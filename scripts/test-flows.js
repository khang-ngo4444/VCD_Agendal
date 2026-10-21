// Real HTTP + MongoDB acceptance checks. Always uses a fresh local database, never the user's app data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const { JSDOM } = require('jsdom');

const databaseName = `agendal_flow_test_${Date.now()}`;
const uri = new URL(process.env.FLOW_TEST_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
if (!['127.0.0.1:27017', 'localhost:27017'].includes(uri.host)) throw new Error('Flow tests require a local MongoDB on port 27017.');
uri.pathname = `/${databaseName}`;
Object.assign(process.env, {
  MONGODB_URI: uri.toString(), SESSION_SECRET: 'local-flow-test-session-secret',
  NODE_ENV: 'test', JOBS_ENABLED: 'false', MAIL_HOST: '127.0.0.1', MAIL_PORT: '1025',
  MAIL_USERNAME: '', MAIL_PASSWORD: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
});

const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Habit = require('../models/Habit');
const HabitCheckIn = require('../models/HabitCheckIn');
const Event = require('../models/Event');
const Reminder = require('../models/Reminder');
const FocusSession = require('../models/FocusSession');
const PushSubscription = require('../models/PushSubscription');
const { toDateInput, addDays } = require('../services/dates');
const { unsubscribeToken } = require('../services/unsubscribe');
const results = [];
let origin;
const password = 'Stone-river-lantern-84!';
const tomorrow = () => addDays(toDateInput(new Date(), 'Asia/Ho_Chi_Minh'), 1);

class Client {
  constructor() { this.cookie = ''; this.token = ''; }
  async request(url, { method = 'GET', fields, csrf = true, follow = false, accept = 'text/html' } = {}) {
    if (method === 'POST' && csrf && !this.token) await this.request('/login', { follow: true });
    const headers = { Accept: accept };
    if (this.cookie) headers.Cookie = this.cookie;
    let body;
    if (fields instanceof FormData) {
      body = fields;
      if (csrf) body.set('_csrf', this.token);
    } else if (method === 'POST') {
      body = new URLSearchParams();
      for (const [key, value] of Object.entries(fields || {})) {
        for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
      }
      if (csrf) body.set('_csrf', this.token);
    }
    const response = await fetch(origin + url, { method, headers, body, redirect: 'manual' });
    const cookie = response.headers.getSetCookie().find((value) => value.startsWith('agendal.sid='))?.split(';')[0];
    if (cookie && cookie !== this.cookie) { this.cookie = cookie; this.token = ''; }
    const html = await response.text();
    const token = html.match(/name="_csrf" value="([^"]+)"/);
    if (token) this.token = token[1];
    const result = { status: response.status, html, location: response.headers.get('location'), headers: response.headers };
    if (follow && result.location && result.status >= 300 && result.status < 400) return this.request(result.location, { follow: true });
    return result;
  }
  get(url, options) { return this.request(url, options); }
  post(url, fields, options) { return this.request(url, { method: 'POST', fields, ...options }); }
  async login(email = 'flows@example.test', secret = password) {
    await this.get('/login', { follow: true });
    const response = await this.post('/login', { email, password: secret });
    assert.equal(response.status, 302, `Login failed: ${response.status}`);
    await this.get(response.location);
  }
}

