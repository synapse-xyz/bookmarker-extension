// Referencias a elementos del DOM
const onboardingView = document.getElementById('onboarding-view');
const mainView = document.getElementById('main-view');
const onboardingForm = document.getElementById('onboarding-form');
const apiKeyInput = document.getElementById('api-key');
const databaseIdInput = document.getElementById('database-id');
const errorMessage = document.getElementById('error-message');
const saveConfigBtn = document.getElementById('save-config-btn');
const saveUrlBtn = document.getElementById('save-url-btn');
const changeConfigBtn = document.getElementById('change-config-btn');
const statusMessage = document.getElementById('status-message');
const currentUrlElement = document.getElementById('current-url');
const labelSelect = document.getElementById('label-select');

// Estado
let isLoading = false;

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  // Capturar screenshot antes de mostrar cualquier vista
  await captureScreenshot();
  await checkOnboardingStatus();
  setupEventListeners();
});

/**
 * Verifica si el onboarding está completo
 */
async function checkOnboardingStatus() {
  try {
    const result = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
    
    if (result.notionApiKey && result.notionDatabaseId) {
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
  
  // Cargar opciones de label
  await loadLabelOptions();
}

/**
 * Configura los event listeners
 */
function setupEventListeners() {
  onboardingForm.addEventListener('submit', handleOnboardingSubmit);
  saveUrlBtn.addEventListener('click', handleSaveURL);
  changeConfigBtn.addEventListener('click', handleChangeConfig);
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
    
    // Guardar configuración
    await chrome.storage.local.set({
      notionApiKey: apiKey,
      notionDatabaseId: databaseId
    });
    
    // Mostrar vista principal
    await showMainView();
    await loadCurrentTabURL();
    
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
    // Obtener configuración
    const config = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId', 'notionTitlePropertyName']);
    
    if (!config.notionApiKey || !config.notionDatabaseId) {
      showStatus('Error: Configuración no encontrada', 'error');
      showOnboardingView();
      return;
    }
    
    // Obtener URL y título de la pestaña actual
    const tab = await getCurrentTab();
    const url = tab.url;
    const title = tab.title;
    
    // Obtener label seleccionado
    const selectedLabel = labelSelect.value || null;
    
    // Usar el nombre real de la propiedad title (por defecto 'nombre')
    const titlePropertyName = config.notionTitlePropertyName || 'nombre';
    
    // Extraer dominio para saved_from
    const domain = extractDomain(url);
    
    // Verificar que todas las propiedades requeridas existen antes de crear la página
    try {
      const propertiesCheck = await checkDatabaseProperties(config.notionApiKey, config.notionDatabaseId);
      
      if (!propertiesCheck.hasAll && propertiesCheck.missing.length > 0) {
        await addMissingProperties(config.notionApiKey, config.notionDatabaseId, propertiesCheck.missing, propertiesCheck.titlePropertyName);
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
        thumbnailUploadId = await uploadImageToNotion(config.notionApiKey, storage.pendingScreenshot);
        // Limpiar screenshot del storage después de subirla exitosamente
        await chrome.storage.local.remove(['pendingScreenshot', 'screenshotTimestamp', 'screenshotUrl']);
      } catch (error) {
        console.error('Error procesando screenshot:', error);
        // Continuar sin thumbnail si falla, pero no bloquear el guardado de la URL
      }
    }
    
    // Crear página en Notion
    await createPage(config.notionApiKey, config.notionDatabaseId, url, title, selectedLabel, titlePropertyName, domain, thumbnailUploadId);
    
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
 * Maneja el cambio de configuración
 */
function handleChangeConfig() {
  // Limpiar configuración
  chrome.storage.local.remove(['notionApiKey', 'notionDatabaseId']);
  
  // Limpiar formulario
  apiKeyInput.value = '';
  databaseIdInput.value.trim();
  
  // Mostrar onboarding
  showOnboardingView();
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
 * Carga las opciones de label desde Notion
 */
async function loadLabelOptions() {
  try {
    const config = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
    
    if (!config.notionApiKey || !config.notionDatabaseId) {
      return;
    }
    
    // Limpiar opciones existentes (excepto "Sin categoría")
    labelSelect.innerHTML = '<option value="">Sin categoría</option>';
    
    // Obtener opciones de label desde Notion
    const options = await getLabelOptions(config.notionApiKey, config.notionDatabaseId);
    
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
