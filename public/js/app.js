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
    const menu = event.target.closest('details[data-dismissable][open]');
    closeOpenMenus();
    menu?.querySelector('summary')?.focus();
    if (drawer?.checked && !menu && !document.querySelector('dialog[open]')) {
      drawer.checked = false;
      drawer.dispatchEvent(new Event('change'));
    }
  }
});

// A click outside an open menu closes it, and so does following a link inside it (e.g. an in-page anchor).
document.addEventListener('click', (event) => {
  closeOpenMenus(event.target.closest('a') ? null : event.target.closest('details'));
});

// On mobile the open navigation blocks background interaction and contains keyboard focus.
const desktopLayout = window.matchMedia('(min-width: 64rem)');
function syncDrawer() {
  if (!drawer) return;
  const open = drawer.checked && !desktopLayout.matches;
  document.querySelector('.drawer-content').inert = open;
  document.querySelector('.drawer-side').inert = !desktopLayout.matches && !open;
  document.querySelector('[data-drawer-open]')?.setAttribute('aria-expanded', String(open));
}
drawer?.addEventListener('change', () => {
  syncDrawer();
  if (drawer.checked) setTimeout(() => {
    if (drawer.checked && !desktopLayout.matches) document.querySelector('.drawer-side nav a')?.focus();
  }, DRAWER_SHOW_DELAY_MS);
  else document.querySelector('[data-drawer-open]')?.focus();
});
desktopLayout.addEventListener('change', syncDrawer);
syncDrawer();
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab' || !drawer?.checked || desktopLayout.matches || document.querySelector('dialog[open]')) return;
  const controls = [...document.querySelectorAll('.drawer-side a, .drawer-side button, .drawer-side summary')]
    .filter((control) => !control.disabled && control.getClientRects().length && getComputedStyle(control).visibility !== 'hidden'
      && (!control.closest('details:not([open])') || control.matches('summary')));
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});

// Informational toasts pause on hover/focus; errors and recovery actions remain until dismissed.
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
  toastElement.querySelector('[data-toast-dismiss]')?.removeAttribute('hidden');
  // Recovery actions and errors remain available until explicitly dismissed.
  if (toastElement.querySelector('form, [data-toast-action]:not([hidden])') || toastElement.getAttribute('role') === 'alert') return;
  let timer;
  const start = () => { clearTimeout(timer); timer = setTimeout(() => removeToast(toastElement), TOAST_DURATION_MS); };
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
document.addEventListener('click', (event) => {
  const dismiss = event.target.closest('[data-toast-dismiss]');
  if (dismiss) removeToast(dismiss.closest('[data-toast]'));
});

window.agendal = { toast };

// Modals (views/partials/modal.ejs)
document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-modal]');
  if (!opener) return;
  const dialog = document.getElementById(opener.dataset.openModal);
  if (!dialog) return;
  event.preventDefault(); // an opener can be a link to a no-JS fallback page
  dialog.addEventListener('close', () => opener.isConnected && opener.focus(), { once: true });
  dialog.showModal();
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
// Without JavaScript the form posts normally. An uncertain POST is never replayed automatically.
const dirtyForms = new Set();
let pendingPosts = 0;
function hasUnsavedInput() {
  for (const form of dirtyForms) if (!form.isConnected) dirtyForms.delete(form);
  return dirtyForms.size > 0;
}
['input', 'change'].forEach((type) => document.addEventListener(type, (event) => {
  const form = event.target.form;
  if (form?.method === 'post') dirtyForms.add(form);
}));

function swapPage(html) {
  const page = new DOMParser().parseFromString(html, 'text/html');
  ['#main', '.drawer-side nav'].forEach((selector) => {
    if (selector === '#main' && hasUnsavedInput()) { stale = true; return; }
    const fresh = page.querySelector(selector);
    if (fresh) document.querySelector(selector)?.replaceWith(fresh);
  });
  page.querySelectorAll('#toast-region [data-toast]').forEach((toastElement) => {
    document.getElementById('toast-region').append(toastElement);
    dismissLater(toastElement);
  });
  document.dispatchEvent(new Event('agendal:render')); // pages with their own scripts set up the new content
}

// Names this tab in its background posts, so the live update they cause (below) isn't applied here a second time.
const tabId = Math.random().toString(36).slice(2);

function showFormErrors(form, html) {
  const page = new DOMParser().parseFromString(html, 'text/html');
  for (const error of form.querySelectorAll('[data-fetch-error]')) {
    for (const field of form.querySelectorAll('[aria-describedby]')) {
      const ids = field.getAttribute('aria-describedby').split(/\s+/).filter((id) => id !== error.id);
      if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
      else { field.removeAttribute('aria-describedby'); field.removeAttribute('aria-invalid'); }
    }
    error.remove();
  }
  let first;
  for (const invalid of page.querySelectorAll('[name][aria-invalid="true"]')) {
    const field = form.elements.namedItem(invalid.name);
    if (!(field instanceof HTMLElement) || !field.id) continue;
    const message = (invalid.getAttribute('aria-describedby') || '').split(/\s+/).map((id) => page.getElementById(id)?.textContent.trim()).filter(Boolean).join(' ');
    if (!message) continue;
    const id = `${field.id}-fetch-error`;
    let error = document.getElementById(id);
    if (!error) {
      error = document.createElement('p'); error.id = id; error.dataset.fetchError = '';
      error.className = 'mt-1.5 text-sm text-error'; error.setAttribute('role', 'alert'); field.after(error);
    }
    error.textContent = message;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', [...new Set([...(field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean), id])].join(' '));
    first ??= field;
  }
  first?.focus();
  return Boolean(first);
}

