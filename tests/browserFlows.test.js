const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const load = (name) => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
let dom;

function page(html) {
  dom = new JSDOM(html, { url: 'http://localhost/today', runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  dom.window.setTimeout = setTimeout;
  dom.window.clearTimeout = clearTimeout;
  dom.window.setInterval = setInterval;
  dom.window.Date = Date;
  return dom.window;
}

function shell() {
  return page(`<main id="main"><form action="/tasks/one/complete" method="post" data-fetch><input name="_csrf" value="token"><button type="submit">Complete</button></form></main>
    <div id="toast-region"></div>${['error', 'success', 'info'].map((type) => `<template id="toast-template-${type}"><div data-toast ${type === 'error' ? 'role="alert"' : ''}><span data-toast-message></span><button data-toast-action hidden></button><button data-toast-dismiss hidden></button></div></template>`).join('')}`);
}

afterEach(() => { dom?.window.close(); jest.useRealTimers(); });

test('an uncertain mutation is never replayed, the page stays usable and an error is announced', async () => {
  const window = shell();
  window.fetch = jest.fn().mockRejectedValue(new Error('connection lost'));
  const nativeSubmit = jest.spyOn(window.HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
  window.eval(load('app.js'));
  const form = window.document.querySelector('form');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(setImmediate);
  expect(window.fetch).toHaveBeenCalledTimes(1);
  expect(nativeSubmit).not.toHaveBeenCalled();
  expect(form.querySelector('button').disabled).toBe(false);
  expect(window.document.querySelector('[role=alert]').textContent).toContain('couldn’t be confirmed');
});

test('calendar pointer cancellation restores the original time without saving', () => {
  const window = page('<div data-hour="60"><div data-day="2026-10-21"><a data-task-id="one" data-minutes="60" style="top: 540px"><span data-time>09:00–10:00</span></a></div><div data-day="2026-10-22"></div></div>');
  window.agendal = { post: jest.fn(), toast: jest.fn() };
  const block = window.document.querySelector('a');
  const original = block.parentElement;
  const target = original.nextElementSibling;
  window.document.elementsFromPoint = () => [target];
  block.getBoundingClientRect = () => ({ top: 540 });
  target.getBoundingClientRect = () => ({ top: 0 });
  window.eval(load('calendar.js'));
  block.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 20, clientY: 550 }));
  window.document.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 100, clientY: 670 }));
  expect(block.parentElement).toBe(target);
  window.document.dispatchEvent(new window.Event('pointercancel'));
  window.document.dispatchEvent(new window.Event('pointerup'));
  expect(block.parentElement).toBe(original);
  expect(block.getAttribute('style')).toBe('top: 540px');
  expect(block.textContent).toBe('09:00–10:00');
  expect(window.agendal.post).not.toHaveBeenCalled();
});

test('double-submit while the first mutation is pending sends only one request', async () => {
  const window = shell();
  let reject;
  window.fetch = jest.fn(() => new Promise((resolve, fail) => { reject = fail; }));
  window.eval(load('app.js'));
  const form = window.document.querySelector('form');
  for (let i = 0; i < 2; i += 1) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  expect(window.fetch).toHaveBeenCalledTimes(1);
  reject(new Error('offline'));
  await new Promise(setImmediate);
});

test('background-form validation explains the exact field error without navigating or losing the draft', async () => {
  const window = shell();
  const form = window.document.querySelector('form');
  form.insertAdjacentHTML('beforeend', '<input id="slot-title" name="title" value="Preserved draft"><input id="slot-end" name="scheduleEnd" value="09:00">');
  window.fetch = jest.fn().mockResolvedValue({ status: 422, ok: false, text: async () => '<input name="scheduleEnd" aria-invalid="true" aria-describedby="time-error"><p id="time-error">End time must be after the start.</p>' });
  window.eval(load('app.js'));
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(setImmediate);
  expect(window.document.querySelector('#slot-title').value).toBe('Preserved draft');
  expect(window.document.querySelector('#slot-end').getAttribute('aria-invalid')).toBe('true');
  expect(window.document.querySelector('#slot-end-fetch-error').textContent).toBe('End time must be after the start.');
  expect(window.document.activeElement.id).toBe('slot-end');
  expect(form.querySelector('button').disabled).toBe(false);
  window.fetch.mockResolvedValue({ status: 422, ok: false, text: async () => '<input name="title" aria-invalid="true" aria-describedby="title-error"><p id="title-error">Use a shorter title.</p>' });
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(setImmediate);
  expect(window.document.querySelector('#slot-end').hasAttribute('aria-invalid')).toBe(false);
  expect(window.document.querySelector('#slot-end-fetch-error')).toBeNull();
  expect(window.document.querySelector('#slot-title-fetch-error').textContent).toBe('Use a shorter title.');
});

test('Undo remains available past the informational-toast deadline and dismiss still works', () => {
  jest.useFakeTimers();
  const window = shell();
  window.eval(load('app.js'));
  const undo = jest.fn();
  window.agendal.toast('Deleted task', { actionLabel: 'Undo', onAction: undo });
  jest.advanceTimersByTime(60000);
  const action = window.document.querySelector('[data-toast-action]');
  expect(action.hidden).toBe(false);
  action.click();
  expect(undo).toHaveBeenCalledTimes(1);
  expect(window.document.querySelector('[data-toast]')).toBeNull();
});

