// ============================================
// STORAGE HELPERS & MIGRATION
// ============================================

/**
 * Migra datos del formato antiguo al nuevo formato de perfiles
 */
async function migrateOldFormat() {
  try {
    const result = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
    
    // Si existen datos del formato antiguo
    if (result.notionApiKey && result.notionDatabaseId) {
      // Obtener metadatos de la base de datos
      let name = 'Base de datos';
      let emoji = null;
      
      try {
        const metadata = await getDatabaseMetadata(result.notionApiKey, result.notionDatabaseId);
        name = metadata.name;
        emoji = metadata.emoji;
      } catch (error) {
        console.warn('Error fetching metadata during migration:', error);
      }
      
      // Crear perfil desde datos antiguos
      const profileId = Date.now().toString();
      const profile = {
        id: profileId,
        apiKey: result.notionApiKey,
        databaseId: result.notionDatabaseId,
        name: name,
        emoji: emoji,
        titlePropertyName: result.notionTitlePropertyName || 'nombre',
        labelOptions: []
      };
      
      // Guardar en nuevo formato
      await chrome.storage.local.set({
        profiles: [profile],
        selectedProfileId: profileId
      });
      
      // Limpiar datos antiguos
      await chrome.storage.local.remove(['notionApiKey', 'notionDatabaseId', 'notionTitlePropertyName']);
      
      console.log('Migration completed successfully');
      return true;
    }
  } catch (error) {
    console.error('Error during migration:', error);
  }
  return false;
}

/**
 * Obtiene todos los perfiles
 */
async function getProfiles() {
  const result = await chrome.storage.local.get(['profiles']);
  return result.profiles || [];
}

/**
 * Obtiene el perfil seleccionado actualmente
 */
async function getSelectedProfile() {
  const result = await chrome.storage.local.get(['profiles', 'selectedProfileId']);
  const profiles = result.profiles || [];
  const selectedId = result.selectedProfileId;
  
  if (selectedId && profiles.length > 0) {
    return profiles.find(p => p.id === selectedId) || null;
  }
  return null;
}

/**
 * Guarda un perfil (nuevo o actualizado)
 */
async function saveProfile(profile) {
  const profiles = await getProfiles();
  const index = profiles.findIndex(p => p.id === profile.id);
  
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  
  await chrome.storage.local.set({ profiles });
  return profile;
}

/**
 * Elimina un perfil
 */
async function deleteProfile(profileId) {
  const profiles = await getProfiles();
  const result = await chrome.storage.local.get(['selectedProfileId']);
  
  const filteredProfiles = profiles.filter(p => p.id !== profileId);
  
  // Si el perfil eliminado era el seleccionado, seleccionar otro
  let newSelectedId = result.selectedProfileId;
  if (newSelectedId === profileId && filteredProfiles.length > 0) {
    newSelectedId = filteredProfiles[0].id;
  } else if (filteredProfiles.length === 0) {
    newSelectedId = null;
  }
  
  await chrome.storage.local.set({ 
    profiles: filteredProfiles,
    selectedProfileId: newSelectedId
  });
}

/**
 * Establece el perfil seleccionado
 */
async function setSelectedProfile(profileId) {
  await chrome.storage.local.set({ selectedProfileId: profileId });
}

/**
 * Obtiene opciones de label para el perfil seleccionado
 */
async function getSelectedProfileLabelOptions() {
  const profile = await getSelectedProfile();
  return profile?.labelOptions || [];
}

/**
 * Actualiza metadatos para todos los perfiles (refresh)
 */
async function refreshAllProfilesMetadata() {
  const profiles = await getProfiles();
  
  for (let profile of profiles) {
    try {
      const metadata = await getDatabaseMetadata(profile.apiKey, profile.databaseId);
      profile.name = metadata.name;
      profile.emoji = metadata.emoji;
      
      // Obtener opciones de categorías
      const options = await getLabelOptions(profile.apiKey, profile.databaseId);
      profile.labelOptions = options;
    } catch (error) {
      console.warn(`Error refreshing profile ${profile.id}:`, error);
    }
  }
  
  await chrome.storage.local.set({ profiles, lastFetched: Date.now() });
  return profiles;
}

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
function showOnboardingView() {
  onboardingView.classList.remove('hidden');
  mainView.classList.add('hidden');
  errorMessage.classList.add('hidden');
  errorMessage.textContent = '';
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
  // Onboarding
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
    await validateNotionConfig(apiKey, databaseId);
    
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
      titlePropertyName: 'nombre',
      labelOptions: []
    };
    
    // Guardar perfil
    await saveProfile(profile);
    await setSelectedProfile(profileId);
    
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
 * Valida la configuración de Notion
 */
