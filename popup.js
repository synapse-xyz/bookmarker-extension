// ============================================
// IMPORTS FROM SHARED FUNCTIONS
// ============================================

import { 
  migrateOldFormat,
  getProfiles,
  getSelectedProfile,
  saveProfile,
  deleteProfile,
  setSelectedProfile,
  getSelectedProfileLabelOptions,
  refreshAllProfilesMetadata,
  getDatabaseMetadata,
  checkDatabaseProperties,
  addMissingProperties,
  getLabelOptions,
  extractDomain,
  uploadImageToNotion,
  createPage,
  validateNotionConfig
} from './shared-functions.js';

// ============================================
// DOM ELEMENTS
// ============================================

// Referencias a elementos del DOM
const onboardingView = document.getElementById('onboarding-view');
const mainView = document.getElementById('main-view');
const onboardingForm = document.getElementById('onboarding-form');
const apiKeyInput = document.getElementById('api-key');
const databaseIdInput = document.getElementById('database-id');
const errorMessage = document.getElementById('error-message');
const saveConfigBtn = document.getElementById('save-config-btn');
const saveUrlBtn = document.getElementById('save-url-btn');
const statusMessage = document.getElementById('status-message');
const currentUrlElement = document.getElementById('current-url');
const labelSelect = document.getElementById('label-select');

// Estado
let isLoading = false;

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  // Capturar screenshot antes de mostrar cualquier vista
  await captureScreenshot();
  await migrateOldFormat();
  await checkOnboardingStatus();
  setupEventListeners();
});

/**
 * Verifica si el onboarding está completo
 */
async function checkOnboardingStatus() {
  try {
    const profiles = await getProfiles();
    
    if (profiles && profiles.length > 0) {
      await showMainView();
      await loadCurrentTabURL();
    } else {
      showOnboardingView();
    }
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    showOnboardingView();
  }
}

/**
 * Muestra la vista de onboarding
 */
async function showOnboardingView() {
  onboardingView.classList.remove('hidden');
  // Mantener mainView visible detrás para el efecto blur
  mainView.classList.remove('hidden');
  errorMessage.classList.add('hidden');
  errorMessage.textContent = '';

  // Restaurar datos temporales si existen
  try {
    const temp = await chrome.storage.local.get(['temp_apiKey', 'temp_dbId']);
    if (temp.temp_apiKey) apiKeyInput.value = temp.temp_apiKey;
    if (temp.temp_dbId) databaseIdInput.value = temp.temp_dbId;
  } catch (e) {
    console.warn('Error restoring temp data', e);
  }
}

/**
 * Muestra la vista principal
 */
async function showMainView() {
  onboardingView.classList.add('hidden');
  mainView.classList.remove('hidden');
  statusMessage.classList.add('hidden');
  
  // Renderizar perfiles en sidebar
  await renderProfiles();
  
  // Cargar opciones de label del perfil seleccionado
  await loadLabelOptions();
}

/**
 * Configura los event listeners
 */
function setupEventListeners() {
  // Onboarding inputs persistence
  const saveTempData = (key, value) => {
    chrome.storage.local.set({ [key]: value });
  };

  apiKeyInput.addEventListener('input', (e) => saveTempData('temp_apiKey', e.target.value));
  databaseIdInput.addEventListener('input', (e) => saveTempData('temp_dbId', e.target.value));

  // Onboarding form
  onboardingForm.addEventListener('submit', handleOnboardingSubmit);
  
  // Main view
  saveUrlBtn.addEventListener('click', handleSaveURL);
  
  // Refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
  }
  
  // Add Profile button & modal
  const addProfileBtn = document.getElementById('add-profile-btn');
  if (addProfileBtn) {
    addProfileBtn.addEventListener('click', openAddProfileModal);
  }
  
  const addProfileForm = document.getElementById('add-profile-form');
  if (addProfileForm) {
    addProfileForm.addEventListener('submit', handleAddProfileSubmit);
  }
  
  const closeAddModalBtn = document.getElementById('close-add-modal');
  if (closeAddModalBtn) {
    closeAddModalBtn.addEventListener('click', closeAddProfileModal);
  }
  
  const cancelAddModalBtn = document.getElementById('cancel-add-modal');
  if (cancelAddModalBtn) {
    cancelAddModalBtn.addEventListener('click', closeAddProfileModal);
  }
  
  const addModalOverlay = document.getElementById('modal-overlay-add');
  if (addModalOverlay) {
    addModalOverlay.addEventListener('click', closeAddProfileModal);
  }
  
  // Config button & modal
  const configBtn = document.getElementById('config-btn');
  if (configBtn) {
    configBtn.addEventListener('click', openSettingsModal);
  }
  
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', handleSettingsSubmit);
  }
  
  const closeSettingsModalBtn = document.getElementById('close-settings-modal');
  if (closeSettingsModalBtn) {
    closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
  }
  
  const cancelSettingsModalBtn = document.getElementById('cancel-settings-modal');
  if (cancelSettingsModalBtn) {
    cancelSettingsModalBtn.addEventListener('click', closeSettingsModal);
  }
  
  const settingsModalOverlay = document.getElementById('modal-overlay-settings');
  if (settingsModalOverlay) {
    settingsModalOverlay.addEventListener('click', closeSettingsModal);
  }
}