function timer() {
  const window = page(`<div data-focus-timer data-task-id="one" data-focus-minutes="25" data-rest-minutes="5" data-sessions-today="0">
    <span data-time></span><span data-status></span><span data-ring></span><span data-announce></span><span data-session-label></span>
    <div data-controls hidden><button data-toggle></button><button data-skip></button><button data-restart></button></div>
    <span data-icon-pause></span><span data-icon-play></span><span data-wake-note hidden></span>
    <a href="/focus" data-focus-exit>Exit</a><form data-focus-complete></form></div>
    <dialog id="focus-leave-dialog"><p data-leave-detail></p></dialog><input name="_csrf" value="token">`);
  window.document.querySelector('dialog').showModal = function () { this.setAttribute('open', ''); };
  window.agendal = { toast: jest.fn() };
  window.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ minutes: 25, sessionsToday: 1 }) });
  return window;
}

test('focus supports pause, resume and restart without accidentally saving an unfinished block', () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-21T04:00:00Z'));
  const window = timer(); window.eval(load('focus.js'));
  jest.advanceTimersByTime(60000);
  window.document.querySelector('[data-toggle]').click();
  const left = window.document.querySelector('[data-time]').textContent;
  jest.advanceTimersByTime(60000);
  expect(window.document.querySelector('[data-time]').textContent).toBe(left);
  expect(window.document.querySelector('[data-toggle]').getAttribute('aria-label')).toBe('Resume');
  window.document.querySelector('[data-toggle]').click();
  jest.advanceTimersByTime(1000);
  expect(window.document.querySelector('[data-time]').textContent).not.toBe(left);
  window.document.querySelector('[data-restart]').click();
  expect(window.document.querySelector('[data-time]').textContent).toBe('25:00');
  expect(window.fetch).not.toHaveBeenCalled();
});

test('skipping a focus block starts a break without crediting an unfinished session', () => {
  jest.useFakeTimers();
  const window = timer(); window.eval(load('focus.js'));
  window.document.querySelector('[data-skip]').click();
  expect(window.document.querySelector('[data-focus-timer]').dataset.phase).toBe('break');
  expect(window.document.querySelector('[data-time]').textContent).toBe('05:00');
  expect(window.fetch).not.toHaveBeenCalled();
});

test('a completed focus block is saved once, followed by a break and a user-controlled next block', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-21T04:00:00Z'));
  const window = timer(); window.eval(load('focus.js'));
  await jest.advanceTimersByTimeAsync(25 * 60000);
  expect(window.fetch).toHaveBeenCalledTimes(1);
  expect(window.document.querySelector('[data-focus-timer]').dataset.phase).toBe('break');
  await jest.advanceTimersByTimeAsync(5 * 60000);
  expect(window.document.querySelector('[data-focus-timer]').dataset.phase).toBe('ready');
  expect(window.document.querySelector('[data-toggle]').getAttribute('aria-label')).toBe('Start the next block');
  window.document.querySelector('[data-toggle]').click();
  expect(window.document.querySelector('[data-focus-timer]').dataset.phase).toBe('focus');
});

test('leaving a running focus block asks for confirmation and cancel keeps the timer', () => {
  jest.useFakeTimers();
  const window = timer(); window.eval(load('focus.js'));
  window.document.querySelector('[data-focus-exit]').click();
  const dialog = window.document.querySelector('dialog');
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain('won’t be saved');
  dialog.returnValue = 'cancel'; dialog.dispatchEvent(new window.Event('close'));
  expect(window.localStorage.getItem('agendal.focus')).not.toBeNull();
});

test('reload resumes the same focus block instead of restarting the clock', () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-21T04:00:00Z'));
  const window = timer(); window.eval(load('focus.js'));
  jest.advanceTimersByTime(60000);
  const before = window.document.querySelector('[data-time]').textContent;
  window.eval(load('focus.js'));
  expect(window.document.querySelector('[data-time]').textContent).toBe(before);
  expect(window.fetch).not.toHaveBeenCalled();
});

test('a completed block waiting for the network is retained when completing or leaving the task', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-21T04:00:00Z'));
  const window = timer(); window.fetch.mockRejectedValue(new Error('offline')); window.eval(load('focus.js'));
  await jest.advanceTimersByTimeAsync(25 * 60000);
  expect(JSON.parse(window.localStorage.getItem('agendal.focus')).pending).toHaveLength(1);
  window.document.querySelector('[data-focus-complete]').dispatchEvent(new window.Event('submit'));
  await jest.advanceTimersByTimeAsync(1);
  expect(JSON.parse(window.localStorage.getItem('agendal.focus.pending'))).toEqual([
    expect.objectContaining({ taskId: 'one', minutes: 25 }),
  ]);
  window.document.querySelector('[data-focus-timer]').remove();
  window.fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ minutes: 25, sessionsToday: 1 }) });
  window.eval(load('focus.js'));
  await jest.advanceTimersByTimeAsync(1);
  expect(JSON.parse(window.localStorage.getItem('agendal.focus.pending'))).toEqual([]);
  expect(window.agendal.toast).toHaveBeenCalledWith('Your completed focus block has been saved.');
});
