# Notion URL Saver - Extensión para Navegadores

Guarda URLs directamente en tu base de datos de Notion con un solo click. Compatible con Chrome, Firefox y otros navegadores basados en Chromium.

## Características

- 🚀 **Guardado Rápido:** Guarda URLs de páginas web en Notion con un click.
- 👥 **Múltiples Perfiles:** Configura y alterna entre diferentes bases de datos o espacios de trabajo.
- 🖱️ **Menú Contextual:** Guarda la página actual o enlaces específicos haciendo click derecho, sin abrir el popup.
- 📸 **Capturas de Pantalla:** Guarda automáticamente una miniatura de la página (solo al guardar página completa).
- 🏷️ **Etiquetado:** Asigna etiquetas (select) a tus guardados directamente desde la extensión.
- 🔍 **Validación Automática:** Verifica y crea las propiedades necesarias en tu base de datos.
- 🚦 **Feedback Visual:** Indicadores de estado (badges) en el icono para confirmar el guardado.

## Instalación

Primero, descarga o clona este repositorio en tu equipo.

### Google Chrome / Microsoft Edge / Brave
1. Abre el navegador y ve a `chrome://extensions/`.
2. Activa el **"Modo de desarrollador"** (Developer mode) en la esquina superior derecha.
3. Haz click en el botón **"Cargar extensión sin empaquetar"** (Load unpacked).
4. Selecciona la carpeta del proyecto `bookmarker-extension`.

### Mozilla Firefox
1. Abre Firefox y escribe `about:debugging` en la barra de direcciones.
2. Haz click en **"Este Firefox"** (This Firefox) en el menú de la izquierda.
3. Haz click en el botón **"Cargar complemento temporalmente..."** (Load Temporary Add-on...).
4. Selecciona el archivo `manifest.json` que se encuentra en la raíz de la carpeta del proyecto.

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

La extensión validará la conexión y guardará el perfil automáticamente. Puedes agregar más perfiles posteriormente desde la interfaz principal.

### Propiedades de la Base de Datos

La extensión utiliza las siguientes propiedades (se crearán automáticamente si no existen):
- `name` (title): Título de la página.
- `url` (url): Link guardado.
- `label` (select): Categoría/Etiqueta.
- `saved_from` (rich_text): Dominio de origen.
- `thumbnail` (files): Captura de pantalla (opcional).

## Uso

### Desde el Popup
1. Haz click en el icono de la extensión.
2. Selecciona un perfil y (opcionalmente) una etiqueta.
3. Haz click en **"Guardar URL en Notion"**.

### Desde el Menú Contextual (Click Derecho)
- **Sobre la página:** "Guardar página actual en Notion" (incluye captura de pantalla).
- **Sobre un enlace:** "Guardar enlace en Notion" (rápido, sin captura).

### Feedback Visual
Observa el icono de la extensión para conocer el estado:
- 🔵 `...`: Procesando...
- 🟢 `✓`: ¡Guardado con éxito!
- 🔴 `✗`: Error (abre el popup para más detalles).

## Estructura del Proyecto

```
bookmarker-extension/
├── manifest.json           # Configuración de la extensión
├── background.js           # Lógica de fondo y menús contextuales
├── shared-functions.js     # Funciones compartidas (API, Storage)
├── popup.html/js/css       # Interfaz de usuario
├── IMPLEMENTATION_NOTES.md # Notas técnicas
└── TROUBLESHOOTING.md      # Guía de solución de problemas
```

## Desarrollo

- **Tecnologías:** Vanilla JavaScript (ES Modules), Manifest V3.
- **API:** Notion API v1.

## Licencia

Este proyecto es de código abierto.
