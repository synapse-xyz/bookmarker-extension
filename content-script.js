// ============================================
// CONTENT SCRIPT: X.COM SAVE BUTTON
// ============================================

const BUTTON_ATTRIBUTE = 'data-notion-save-button';
const TOAST_ID = 'notion-save-toast';
const STYLE_ID = 'notion-save-style';

const TOAST_DURATION = 2500;
const STATE_RESET_DELAY = 1600;
const SCROLL_DELAY = 450;

const BUTTON_STATES = {
  idle: '💾',
  loading: '⌛',
  success: '✅',
  error: '❌'
};

let toastTimeoutId = null;
const buttonResetTimers = new WeakMap();

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .notion-save-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 999px;
      border: none;
      background: transparent;
      cursor: pointer;
      color: inherit;
      font-size: 16px;
      line-height: 1;
      transition: background-color 0.2s ease, opacity 0.2s ease;
    }

    .notion-save-button:hover {
      background-color: rgba(15, 20, 25, 0.1);
    }

    .notion-save-button:disabled {
      cursor: default;
      opacity: 0.6;
    }

    .notion-save-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      background: rgba(15, 20, 25, 0.9);
      color: #fff;
      font-size: 13px;
      padding: 10px 14px;
      border-radius: 10px;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }

    .notion-save-toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  `;

  document.head.appendChild(style);
}

function ensureToast() {
  let toast = document.getElementById(TOAST_ID);
  if (toast) return toast;

  toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.className = 'notion-save-toast';
  document.body.appendChild(toast);
  return toast;
}

function showToast(message) {
  const toast = ensureToast();
  toast.textContent = message;
  toast.classList.add('show');

  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, TOAST_DURATION);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setButtonState(button, state) {
  button.textContent = BUTTON_STATES[state] || BUTTON_STATES.idle;
  button.dataset.state = state;
}

function scheduleButtonReset(button) {
  const existingTimer = buttonResetTimers.get(button);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timeoutId = setTimeout(() => {
    setButtonState(button, 'idle');
    button.disabled = false;
  }, STATE_RESET_DELAY);

  buttonResetTimers.set(button, timeoutId);
}

function createSaveButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'notion-save-button';
  button.setAttribute('aria-label', 'Guardar en Notion');
  button.setAttribute(BUTTON_ATTRIBUTE, 'true');
  setButtonState(button, 'idle');

  return button;
}

function getTweetUrl(article) {
  if (!article) return null;

  const anchor = article.querySelector('a[href*="/status/"]');
  if (!anchor) return null;

  try {
    const url = new URL(anchor.getAttribute('href'), window.location.origin);
    return url.toString();
  } catch (error) {
    return null;
  }
}

function getTweetUsername(article) {
  const userAnchor = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
  const username = userAnchor?.innerText?.trim();

  if (username) {
    return username.replace(/\s+/g, ' ');
  }

  return null;
}

function getTweetTitle(article, fallbackUrl) {
  const textElement = article.querySelector('[data-testid="tweetText"]');
  const text = textElement?.innerText?.trim();

  if (!text) {
    return fallbackUrl || 'Tweet';
  }

  const words = text.split(/\s+/).filter(Boolean).slice(0, 7);
  const snippet = words.join(' ');
  const username = getTweetUsername(article) || 'Alguien';

  return `${username} on X: ${snippet}`;
}

async function requestVisibleTabCapture() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'capture-visible-tab' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Error al capturar pantalla'));
          return;
        }

        if (!response?.success || !response.dataUrl) {
          reject(new Error(response?.message || 'No se pudo capturar'));
          return;
        }

        resolve(response.dataUrl);
      }
    );
  });
}

async function cropScreenshot(dataUrl, rect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return dataUrl;
  }

  const image = new Image();
  image.src = dataUrl;

  await new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Error cargando captura'));
  });

  const scale = window.devicePixelRatio || 1;
  const x = Math.max(0, rect.left * scale);
  const y = Math.max(0, rect.top * scale);
  const width = Math.min(image.width - x, rect.width * scale);
  const height = Math.min(image.height - y, rect.height * scale);

  if (width <= 0 || height <= 0) {
    return dataUrl;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);

  const context = canvas.getContext('2d');
  if (!context) {
    return dataUrl;
  }

  context.drawImage(
    image,
    x,
    y,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL('image/png');
}

function sendSaveRequest(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'save-link-from-content',
        payload
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, message: 'Error al guardar' });
          return;
        }

        resolve(response || { success: false, message: 'Error al guardar' });
      }
    );
  });
}

async function handleSaveClick(article, button) {
  if (button.dataset.state === 'loading') {
    return;
  }

  const url = getTweetUrl(article);
  if (!url) {
    showToast('No se pudo obtener el enlace');
    setButtonState(button, 'error');
    scheduleButtonReset(button);
    return;
  }

  const title = getTweetTitle(article, url);
  button.disabled = true;
  setButtonState(button, 'loading');
  showToast('Guardando en Notion...');

  try {
    article.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(SCROLL_DELAY);

    const rect = article.getBoundingClientRect();
    const screenshot = await requestVisibleTabCapture();
    const thumbnailDataUrl = await cropScreenshot(screenshot, rect);

    const response = await sendSaveRequest({ url, title, thumbnailDataUrl });

    if (response?.success) {
      showToast('Guardado en Notion');
      setButtonState(button, 'success');
    } else {
      showToast(response?.message || 'Error al guardar');
      setButtonState(button, 'error');
    }
  } catch (error) {
    showToast(error.message || 'Error al guardar');
    setButtonState(button, 'error');
  } finally {
    scheduleButtonReset(button);
  }
}

function injectButtonForMoreMenu(moreButton) {
  if (!moreButton || moreButton.closest(`[${BUTTON_ATTRIBUTE}]`)) return;

  const actionBar = moreButton.parentElement;
  if (!actionBar || actionBar.querySelector(`[${BUTTON_ATTRIBUTE}]`)) return;

  const article = moreButton.closest('article');
  if (!article) return;

  const button = createSaveButton();
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    handleSaveClick(article, button);
  });

  actionBar.insertBefore(button, moreButton);
}

function scanAndInject() {
  ensureStyles();

  const moreButtons = document.querySelectorAll('div[data-testid="caret"], button[data-testid="caret"]');
  moreButtons.forEach(button => injectButtonForMoreMenu(button));
}

function startObserver() {
  scanAndInject();

  const observer = new MutationObserver(() => {
    scanAndInject();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}