/**
 * Maneja el submit del formulario de onboarding
 */
async function handleOnboardingSubmit(e) {
  e.preventDefault();
  
  if (isLoading) return;
  
  const apiKey = apiKeyInput.value.trim();
  const databaseId = databaseIdInput.value.trim();
  
  // Validación básica
  if (!apiKey || !databaseId) {
    showError('Por favor, completa todos los campos');
    return;
  }

  setLoading(true);
  hideError();
  
  try {
    // Validar configuración de Notion
    const validationResult = await validateNotionConfig(apiKey, databaseId);
    
    // Obtener metadatos de la base de datos
    const metadata = await getDatabaseMetadata(apiKey, databaseId);
    
    // Crear nuevo perfil
    const profileId = Date.now().toString();
    const profile = {
      id: profileId,
      apiKey: apiKey,
      databaseId: databaseId,
      name: metadata.name,
      emoji: metadata.emoji,
      titlePropertyName: validationResult.titlePropertyName || 'name',
      labelOptions: []
    };
    
    // Guardar perfil
    await saveProfile(profile);
    await setSelectedProfile(profileId);

    // Limpiar datos temporales de onboarding
    await chrome.storage.local.remove(['temp_apiKey', 'temp_dbId']);
    
    // Mostrar vista principal
    await showMainView();
    await loadCurrentTabURL();
    
    // Limpiar formulario
    apiKeyInput.value = '';
    databaseIdInput.value = '';
    
  } catch (error) {
    showError(error.message || 'Error al validar la configuración');
  } finally {
    setLoading(false);
  }
}



/**
 * Maneja el guardado de la URL actual
 */
async function handleSaveURL() {
  if (isLoading) return;
  
  setLoading(true);
  hideStatus();
  
  try {
    // Obtener perfil seleccionado
    const profile = await getSelectedProfile();
    
    if (!profile) {
      showStatus('Error: No hay perfil seleccionado', 'error');
      return;
    }
    
    // Obtener URL y título de la pestaña actual
    const tab = await getCurrentTab();
    const url = tab.url;
    const title = tab.title;
    
    // Obtener label seleccionado
    const selectedLabel = labelSelect.value || null;
    
    // Extraer dominio para saved_from
    const domain = extractDomain(url);
    
    // Verificar que todas las propiedades requeridas existen antes de crear la página
    try {
      const propertiesCheck = await checkDatabaseProperties(profile.apiKey, profile.databaseId);
      
      if (!propertiesCheck.hasAll && propertiesCheck.missing.length > 0 || propertiesCheck.needsRename) {
        await addMissingProperties(profile.apiKey, profile.databaseId, propertiesCheck.missing, propertiesCheck.titlePropertyName, propertiesCheck.needsRename);
        
        // Si se renombró, actualizar el titlePropertyName del perfil
        if (propertiesCheck.needsRename) {
          profile.titlePropertyName = 'name';
          await saveProfile(profile);
        }
      }
    } catch (error) {
      console.error('Error verificando propiedades:', error);
      // Continuar de todas formas, pero puede fallar al crear la página
    }
    
    // Obtener screenshot del storage y subirla directamente a Notion
    let thumbnailUploadId = null;
    const storage = await chrome.storage.local.get(['pendingScreenshot', 'screenshotUrl']);
    
    if (storage.pendingScreenshot && storage.screenshotUrl === url) {
      try {
        // Subir la imagen directamente a Notion
        thumbnailUploadId = await uploadImageToNotion(profile.apiKey, storage.pendingScreenshot);
        // Limpiar screenshot del storage después de subirla exitosamente
        await chrome.storage.local.remove(['pendingScreenshot', 'screenshotTimestamp', 'screenshotUrl']);
      } catch (error) {
        console.error('Error procesando screenshot:', error);
        // Continuar sin thumbnail si falla, pero no bloquear el guardado de la URL
      }
    }
    
    // Crear página en Notion
    await createPage(profile.apiKey, profile.databaseId, url, title, selectedLabel, profile.titlePropertyName, domain, thumbnailUploadId);
    
    showStatus('¡URL guardada exitosamente en Notion!', 'success');
    
    // Actualizar URL mostrada
    currentUrlElement.textContent = url;
    
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
}



/**
 * Obtiene la pestaña actual
 */
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Carga la URL de la pestaña actual
 */
async function loadCurrentTabURL() {
  try {
    const tab = await getCurrentTab();
    if (tab && tab.url) {
      currentUrlElement.textContent = tab.url;
    } else {
      currentUrlElement.textContent = 'No se pudo obtener la URL';
    }
  } catch (error) {
    console.error('Error loading current tab URL:', error);
    currentUrlElement.textContent = 'Error al cargar la URL';
  }
}

/**
 * Captura una screenshot de la pestaña actual
 */
async function captureScreenshot() {
  try {
    const tab = await getCurrentTab();
    if (!tab || !tab.id) {
      return;
    }
    
    // Capturar screenshot de la pestaña visible
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90
    });
    
    // Guardar screenshot temporalmente en storage
    await chrome.storage.local.set({
      pendingScreenshot: dataUrl,
      screenshotTimestamp: Date.now(),
      screenshotUrl: tab.url
    });
  } catch (error) {
    console.error('Error capturando screenshot:', error);
    // Continuar de todas formas, la extensión puede funcionar sin screenshot
  }
}

