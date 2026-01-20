# Notion URL Saver - Extensión de Chrome

Extensión de Chrome que te permite guardar URLs directamente en tu base de datos de Notion con un solo click.

## Características

- 🚀 Guarda URLs de páginas web en Notion
- ⚙️ Configuración simple con onboarding
- 🔍 Validación automática de propiedades de base de datos
- ✨ Interfaz moderna y fácil de usar
- 🔒 Almacenamiento seguro de credenciales

## Instalación

1. Clona o descarga este repositorio
2. Abre Chrome y ve a `chrome://extensions/`
3. Activa el "Modo de desarrollador" (Developer mode) en la esquina superior derecha
4. Haz click en "Cargar extensión sin empaquetar" (Load unpacked)
5. Selecciona la carpeta del proyecto

## Configuración

### 1. Crear una Integración en Notion

1. Ve a [Notion Integrations](https://www.notion.so/my-integrations)
2. Haz click en "New integration"
3. Dale un nombre a tu integración (ej: "URL Saver")
4. Selecciona el workspace donde está tu base de datos
5. Copia el **Internal Integration Token** (API Key)

### 2. Conectar la Base de Datos

1. Abre tu base de datos en Notion
2. Haz click en los tres puntos (⋯) en la esquina superior derecha
3. Selecciona "Add connections" o "Conectar"
4. Busca y selecciona tu integración
5. Copia el **Database ID** de la URL de tu base de datos:
   - La URL se ve así: `https://www.notion.so/workspace/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - El Database ID es la parte después del último `/` (sin guiones)

### 3. Configurar la Extensión

1. Haz click en el icono de la extensión en Chrome
2. Ingresa tu **API Key** de Notion
3. Ingresa el **Database ID** de tu base de datos
4. Haz click en "Guardar Configuración"

La extensión verificará automáticamente que tu base de datos tenga las propiedades necesarias:
- `name` (title): Nombre de la página (la extensión renombrará la propiedad title existente a "name")
- `url` (url): URL de la página
- `label` (select): Etiqueta opcional
- `saved_from` (rich_text): Dominio de origen
- `thumbnail` (files): Captura de pantalla de la página

Si faltan propiedades, la extensión intentará agregarlas automáticamente (requiere permisos de edición).

## Uso

1. Navega a cualquier página web que quieras guardar
2. Haz click en el icono de la extensión
3. Haz click en "Guardar URL en Notion"
4. ¡Listo! La URL se guardará en tu base de datos de Notion

## Iconos

La extensión requiere iconos en las siguientes dimensiones:
- `icons/icon16.png` (16x16 píxeles)
- `icons/icon48.png` (48x48 píxeles)
- `icons/icon128.png` (128x128 píxeles)

Puedes generar iconos básicos ejecutando:
```bash
python3 generate-icons.py
```

O crear tus propios iconos y colocarlos en la carpeta `icons/`.

## Estructura del Proyecto

```
pomodoro-cursor/
├── manifest.json          # Configuración de la extensión
├── popup.html             # Interfaz del popup
├── popup.css              # Estilos del popup
├── popup.js               # Lógica principal
├── notion-api.js          # Integración con Notion API
├── icons/                 # Iconos de la extensión
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # Este archivo
```

## Solución de Problemas

### Error: "API Key inválida"
- Verifica que copiaste correctamente el Internal Integration Token
- Asegúrate de que la integración no haya sido eliminada

### Error: "Base de datos no encontrada"
- Verifica que el Database ID sea correcto
- Asegúrate de que la integración esté conectada a la base de datos en Notion

### Error: "No tienes permisos para modificar esta base de datos"
- Ve a tu base de datos en Notion
- Conecta la integración si no está conectada
- Asegúrate de que la integración tenga permisos de edición

### La extensión no guarda URLs
- Verifica que la configuración esté guardada correctamente
- Revisa la consola del navegador para ver errores (F12)
- Asegúrate de que la base de datos tenga las propiedades correctas

## Desarrollo

Esta extensión está construida con:
- Vanilla JavaScript (sin frameworks)
- Chrome Extension Manifest V3
- Notion API v1

## Licencia

Este proyecto es de código abierto y está disponible para uso personal y comercial.
