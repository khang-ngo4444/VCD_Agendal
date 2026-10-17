// Admin console enhancements. Every admin page still works without this file.

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
      form.submit();
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
