// Buttons on the /components demo page.
const demoToasts = {
  success: ['Nice! “Morning run” is done.', { actionLabel: 'Undo', onAction: () => window.agendal.toast('Undone.', { type: 'info' }) }],
  info: ['Reminder set for 13:15', { type: 'info' }],
  error: ['Couldn’t save. Check your connection and try again.', { type: 'error' }],
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-demo-toast]');
  if (button) window.agendal.toast(...demoToasts[button.dataset.demoToast]);
});
