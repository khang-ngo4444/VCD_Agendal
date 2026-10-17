// Admin console enhancements. Every admin page still works without this file.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      form.submit(); // form.submit() fires no submit event, so the pending state is set here
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
