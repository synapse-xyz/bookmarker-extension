# Notion URL Saver - Extensión de Chrome

Extensión de Chrome que te permite guardar URLs directamente en tu base de datos de Notion con un solo click. Ahora con soporte para múltiples perfiles y menú contextual.

## Características

- 🚀 **Guardado Rápido:** Guarda URLs de páginas web en Notion con un click.
- 👥 **Múltiples Perfiles:** Configura y alterna entre diferentes bases de datos o espacios de trabajo.
- 🖱️ **Menú Contextual:** Guarda la página actual o enlaces específicos haciendo click derecho, sin abrir el popup.
- 📸 **Capturas de Pantalla:** Guarda automáticamente una miniatura de la página (solo al guardar página completa).
- 🏷️ **Etiquetado:** Asigna etiquetas (select) a tus guardados directamente desde la extensión.
- 🔍 **Validación Automática:** Verifica y crea las propiedades necesarias en tu base de datos.
- 🚦 **Feedback Visual:** Indicadores de estado (badges) en el icono para confirmar el guardado.

## Instalación

1. Clona o descarga este repositorio.
2. Abre Chrome y ve a `chrome://extensions/`.
3. Activa el "Modo de desarrollador" (Developer mode) en la esquina superior derecha.
4. Haz click en "Cargar extensión sin empaquetar" (Load unpacked).
5. Selecciona la carpeta del proyecto `bookmarker-extension`.

## Configuración

### 1. Preparar Notion

1. Crea una Integración en [Notion Integrations](https://www.notion.so/my-integrations).
2. Obtén el **Internal Integration Token** (API Key).
3. Conecta tu integración a la base de datos deseada (menú `...` > Add connections).
4. Obtén el **Database ID** desde la URL de la base de datos.

### 2. Configurar la Extensión

Al abrir la extensión por primera vez, verás una pantalla de bienvenida:

1. Ingresa tu **API Key** de Notion.
2. Ingresa el **Database ID**.
3. Haz click en "Guardar Configuración".

La extensión validará la conexión y guardará el perfil. Puedes agregar más perfiles posteriormente desde la interfaz principal.

### Propiedades de la Base de Datos

La extensión utiliza las siguientes propiedades (se crearán si no existen y tienes permisos):
- `name` (title): Título de la página.
- `url` (url): Link guardado.
- `label` (select): Categoría/Etiqueta.
- `saved_from` (rich_text): Dominio de origen.
- `thumbnail` (files): Captura de pantalla (opcional).

## Uso

### Desde el Popup
1. Haz click en el icono de la extensión.
2. Selecciona un perfil (si tienes varios).
3. (Opcional) Elige una etiqueta.
4. Haz click en "Guardar URL en Notion".

### Desde el Menú Contextual (Click Derecho)
- **En cualquier página:** Selecciona "Guardar página actual en Notion" para guardar la URL y una captura de pantalla.
- **Sobre un enlace:** Selecciona "Guardar enlace en Notion" para guardar solo ese link específico (sin captura).

Observa el icono de la extensión para ver el estado:
- 🔵 `...`: Guardando...
- 🟢 `✓`: ¡Guardado exitoso!
- 🔴 `✗`: Error (revisa tu configuración).

## Estructura del Proyecto

```
bookmarker-extension/
├── manifest.json           # Configuración (Manifest V3)
├── background.js           # Service worker y menú contextual
├── popup.html              # Interfaz de usuario
├── popup.css               # Estilos
├── popup.js                # Lógica de la interfaz
├── shared-functions.js     # Lógica compartida (API Notion, Storage)
├── notion-api.js           # (Deprecado - funciones movidas a shared)
├── IMPLEMENTATION_NOTES.md # Detalles técnicos
└── TROUBLESHOOTING.md      # Solución de problemas
```

## Solución de Problemas

Si encuentras errores:
1. **API Key/Database ID:** Verifica que sean correctos y que la integración esté conectada a la base de datos.
2. **Badges Rojos:** Si el icono muestra una `✗`, abre el popup para ver el mensaje de error detallado.
3. **Logs:**
   - Click derecho en el popup > "Inspeccionar" para ver errores de interfaz.
   - Ve a `chrome://extensions` > "Inspect views: service worker" para errores de fondo.

Consulta `TROUBLESHOOTING.md` para más detalles.

## Desarrollo

Construido con:
- Vanilla JavaScript (ES Modules)
- Chrome Extension Manifest V3
- Notion API

## Licencia

Este proyecto es de código abierto.