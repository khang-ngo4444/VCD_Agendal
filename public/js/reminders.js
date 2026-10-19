// The task's custom reminder form (views/tasks/_custom-reminder-form.ejs): says at once when the picked date and time
// have already passed, in the user's time zone, and keeps the form from being sent like that (the server checks again).
// Delegated, so forms swapped in later (app.js data-fetch, live updates) work too; loading it twice does no harm.

(() => {
  if (window.agendalReminders) return;
  window.agendalReminders = true;

  // "YYYY-MM-DDTHH:mm" for now in `timeZone`; strings in this shape compare in time order.
  function nowIn(timeZone) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function check(form) {
    const date = form.elements.reminderDate.value;
    const time = form.elements.reminderTime.value;
    const hint = form.querySelector('[data-reminder-hint]');
    hint.dataset.normal ??= hint.textContent;
    const past = Boolean(date && time) && `${date}T${time}` <= nowIn(form.dataset.timeZone);
    for (const input of [form.elements.reminderDate, form.elements.reminderTime]) {
      input.classList.toggle('input-error', past);
      input.toggleAttribute('aria-invalid', past);
    }
    hint.classList.toggle('text-error', past);
    hint.classList.toggle('text-muted', !past);
    hint.textContent = past ? 'That time has already passed. Pick a later one.' : hint.dataset.normal;
    return !past;
  }

  document.addEventListener('input', (event) => {
    const form = event.target.closest('[data-reminder-form]');
    if (form) check(form);
  });

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target.closest('[data-reminder-form]');
      if (form && !check(form)) {
        event.preventDefault();
        event.stopImmediatePropagation(); // not sent, so the double-submit guard in app.js shouldn't disable the button
        form.elements.reminderTime.focus();
      }
    },
    true
  );
})();
