// Instant preview for appearance settings (theme, accent).
// Saving is handled globally by form[data-autosave] in public/js/app.js.
(() => {
  const form = document.querySelector('form[action="/settings/appearance"]');
  if (!form) return;

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'agendal');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'agendal-dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function applyAccent(accent) {
    if (!accent || accent === 'blue') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', accent);
    }
  }

  form.addEventListener('change', (event) => {
    const input = event.target;
    if (!input || !input.matches('input[type=radio]')) return;

    if (input.name === 'theme') {
      applyTheme(input.value);
    } else if (input.name === 'accentColour') {
      applyAccent(input.value);
    }
  });
})();
