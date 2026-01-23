// ============================================
// IMPORTS
// ============================================

import {
  getSelectedProfile,
  createPage,
  uploadImageToNotion,
  extractDomain,
  checkDatabaseProperties,
  checkDatabasePropertiesWithCache,
  addMissingProperties
} from './shared-functions.js';

// ============================================
// PERFORMANCE: PROFILE CACHE
// ============================================

let cachedProfile = null;
let cacheTimestamp = 0;

/**
 * Obtiene el perfil con cache en memoria (5 minutos)
 * Ahorro: ~50ms por guardado
 */
async function getProfileWithCache() {
  const now = Date.now();
  
  if (cachedProfile && (now - cacheTimestamp < 300000)) { // 5 minutos
    return cachedProfile;
  }
  
  cachedProfile = await getSelectedProfile();
  cacheTimestamp = now;
  return cachedProfile;
}

/**
 * Invalidar cache cuando cambia el perfil seleccionado o los perfiles
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.selectedProfileId || changes.profiles)) {
    cachedProfile = null;
  }
});

// ============================================
// SERVICE WORKER CLEANUP
// ============================================

// Limpiar screenshots antiguos (más de 1 hora) al iniciar
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['screenshotTimestamp'], (result) => {
    if (result.screenshotTimestamp) {
      const age = Date.now() - result.screenshotTimestamp;
      if (age > 3600000) { // 1 hora
        chrome.storage.local.remove(['pendingScreenshot', 'screenshotTimestamp']);
      }
    }
  });
});

// ============================================
// CONTEXT MENU SETUP
// ============================================

/**
 * Crear menús contextuales al instalar/actualizar la extensión
 */
chrome.runtime.onInstalled.addListener(() => {
  // Limpiar screenshots antiguos al actualizar
  chrome.storage.local.get(['screenshotTimestamp'], (result) => {
    if (result.screenshotTimestamp) {
      const age = Date.now() - result.screenshotTimestamp;
      if (age > 3600000) { // 1 hora
        chrome.storage.local.remove(['pendingScreenshot', 'screenshotTimestamp']);
      }
    }
  });

  // Crear menú para guardar página actual
  chrome.contextMenus.create({
    id: 'save-current-page',
    title: 'Guardar página actual en Notion',
    contexts: ['page', 'selection', 'image', 'frame'],
    documentUrlPatterns: ['https://*/*'],
  });

  // Crear menú para guardar un enlace específico
  chrome.contextMenus.create({
    id: 'save-link',
    title: 'Guardar enlace en Notion',
    contexts: ['link']
  });
});

/**
 * Manejar clicks en el menú contextual
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-current-page') {
    await handleSaveCurrentPage(tab);
  } else if (info.menuItemId === 'save-link') {
    await handleSaveLink(info, tab);
  }
});

// ============================================
// CONTENT SCRIPT MESSAGING
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'save-link-from-content') {
    return;
  }

  const { url, title } = message.payload || {};

  (async () => {
    try {
      showLoadingBadge();
      await saveUrlToNotion({ url, title });
      showSuccessBadge();
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error guardando enlace desde contenido:', error);
      showErrorBadge(error.message || 'Error');
      sendResponse({ success: false, message: error.message || 'Error al guardar' });
    }
  })();

  return true;
});

// ============================================
// CONTEXT MENU HANDLERS
// ============================================

/**
 * Maneja guardar la página actual desde el menú contextual
 * OPTIMIZADO: Operaciones en paralelo + cache
 */
async function handleSaveCurrentPage(tab) {
  try {
    showLoadingBadge();
    
    // PASO 1: Obtener perfil y capturar screenshot EN PARALELO
    const [profile, dataUrl] = await Promise.all([
      getProfileWithCache(),  // PERFORMANCE: Con cache
      chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',  // PERFORMANCE: JPEG quality 70
        quality: 70
      })
    ]);
    
    if (!profile) {
      showErrorBadge('No hay perfil');
      return;
    }
    
    // PASO 2: Upload imagen y validar BD EN PARALELO
    let thumbnailUploadId = null;
    let propertiesCheck = null;
    
    try {
      [thumbnailUploadId, propertiesCheck] = await Promise.all([
        uploadImageToNotion(profile.apiKey, dataUrl).catch(err => {
          console.warn('Error uploading screenshot:', err);
          return null;
        }),
        checkDatabasePropertiesWithCache(profile.apiKey, profile.databaseId)  // PERFORMANCE: Con cache
      ]);
    } catch (error) {
      console.warn('Error en operaciones paralelas:', error);
    }
    
    // PASO 3: Agregar propiedades faltantes si es necesario (raro, solo primera vez)
    if (propertiesCheck && (!propertiesCheck.hasAll || propertiesCheck.needsRename)) {
      try {
        await addMissingProperties(
          profile.apiKey,
          profile.databaseId,
          propertiesCheck.missing,
          propertiesCheck.titlePropertyName,
          propertiesCheck.needsRename
        );
      } catch (error) {
        console.warn('Error verificando propiedades:', error);
      }
    }
    
    // PASO 4: Crear página en Notion
    const domain = extractDomain(tab.url);
    await createPage(
      profile.apiKey,
      profile.databaseId,
      tab.url,
      tab.title,
      null,
      profile.titlePropertyName,
      domain,
      thumbnailUploadId
    );
    
    showSuccessBadge();
    
  } catch (error) {
    console.error('Error guardando página:', error);
    showErrorBadge(error.message || 'Error');
  }
}

/**
 * Maneja guardar un enlace específico desde el menú contextual
 * OPTIMIZADO: Operaciones en paralelo + cache
 */
async function handleSaveLink(info, tab) {
  try {
    showLoadingBadge();
    await saveUrlToNotion({
      url: info.linkUrl,
      title: info.selectionText || info.linkUrl
    });
    showSuccessBadge();
  } catch (error) {
    console.error('Error guardando enlace:', error);
    showErrorBadge(error.message || 'Error');
  }
}

async function saveUrlToNotion({ url, title }) {
  const profile = await getProfileWithCache();  // PERFORMANCE: Con cache

  if (!profile) {
    throw new Error('No hay perfil');
  }

  let propertiesCheck = null;
  try {
    propertiesCheck = await checkDatabasePropertiesWithCache(profile.apiKey, profile.databaseId);  // PERFORMANCE: Con cache

    if (!propertiesCheck.hasAll || propertiesCheck.needsRename) {
      await addMissingProperties(
        profile.apiKey,
        profile.databaseId,
        propertiesCheck.missing,
        propertiesCheck.titlePropertyName,
        propertiesCheck.needsRename
      );
    }
  } catch (error) {
    console.warn('Error verificando propiedades:', error);
  }

  const linkUrl = url;
  const linkText = title || url;
  const domain = extractDomain(linkUrl);

  await createPage(
    profile.apiKey,
    profile.databaseId,
    linkUrl,
    linkText,
    null,
    profile.titlePropertyName,
    domain,
    null  // sin thumbnail
  );
}

// ============================================
// BADGE HELPERS
// ============================================

/**
 * Muestra badge de carga (azul con puntos)
 */
function showLoadingBadge() {
  chrome.action.setBadgeText({ text: '...' });
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' }); // azul
}

/**
 * Muestra badge de éxito (verde con checkmark)
 */
function showSuccessBadge() {
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // verde
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}

/**
 * Muestra badge de error (rojo con x)
 */
function showErrorBadge(message = 'Error') {
  console.error('Badge error:', message);
  chrome.action.setBadgeText({ text: '✗' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // rojo
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
}
