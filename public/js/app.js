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

function dismissLater(toastElement) {
  let timer;
  const start = () => (timer = setTimeout(() => toastElement.remove(), TOAST_DURATION_MS));
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