async function validateNotionConfig(apiKey, databaseId) {
  try {
    // Verificar que la base de datos existe y es accesible
    const database = await getDatabase(apiKey, databaseId);
    
    // Verificar propiedades
    const propertiesCheck = await checkDatabaseProperties(apiKey, databaseId);
    
    // Si faltan propiedades, intentar agregarlas
    if (!propertiesCheck.hasAll && propertiesCheck.missing.length > 0) {
      try {
        await addMissingProperties(apiKey, databaseId, propertiesCheck.missing, propertiesCheck.titlePropertyName);
      } catch (error) {
        // Si falla por permisos, lanzar error descriptivo
        if (error.message.includes('permisos') || error.message.includes('permission')) {
          throw new Error('No tienes permisos para modificar esta base de datos. Asegúrate de que tu integración tenga acceso y permisos de edición en la base de datos.');
        }
        throw error;
      }
    }
    
    // Guardar el nombre real de la propiedad title para usarlo al crear páginas
    if (propertiesCheck.titlePropertyName) {
      await chrome.storage.local.set({ notionTitlePropertyName: propertiesCheck.titlePropertyName });
    }
    
    return true;
  } catch (error) {
    // Mejorar mensajes de error
    if (error.message.includes('404')) {
      throw new Error('Base de datos no encontrada. Verifica que el Database ID sea correcto y que tu integración tenga acceso a la base de datos.');
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      throw new Error('API Key inválida. Verifica que tu API Key sea correcta.');
    } else if (error.message.includes('403')) {
      throw new Error('No tienes permisos para acceder a esta base de datos. Asegúrate de que tu integración esté conectada a la base de datos en Notion.');
    }
    throw error;
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
      
      if (!propertiesCheck.hasAll && propertiesCheck.missing.length > 0) {
        await addMissingProperties(profile.apiKey, profile.databaseId, propertiesCheck.missing, propertiesCheck.titlePropertyName);
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
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
}

/**
 * Oculta el mensaje de estado
 */
function hideStatus() {
  statusMessage.classList.add('hidden');
  statusMessage.textContent = '';
  statusMessage.className = 'status-message';
}

/**
 * Establece el estado de carga
 */
function setLoading(loading) {
  isLoading = loading;
  saveConfigBtn.disabled = loading;
  saveUrlBtn.disabled = loading;
  
  if (loading) {
    saveConfigBtn.textContent = 'Validando...';
    saveUrlBtn.textContent = 'Guardando...';
  } else {
    saveConfigBtn.textContent = 'Guardar Configuración';
    saveUrlBtn.textContent = 'Guardar URL en Notion';
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
    const profileItem = document.createElement('div');
    profileItem.className = 'profile-item';
    if (profile.id === selectedProfileId) {
      profileItem.classList.add('selected');
    }
    
    const emoji = profile.emoji || '🔲';
    const name = profile.name || 'Sin nombre';
    
    profileItem.innerHTML = `
      <div class="profile-item-name">
        <span class="profile-emoji">${emoji}</span>
        <span>${name}</span>
      </div>
      <button type="button" class="profile-delete-btn" data-profile-id="${profile.id}">&times;</button>
    `;
    
    // Click para seleccionar perfil
    const nameArea = profileItem.querySelector('.profile-item-name');
    nameArea.addEventListener('click', async () => {
      await selectProfile(profile.id);
    });
    
    // Click para eliminar perfil
    const deleteBtn = profileItem.querySelector('.profile-delete-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleDeleteProfile(profile.id);
    });
    
    profileList.appendChild(profileItem);
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
  await renderProfiles();
  await loadLabelOptions();
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
    modal.classList.remove('hidden');
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
    modal.classList.add('hidden');
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
    await validateNotionConfig(apiKey, databaseId);
    
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
      titlePropertyName: 'nombre',
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
    modal.classList.remove('hidden');
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
    modal.classList.add('hidden');
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
    await validateNotionConfig(apiKey, databaseId);
    
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
