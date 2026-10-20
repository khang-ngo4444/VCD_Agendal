// Focus mode (views/focus, Figma W13 / M47).
// The Focus page: the box above "Other open tasks" filters the list as you type.

(() => {
  // ---- Focus page: filter "Other open tasks". Set up again whenever the page content is swapped in (app.js). ----
  function setUpFilter() {
    const filter = document.querySelector('[data-focus-filter]');
    if (!filter) return;
    filter.hidden = false;
    const input = filter.querySelector('input');
    const rows = [...document.querySelectorAll('#focus-other-list [data-focus-task]')];
    const none = document.querySelector('[data-focus-no-match]');
    input.addEventListener('input', () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const row of rows) {
        row.hidden = !words.every((word) => row.dataset.focusTask.includes(word));
        if (!row.hidden) shown += 1;
      }
      none.hidden = shown > 0;
    });
  }
  if (!window.agendalFocus) {
    window.agendalFocus = true;
    setUpFilter();
    document.addEventListener('agendal:render', setUpFilter);
  }
})();