// POSTs `fields` the way a form would (adding the page's CSRF token) and swaps in the page the server redirects to.
// Used by data-fetch forms and by scripts like the Board's drag and drop (window.agendal.post).
async function postAndSwap(url, fields, submittedForm) {
  const body = new URLSearchParams(fields);
  if (!body.has('_csrf')) body.set('_csrf', document.querySelector('input[name=_csrf]')?.value ?? '');
  pendingPosts += 1;
  try {
    const response = await fetch(url, { method: 'post', body, headers: { 'X-Tab-Id': tabId } });
    if (response.status === 422 && submittedForm && showFormErrors(submittedForm, await response.text())) return false;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (new URL(response.url).pathname !== location.pathname) return location.assign(response.url);
    const html = await response.text();
    dirtyForms.delete(submittedForm);
    swapPage(html);
  } finally {
    pendingPosts -= 1;
  }
}
window.agendal.post = postAndSwap;
window.agendal.tabId = tabId; // for scripts that post with their own fetch (public/js/insights.js)

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
  form.setAttribute('aria-busy', 'true');
  try {
    const fields = new FormData(form);
    if (event.submitter?.name) fields.append(event.submitter.name, event.submitter.value);
    const updated = await postAndSwap(form.action, fields, form);
    if (key && updated !== false) [...document.querySelectorAll('form[data-fetch]')].find((other) => fetchKey(other) === key)?.querySelector('button')?.focus();
  } catch {
    toast('The result couldn’t be confirmed. Your input is kept. Check the current state before trying again.', { type: 'error' });
  } finally {
    buttons.forEach((button) => (button.disabled = false));
    form.removeAttribute('aria-busy');
  }
});

// Search page (Figma W06): results follow the header's search box as you type, 250 ms after the last key, swapping in
// each [data-live] part without a reload. The address bar follows, so Back and Reload show the same results.
// On other pages the box simply opens the search page on Enter.
const searchForm = document.getElementById('search-form');
const SEARCH_DELAY_MS = 250;
let searchTimer;
let searchRequest;

async function liveSearch() {
  const url = new URL(searchForm.action);
  url.search = new URLSearchParams([...new FormData(searchForm)].filter(([, value]) => value !== '')).toString(); // no "&due=&from="
  searchRequest?.abort(); // an older, slower answer must not overwrite a newer one
  const request = (searchRequest = new AbortController());
  try {
    const response = await fetch(url, { signal: request.signal });
    if (!response.ok || new URL(response.url).pathname !== url.pathname) throw new Error(`HTTP ${response.status}`);
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    document.querySelectorAll('[data-live]').forEach((part) => part.replaceWith(page.querySelector(`[data-live="${part.dataset.live}"]`)));
    history.replaceState(null, '', url);
    const reset = document.querySelector('[data-search-reset]');
    const freshReset = page.querySelector('[data-search-reset]');
    if (reset && freshReset) reset.setAttribute('href', freshReset.getAttribute('href'));
    // Screen readers hear the count or the empty-state heading.
    const summary = document.querySelector('[data-live="results"] [data-summary], [data-live="results"] h2');
    document.querySelector('[data-search-status]').textContent = summary?.textContent.trim() ?? '';
  } catch (err) {
    if (err.name !== 'AbortError') location.assign(url); // e.g. the session ended: let the server answer
  }
}

if (searchForm && location.pathname === '/search') {
  document.addEventListener('input', (event) => {
    if (event.target.form !== searchForm) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(liveSearch, SEARCH_DELAY_MS);
  });
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    const filterMenu = event.submitter?.closest('details');
    closeOpenMenus();
    filterMenu?.querySelector('summary')?.focus();
    liveSearch();
  });
}

// Live updates (services/sync.js): a change made in another tab or on another device makes this page fetch itself
// again and swap in the new content, like a data-fetch form does. It waits while you're typing, dragging, in a dialog
// or menu, or away from the tab, and catches up as soon as you're done.
let stale = false;
let pointerDown = false;

const busy = () =>
  document.hidden ||
  pendingPosts > 0 ||
  hasUnsavedInput() ||
  pointerDown ||
  document.querySelector('dialog[open], #main details[open], [data-project-menu][open]') ||
  document.activeElement?.matches('input:not([type=checkbox], [type=radio]), textarea, select');

let refreshVersion = 0;
async function refresh() {
  const version = ++refreshVersion;
  stale = true;
  if (busy()) return;
  stale = false;
  const response = await fetch(location.href, { headers: { 'X-Live-Refresh': '1' } }).catch(() => null);
  if (!response?.ok || new URL(response.url).pathname !== location.pathname) { stale = true; return; }
  const html = await response.text();
  if (version !== refreshVersion) return;
  if (busy()) { stale = true; return; }
  swapPage(html);
}

if (document.querySelector('.drawer-side nav') && window.EventSource) {
  new EventSource('/sync').addEventListener('message', (event) => event.data !== tabId && refresh());
  const catchUp = () => stale && setTimeout(refresh); // next tick, once focus has settled
  document.addEventListener('pointerdown', () => (pointerDown = true));
  ['pointerup', 'pointercancel'].forEach((type) =>
    document.addEventListener(type, () => {
      pointerDown = false;
      catchUp();
    })
  );
  document.addEventListener('focusout', catchUp);
  document.addEventListener('visibilitychange', catchUp);
  document.addEventListener('close', catchUp, true); // a dialog closed; neither close nor toggle bubbles
  document.addEventListener('toggle', catchUp, true); // a menu closed
}

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
