const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const { requireLogin } = require('./middleware/auth');
const authRoutes = require('./routes/auth');

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    name: 'agendal.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // each visit restarts the 30 days
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, ttl: SESSION_MAX_AGE_MS / 1000 }),
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// Public routes
app.get('/', (req, res) => res.render('home', { title: 'Agendal' }));
app.use(authRoutes);

// Everything below needs a logged-in user
app.use(requireLogin);
app.get('/today', (req, res) => res.render('today', { title: 'Today · Agendal' }));

module.exports = app;

// Exported without listen() so tests can mount the app; `npm run dev` starts the server.
if (require.main === module) {
  const port = process.env.PORT || 3000;
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('MongoDB connected');
      app.listen(port, () => console.log(`Agendal running at http://localhost:${port}`));
    })
    .catch((err) => {
      console.error('MongoDB connection failed:', err.message);
      process.exitCode = 1;
    });
}
