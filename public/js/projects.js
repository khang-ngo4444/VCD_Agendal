// The visible … control, mouse context menu and keyboard context key share one menu.
function setUpProjectEditors() {
  document.querySelectorAll('[data-project-emoji-picker], [data-project-colour-picker], [data-project-preview]').forEach((element) => { element.hidden = false; });
}
setUpProjectEditors();
document.addEventListener('agendal:render', setUpProjectEditors);

function positionProjectMenu(menu) {
  const panel = menu.querySelector('[data-project-menu-panel]');
  const anchor = menu.querySelector('summary').getBoundingClientRect();
  const margin = 8;
  // The mobile drawer is transformed and clips descendants; a popover uses the browser's top layer.
  if (typeof panel.showPopover === 'function') {
    panel.popover = 'manual';
    if (!panel.matches(':popover-open')) panel.showPopover();
  }
  Object.assign(panel.style, { position: 'fixed', inset: 'auto', margin: '0', maxHeight: `calc(100vh - ${margin * 2}px)`, overflowY: 'auto' });
  const { width, height } = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(margin, Math.min(anchor.right - width, innerWidth - width - margin))}px`;
  panel.style.top = `${Math.max(margin, Math.min(anchor.bottom, innerHeight - height - margin))}px`;
}

function openProjectMenu(item) {
  const menu = item?.querySelector('[data-project-menu]');
  if (!menu) return false;
  document.querySelectorAll('details[data-dismissable][open]').forEach((other) => { if (other !== menu) other.open = false; });
  menu.open = true;
  positionProjectMenu(menu);
  menu.querySelector('[data-project-menu-panel] a')?.focus();
  return true;
}

document.addEventListener('contextmenu', (event) => {
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (openProjectMenu(event.target.closest('[data-project-item]'))) event.preventDefault();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (openProjectMenu(event.target.closest('[data-project-item]'))) event.preventDefault();
});
document.addEventListener('toggle', (event) => {
  if (!event.target.matches('[data-project-menu]')) return;
  if (event.target.open) positionProjectMenu(event.target);
  else {
    const panel = event.target.querySelector('[data-project-menu-panel]');
    if (typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) panel.hidePopover();
  }
}, true);
window.addEventListener('resize', () => document.querySelectorAll('[data-project-menu][open]').forEach((menu) => { menu.open = false; }));

function updateProjectPreview(form) {
  const name = form.elements.name.value.trim();
  const icon = form.elements.icon.value.trim();
  const colour = form.elements.colour.value;
  form.querySelector('[data-project-preview-name]').textContent = name || 'Your item';
  form.querySelector('[data-project-preview-icon]').textContent = icon;
  const dot = form.querySelector('[data-project-preview-dot]');
  dot.hidden = Boolean(icon);
  if (/^#[0-9a-f]{6}$/i.test(colour)) {
    dot.style.backgroundColor = colour;
    form.querySelector('[data-project-colour-picker]').value = colour;
  }
}
document.addEventListener('input', (event) => {
  const form = event.target.closest('[data-project-editor]');
  if (!form) return;
  if (event.target.matches('[data-project-colour-picker]')) {
    form.elements.colour.value = event.target.value;
    form.elements.colour.dispatchEvent(new Event('change', { bubbles: true }));
  }
  updateProjectPreview(form);
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-project-emoji]');
  if (!button) return;
  const input = button.form.elements.icon;
  input.value = button.dataset.projectEmoji;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
