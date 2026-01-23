// ============================================
// CONTENT SCRIPT: X.COM SAVE BUTTON
// ============================================

const BUTTON_ATTRIBUTE = 'data-notion-save-button';
const TOAST_ID = 'notion-save-toast';
const STYLE_ID = 'notion-save-style';

const TOAST_DURATION = 2500;
let toastTimeoutId = null;

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
      transition: background-color 0.2s ease;
    }

    .notion-save-button:hover {
      background-color: rgba(15, 20, 25, 0.1);
    }

    .notion-save-button svg {
      width: 18px;
      height: 18px;
      display: block;
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

function createSaveButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'notion-save-button';
  button.setAttribute('aria-label', 'Guardar en Notion');
  button.setAttribute(BUTTON_ATTRIBUTE, 'true');
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm0 2v14h12V9h-4V5H6zm4 7h4v6h-4v-6z" />
    </svg>
  `;

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

function getTweetTitle(article, fallbackUrl) {
  const textElement = article.querySelector('[data-testid="tweetText"]');
  const text = textElement?.innerText?.trim();
  return text || fallbackUrl || 'Tweet';
}

async function handleSaveClick(article, button) {
  const url = getTweetUrl(article);
  if (!url) {
    showToast('No se pudo obtener el enlace');
    return;
  }

  const title = getTweetTitle(article, url);
  button.disabled = true;
  showToast('Guardando en Notion...');

  chrome.runtime.sendMessage(
    {
      type: 'save-link-from-content',
      payload: { url, title }
    },
    (response) => {
      button.disabled = false;
      if (chrome.runtime.lastError) {
        showToast('Error al guardar');
        return;
      }

      if (response?.success) {
        showToast('Guardado en Notion');
      } else {
        showToast(response?.message || 'Error al guardar');
      }
    }
  );
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
