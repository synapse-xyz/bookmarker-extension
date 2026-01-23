// ============================================
// SHARED FUNCTIONS - Notion API & Storage
// ============================================

// ============================================
// CONSTANTS
// ============================================

export const NOTION_API_BASE = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2022-06-28';

// ============================================
// STORAGE HELPERS & MIGRATION
// ============================================

/**
 * Migra datos del formato antiguo al nuevo formato de perfiles
 */
export async function migrateOldFormat() {
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
export async function getProfiles() {
  const result = await chrome.storage.local.get(['profiles']);
  return result.profiles || [];
}

/**
 * Obtiene el perfil seleccionado actualmente
 */
export async function getSelectedProfile() {
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
export async function saveProfile(profile) {
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
export async function deleteProfile(profileId) {
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
export async function setSelectedProfile(profileId) {
  await chrome.storage.local.set({ selectedProfileId: profileId });
}

/**
 * Obtiene opciones de label para el perfil seleccionado
 */
export async function getSelectedProfileLabelOptions() {
  const profile = await getSelectedProfile();
  return profile?.labelOptions || [];
}

/**
 * Actualiza metadatos para todos los perfiles (refresh)
 */
export async function refreshAllProfilesMetadata() {
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
// NOTION API FUNCTIONS
// ============================================

/**
 * Realiza una petición a la API de Notion
 */
export async function notionRequest(apiKey, endpoint, method = 'GET', body = null) {
  const url = `${NOTION_API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br'  // PERFORMANCE: Request compression
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    // Error de red (sin conexión, timeout, etc.)
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Error de conexión. Verifica tu conexión a internet.');
    }
    throw new Error(`Error de red: ${error.message}`);
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error desconocido' }));
    const status = response.status;
    
    // Mejorar mensajes de error según el código de estado
    if (status === 401) {
      throw new Error('API Key inválida o expirada');
    } else if (status === 403) {
      throw new Error('No tienes permisos para acceder a este recurso');
    } else if (status === 404) {
      throw new Error('Recurso no encontrado');
    } else if (status >= 500) {
      throw new Error('Error del servidor de Notion. Intenta más tarde.');
    }
    
    throw new Error(errorData.message || `HTTP error! status: ${status}`);
  }

  return await response.json();
}

/**
 * Obtiene información de una base de datos
 */
export async function getDatabase(apiKey, databaseId) {
  try {
    return await notionRequest(apiKey, `/databases/${databaseId}`);
  } catch (error) {
    throw new Error(`Error al obtener la base de datos: ${error.message}`);
  }
}

/**
 * Verifica si la base de datos tiene las propiedades requeridas
 */
export async function checkDatabaseProperties(apiKey, databaseId) {
  try {
    const database = await getDatabase(apiKey, databaseId);
    const properties = database.properties || {};
    
    const required = {
      name: { type: 'title', exists: false, actualName: null },
      url: { type: 'url', exists: false },
      label: { type: 'select', exists: false },
      saved_from: { type: 'rich_text', exists: false },
      thumbnail: { type: 'files', exists: false }
    };

    // Buscar propiedad de tipo "title" (siempre existe una por defecto en Notion)
    let titlePropertyName = null;
    for (const propName in properties) {
      const prop = properties[propName];
      if (prop.type === 'title') {
        titlePropertyName = propName;
        // Marcar como existente y guardar el nombre actual
        required.name.exists = true;
        required.name.actualName = propName;
        break; // Solo puede haber una propiedad title
      }
    }

    // Verificar otras propiedades
    for (const propName in properties) {
      const prop = properties[propName];
      if (propName === 'url' && prop.type === 'url') {
        required.url.exists = true;
      } else if (propName === 'label' && prop.type === 'select') {
        required.label.exists = true;
      } else if (propName === 'saved_from' && (prop.type === 'rich_text' || prop.type === 'text')) {
        required.saved_from.exists = true;
      } else if (propName === 'thumbnail' && prop.type === 'files') {
        required.thumbnail.exists = true;
      }
    }

    // Si la propiedad title no se llama "name", necesitamos renombrarla
    const needsRename = titlePropertyName && titlePropertyName !== 'name';

    return {
      hasAll: required.name.exists && required.url.exists && required.label.exists && required.saved_from.exists && required.thumbnail.exists,
      missing: Object.keys(required).filter(key => !required[key].exists),
      titlePropertyName: required.name.actualName || titlePropertyName,
      needsRename: needsRename,
      database
    };
  } catch (error) {
    throw error;
  }
}

// ============================================
// PERFORMANCE: DATABASE VALIDATION CACHE
// ============================================

const validatedDatabases = new Map();

/**
 * Versión cacheada de checkDatabaseProperties
 * Cache válido por 30 minutos para evitar validaciones repetidas
 * Ahorro: ~500ms por guardado después del primero
 */
export async function checkDatabasePropertiesWithCache(apiKey, databaseId) {
  const cacheKey = `${databaseId}-${apiKey.slice(-8)}`;
  
  if (validatedDatabases.has(cacheKey)) {
    const cached = validatedDatabases.get(cacheKey);
    if (Date.now() - cached.timestamp < 1800000) { // 30 minutos
      return cached.data;
    }
  }
  
  const result = await checkDatabaseProperties(apiKey, databaseId);
  validatedDatabases.set(cacheKey, {
    data: result,
    timestamp: Date.now()
  });
  
  return result;
}

/**
 * Limpia el cache de validación de bases de datos
 * Útil para forzar re-validación después de cambios en el schema
 */
export function clearDatabaseCache() {
  validatedDatabases.clear();
}

/**
 * Agrega propiedades faltantes a la base de datos y renombra la propiedad title a "name"
 */
export async function addMissingProperties(apiKey, databaseId, missingProperties, titlePropertyName = null, needsRename = false) {
  try {
    const properties = {};
    const propertiesToAdd = missingProperties.filter(p => p !== 'name'); // Excluir 'name' de las propiedades a agregar
    
    // Si la propiedad title necesita ser renombrada a "name"
    if (needsRename && titlePropertyName && titlePropertyName !== 'name') {
      properties[titlePropertyName] = {
        name: 'name'
      };
    }
    
    // Agregar otras propiedades faltantes
    for (const propName of propertiesToAdd) {
      switch (propName) {
        case 'url':
          properties.url = {
            url: {}
          };
          break;
        case 'label':
          properties.label = {
            select: {
              options: []
            }
          };
          break;
        case 'saved_from':
          properties.saved_from = {
            rich_text: {}
          };
          break;
        case 'thumbnail':
          properties.thumbnail = {
            files: {}
          };
          break;
      }
    }

    // Si no hay propiedades para agregar/renombrar, retornar éxito
    if (Object.keys(properties).length === 0) {
      return { success: true };
    }

    const updateBody = {
      properties: properties
    };

    return await notionRequest(apiKey, `/databases/${databaseId}`, 'PATCH', updateBody);
  } catch (error) {
    // Si el error es de permisos, lanzar un error más descriptivo
    if (error.message.includes('403') || error.message.includes('permission')) {
      throw new Error('No tienes permisos para modificar esta base de datos. Asegúrate de que tu integración tenga acceso a la base de datos.');
    }
    // Si el error es sobre crear una propiedad title, ignorarlo (ya existe una)
    if (error.message.includes('Cannot create new title property') || error.message.includes('title property')) {
      // La propiedad title ya existe, solo necesitamos usarla con su nombre actual
      return { success: true, skipped: 'title' };
    }
    // Si el error es sobre renombrar, también lo ignoramos y usamos el nombre actual
    if (error.message.includes('rename') || error.message.includes('name')) {
      return { success: true, skipped: 'rename' };
    }
    throw new Error(`Error al agregar propiedades: ${error.message}`);
  }
}

/**
 * Obtiene las opciones disponibles del select "label"
 */
export async function getLabelOptions(apiKey, databaseId) {
  try {
    const database = await getDatabase(apiKey, databaseId);
    const properties = database.properties || {};
    
    if (properties.label && properties.label.type === 'select') {
      const options = properties.label.select.options || [];
      return options.map(option => option.name);
    }
    
    return [];
  } catch (error) {
    throw new Error(`Error al obtener opciones de label: ${error.message}`);
  }
}

/**
 * Extrae el dominio de una URL
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (error) {
    // Si no es una URL válida, intentar extraer dominio básico
    const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
    return match ? match[1] : 'unknown';
  }
}

/**
 * Convierte data URL a blob
 */
export function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Sube una imagen directamente a Notion usando su API de upload
 * Retorna el upload_id que se puede usar en la propiedad files
 */
export async function uploadImageToNotion(apiKey, dataURL) {
  try {
    // Paso 1: Crear un objeto de upload
    const createUploadResponse = await notionRequest(apiKey, '/file_uploads', 'POST', {
      mode: 'single_part'
    });
    
    const uploadId = createUploadResponse.id;
    const sendUrl = createUploadResponse.upload_url || `${NOTION_API_BASE}/file_uploads/${uploadId}/send`;
    
    // Paso 2: Convertir data URL a blob
    const blob = dataURLtoBlob(dataURL);
    
    // Paso 3: Subir el archivo usando multipart/form-data
    const formData = new FormData();
    formData.append('file', blob, 'screenshot.png');
    
    const uploadResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION
        // NO incluir Content-Type aquí, el navegador lo maneja automáticamente con el boundary
      },
      body: formData
    });
    
    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorData.message || `Error al subir el archivo: ${uploadResponse.status}`);
    }
    
    // Paso 4: Verificar el estado del upload
    const uploadStatus = await uploadResponse.json().catch(() => ({}));
    
    // Retornar el upload_id para usarlo en la propiedad files
    return uploadId;
  } catch (error) {
    console.error('Error subiendo imagen a Notion:', error);
    throw error;
  }
}

/**
 * Obtiene metadatos de la base de datos (nombre y emoji)
 */
export async function getDatabaseMetadata(apiKey, databaseId) {
  try {
    const database = await getDatabase(apiKey, databaseId);
    const name = database.title?.[0]?.plain_text || 'Sin nombre';
    
    // Obtener emoji si existe
    let emoji = null;
    if (database.icon) {
      if (database.icon.type === 'emoji') {
        emoji = database.icon.emoji;
      } else {
        // Si es un icono personalizado (archivo), mostrar "🔲"
        emoji = '🔲';
      }
    }
    
    return { name, emoji };
  } catch (error) {
    throw new Error(`Error al obtener metadatos de la base de datos: ${error.message}`);
  }
}

/**
 * Valida la configuración de Notion
 */
export async function validateNotionConfig(apiKey, databaseId) {
  try {
    // Verificar que la base de datos existe y es accesible
    const database = await getDatabase(apiKey, databaseId);
    
    // Verificar propiedades
    const propertiesCheck = await checkDatabaseProperties(apiKey, databaseId);
    
    // Si faltan propiedades o necesita renombrar, intentar agregarlas/renombrarlas
    if (!propertiesCheck.hasAll && propertiesCheck.missing.length > 0 || propertiesCheck.needsRename) {
      try {
        await addMissingProperties(apiKey, databaseId, propertiesCheck.missing, propertiesCheck.titlePropertyName, propertiesCheck.needsRename);
      } catch (error) {
        // Si falla por permisos, lanzar error descriptivo
        if (error.message.includes('permisos') || error.message.includes('permission')) {
          throw new Error('No tienes permisos para modificar esta base de datos. Asegúrate de que tu integración tenga acceso y permisos de edición en la base de datos.');
        }
        throw error;
      }
    }
    
    // Guardar el nombre real de la propiedad title para usarlo al crear páginas
    // Después del renombrado, debería ser "name"
    const finalTitlePropertyName = propertiesCheck.needsRename ? 'name' : propertiesCheck.titlePropertyName;
    
    return { titlePropertyName: finalTitlePropertyName };
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
 * Crea una nueva página en la base de datos con la URL
 */
export async function createPage(apiKey, databaseId, url, title = null, label = null, titlePropertyName = 'name', savedFrom = null, thumbnailUploadId = null) {
  try {
    const pageData = {
      parent: {
        database_id: databaseId
      },
      properties: {
        url: {
          url: url
        }
      }
    };

    // Usar el nombre real de la propiedad title (puede ser "nombre" o cualquier otro nombre)
    const titleContent = title || url;
    pageData.properties[titlePropertyName] = {
      title: [
        {
          text: {
            content: titleContent
          }
        }
      ]
    };

    // Agregar label si se proporciona
    if (label) {
      pageData.properties.label = {
        select: {
          name: label
        }
      };
    }

    // Agregar saved_from con el dominio extraído de la URL
    const domain = savedFrom || extractDomain(url);
    pageData.properties.saved_from = {
      rich_text: [
        {
          text: {
            content: domain
          }
        }
      ]
    };

    // Agregar thumbnail si se proporciona un upload_id
    if (thumbnailUploadId) {
      pageData.properties.thumbnail = {
        files: [
          {
            type: 'file_upload',
            file_upload: {
              id: thumbnailUploadId
            },
            name: 'screenshot.png'
          }
        ]
      };
    }

    return await notionRequest(apiKey, '/pages', 'POST', pageData);
  } catch (error) {
    throw new Error(`Error al crear la página: ${error.message}`);
  }
}
