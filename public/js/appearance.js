// Instant preview and 60fps pulse / circular reveal animation for appearance settings (theme, accent).
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

  // Track click coordinate for circular reveal animation
  let lastClick = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-theme-option]')) {
      lastClick = { x: event.clientX, y: event.clientY };
    }
  });

  function triggerPulseAnimation(input) {
    const label = input.closest('label');
    const card = label?.querySelector('.theme-card');
    if (!card) return;

    card.classList.remove('pulse-active');
    void card.offsetWidth; // Force reflow to restart CSS keyframe animation smoothly
    card.classList.add('pulse-active');
    setTimeout(() => card.classList.remove('pulse-active'), 600);
  }

  function switchThemeWithAnimation(theme, input) {
    triggerPulseAnimation(input);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || prefersReducedMotion) {
      applyTheme(theme);
      return;
    }

    const { x, y } = lastClick;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      applyTheme(theme);
    });

    transition.ready
      .then(() => {
        const clipPath = [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ];

        document.documentElement.animate(
          {
            clipPath: clipPath,
          },
          {
            duration: 450,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      })
      .catch(() => {
        applyTheme(theme);
      });
  }

  form.addEventListener('change', (event) => {
    const input = event.target;
    if (!input || !input.matches('input[type=radio]')) return;

    if (input.name === 'theme') {
      switchThemeWithAnimation(input.value, input);
    } else if (input.name === 'accentColour') {
      applyAccent(input.value);
    }
  });
})();
