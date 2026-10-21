// The task's reminder picker (views/tasks/_reminder.ejs) and custom form (views/tasks/_custom-reminder-form.ejs):
// - the form says at once when the picked date and time have already passed, in the user's time zone, and isn't
//   sent like that (the server checks again);
// - the menu works from the keyboard: ↓ opens it, ↑/↓/Home/End move between choices, Esc closes it and goes back.
// Delegated, so content swapped in later (app.js data-fetch, live updates) works too; loading it twice does no harm.

(() => {
  if (window.agendalReminders) return;
  window.agendalReminders = true;

  const choices = (menu) => [...menu.querySelectorAll('.dropdown-content button:not(:disabled), .dropdown-content a[href]')];

  document.addEventListener('keydown', (event) => {
    const menu = event.target.closest('[data-reminder-menu]');
    if (!menu) return;
    const summary = menu.querySelector('summary');
    // app.js may have closed the menu already (its own Esc handler); either way focus goes back to the Reminder button.
    if (event.key === 'Escape') {
      menu.open = false;
      summary.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = choices(menu);
    if (!items.length) return;
    if (event.target === summary) {
      menu.open = true;
      // Start on the current choice when there is one, like a native select.
      (items.find((item) => item.getAttribute('aria-current') === 'true') ?? items[event.key === 'ArrowUp' || event.key === 'End' ? items.length - 1 : 0]).focus();
      return;
    }
    const index = items.indexOf(event.target);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key];
    items[(next + items.length) % items.length].focus();
  });

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
      if (past) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
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
