// Progressive enhancements for the app shell. Every page still works without this file.

const drawer = document.getElementById('app-drawer');
const DRAWER_SHOW_DELAY_MS = 150; // DaisyUI keeps .drawer-side hidden (unfocusable) for 0.1s after opening

function closeOpenMenus(except) {
  document.querySelectorAll('details[data-dismissable][open]').forEach((menu) => {
    if (menu !== except) menu.removeAttribute('open');
  });
}

document.addEventListener('keydown', (event) => {
  // The drawer button is a <label>, and labels ignore Enter/Space on their own.
  const keyButton = event.target.closest('[data-key-click]');
  if (keyButton && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    keyButton.click();
  }

  if (event.key === 'Escape') {
    closeOpenMenus();
    if (drawer?.checked) {
      drawer.checked = false;
      drawer.dispatchEvent(new Event('change'));
    }
  }
});

// A click outside an open menu closes it.
document.addEventListener('click', (event) => closeOpenMenus(event.target.closest('details')));

// Keyboard users land inside the drawer when it opens, and back on the menu button when it closes.
drawer?.addEventListener('change', () => {
  if (drawer.checked) setTimeout(() => document.querySelector('.drawer-side nav a')?.focus(), DRAWER_SHOW_DELAY_MS);
  else document.querySelector('[data-drawer-open]')?.focus();
});