/**
 * Carga las opciones de label desde Notion para el perfil seleccionado
 */
async function loadLabelOptions() {
  try {
    const profile = await getSelectedProfile();
    
    if (!profile) {
      labelSelect.innerHTML = '<option value="">Sin categoría</option>';
      return;
    }
    
    // Limpiar opciones existentes (excepto "Sin categoría")
    labelSelect.innerHTML = '<option value="">Sin categoría</option>';
    
    // Obtener opciones de label desde Notion
    const options = await getLabelOptions(profile.apiKey, profile.databaseId);
    
    // Agregar opciones al select
    options.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option;
      optionElement.textContent = option;
      labelSelect.appendChild(optionElement);
    });
  } catch (error) {
    console.error('Error loading label options:', error);
    // Si hay error, mantener solo "Sin categoría"
  }
}

/**
 * Muestra un mensaje de error
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

/**
 * Oculta el mensaje de error
 */
function hideError() {
  errorMessage.classList.add('hidden');
  errorMessage.textContent = '';
}

/**
 * Muestra un mensaje de estado
 */
function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  
  // Mapear tipos a clases de CSS
  let notificationClass = 'success';
  if (type === 'error') notificationClass = 'error';
  if (type === 'loading') notificationClass = 'loading';
  
  statusMessage.className = `notification ${notificationClass}`;
  statusMessage.classList.remove('hidden');
}

/**
 * Oculta el mensaje de estado
 */
function hideStatus() {
  statusMessage.classList.add('hidden');
  statusMessage.textContent = '';
  // Resetear clases base, manteniendo notification y hidden
  statusMessage.className = 'notification hidden';
}

/**
 * Establece el estado de carga
 */
function setLoading(loading) {
  isLoading = loading;
  saveConfigBtn.disabled = loading;
  saveUrlBtn.disabled = loading;
  
  if (loading) {
    saveConfigBtn.classList.add('loading');
    saveUrlBtn.classList.add('loading');
    
    // Guardar texto original si no existe
    if (!saveConfigBtn.dataset.originalText) saveConfigBtn.dataset.originalText = saveConfigBtn.textContent;
    if (!saveUrlBtn.dataset.originalText) saveUrlBtn.dataset.originalText = saveUrlBtn.textContent;
    
    saveConfigBtn.textContent = 'Validando...';
    saveUrlBtn.textContent = 'Guardando...';
  } else {
    saveConfigBtn.classList.remove('loading');
    saveUrlBtn.classList.remove('loading');
    
    // Restaurar texto original
    if (saveConfigBtn.dataset.originalText) saveConfigBtn.textContent = saveConfigBtn.dataset.originalText;
    if (saveUrlBtn.dataset.originalText) saveUrlBtn.textContent = saveUrlBtn.dataset.originalText;
  }
}

