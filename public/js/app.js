// Progressive enhancements for the app shell. Every page still works without this file.

const drawer = document.getElementById('app-drawer');
const DRAWER_SHOW_DELAY_MS = 150; // DaisyUI keeps .drawer-side hidden (unfocusable) for 0.1s after opening

function closeOpenMenus(except) {
  document.querySelectorAll('details[data-dismissable][open]').forEach((menu) => {
    if (menu !== except) menu.removeAttribute('open');
  });
}

document.addEventListener('keydown', (event) => {
  // The drawer button is a <label>, and labels ignore Enter/Space on their own.
  const keyButton = event.target.closest('[data-key-click]');
  if (keyButton && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    keyButton.click();
  }

  if (event.key === 'Escape') {
    closeOpenMenus();
    if (drawer?.checked) {
      drawer.checked = false;
      drawer.dispatchEvent(new Event('change'));
    }
  }
});

// A click outside an open menu closes it, and so does following a link inside it (e.g. an in-page anchor).
document.addEventListener('click', (event) => {
  closeOpenMenus(event.target.closest('a') ? null : event.target.closest('details'));
});

// Keyboard users land inside the drawer when it opens, and back on the menu button when it closes.
drawer?.addEventListener('change', () => {
  if (drawer.checked) setTimeout(() => document.querySelector('.drawer-side nav a')?.focus(), DRAWER_SHOW_DELAY_MS);
  else document.querySelector('[data-drawer-open]')?.focus();
});

// Toasts (views/partials/toast.ejs). Undo actions need the full 5 seconds, so hover or focus pauses the timer.
const TOAST_DURATION_MS = 5000;

// Pages that animate toasts out (the admin console, src/css/app.css) get [data-leaving] and a moment to play it;
// elsewhere there is no animation and the toast goes at once, as before.
function removeToast(toastElement) {
  toastElement.dataset.leaving = '';
  if (getComputedStyle(toastElement).animationName === 'none') return toastElement.remove();
  toastElement.addEventListener('animationend', () => toastElement.remove(), { once: true });
  setTimeout(() => toastElement.remove(), 400); // in case the animation never runs (e.g. a background tab)
}

function dismissLater(toastElement) {
  let timer;
  const start = () => (timer = setTimeout(() => removeToast(toastElement), TOAST_DURATION_MS));
  const pause = () => clearTimeout(timer);
  toastElement.addEventListener('mouseenter', pause);
  toastElement.addEventListener('mouseleave', start);
  toastElement.addEventListener('focusin', pause);
  toastElement.addEventListener('focusout', start);
  start();
}

function toast(message, { type = 'success', actionLabel, onAction } = {}) {
  const template = document.getElementById(`toast-template-${type}`);
  const toastElement = template.content.firstElementChild.cloneNode(true);
  toastElement.querySelector('[data-toast-message]').textContent = message;

  if (actionLabel) {
    const action = toastElement.querySelector('[data-toast-action]');
    action.textContent = actionLabel;
    action.hidden = false;
    action.addEventListener('click', () => {
      toastElement.remove();
      onAction?.();
    });
  }

  document.getElementById('toast-region').append(toastElement);
  dismissLater(toastElement);
  return toastElement;
}

document.querySelectorAll('#toast-region [data-toast]').forEach(dismissLater); // flash messages from the server

window.agendal = { toast };

// Modals (views/partials/modal.ejs)
document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-modal]');
  if (!opener) return;
  event.preventDefault(); // an opener can be a link to a no-JS fallback page
  document.getElementById(opener.dataset.openModal)?.showModal();
});

// Confirm destructive actions (views/partials/confirm-dialog.ejs). Without JS the form submits directly.
const confirmDialog = document.getElementById('confirm-dialog');

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.dataset.confirm || !confirmDialog) return;

  event.preventDefault();
  confirmDialog.querySelector('#confirm-heading').textContent = form.dataset.confirm;
  confirmDialog.querySelector('#confirm-detail').textContent = form.dataset.confirmDetail ?? '';
  confirmDialog.querySelector('[data-confirm-button]').textContent = form.dataset.confirmButton ?? 'Delete';
  confirmDialog.returnValue = '';
  confirmDialog.addEventListener('close', () => confirmDialog.returnValue === 'confirm' && form.submit(), { once: true });
  confirmDialog.showModal();
});

