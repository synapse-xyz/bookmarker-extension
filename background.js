// ============================================
// IMPORTS
// ============================================

import {
  getSelectedProfile,
  createPage,
  uploadImageToNotion,
  extractDomain,
  checkDatabaseProperties,
  addMissingProperties
} from './shared-functions.js';

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
    contexts: ['page', 'selection', 'image', 'frame']
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
// CONTEXT MENU HANDLERS
// ============================================

/**
 * Maneja guardar la página actual desde el menú contextual
 */
async function handleSaveCurrentPage(tab) {
  try {
    showLoadingBadge();
    
    // 1. Obtener perfil seleccionado
    const profile = await getSelectedProfile();
    if (!profile) {
      showErrorBadge('No hay perfil');
      return;
    }
    
    // 2. Capturar screenshot de la pestaña
    let thumbnailUploadId = null;
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 90
      });
      thumbnailUploadId = await uploadImageToNotion(profile.apiKey, dataUrl);
    } catch (error) {
      console.warn('Error capturando/subiendo screenshot:', error);
      // Continuar sin thumbnail
    }
    
    // 3. Verificar propiedades de la base de datos
    try {
      const propertiesCheck = await checkDatabaseProperties(profile.apiKey, profile.databaseId);
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
    
    // 4. Crear página en Notion
    const domain = extractDomain(tab.url);
    await createPage(
      profile.apiKey,
      profile.databaseId,
      tab.url,
      tab.title,
      null, // sin categoría por defecto
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
 */
async function handleSaveLink(info, tab) {
  try {
    showLoadingBadge();
    
    // 1. Obtener perfil seleccionado
    const profile = await getSelectedProfile();
    if (!profile) {
      showErrorBadge('No hay perfil');
      return;
    }
    
    // 2. Obtener URL del link
    const linkUrl = info.linkUrl;
    const linkText = info.selectionText || info.linkUrl; // Usar texto seleccionado o la URL
    
    // 3. Verificar propiedades (igual que en página actual)
    try {
      const propertiesCheck = await checkDatabaseProperties(profile.apiKey, profile.databaseId);
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
    
    // 4. Crear página SIN thumbnail
    const domain = extractDomain(linkUrl);
    await createPage(
      profile.apiKey,
      profile.databaseId,
      linkUrl,
      linkText,
      null, // sin categoría por defecto
      profile.titlePropertyName,
      domain,
      null  // sin thumbnail
    );
    
    showSuccessBadge();
    
  } catch (error) {
    console.error('Error guardando enlace:', error);
    showErrorBadge(error.message || 'Error');
  }
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