// ============================================
// PROFILE RENDERING & SELECTION
// ============================================

/**
 * Renderiza la lista de perfiles en el sidebar
 */
async function renderProfiles() {
  const profiles = await getProfiles();
  const selectedProfileId = (await chrome.storage.local.get(['selectedProfileId'])).selectedProfileId;
  const profileList = document.getElementById('profile-list');
  
  if (!profileList) return;
  
  profileList.innerHTML = '';
  
  for (const profile of profiles) {
    const a = document.createElement('a');
    
    if (profile.id === selectedProfileId) {
      a.classList.add('active');
    }
    
    const emoji = profile.emoji || '🔲';
    const name = profile.name || 'Sin nombre';
    
    // Estructura interna
    a.innerHTML = `
      <span style="display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap;">
        <span>${emoji}</span>
        <span style="text-overflow: ellipsis; overflow: hidden;" title="${name}">${name}</span>
      </span>
      <button type="button" class="delete-profile-btn" data-profile-id="${profile.id}">&times;</button>
    `;
    
    // Click para seleccionar perfil (delegado al anchor, excluyendo el botón delete)
    a.addEventListener('click', async (e) => {
      // Si el click fue en el botón de borrar, no seleccionar
      if (e.target.closest('.delete-profile-btn')) return;
      await selectProfile(profile.id);
    });
    
    // Click para eliminar perfil
    const deleteBtn = a.querySelector('.delete-profile-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevenir selección
      await handleDeleteProfile(profile.id);
    });
    
    const li = document.createElement('li');
    li.appendChild(a);
    profileList.appendChild(li);
  }
}

/**
 * Selecciona un perfil
 */
async function selectProfile(profileId) {
  await setSelectedProfile(profileId);
  await renderProfiles();
  await loadLabelOptions();
}

/**
 * Maneja la eliminación de un perfil
 */
async function handleDeleteProfile(profileId) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  
  if (!profile) return;
  
  // Confirmar eliminación
  const confirmed = confirm(`¿Estás seguro de que deseas eliminar el perfil "${profile.name || 'Sin nombre'}"?`);
  if (!confirmed) return;
  
  await deleteProfile(profileId);
  
  // Verificar si quedan perfiles después de eliminar
  const remainingProfiles = await getProfiles();
  
  if (remainingProfiles.length === 0) {
    // No quedan perfiles, mostrar onboarding
    showOnboardingView();
  } else {
    // Aún hay perfiles, actualizar vista
    await renderProfiles();
    await loadLabelOptions();
  }
}

// ============================================
// MODAL: ADD PROFILE
// ============================================

/**
 * Abre el modal para añadir perfil
 */
