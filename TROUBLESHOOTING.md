# Troubleshooting - Menú Contextual

## 🔧 Pasos para Diagnosticar Problemas

### Paso 1: Verificar que la extensión cargó correctamente

1. Ve a `chrome://extensions/`
2. Busca "Notion URL Saver"
3. Verifica que esté **activada** (toggle azul)
4. Si muestra errores, anota todos

### Paso 2: Revisar la consola del Service Worker

1. En `chrome://extensions/`
2. Busca "Notion URL Saver"
3. En la sección "Service workers", haz click en "background.html"
4. Se abrirá DevTools con la consola del service worker
5. **Copia todos los errores que veas**

### Paso 3: Revisar la consola del Popup

1. Abre el popup (click en el icono de la extensión)
2. Click derecho en el popup
3. Selecciona "Inspect"
4. En DevTools, ve a la pestaña "Console"
5. **Copia todos los errores que veas**

### Paso 4: Verificar que el menú aparezca

1. Abre cualquier página web
2. Click derecho en cualquier lugar
3. **¿Ves las opciones "Guardar página actual" y "Guardar enlace"?**
   - Si SÍ → El menú está funcionando, continúa con Paso 5
   - Si NO → El service worker no está corriendo, ve a "Solución: Service Worker No Corre"

### Paso 5: Verificar que el menú responda

1. Click derecho en una página
2. Haz click en "Guardar página actual en Notion"
3. **¿Ves un badge azul en el icono?**
   - Si SÍ → El menú responde, continúa con Paso 6
   - Si NO → El evento no se está capturando, ve a "Solución: Evento No Se Captura"

### Paso 6: Revisar si se guardó en Notion

1. Abre Notion
2. Ve a tu base de datos de bookmarks
3. **¿Ves la página nueva?**
   - Si SÍ → ¡Todo funciona! Problema resuelto.
   - Si NO → El guardado falló, ve a "Solución: Fallo al Guardar"

---

## 🆘 Soluciones Comunes

### Solución 1: Service Worker No Corre

**Síntoma:** El menú contextual no aparece

**Pasos:**
1. Ve a `chrome://extensions/`
2. Busca "Notion URL Saver"
3. Haz click en "Recargar" (el ícono circular)
4. Espera 5 segundos
5. Intenta el menú contextual de nuevo

**Si sigue sin funcionar:**
1. Desactiva la extensión (toggle OFF)
2. Espera 2 segundos
3. Actívala de nuevo (toggle ON)
4. Intenta de nuevo

**Si sigue sin funcionar:**
1. Ve a DevTools del service worker (ver Paso 2)
2. Revisa si hay errores
3. Copia el error exacto
4. Reporta el error

### Solución 2: Error "Module not found"

**Síntoma:** Error en la consola del service worker

**Causa:** El archivo `shared-functions.js` no existe o no está en el lugar correcto

**Pasos:**
1. Verifica que el archivo exista en `/bookmarker-extension/shared-functions.js`
2. Si no existe, descárgalo o crea uno nuevo
3. Recarga la extensión

### Solución 3: Error "getSelectedProfile is not a function"

**Síntoma:** El menú aparece, haces click, pero nada ocurre

**Causa:** Los imports no funcionaron

**Pasos:**
1. En la consola del service worker, ejecuta:
   ```javascript
   chrome.runtime.getManifest()
   ```
2. Verifica que aparezca el manifest completo
3. Si hay errores, reporta

### Solución 4: Error "Cannot use import statement"

**Síntoma:** Error en la consola del service worker

**Causa:** El service worker no está configurado como módulo

**Verificación:**
1. Abre `manifest.json`
2. Busca la sección `"background"`
3. Verifica que contenga:
   ```json
   "background": {
     "service_worker": "background.js",
     "type": "module"
   }
   ```
4. Si no tiene `"type": "module"`, edítalo

### Solución 5: Fallo al Guardar en Notion

**Síntoma:** Badge verde, pero no aparece en Notion

**Pasos:**
1. En la consola del service worker, busca líneas que digan:
   - `Error guardando página:`
   - `Error guardando enlace:`
2. Copia el error exacto
3. Verifica que tu perfil esté configurado:
   - Abre el popup
   - ¿Ves un perfil seleccionado?
   - Si no, configura uno primero

### Solución 6: No Veo el Badge

**Síntoma:** Hago click en el menú pero no veo feedback visual

**Pasos:**
1. Verifica que el popup NO esté abierto
2. Intenta guardar de nuevo
3. Mira el ícono de la extensión (debe cambiar de color)
4. Si no cambia, reporta

---

## 📋 Checklist de Diagnóstico Completo

```
1. ¿La extensión está activada en chrome://extensions/?
   [ ] Sí     [ ] No

2. ¿El service worker corre?
   [ ] Sí (Service worker: running)    [ ] No (Service worker: stopped)

3. ¿El menú contextual aparece?
   [ ] Sí     [ ] No

4. ¿El menú responde (ves el badge azul)?
   [ ] Sí     [ ] No

5. ¿Se guardó en Notion?
   [ ] Sí     [ ] No

6. ¿Hay errores en la consola?
   [ ] Sí → Copia el error exacto
   [ ] No
```

---

## 🐛 Reporte de Bugs

Si aún tienes problemas, comparte:

1. **Error exacto** de la consola
2. **Navegador y versión** (ej: Chrome 120)
3. **Sistema operativo** (Windows, Mac, Linux)
4. **Pasos para reproducir** el problema
5. **Screenshot** de los errores (si es posible)

---

## 📞 Comandos Útiles para DevTools

En la consola del service worker, puedes ejecutar:

```javascript
// Ver si chrome.contextMenus existe
chrome.contextMenus

// Ver todos los menús creados
chrome.contextMenus.query({}, (items) => console.log(items))

// Ver el manifest
chrome.runtime.getManifest()

// Ver storage
chrome.storage.local.get(null, (items) => console.log(items))
```

