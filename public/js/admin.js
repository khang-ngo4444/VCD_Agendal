// Admin console enhancements. Every admin page still works without this file.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Loading bar along the top edge (.nav-progress): shown only if the next page takes longer than 150 ms.
const progressBar = document.querySelector('.nav-progress');
const PROGRESS_DELAY_MS = 150;
let progressTimer;

function startProgress() {
  if (!progressBar) return;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => progressBar.classList.add('is-loading'), PROGRESS_DELAY_MS);
}

function stopProgress() {
  clearTimeout(progressTimer);
  progressBar?.classList.remove('is-loading');
}

// A new page starts without the bar; this also clears it when Back restores a page from the cache.
window.addEventListener('pageshow', stopProgress);

// A button whose form is on its way: spinner, disabled, so a second click can't send it twice.
function showPending(button) {
  if (!button || button.disabled) return;
  button.style.minWidth = `${button.offsetWidth}px`; // keep the width while the label changes
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.insertAdjacentHTML('afterbegin', '<span class="loading loading-spinner loading-xs" aria-hidden="true"></span> ');
}

// Back/forward cache restores the page as it was left; give the buttons back.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  document.querySelectorAll('button[aria-busy="true"]').forEach((button) => {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.querySelector('.loading')?.remove();
  });
});

// Lock account (AD-W03): a form with data-lock asks here first and carries the typed reason.
// Without JS the form posts straight away, with no reason.
const lockDialog = document.getElementById('lock-dialog');

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.dataset.lock || !lockDialog) return;

  event.preventDefault();
  const reasonInput = lockDialog.querySelector('[data-lock-reason]');
  lockDialog.querySelector('#lock-heading').textContent = `Lock ${form.dataset.lock}’s account?`;
  lockDialog.querySelector('[data-lock-email]').textContent = form.dataset.lockEmail;
  reasonInput.value = '';
  lockDialog.returnValue = '';
  lockDialog.addEventListener(
    'close',
    () => {
      if (lockDialog.returnValue !== 'confirm') return;
      form.elements.reason.value = reasonInput.value.trim();
      showPending(form.querySelector('button'));
      startProgress();
      form.submit(); // form.submit() fires no submit event, so the pending state and loading bar start here
    },
    { once: true }
  );
  lockDialog.showModal();
});

// Enter in the reason box confirms, like pressing "Lock account".
lockDialog?.querySelector('[data-lock-reason]').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  lockDialog.close('confirm');
});

// Every other form that changes something (Unlock, Log out) shows the pending state on the button pressed.
// Runs after the handler above, so the Lock form is already intercepted (defaultPrevented) by then.
document.addEventListener('submit', (event) => {
  if (event.defaultPrevented || event.target.method !== 'post') return;
  showPending(event.submitter ?? event.target.querySelector('button'));
});

// "/" jumps to the page's search box, Esc clears it (and the results, if a search was applied).
const searchInput = document.querySelector('[data-search]');

document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || !searchInput || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('input, textarea, select, [contenteditable]')) return; // typing a "/" somewhere
  event.preventDefault();
  searchInput.focus();
  searchInput.select();
});

searchInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const applied = new URLSearchParams(window.location.search).has('q');
  if (searchInput.value) {
    searchInput.value = '';
    if (applied) searchInput.form.requestSubmit();
  } else {
    searchInput.blur();
  }
});

// Overview numbers count up from 0. The page already shows the real number, so nothing is lost without JS.
const COUNT_UP_MS = 600;
if (!reducedMotion) {
  document.querySelectorAll('[data-count-up]').forEach((element) => {
    const target = Number(element.dataset.countUp);
    if (!target) return;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - (1 - progress) ** 3;
      element.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (progress < 1) requestAnimationFrame(step);
    };
    element.textContent = '0';
    requestAnimationFrame(step);
  });
}

// Live search (Users, Activity log): 300 ms after the last keystroke the chips and results are fetched and swapped in,
// and the address bar follows (?q=…), so Back, Reload and shared links still match. Enter and Esc use it too.
// Any failure falls back to a normal page load. Without JS the form simply submits on Enter.
const liveForm = document.querySelector('form[data-live-search]');
const LIVE_DELAY_MS = 300;
const SKELETON_DELAY_MS = 150; // fast answers swap straight in, without a flash of grey rows
const SKELETON_ROWS = 6;
let liveTimer;
let liveRequest;

// Grey placeholder rows in the table body while results load (one bar per column).
function showSkeleton(results) {
  const columns = results.querySelectorAll('thead th').length || 4;
  const row = `<tr class="border-t border-base-300">${'<td class="px-4 py-3.5"><span class="skel"></span></td>'.repeat(columns)}</tr>`;
  const body = results.querySelector('tbody');
  if (body) body.innerHTML = row.repeat(SKELETON_ROWS);
  else results.innerHTML = `<table class="w-full"><tbody>${row.repeat(SKELETON_ROWS)}</tbody></table>`;
}

async function liveSearch() {
  // getAttribute, not .action: the Activity form has a hidden field named "action", which .action would return.
  const url = new URL(liveForm.getAttribute('action'), window.location.href);
  url.search = new URLSearchParams(new FormData(liveForm)).toString();
  if (url.href === window.location.href) return;

  liveRequest?.abort(); // an older, slower answer must not overwrite a newer one
  const request = new AbortController();
  liveRequest = request;
  const results = document.querySelector('[data-live="results"]');
  results.setAttribute('aria-busy', 'true');
  const skeletonTimer = setTimeout(() => showSkeleton(results), SKELETON_DELAY_MS);

  try {
    const response = await fetch(url, { signal: request.signal, headers: { Accept: 'text/html' } });
    if (!response.ok || !response.url.startsWith(url.origin + url.pathname)) throw new Error(`HTTP ${response.status}`);
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    for (const name of ['chips', 'results']) {
      const fresh = page.querySelector(`[data-live="${name}"]`);
      if (!fresh) throw new Error(`no ${name} in the response`);
      document.querySelector(`[data-live="${name}"]`).replaceWith(fresh);
    }
    window.history.replaceState(null, '', url);
    // Screen readers hear the new count ("Showing 1–3 of 3") or the empty-state heading.
    const fresh = document.querySelector('[data-live="results"]');
    const summary = fresh.querySelector('.border-t > span, h2');
    document.querySelector('[data-live-status]').textContent = summary?.textContent.trim() ?? '';
  } catch (err) {
    if (err.name === 'AbortError') return;
    window.location.assign(url); // e.g. the session ended: let the server answer with a real page
  } finally {
    clearTimeout(skeletonTimer);
    if (liveRequest === request) document.querySelector('[data-live="results"]')?.removeAttribute('aria-busy');
  }
}

liveForm?.addEventListener('input', () => {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(liveSearch, LIVE_DELAY_MS);
});

// Enter (and Esc, which calls requestSubmit) search straight away instead of loading a new page.
liveForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(liveTimer);
  liveSearch();
});

// Start the loading bar for links to other admin pages (not new tabs, downloads or anchors on this page)
// and for forms that really send. Registered last, so the Lock form's own handler has already run.
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) return;
  startProgress();
});

document.addEventListener('submit', (event) => {
  if (event.defaultPrevented || event.target.method === 'dialog') return;
  startProgress();
});
