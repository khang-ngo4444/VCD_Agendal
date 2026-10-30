// Shared setup for the integration tests (tests/integration): the real app (app.js) against a throwaway in-memory MongoDB,
// so the tests go through routes, sessions, CSRF and the database like a browser would, without touching real data.
// Each test file gets its own database (Jest runs files in separate module registries).
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

const PASSWORD = 'correct horse battery';
let mongo;
let app;

// Start the database first: app.js reads MONGODB_URI when it is required (the session store connects to it).
async function startApp() {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.SESSION_SECRET ??= 'test-session-secret';
  app = require('../../app');
  await mongoose.connect(process.env.MONGODB_URI);
  return app;
}

async function stopApp() {
  await mongoose.disconnect();
  await mongo?.stop();
}

// Empty every collection, so each test starts from nothing.
async function resetData() {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
}

// The page's CSRF token, read from the first form on it (views/partials/csrf.ejs).
async function csrf(agent, path) {
  const res = await agent.get(path);
  const match = res.text.match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error(`No CSRF token on ${path} (status ${res.status})`);
  return match[1];
}

// POSTs a form the way the browser does: urlencoded, with the token from `from` (the page the form is on).
async function post(agent, path, fields = {}, from = '/today') {
  const token = await csrf(agent, from);
  return agent.post(path).type('form').send({ _csrf: token, ...fields });
}

// A signed-in browser for a new account that has finished the Welcome screen.
async function signUp(email = 'ana@example.com', name = 'Ana Tran') {
  const agent = request.agent(app);
  await post(agent, '/register', { name, email, password: PASSWORD }, '/register');
  await post(agent, '/welcome', { skip: '1' }, '/welcome');
  const User = require('../../models/User');
  return { agent, user: await User.findOne({ email }) };
}

// Logs in on a fresh browser and returns the response (302 on success, 401 / 429-style page on failure).
async function logIn(email, password = PASSWORD, agent = request.agent(app)) {
  const res = await post(agent, '/login', { email, password }, '/login');
  return { agent, res };
}

// An admin account, made directly in the database (there is no sign-up form for admins), signed in.
async function signUpAdmin(email = 'admin@example.com') {
  const User = require('../../models/User');
  const admin = new User({ email, name: 'Admin', role: 'admin', onboardedAt: new Date() });
  await admin.setPassword(PASSWORD);
  await admin.save();
  const { agent } = await logIn(email);
  return { agent, user: admin };
}

module.exports = { PASSWORD, startApp, stopApp, resetData, csrf, post, signUp, logIn, signUpAdmin };