function openAddProfileModal() {
  const modal = document.getElementById('add-profile-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Cierra el modal para añadir perfil
 */
function closeAddProfileModal() {
  const modal = document.getElementById('add-profile-modal');
  const form = document.getElementById('add-profile-form');
  const errorDiv = document.getElementById('modal-error');
  
  if (modal) {
    modal.classList.remove('active');
  }
  if (form) {
    form.reset();
  }
  if (errorDiv) {
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
  }
}

/**
 * Maneja el submit del formulario para añadir perfil
 */
async function handleAddProfileSubmit(e) {
  e.preventDefault();
  
  const apiKeyInput = document.getElementById('modal-api-key');
  const dbIdInput = document.getElementById('modal-db-id');
  const errorDiv = document.getElementById('modal-error');
  
  const apiKey = apiKeyInput.value.trim();
  const databaseId = dbIdInput.value.trim();
  
  if (!apiKey || !databaseId) {
    showModalError('modal-error', 'Por favor, completa todos los campos');
    return;
  }
  
  try {
    showModalError('modal-error', '', true); // Limpiar errores
    
    // Validar configuración de Notion
    const validationResult = await validateNotionConfig(apiKey, databaseId);
    
    // Obtener metadatos de la base de datos
    const metadata = await getDatabaseMetadata(apiKey, databaseId);
    
    // Obtener opciones de categorías
    const labelOptions = await getLabelOptions(apiKey, databaseId);
    
    // Crear nuevo perfil
    const profileId = Date.now().toString();
    const profile = {
      id: profileId,
      apiKey: apiKey,
      databaseId: databaseId,
      name: metadata.name,
      emoji: metadata.emoji,
      titlePropertyName: validationResult.titlePropertyName || 'name',
      labelOptions: labelOptions
    };
    
    // Guardar perfil
    await saveProfile(profile);
    await setSelectedProfile(profileId);
    
    // Actualizar vista
    await renderProfiles();
    await loadLabelOptions();
    
    // Cerrar modal
    closeAddProfileModal();
    
  } catch (error) {
    showModalError('modal-error', error.message || 'Error al agregar perfil');
  }
}

// ============================================
// MODAL: SETTINGS
// ============================================

/**
 * Abre el modal de configuración
 */
async function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const profile = await getSelectedProfile();
  
  if (!profile) return;
  
  // Pre-llenar los campos con los datos del perfil actual
  const apiKeyInput = document.getElementById('settings-api-key');
  const dbIdInput = document.getElementById('settings-db-id');
  
  if (apiKeyInput) {
    apiKeyInput.value = profile.apiKey;
  }
  if (dbIdInput) {
    dbIdInput.value = profile.databaseId;
  }
  
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Cierra el modal de configuración
 */
function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const form = document.getElementById('settings-form');
  const errorDiv = document.getElementById('settings-error');
  
  if (modal) {
    modal.classList.remove('active');
  }
  if (form) {
    form.reset();
  }
  if (errorDiv) {
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
  }
}

/**
 * Maneja el submit del formulario de configuración
 */
async function handleSettingsSubmit(e) {
  e.preventDefault();
  
  const apiKeyInput = document.getElementById('settings-api-key');
  const dbIdInput = document.getElementById('settings-db-id');
  
  const apiKey = apiKeyInput.value.trim();
  const databaseId = dbIdInput.value.trim();
  
  if (!apiKey || !databaseId) {
    showModalError('settings-error', 'Por favor, completa todos los campos');
    return;
  }
  
  try {
    showModalError('settings-error', '', true); // Limpiar errores
    
    // Validar nueva configuración
    const validationResult = await validateNotionConfig(apiKey, databaseId);
    
    // Obtener perfil actual
    const profile = await getSelectedProfile();
    if (!profile) return;
    
    // Obtener nuevos metadatos
    const metadata = await getDatabaseMetadata(apiKey, databaseId);
    const labelOptions = await getLabelOptions(apiKey, databaseId);
    
    // Actualizar perfil
    profile.apiKey = apiKey;
    profile.databaseId = databaseId;
    profile.name = metadata.name;
    profile.emoji = metadata.emoji;
    profile.titlePropertyName = validationResult.titlePropertyName || 'name';
    profile.labelOptions = labelOptions;
    
    // Guardar cambios
    await saveProfile(profile);
    
    // Actualizar vista
    await renderProfiles();
    await loadLabelOptions();
    
    // Cerrar modal
    closeSettingsModal();
    
  } catch (error) {
    showModalError('settings-error', error.message || 'Error al guardar cambios');
  }
}

// ============================================
// REFRESH FUNCTIONALITY
// ============================================

/**
 * Maneja el click del botón refresh
 */
async function handleRefresh() {
  const refreshBtn = document.getElementById('refresh-btn');
  
  if (isLoading) return;
  
  try {
    isLoading = true;
    if (refreshBtn) {
      refreshBtn.classList.add('loading');
    }
    
    showStatus('Actualizando perfiles...', 'loading');
    
    // Actualizar metadatos de todos los perfiles
    await refreshAllProfilesMetadata();
    
    // Actualizar vista
    await renderProfiles();
    await loadLabelOptions();
    
    showStatus('¡Perfiles actualizados exitosamente!', 'success');
    
  } catch (error) {
    showStatus(`Error al actualizar: ${error.message}`, 'error');
  } finally {
    isLoading = false;
    if (refreshBtn) {
      refreshBtn.classList.remove('loading');
    }
  }
}

// ============================================
// MODAL HELPER FUNCTIONS
// ============================================

/**
 * Muestra error en modal
 */
function showModalError(elementId, message, hide = false) {
  const errorDiv = document.getElementById(elementId);
  if (errorDiv) {
    if (hide) {
      errorDiv.classList.add('hidden');
      errorDiv.textContent = '';
    } else {
      errorDiv.textContent = message;
      errorDiv.classList.remove('hidden');
    }
  }
}
