// Service Worker para limpiar screenshots antiguos
// La captura de screenshot se hace desde el popup.js cuando se carga

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

// También limpiar cuando se instala/actualiza
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['screenshotTimestamp'], (result) => {
    if (result.screenshotTimestamp) {
      const age = Date.now() - result.screenshotTimestamp;
      if (age > 3600000) { // 1 hora
        chrome.storage.local.remove(['pendingScreenshot', 'screenshotTimestamp']);
      }
    }
  });
});
