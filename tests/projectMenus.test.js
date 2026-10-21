const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
let dom;
function setup() {
  dom = new JSDOM('<div data-project-item><a href="/projects/one">Study</a><details data-dismissable data-project-menu><summary tabindex="0">Options</summary><div data-project-menu-panel><a href="/projects/one/edit">Customize item</a><button>Move up</button></div></details></div><a id="outside" href="/today">Today</a><textarea></textarea>', { url: 'http://localhost/projects', runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  Object.defineProperty(window, 'innerWidth', { value: 320 });
  Object.defineProperty(window, 'innerHeight', { value: 800 });
  const menu = window.document.querySelector('details');
  menu.querySelector('summary').getBoundingClientRect = () => ({ right: 300, bottom: 780 });
  menu.querySelector('[data-project-menu-panel]').getBoundingClientRect = () => ({ width: 192, height: 184 });
  window.eval(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(__dirname, '../public/js/projects.js'), 'utf8'));
  return { window, menu, item: window.document.querySelector('[data-project-item]>a') };
}
afterEach(() => dom?.window.close());

test('right-click opens the same visible menu, keeps it inside the viewport and focuses Customize', () => {
  const { window, menu, item } = setup();
  const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  item.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(menu.open).toBe(true);
  expect(window.document.activeElement.textContent).toBe('Customize item');
  expect(menu.querySelector('[data-project-menu-panel]').style.top).toBe('608px');
  window.document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(menu.open).toBe(false);
  expect(window.document.activeElement.tagName).toBe('SUMMARY');
});
test('keyboard context key opens it; an outside click dismisses it; unrelated context menus are preserved', () => {
  const { window, menu, item } = setup();
  item.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
  expect(menu.open).toBe(true);
  window.document.getElementById('outside').click();
  expect(menu.open).toBe(false);
  for (const node of [window.document.getElementById('outside'), window.document.querySelector('textarea')]) {
    const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
});

test('emoji and colour controls update the same editable draft and render text safely', () => {
  const { window } = setup();
  const form = window.document.createElement('form');
  form.setAttribute('data-project-editor', '');
  form.innerHTML = '<input name="name" value="My item"><input name="icon"><input name="colour" value="#123456"><input type="color" data-project-colour-picker><span data-project-preview-name></span><span data-project-preview-icon></span><span data-project-preview-dot></span><button type="button" data-project-emoji="📚">Book</button>';
  window.document.body.append(form);
  form.querySelector('button').click();
  expect(form.elements.icon.value).toBe('📚');
  expect(form.querySelector('[data-project-preview-icon]').textContent).toBe('📚');
  const picker = form.querySelector('[data-project-colour-picker]');
  picker.value = '#abcdef'; picker.dispatchEvent(new window.Event('input', { bubbles: true }));
  expect(form.elements.colour.value).toBe('#abcdef');
  form.elements.name.value = '<img src=x onerror=alert(1)>';
  form.elements.name.dispatchEvent(new window.Event('input', { bubbles: true }));
  expect(form.querySelector('[data-project-preview-name]').textContent).toContain('<img');
  expect(form.querySelector('img')).toBeNull();
  form.elements.icon.value = ''; form.elements.icon.dispatchEvent(new window.Event('input', { bubbles: true }));
  expect(form.querySelector('[data-project-preview-dot]').hidden).toBe(false);
});