// Forms that should submit as soon as a value is picked, e.g. the avatar file input.
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-autosubmit]')) event.target.form.requestSubmit();
});

// Welcome screen: preselect the browser's time zone when the list has it.
const timeZoneSelect = document.querySelector('[data-detect-time-zone]');
const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (timeZoneSelect && [...timeZoneSelect.options].some((option) => option.value === browserTimeZone)) {
  timeZoneSelect.value = browserTimeZone;
}
// Show / hide password. The buttons are `hidden` in the HTML so they only appear when this script can make them work.
document.querySelectorAll('[data-toggle-password]').forEach((button) => (button.hidden = false));
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-toggle-password]');
  if (!button) return;
  const input = document.getElementById(button.getAttribute('aria-controls'));
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
  button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  button.querySelector('[data-eye]').hidden = show;
  button.querySelector('[data-eye-off]').hidden = !show;
  input.focus();
});

// Forms marked data-fetch post in the background. The server still answers with its usual redirect, and the page it
// redirects to replaces the main content, sidebar and toasts here: the list updates without a reload or a jump to the top.
// Without JavaScript, or if the request fails, the form posts as normal.
function swapPage(html) {
  const page = new DOMParser().parseFromString(html, 'text/html');
  ['#main', '.drawer-side nav'].forEach((selector) => {
    const fresh = page.querySelector(selector);
    if (fresh) document.querySelector(selector)?.replaceWith(fresh);
  });
  page.querySelectorAll('#toast-region [data-toast]').forEach((toastElement) => {
    document.getElementById('toast-region').append(toastElement);
    dismissLater(toastElement);
  });
  document.dispatchEvent(new Event('agendal:render')); // pages with their own scripts set up the new content
}

// POSTs `fields` the way a form would (adding the page's CSRF token) and swaps in the page the server redirects to.
// Used by data-fetch forms and by scripts like the Board's drag and drop (window.agendal.post).
async function postAndSwap(url, fields) {
  const body = new URLSearchParams(fields);
  if (!body.has('_csrf')) body.set('_csrf', document.querySelector('input[name=_csrf]')?.value ?? '');
  const response = await fetch(url, { method: 'post', body });
  // Sent somewhere else, e.g. to the login page because the session ended: go there for real.
  if (!response.ok || new URL(response.url).pathname !== location.pathname) return location.assign(response.url);
  swapPage(await response.text());
}
window.agendal.post = postAndSwap;

// Which form to give focus back to after the swap: data-fetch="<key>" when several forms share one action.
const fetchKey = (form) => form.dataset.fetch || form.getAttribute('action');

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (event.defaultPrevented || !form.matches('form[data-fetch]')) return;
  event.preventDefault();
  const buttons = [...form.querySelectorAll('button')];
  if (buttons.some((button) => button.disabled)) return; // a double click: the first one is still on its way
  const key = form.contains(document.activeElement) ? fetchKey(form) : null;
  buttons.forEach((button) => (button.disabled = true));
  try {
    await postAndSwap(form.action, new FormData(form));
    if (key) [...document.querySelectorAll('form[data-fetch]')].find((other) => fetchKey(other) === key)?.querySelector('button')?.focus();
  } catch {
    form.submit();
  }
});

// While a form is being sent its submit button is disabled and says so, so a double click can't send it twice.
// Registered after the confirm-dialog handler, and skipped when that handler already stopped the submit.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (event.defaultPrevented || form.hasAttribute('data-no-pending') || form.method !== 'post') return;
  // Next tick: the browser reads the clicked button's name/value before this runs, and a disabled button would be left out.
  setTimeout(() => {
    form.querySelectorAll('button[type=submit]:not([form])').forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
  }, 0);
});
// Coming back with the Back button restores the page from cache: make the buttons usable again.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  document.querySelectorAll('button[aria-busy=true]').forEach((button) => {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  });
});