async function check(id, expectation, action) {
  const start = Date.now();
  try {
    await action();
    results.push({ id, expectation, status: 'PASS', durationMs: Date.now() - start });
    console.log(`PASS ${id} ${expectation}`);
  } catch (error) {
    results.push({ id, expectation, status: 'FAIL', error: error.message, durationMs: Date.now() - start });
    console.log(`FAIL ${id} ${expectation}: ${error.message}`);
  }
}
const status = (response, expected) => assert.equal(response.status, expected, response.html.slice(0, 160));
const contains = (response, value) => assert.ok(response.html.includes(value), `Missing: ${value}`);
function semantics(html) {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate ids break label/error associations');
    for (const element of document.querySelectorAll('[aria-describedby], [aria-labelledby]')) {
      for (const attribute of ['aria-describedby', 'aria-labelledby']) {
        for (const id of (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)) assert.ok(document.getElementById(id), `Broken ${attribute}: ${id}`);
      }
    }
    for (const element of document.querySelectorAll('input:not([type=hidden]), select, textarea, button, summary')) {
      if (element.closest('[aria-hidden="true"]')) continue;
      const name = element.getAttribute('aria-label') || (element.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent || '').join('').trim()
        || [...(element.labels || [])].map((label) => label.textContent.trim()).join('')
        || (['BUTTON', 'SUMMARY'].includes(element.tagName) ? element.textContent.trim() : '') || element.getAttribute('title');
      assert.ok(name, `Unnamed control: ${element.tagName} ${element.name || element.id}`);
    }
  } finally { dom.window.close(); }
}
async function account(email, role = 'user') {
  const user = new User({ email, name: 'Flow Tester', role, onboardedAt: new Date() });
  await user.setPassword(password);
  return user.save();
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([User, Project, Task, Habit, HabitCheckIn, Event, Reminder, FocusSession, PushSubscription].map((model) => model.init()));
  const app = require('../app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  app.locals.appUrl = origin;
  const guest = new Client();
  const member = new Client();
  const peer = new Client();
  const admin = new Client();
  let owner;
  let peerUser;
  let adminUser;
  let project;
  let task;
  let habit;
  let event;
  const serverErrors = [];
  const originalError = console.error;
  console.error = (...args) => { serverErrors.push(args.map(String).join(' ')); originalError(...args); };
  try {
    for (const url of ['/', '/privacy', '/terms', '/login', '/register', '/forgot-password']) {
      await check(`PUB ${url}`, 'Page has a title, main heading and usable content', async () => {
        const response = await guest.get(url); status(response, 200); assert.match(response.html, /<title>[^<]+<\/title>/); assert.match(response.html, /<h1\b/); semantics(response.html);
      });
    }
    for (const url of ['/today', '/upcoming', '/board', '/calendar', '/habits', '/search', '/focus', '/insights', '/settings/account', '/admin']) {
      await check(`AUTH guest ${url}`, 'Guest is redirected to login', async () => assert.equal((await guest.get(url)).location, '/login'));
    }
    await check('AUTH csrf', 'A POST without a CSRF token is rejected with actionable 403', async () => {
      const response = await guest.post('/register', { email: 'bad@example.test' }, { csrf: false }); status(response, 403); contains(response, 'Reload the page');
    });
    await check('AUTH registration errors', 'Invalid registration keeps email and explains field errors', async () => {
      const response = await guest.post('/register', { name: 'Test', email: 'not-an-email', password: 'short' }); status(response, 422); contains(response, 'not-an-email'); contains(response, 'aria-invalid="true"');
    });
    await check('AUTH registration success', 'Valid registration creates an account and requires onboarding', async () => {
      status(await member.post('/register', { name: 'Flow Tester', email: 'flows@example.test', password }), 302);
      owner = await User.findOne({ email: 'flows@example.test' }); assert.ok(owner); assert.equal((await member.get('/today')).location, '/welcome');
    });
    await check('AUTH onboarding', 'Onboarding persists timezone, week start and starter project', async () => {
      await member.get('/welcome');
      status(await member.post('/welcome', { timeZone: 'Asia/Ho_Chi_Minh', weekStartsOn: '1', projectName: 'First project' }), 302);
      owner = await User.findById(owner._id); assert.ok(owner.onboardedAt); assert.ok(await Project.findOne({ owner: owner._id, name: 'First project' })); await member.get('/today');
    });
    await check('AUTH duplicate', 'Duplicate email is rejected without creating another account', async () => {
      status(await guest.post('/register', { name: 'Test', email: owner.email, password }), 422); assert.equal(await User.countDocuments({ email: owner.email }), 1);
    });
    peerUser = await account('peer@example.test'); adminUser = await account('admin-flows@example.test', 'admin');
    await peer.login(peerUser.email); await admin.login(adminUser.email);
    await check('AUTH wrong login', 'Wrong credentials are rejected', async () => status(await guest.post('/login', { email: owner.email, password: 'wrong' }), 401));
    await check('AUTH forgot invalid', 'Malformed reset email has an inline error', async () => status(await guest.post('/forgot-password', { email: 'wrong' }), 422));
    await check('AUTH forgot unknown', 'Unknown email gets the neutral response', async () => { const response = await guest.post('/forgot-password', { email: 'unknown@example.test' }); status(response, 200); assert.doesNotMatch(response.html, /doesn.t exist/i); });
    await check('AUTH invalid reset', 'Invalid or expired reset link returns 410 with recovery', async () => { const response = await guest.get('/reset-password/not-a-real-token'); status(response, 410); contains(response, '/forgot-password'); });
    await check('AUTH onboarding skip', 'Skip uses defaults and does not create a starter project', async () => {
      const client = new Client(); await client.post('/register', { email: 'skip@example.test', name: 'Skip Tester', password }); await client.get('/welcome');
      await client.post('/welcome', { skip: '1', projectName: 'Must not exist' }); const user = await User.findOne({ email: 'skip@example.test' }); assert.ok(user.onboardedAt); assert.equal(await Project.countDocuments({ owner: user._id }), 0);
    });
    await check('AUTH reset email delivery', 'Known-account reset sends a usable link to local Mailpit', async () => {
      status(await guest.post('/forgot-password', { email: peerUser.email }), 200);
      let message;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const list = await (await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${peerUser.email}`)}`)).json();
        if (list.messages?.length) { message = await (await fetch(`http://127.0.0.1:8025/api/v1/message/${list.messages[0].ID}`)).json(); break; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(message, 'No reset email arrived in local Mailpit'); assert.match(message.Text || message.HTML, /reset-password\/[a-f0-9]+/);
      const before = (await User.findById(peerUser._id)).passwordReset.tokenHash;
      await guest.post('/forgot-password', { email: peerUser.email }); assert.equal((await User.findById(peerUser._id)).passwordReset.tokenHash, before, 'Cooldown replaced a still-valid reset link');
    });
    const appPages = ['/today', '/today?date=2026-10-01', '/today?date=bad', '/upcoming', '/board', '/board?project=inbox', '/calendar?view=day', '/calendar?view=week', '/calendar?view=month', '/calendar?view=bad&date=bad', '/habits', '/habits/new', '/search', '/search?q=nothing-will-match', '/focus', '/insights', '/insights?range=week', '/projects', '/inbox', '/tasks/new', '/events/new', '/settings/profile', '/settings/appearance', '/settings/notifications', '/settings/account', '/settings/account/delete'];
    for (const url of appPages) {
      await check(`SCREEN ${url}`, 'Authenticated screen renders with main heading and private cache policy', async () => {
        const response = await member.get(url); status(response, 200); assert.match(response.html, /<main\b/); assert.match(response.html, /<h1\b/); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.doesNotMatch(response.html, /ReferenceError|TypeError|SyntaxError/); semantics(response.html);
      });
    }
    await check('PROJECT empty', 'Empty project name is rejected inline', async () => status(await member.post('/projects', { name: '' }), 422));
    await check('PROJECT create', 'Create project and open its page', async () => {
      const response = await member.post('/projects', { name: 'Flow project' }); status(response, 302); project = await Project.findOne({ owner: owner._id, name: 'Flow project' }); assert.equal(response.location, `/projects/${project._id}`); status(await member.get(response.location), 200);
    });
    await check('PROJECT rename', 'Rename persists and is reflected in the sidebar', async () => {
      await member.post(`/projects/${project._id}/rename`, { name: 'Renamed project' }); assert.equal((await Project.findById(project._id)).name, 'Renamed project'); contains(await member.get('/today'), 'Renamed project');
    });
    await check('PROJECT rename error', 'Invalid rename keeps the edit open with a field error and stored name unchanged', async () => {
      const response = await member.post(`/projects/${project._id}/rename`, { name: '' }); status(response, 422); contains(response, 'aria-invalid="true"'); assert.equal((await Project.findById(project._id)).name, 'Renamed project');
    });
    await check('PROJECT colour', 'Valid colour is saved; crafted CSS value is rejected', async () => {
      await member.post(`/projects/${project._id}/colour`, { colour: '#2f6fde' }); await member.post(`/projects/${project._id}/colour`, { colour: 'red; background:url(evil)' }); assert.equal((await Project.findById(project._id)).colour, '#2f6fde');
    });
    await check('TASK empty', 'Quick-add shows inline errors and retains chosen project', async () => {
      const response = await member.post('/tasks', { title: '', project: String(project._id), returnTo: '/board' }); status(response, 422); contains(response, 'Type a title'); contains(response, `value="${project._id}" selected`);
    });
    await check('TASK project validation', 'Invalid project is a recoverable 422 and preserves draft', async () => {
      const response = await member.post('/tasks', { title: 'Draft with invalid project', project: 'invalid' }); status(response, 422); contains(response, 'Draft with invalid project');
    });
    await check('TASK create', 'Title-only task is owned, open and placed in selected project', async () => {
      status(await member.post('/tasks', { title: 'Flow task', project: String(project._id), returnTo: '/board' }), 302); task = await Task.findOne({ owner: owner._id, title: 'Flow task' }); assert.equal(String(task.project), String(project._id)); assert.equal(task.status, 'backlog');
    });
    for (const [name, fields] of [['long title', { title: 'x'.repeat(201) }], ['array title', { title: ['one', 'two'] }], ['partial schedule', { title: 'Retained schedule', scheduleDate: tomorrow() }], ['foreign project', { title: 'Foreign project draft', project: String((await Project.create({ owner: peerUser._id, name: 'Peer only' }))._id) }]]) {
      await check(`TASK validation ${name}`, 'Invalid quick-add is rejected with 422 and saves no extra task', async () => { const before = await Task.countDocuments({ owner: owner._id }); status(await member.post('/tasks', fields), 422); assert.equal(await Task.countDocuments({ owner: owner._id }), before); });
    }
    await check('TASK invalid edit', 'Invalid edit keeps the draft and does not change stored task', async () => {
      const response = await member.post(`/tasks/${task._id}`, { title: 'Keep this draft', priority: 'bad' }); status(response, 422); contains(response, 'Keep this draft'); assert.equal((await Task.findById(task._id)).title, 'Flow task');
    });
    await check('TASK update', 'Task detail saves description, due date, priority and local schedule', async () => {
      status(await member.post(`/tasks/${task._id}`, { title: 'Updated flow task', description: 'Useful description', priority: 'high', project: String(project._id), dueDate: tomorrow(), scheduleDate: tomorrow(), scheduleStart: '10:00', scheduleEnd: '11:00' }), 302);
      task = await Task.findById(task._id); assert.equal(task.description, 'Useful description'); assert.equal(task.schedule.start.toISOString().slice(11, 16), '03:00');
    });
    for (const column of ['upcoming', 'active', 'done', 'backlog']) await check(`BOARD ${column}`, 'Moving column updates completion consistently', async () => {
      status(await member.post(`/tasks/${task._id}/move`, { status: column, returnTo: '/board' }), 302); const saved = await Task.findById(task._id); assert.equal(saved.status, column); assert.equal(Boolean(saved.completedAt), column === 'done');
    });
    await check('TASK complete reopen', 'Complete and reopen change progress and completion flag', async () => {
      await member.post(`/tasks/${task._id}/complete`, { done: '1' }); assert.ok((await Task.findById(task._id)).completedAt); await member.post(`/tasks/${task._id}/complete`, { done: '0' }); assert.equal((await Task.findById(task._id)).completedAt, null);
    });
    for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) await check(`TASK repeat ${frequency}`, 'Completion makes one next occurrence; duplicate completion and Undo do not duplicate it', async () => {
      const recurring = await Task.create({ owner: owner._id, title: `Repeat ${frequency}`, dueDate: new Date(`${tomorrow()}T10:00:00Z`), repeat: { frequency } });
      await member.post(`/tasks/${recurring._id}/complete`, { done: '1' }); assert.equal(await Task.countDocuments({ previousOccurrence: recurring._id }), 1);
      await member.post(`/tasks/${recurring._id}/complete`, { done: '1' }); assert.equal(await Task.countDocuments({ previousOccurrence: recurring._id }), 1);
      await member.post(`/tasks/${recurring._id}/complete`, { done: '0' }); assert.equal(await Task.countDocuments({ previousOccurrence: recurring._id }), 0);
    });
    await check('TASK repeat until', 'A repeat ending on this occurrence creates no task beyond the end', async () => {
      const dueDate = new Date(`${tomorrow()}T10:00:00Z`); const recurring = await Task.create({ owner: owner._id, title: 'Repeat until', dueDate, repeat: { frequency: 'daily', until: dueDate } });
      await member.post(`/tasks/${recurring._id}/complete`, { done: '1' }); assert.equal(await Task.countDocuments({ previousOccurrence: recurring._id }), 0);
    });
    await check('TASK reminder preset', 'Preset reminder is created before scheduled start', async () => {
      await member.post(`/tasks/${task._id}/reminder`, { preset: '15' }); assert.ok(await Reminder.findOne({ owner: owner._id, task: task._id, sent: false }));
    });
    await check('TASK reminder move preset', 'Preset reminder follows a moved task schedule', async () => {
      await member.post(`/tasks/${task._id}/schedule`, { scheduleDate: tomorrow(), scheduleStart: '12:00', scheduleEnd: '13:00' }); const saved = await Task.findById(task._id); const reminder = await Reminder.findOne({ task: task._id, sent: false }); assert.equal(saved.schedule.start - reminder.remindAt, 15 * 60000);
    });
    await check('TASK reminder invalid', 'Past or malformed reminder shows a useful error and leaves existing reminder intact', async () => {
      const before = await Reminder.findOne({ task: task._id, sent: false }); const response = await member.post(`/tasks/${task._id}/reminder`, { custom: '1', reminderDate: '2000-01-01', reminderTime: '09:00' }, { follow: true }); contains(response, 'already passed'); assert.ok(await Reminder.findById(before._id));
    });
    await check('TASK reminder custom', 'Custom reminder persists the users local date and time', async () => {
      await member.post(`/tasks/${task._id}/reminder`, { custom: '1', reminderDate: tomorrow(), reminderTime: '08:00' }); const reminder = await Reminder.findOne({ task: task._id, sent: false }); assert.ok(reminder); assert.equal(reminder.remindAt.toISOString().slice(11, 16), '01:00');
    });
    await check('TASK reminder undo', 'Remove and Undo restore a pending reminder', async () => {
      await member.post(`/tasks/${task._id}/reminder/remove`, {}); assert.equal(await Reminder.countDocuments({ task: task._id, sent: false }), 0); await member.post(`/tasks/${task._id}/reminder/restore`, {}); assert.equal(await Reminder.countDocuments({ task: task._id, sent: false }), 1);
    });
    await check('CAL reschedule', 'Moving time changes UTC schedule and unschedule removes it', async () => {
      await member.post(`/tasks/${task._id}/schedule`, { scheduleDate: tomorrow(), scheduleStart: '14:00', scheduleEnd: '15:00' }); assert.equal((await Task.findById(task._id)).schedule.start.toISOString().slice(11, 16), '07:00'); await member.post(`/tasks/${task._id}/unschedule`, {}); assert.equal((await Task.findById(task._id)).schedule?.start, undefined);
    });
    await check('TASK delete restore', 'Soft-delete hides task and Undo restores it', async () => {
      await member.post(`/tasks/${task._id}/delete`, {}); status(await member.get(`/tasks/${task._id}`), 404); assert.ok((await Task.findById(task._id)).deletedAt); await member.post(`/tasks/${task._id}/restore`, {}); status(await member.get(`/tasks/${task._id}`), 200);
    });
    await check('SEARCH find', 'Search finds owned tasks and excludes another accounts data', async () => {
      contains(await member.get('/search?q=Updated+flow'), 'Updated flow task'); const secret = await Task.create({ owner: peerUser._id, title: 'secret-peer-task' }); assert.ok(!(await member.get('/search?q=secret-peer-task')).html.includes(`href="/tasks/${secret._id}"`));
    });
    await check('SEARCH filters', 'Project, priority and completed filters include only matching tasks', async () => {
      const response = await member.get(`/search?q=Updated&project=${project._id}&priority=high&status=open`); contains(response, `href="/tasks/${task._id}"`); const miss = await member.get('/search?q=Updated&priority=low'); assert.ok(!miss.html.includes(`href="/tasks/${task._id}"`));
    });
    await check('BOARD project filter', 'Board project filter excludes tasks from other projects and includes Inbox separately', async () => {
      contains(await member.get(`/board?project=${project._id}`), `data-task-id="${task._id}"`); assert.ok(!(await member.get('/board?project=inbox')).html.includes(`data-task-id="${task._id}"`));
    });
    await check('XSS content', 'Task titles are escaped as text', async () => {
      await member.post('/tasks', { title: '<img src=x onerror=alert(1)>' }); const response = await member.get('/inbox'); contains(response, '&lt;img'); assert.ok(!response.html.includes('<img src=x onerror='));
    });
    const habitBase = { name: 'Flow habit', colour: '#2f6fde', frequencyType: 'daily' };
    await check('HABIT invalid', 'Missing habit name and invalid frequency are explained inline', async () => status(await member.post('/habits', { ...habitBase, name: '', frequencyType: 'wrong' }), 422));
    for (const frequencyType of ['daily', 'weekdays', 'days', 'timesPerWeek']) await check(`HABIT create ${frequencyType}`, 'Each supported frequency creates the correct habit', async () => {
      await member.post('/habits', { ...habitBase, name: `Flow ${frequencyType}`, frequencyType, days: ['1', '3', '5'], timesPerWeek: '3' }); const created = await Habit.findOne({ owner: owner._id, name: `Flow ${frequencyType}` }); assert.equal(created.frequency.type, frequencyType); if (frequencyType === 'daily') habit = created;
    });
    await check('HABIT edit', 'Habit detail, edit and month navigation render and save changes', async () => {
      status(await member.get(`/habits/${habit._id}?month=2026-09`), 200); status(await member.get(`/habits/${habit._id}/edit`), 200); await member.post(`/habits/${habit._id}`, { ...habitBase, name: 'Edited habit' }); assert.equal((await Habit.findById(habit._id)).name, 'Edited habit');
    });
    const today = toDateInput(new Date(), owner.timeZone);
    await check('HABIT check-in duplicate', 'Repeated check-in creates only one history entry', async () => {
      await Promise.all([member.post(`/habits/${habit._id}/check-ins`, { date: today, done: '1' }), member.post(`/habits/${habit._id}/check-ins`, { date: today, done: '1' })]); assert.equal(await HabitCheckIn.countDocuments({ habit: habit._id, date: today }), 1);
    });
    await check('HABIT undo/backfill', 'Undo removes today; allowed historical day can be checked in', async () => {
      await member.post(`/habits/${habit._id}/check-ins`, { date: today, done: '0' }); assert.equal(await HabitCheckIn.countDocuments({ habit: habit._id, date: today }), 0); await member.post(`/habits/${habit._id}/check-ins`, { date: addDays(today, -6), done: '1' }); assert.equal(await HabitCheckIn.countDocuments({ habit: habit._id }), 1);
    });
    await check('HABIT invalid toggle', 'Malformed done value cannot silently remove a valid check-in', async () => {
      await member.post(`/habits/${habit._id}/check-ins`, { date: addDays(today, -6), done: 'unexpected' }); assert.equal(await HabitCheckIn.countDocuments({ habit: habit._id }), 1);
    });
    await check('HABIT future/too-old', 'Future and more-than-six-days-old check-ins never persist', async () => {
      for (const date of [tomorrow(), addDays(today, -7)]) await member.post(`/habits/${habit._id}/check-ins`, { date, done: '1' }); assert.equal(await HabitCheckIn.countDocuments({ habit: habit._id }), 1);
    });
    await check('HABIT archive/restore', 'Archive preserves history and unarchive restores visibility', async () => {
      await member.post(`/habits/${habit._id}/archive`, { archived: '1' }); assert.ok((await Habit.findById(habit._id)).archivedAt); assert.equal(await HabitCheckIn.countDocuments({ habit: habit._id }), 1); await member.post(`/habits/${habit._id}/archive`, { archived: '0' }); assert.equal((await Habit.findById(habit._id)).archivedAt, null);
    });
    for (const [name, fields] of [['no chosen days', { frequencyType: 'days' }], ['zero weekly target', { frequencyType: 'timesPerWeek', timesPerWeek: '0' }], ['over weekly target', { frequencyType: 'timesPerWeek', timesPerWeek: '8' }], ['bad colour', { colour: '#badbad' }], ['bad reminder', { reminderTime: '99:99' }]]) {
      await check(`HABIT validation ${name}`, 'Frequency, colour and reminder boundary errors return 422 without saving', async () => { const before = await Habit.countDocuments({ owner: owner._id }); status(await member.post('/habits', { ...habitBase, ...fields }), 422); assert.equal(await Habit.countDocuments({ owner: owner._id }), before); });
    }
    const eventFields = { title: 'Flow event', date: tomorrow(), start: '09:00', end: '10:00', project: String(project._id), location: 'Room A', notes: 'Bring notes' };
    await check('EVENT invalid', 'Invalid time does not save an event and preserves title', async () => { const response = await member.post('/events', { ...eventFields, end: '08:00' }); status(response, 422); contains(response, 'Flow event'); });
    await check('EVENT create/edit', 'Timed event stores timezone-correct times and editable details', async () => {
      await member.post('/events', eventFields); event = await Event.findOne({ owner: owner._id, title: 'Flow event' }); assert.equal(event.start.toISOString().slice(11, 16), '02:00'); status(await member.get(`/events/${event._id}`), 200); await member.post(`/events/${event._id}`, { ...eventFields, title: 'Edited event' }); assert.equal((await Event.findById(event._id)).title, 'Edited event');
    });
    await check('EVENT all-day', 'All-day event spans one local calendar day', async () => {
      await member.post('/events', { ...eventFields, title: 'All-day event', allDay: 'on' }); const saved = await Event.findOne({ owner: owner._id, title: 'All-day event' }); assert.equal(saved.allDay, true); assert.equal(saved.end - saved.start, 86400000);
    });
    await check('EVENT recurring', 'Recurring event occurrence opens with scope controls', async () => {
      await member.post('/events', { ...eventFields, title: 'Weekly event', repeat: 'weekly', until: addDays(tomorrow(), 28) }); const saved = await Event.findOne({ title: 'Weekly event', owner: owner._id }); assert.equal(saved.repeat.frequency, 'weekly'); contains(await member.get(`/events/${saved._id}?occurrence=${saved.start.toISOString()}`), 'scope');
    });
    for (const scope of ['this', 'following', 'all']) await check(`EVENT recurring edit ${scope}`, 'Editing the selected scope changes only the intended occurrences', async () => {
      const { addInterval, occurrences } = require('../services/recurrence');
      const response = await member.post('/events', { ...eventFields, title: `Edit series ${scope}`, repeat: 'weekly', until: addDays(tomorrow(), 28) }); status(response, 302);
      const series = await Event.findOne({ owner: owner._id, title: `Edit series ${scope}` }); const original = addInterval(series.start, 'weekly', 1, owner.timeZone);
      await member.post(`/events/${series._id}`, { ...eventFields, title: `Changed series ${scope}`, date: addDays(tomorrow(), 7), repeat: 'weekly', until: addDays(tomorrow(), 28), occurrence: original.toISOString(), scope });
      const saved = await Event.findById(series._id);
      if (scope === 'this') { assert.equal(saved.title, series.title); assert.equal(saved.exceptions[0].title, `Changed series ${scope}`); }
      else if (scope === 'following') { assert.ok(saved.repeat.until < original); assert.equal(await Event.countDocuments({ owner: owner._id, title: `Changed series ${scope}` }), 1); }
      else { assert.equal(saved.title, `Changed series ${scope}`); assert.equal(occurrences(saved.toObject(), series.start, addInterval(series.start, 'weekly', 4, owner.timeZone), owner.timeZone).length, 4); }
    });
    for (const scope of ['this', 'following', 'all']) await check(`EVENT recurring delete ${scope}`, 'Deleting the selected scope preserves or removes the correct part of the series', async () => {
      const { addInterval } = require('../services/recurrence'); await member.post('/events', { ...eventFields, title: `Delete series ${scope}`, repeat: 'weekly', until: addDays(tomorrow(), 28) });
      const series = await Event.findOne({ owner: owner._id, title: `Delete series ${scope}` }); const original = addInterval(series.start, 'weekly', 1, owner.timeZone);
      await member.post(`/events/${series._id}/delete`, { occurrence: original.toISOString(), scope }); const saved = await Event.findById(series._id);
      if (scope === 'this') assert.equal(saved.exceptions[0].cancelled, true); else if (scope === 'following') assert.ok(saved.repeat.until < original); else assert.equal(saved, null);
    });
    await check('EVENT moved earlier', 'An occurrence moved before its series start is visible on its new calendar day', async () => {
      const { addInterval, occurrences } = require('../services/recurrence'); await member.post('/events', { ...eventFields, title: 'Moved earlier', repeat: 'weekly' });
      const series = await Event.findOne({ owner: owner._id, title: 'Moved earlier' }); const original = addInterval(series.start, 'weekly', 1, owner.timeZone); const movedDate = addDays(tomorrow(), -1);
      await member.post(`/events/${series._id}`, { ...eventFields, title: 'Moved earlier', date: movedDate, repeat: 'weekly', occurrence: original.toISOString(), scope: 'this' });
      const saved = await Event.findById(series._id); const from = new Date(`${movedDate}T00:00:00Z`); const to = new Date(from.getTime() + 86400000);
      assert.equal(occurrences(saved.toObject(), from, to, owner.timeZone).length, 1);
      contains(await member.get(`/calendar?view=day&date=${movedDate}`), 'Moved earlier');
    });
    await check('EVENT scope unsupported', 'Single-occurrence edits must not silently discard changes to place or notes', async () => {
      const series = await Event.findOne({ owner: owner._id, title: 'Weekly event' });
      const response = await member.post(`/events/${series._id}`, { ...eventFields, title: 'Weekly event', location: 'Different room', repeat: 'weekly', until: addDays(tomorrow(), 28), occurrence: series.start.toISOString(), scope: 'this' });
      status(response, 422); contains(response, 'Different room'); contains(response, 'following');
    });
    await check('EVENT foreign project', 'Foreign project is a field error and cannot attach another owners project', async () => {
      const foreign = await Project.findOne({ owner: peerUser._id }); status(await member.post('/events', { ...eventFields, project: String(foreign._id) }), 422);
    });
    await check('FOCUS length', 'Focus length preference persists', async () => { await member.post('/focus/length', { minutes: '50' }); assert.equal((await User.findById(owner._id)).preferences.focusMinutes, 50); status(await member.get(`/focus/${task._id}`), 200); });
    await check('FOCUS early block', 'Unfinished block is refused', async () => status(await member.post(`/focus/${task._id}/sessions`, { startedAt: new Date().toISOString(), minutes: '25' }, { accept: 'application/json' }), 422));
    await check('FOCUS save/deduplicate', 'Finished block saves once and duplicate is idempotent', async () => {
      const fields = { startedAt: new Date(Date.now() - 26 * 60000).toISOString(), minutes: '25' }; status(await member.post(`/focus/${task._id}/sessions`, fields), 201); status(await member.post(`/focus/${task._id}/sessions`, fields), 200); assert.equal(await FocusSession.countDocuments({ owner: owner._id, task: task._id }), 1);
    });
    await check('FOCUS concurrent save', 'Simultaneous retries cannot create duplicate completed focus blocks', async () => {
      const fields = { startedAt: new Date(Date.now() - 51 * 60000).toISOString(), minutes: '50' };
      const responses = await Promise.all(Array.from({ length: 8 }, () => member.post(`/focus/${task._id}/sessions`, fields)));
      for (const response of responses) assert.ok([200, 201].includes(response.status));
      assert.equal(await FocusSession.countDocuments({ owner: owner._id, task: task._id, startedAt: new Date(fields.startedAt) }), 1);
    });
    await check('TASK concurrent repeat', 'Simultaneous completions create only one next repeating task', async () => {
      const recurring = await Task.create({ owner: owner._id, title: 'Concurrent repeat', dueDate: new Date(`${tomorrow()}T10:00:00Z`), repeat: { frequency: 'daily' } });
      const responses = await Promise.all(Array.from({ length: 5 }, () => member.post(`/tasks/${recurring._id}/complete`, { done: '1' })));
      for (const response of responses) status(response, 302);
      assert.equal(await Task.countDocuments({ previousOccurrence: recurring._id }), 1);
    });
    await check('INSIGHTS chart', 'Chart selection persists and stats alias points to Insights', async () => { await member.post('/insights/chart', { chart: 'line' }); assert.equal((await User.findById(owner._id)).preferences.insightsChart, 'line'); assert.equal((await member.get('/stats')).location, '/insights'); });
    for (const file of ['tasks.csv', 'habit-checkins.csv']) await check(`EXPORT ${file}`, 'CSV export responds with correct media type and attachment', async () => {
      const response = await member.get(`/insights/export/${file}`); status(response, 200); assert.match(response.headers.get('content-type'), /text\/csv/); assert.match(response.headers.get('content-disposition'), /attachment/); assert.ok(response.html.length > 20);
    });
    await check('EXPORT formula injection', 'CSV escapes spreadsheet formulas and excludes foreign or deleted tasks', async () => {
      const dangerous = await Task.create({ owner: owner._id, title: '=1+1' }); const removed = await Task.create({ owner: owner._id, title: 'deleted-export-secret', deletedAt: new Date() });
      const response = await member.get('/insights/export/tasks.csv'); contains(response, "'=1+1"); assert.ok(!response.html.includes('secret-peer-task')); assert.ok(!response.html.includes(removed.title)); await dangerous.deleteOne();
    });
    for (const [url, Model, item] of [[`/projects/${project._id}`, Project, project], [`/tasks/${task._id}`, Task, task], [`/habits/${habit._id}`, Habit, habit], [`/events/${event._id}`, Event, event]]) {
      await check(`ISOLATION GET ${Model.modelName}`, 'Another owner cannot read the resource', async () => status(await peer.get(url), 404));
      const suffix = Model === Project ? '/delete' : Model === Task ? '/complete' : Model === Habit ? '/archive' : '/delete';
      await check(`ISOLATION POST ${Model.modelName}`, 'Another owner cannot change/delete the resource', async () => { status(await peer.post(url + suffix, { done: '1', archived: '1' }), 404); assert.ok(await Model.findById(item._id)); });
    }
    await check('REDIRECT external', 'returnTo cannot redirect outside the application', async () => {
      for (const returnTo of ['https://evil.test', '//evil.test', '/\\evil.test']) { const response = await member.post(`/tasks/${task._id}/complete`, { done: '0', returnTo }); assert.equal(response.location, '/inbox'); }
    });
    await check('PROFILE validation', 'Bad timezone retains typed name and shows a field error', async () => { const response = await member.post('/settings/profile', { name: 'Kept draft', timeZone: 'Bad/Zone' }); status(response, 422); contains(response, 'Kept draft'); });
    await check('PROFILE save', 'Profile name and timezone save', async () => { await member.post('/settings/profile', { name: 'Updated Tester', timeZone: 'Asia/Ho_Chi_Minh' }); assert.equal((await User.findById(owner._id)).name, 'Updated Tester'); });
    await check('PROFILE avatar invalid', 'A file pretending to be an image is rejected without altering avatar', async () => {
      const fields = new FormData(); fields.append('_csrf', member.token); fields.append('avatar', new Blob(['not an image'], { type: 'image/png' }), 'bad.png');
      const response = await member.post('/settings/avatar', fields, { follow: true }); contains(response, 'couldn’t be read'); assert.equal((await User.findById(owner._id)).avatar, undefined);
    });
    await check('PROFILE avatar valid', 'Valid image is re-encoded to a 256px WebP avatar', async () => {
      const sharp = require('sharp'); const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'blue' } }).png().toBuffer();
      const fields = new FormData(); fields.append('_csrf', member.token); fields.append('avatar', new Blob([png], { type: 'image/png' }), 'avatar.png');
      status(await member.post('/settings/avatar', fields), 302); const user = await User.findById(owner._id); assert.match(user.avatar, /\.webp\?v=/);
      const metadata = await sharp(await fs.readFile(path.join(__dirname, '..', 'public', 'uploads', 'avatars', `${owner._id}.webp`))).metadata(); assert.equal(metadata.width, 256); assert.equal(metadata.format, 'webp');
    });
    await check('PROFILE avatar size', 'Oversize upload explains 2 MB limit and retains existing avatar', async () => {
      const before = (await User.findById(owner._id)).avatar; const fields = new FormData(); fields.append('_csrf', member.token); fields.append('avatar', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
      const response = await member.post('/settings/avatar', fields, { follow: true }); contains(response, 'under 2 MB'); assert.equal((await User.findById(owner._id)).avatar, before);
    });
    await check('APPEARANCE save', 'Theme, accent, week start and calendar layout persist', async () => {
      await member.post('/settings/appearance', { theme: 'dark', accentColour: 'purple', weekStartsOn: '0', calendarLayout: 'month' }); const preferences = (await User.findById(owner._id)).preferences; assert.equal(preferences.theme, 'dark'); assert.equal(preferences.accentColour, 'purple'); assert.equal(preferences.weekStartsOn, 0); assert.equal(preferences.calendarLayout, 'month'); contains(await member.get('/today'), 'data-theme="agendal-dark"');
    });
    await check('NOTIFY invalid', 'Invalid summary time is an inline error and retains choices', async () => status(await member.post('/settings/notifications', { dailySummary: 'on', dailySummaryTime: '25:61' }), 422));
    await check('NOTIFY save', 'Notification settings and summary time persist', async () => {
      await member.post('/settings/notifications', { email: 'on', dailySummary: 'on', dailySummaryTime: '08:15' }); const notifications = (await User.findById(owner._id)).notifications; assert.equal(notifications.push, false); assert.equal(notifications.email, true); assert.equal(notifications.dailySummary.time, '08:15');
    });
    await check('NOTIFY push missing', 'Push test reports unavailable delivery instead of false success', async () => status(await member.post('/notifications/push/test', {}), 409));
    await check('NOTIFY bad subscription', 'Malformed browser subscription is rejected', async () => status(await member.post('/notifications/push/subscribe', { endpoint: 'http://localhost' }), 400));
    await check('NOTIFY unsubscribe/resubscribe', 'Signed email link changes only the intended account without requiring login', async () => {
      const token = unsubscribeToken(owner._id); const anonymous = new Client(); status(await anonymous.get(`/notifications/unsubscribe/${token}`), 200);
      status(await anonymous.post(`/notifications/unsubscribe/${token}`, {}, { csrf: false }), 200); assert.equal((await User.findById(owner._id)).notifications.email, false);
      status(await anonymous.post(`/notifications/resubscribe/${token}`, {}, { csrf: false }), 200); assert.equal((await User.findById(owner._id)).notifications.email, true);
      status(await anonymous.post(`/notifications/unsubscribe/${token}tampered`, {}, { csrf: false }), 404);
    });
    await check('NOTIFY task email job', 'Due reminder is delivered to local Mailpit once and recorded as sent', async () => {
      const dueTask = await Task.create({ owner: owner._id, title: `Flow due email ${databaseName}` });
      const dueReminder = await Reminder.create({ owner: owner._id, task: dueTask._id, remindAt: new Date(Date.now() - 60000) });
      const { processDueReminders } = require('../services/reminders');
      const result = await processDueReminders(); assert.ok(result.sent >= 1); assert.equal((await Reminder.findById(dueReminder._id)).sent, true);
      const mails = await (await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${owner.email} subject:Flow`)}`)).json(); assert.ok(mails.messages?.some((mail) => mail.Subject.includes(databaseName)), 'Reminder not found in Mailpit');
      assert.equal((await processDueReminders()).sent, 0);
      assert.ok((await User.findById(owner._id)).notifications.lastDelivered.channels.includes('email'));
    });
    await check('NOTIFY habit email job', 'Due habit reminder is sent once using the users local time', async () => {
      const { toTimeInput } = require('../services/dates'); const now = new Date();
      await User.updateOne({ _id: owner._id }, { $set: { 'notifications.lastEmailAt': null } });
      const dueHabit = await Habit.create({ owner: owner._id, name: `Flow email habit`, colour: '#2f6fde', frequency: { type: 'daily' }, reminderTime: toTimeInput(now, owner.timeZone) });
      const { processHabitReminders } = require('../services/habitReminders'); assert.equal((await processHabitReminders({ now })).sent, 1);
      assert.equal((await Habit.findById(dueHabit._id)).lastRemindedOn, toDateInput(now, owner.timeZone)); assert.equal((await processHabitReminders({ now })).sent, 0);
    });
    await check('NOTIFY daily summary job', 'Daily summary is sent once and marks the local day delivered', async () => {
      const { toTimeInput } = require('../services/dates'); const now = new Date();
      await User.updateOne({ _id: owner._id }, { $set: { 'notifications.dailySummary.time': toTimeInput(now, owner.timeZone), 'notifications.dailySummary.lastSentOn': null } });
      const { processDailySummaries } = require('../services/dailySummary'); assert.equal((await processDailySummaries({ now })).sent, 1); assert.equal((await processDailySummaries({ now })).sent, 0);
      assert.equal((await User.findById(owner._id)).notifications.lastDelivered.what, 'Daily summary');
    });
    await check('ADMIN denied', 'Non-admin cannot read or mutate the admin area', async () => { status(await member.get('/admin'), 404); status(await member.post(`/admin/users/${peerUser._id}/lock`, {}), 404); });
    for (const url of ['/admin', '/admin/users', '/admin/users?q=peer&status=active', '/admin/users?page=2', '/admin/activity', '/admin/activity?q=flows']) await check(`ADMIN screen ${url}`, 'Admin page renders without server error', async () => status(await admin.get(url), 200));
    await check('ADMIN self-lock', 'Admin cannot lock their own account', async () => { await admin.post(`/admin/users/${adminUser._id}/lock`, {}); assert.equal((await User.findById(adminUser._id)).isLockedByAdmin(), false); });
    await check('ADMIN lock/unlock', 'Lock revokes sessions, blocks login; unlock permits login again', async () => {
      await admin.post(`/admin/users/${peerUser._id}/lock`, { reason: 'Flow test' }); assert.equal((await peer.get('/today')).location, '/login'); const attempt = new Client(); await attempt.get('/login'); status(await attempt.post('/login', { email: peerUser.email, password }), 403); await admin.post(`/admin/users/${peerUser._id}/unlock`, {}); await peer.login(peerUser.email);
    });
    await check('HABIT delete', 'Deleting a habit removes its history', async () => { await member.post(`/habits/${habit._id}/delete`, {}); assert.equal(await Habit.findById(habit._id), null); assert.equal(await HabitCheckIn.countDocuments({ habit: habit._id }), 0); });
    await check('EVENT delete', 'Delete removes the event', async () => { await member.post(`/events/${event._id}/delete`, {}); assert.equal(await Event.findById(event._id), null); });
    await check('PROJECT delete keeps tasks/events', 'Deleting project moves tasks to Inbox and unassigns events without deleting them', async () => {
      const eventCount = await Event.countDocuments({ owner: owner._id }); assert.ok(await Event.countDocuments({ owner: owner._id, project: project._id }));
      await member.post(`/projects/${project._id}/delete`, {}); assert.equal(await Project.findById(project._id), null); assert.equal((await Task.findById(task._id)).project, null);
      assert.equal(await Event.countDocuments({ owner: owner._id, project: project._id }), 0); assert.equal(await Event.countDocuments({ owner: owner._id }), eventCount);
    });
    await check('AUTH password validation', 'Wrong current password cannot change credentials', async () => status(await member.post('/settings/password', { currentPassword: 'wrong', newPassword: 'Cedar-sky-bridge-72!', confirmPassword: 'Cedar-sky-bridge-72!' }), 422));
    await check('AUTH change password', 'Password change keeps this session and revokes a second session', async () => {
      const second = new Client(); await second.login(); await member.post('/settings/password', { currentPassword: password, newPassword: 'Cedar-sky-bridge-72!', confirmPassword: 'Cedar-sky-bridge-72!' }); status(await member.get('/today'), 200); assert.equal((await second.get('/today')).location, '/login');
    });
    await check('AUTH reset password', 'Valid reset updates password, invalidates token and logs in', async () => {
      const resetOwner = await User.findById(peerUser._id); const token = resetOwner.createPasswordResetToken(); await resetOwner.save(); const resetClient = new Client(); status(await resetClient.get(`/reset-password/${token}`), 200); status(await resetClient.post(`/reset-password/${token}`, { newPassword: 'Cedar-sky-bridge-72!', confirmPassword: 'Cedar-sky-bridge-72!' }), 302); status(await resetClient.get(`/reset-password/${token}`), 410); assert.equal(await (await User.findById(peerUser._id)).checkPassword('Cedar-sky-bridge-72!'), true);
    });
    await check('ACCOUNT delete validation', 'Account deletion requires current password and explicit acknowledgement', async () => status(await member.post('/settings/account/delete', { deletePassword: 'wrong' }), 422));
    await check('ACCOUNT deletion', 'Deletion removes all owned data and revokes the session', async () => {
      const response = await member.post('/settings/account/delete', { deletePassword: 'Cedar-sky-bridge-72!', understand: 'on' }); status(response, 302); assert.equal(response.location, '/');
      assert.equal(await User.findById(owner._id), null); for (const model of [Project, Task, Habit, HabitCheckIn, Event, Reminder, FocusSession]) assert.equal(await model.countDocuments({ owner: owner._id }), 0, `${model.modelName} data remains`); assert.equal((await member.get('/today')).location, '/login');
      await assert.rejects(fs.access(path.join(__dirname, '..', 'public', 'uploads', 'avatars', `${owner._id}.webp`)), { code: 'ENOENT' });
    });
    await check('AUTH logout', 'Logout revokes access and clears session', async () => { await admin.post('/logout', {}); assert.equal((await admin.get('/admin')).location, '/login'); });
    await check('ERROR unknown route', 'Unknown address is a real 404 with recovery', async () => { await peer.login(peerUser.email, 'Cedar-sky-bridge-72!'); const response = await peer.get('/does-not-exist'); status(response, 404); contains(response, 'Page not found'); });
    await check('SERVER errors', 'No unexpected server error was hidden behind a passing assertion', async () => assert.deepEqual(serverErrors, []));
  } finally {
    console.error = originalError;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.match(mongoose.connection.name, /^agendal_flow_test_\d+$/);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

run().catch((error) => results.push({ id: 'HARNESS', expectation: 'Complete flow harness', status: 'FAIL', error: error.stack })).finally(async () => {
  const directory = path.join(__dirname, '..', 'test-results');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'flows.json'), JSON.stringify({ ranAt: new Date().toISOString(), databaseName, results }, null, 2));
  const failures = results.filter((result) => result.status === 'FAIL');
  console.log(`\n${results.length - failures.length}/${results.length} flow checks passed; ${failures.length} failed.`);
  process.exit(failures.length ? 1 : 0); // the session store owns its own MongoDB connection
});
