// Autosave and instant preview for appearance settings (theme, accent, week start, calendar layout).
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

  let abortController = null;

  async function saveSettings() {
    abortController?.abort();
    abortController = new AbortController();

    const body = new URLSearchParams(new FormData(form));
    const csrfToken = form.querySelector('input[name=_csrf]')?.value ?? '';
    const headers = {
      'X-CSRF-Token': csrfToken,
      'X-Requested-With': 'fetch',
      'X-Tab-Id': window.agendal?.tabId ?? '',
    };

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body,
        headers,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        window.agendal?.toast('Could not save appearance settings. Please check your connection.', { type: 'error' });
      }
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

    saveSettings();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveSettings();
  });
})();
