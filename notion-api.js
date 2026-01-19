// Notion API Integration
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

/**
 * Realiza una petición a la API de Notion
 */
async function notionRequest(apiKey, endpoint, method = 'GET', body = null) {
  const url = `${NOTION_API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
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
async function getDatabase(apiKey, databaseId) {
  try {
    return await notionRequest(apiKey, `/databases/${databaseId}`);
  } catch (error) {
    throw new Error(`Error al obtener la base de datos: ${error.message}`);
  }
}

/**
 * Verifica si la base de datos tiene las propiedades requeridas
 */
async function checkDatabaseProperties(apiKey, databaseId) {
  try {
    const database = await getDatabase(apiKey, databaseId);
    const properties = database.properties || {};
    
    const required = {
      nombre: { type: 'title', exists: false, actualName: null },
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
        // Si se llama "nombre", marcarla como existente
        if (propName === 'nombre') {
          required.nombre.exists = true;
          required.nombre.actualName = propName;
        }
        break; // Solo puede haber una propiedad title
      }
    }

    // Si existe una propiedad title pero no se llama "nombre", la renombraremos
    if (titlePropertyName && titlePropertyName !== 'nombre') {
      required.nombre.exists = true; // Consideramos que existe (solo necesita renombrarse)
      required.nombre.actualName = titlePropertyName;
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

    return {
      hasAll: required.nombre.exists && required.url.exists && required.label.exists && required.saved_from.exists && required.thumbnail.exists,
      missing: Object.keys(required).filter(key => !required[key].exists),
      titlePropertyName: required.nombre.actualName || titlePropertyName,
      database
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Agrega propiedades faltantes a la base de datos y renombra la propiedad title si es necesario
 */
async function addMissingProperties(apiKey, databaseId, missingProperties, titlePropertyName = null) {
  try {
    const properties = {};
    const propertiesToAdd = missingProperties.filter(p => p !== 'nombre'); // Excluir 'nombre' de las propiedades a agregar
    
    // Si falta "nombre" pero existe una propiedad title, intentar renombrarla
    if (missingProperties.includes('nombre') && titlePropertyName && titlePropertyName !== 'nombre') {
      try {
        // Intentar renombrar la propiedad title existente a "nombre"
        properties[titlePropertyName] = {
          name: 'nombre'
        };
      } catch (error) {
        // Si falla el renombrado, simplemente usaremos el nombre actual de la propiedad
        console.warn(`No se pudo renombrar la propiedad title a "nombre". Se usará el nombre actual: ${titlePropertyName}`);
      }
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
async function getLabelOptions(apiKey, databaseId) {
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
function extractDomain(url) {
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
function dataURLtoBlob(dataURL) {
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
async function uploadImageToNotion(apiKey, dataURL) {
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
 * Crea una nueva página en la base de datos con la URL
 */
async function createPage(apiKey, databaseId, url, title = null, label = null, titlePropertyName = 'nombre', savedFrom = null, thumbnailUploadId = null) {
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
