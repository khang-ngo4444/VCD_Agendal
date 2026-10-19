const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const { SESSION_COOKIE, WELCOME_PATH, requireLogin, requireOnboarding, keepAdminsInConsole, guestOnly } = require('./middleware/auth');
const csrf = require('./middleware/csrf');
const avatarUpload = require('./middleware/avatarUpload');
const { showFlash } = require('./middleware/flash');
const loadShell = require('./middleware/shell');
const authRoutes = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const { passport, enabledProviders } = require('./config/passport');
const settingsRoutes = require('./routes/settings');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const habitRoutes = require('./routes/habits');
const dailyRoutes = require('./routes/daily');
const boardRoutes = require('./routes/board');
const calendarRoutes = require('./routes/calendar');
const eventRoutes = require('./routes/events');
const adminRoutes = require('./routes/admin');
const welcome = require('./controllers/welcomeController');

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.dates = require('./services/dates'); // views format dates in the user's time zone
// Absolute base URL for canonical links and social preview images.
app.locals.appUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

// Helmet's default CSP already allows https: styles and fonts (Google Fonts) and blocks inline scripts.
// Over plain http on localhost, upgrade-insecure-requests would break every asset, so it is production-only.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null },
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));
app.get('/js/vendor/sortable.min.js', (req, res) => res.sendFile(require.resolve('sortablejs/Sortable.min.js'))); // Board drag and drop
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    name: SESSION_COOKIE,
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
app.post('/settings/avatar', avatarUpload); // multipart body must be parsed before the CSRF check
app.use(csrf);
app.use(showFlash);
app.use(passport.initialize());
app.locals.oauthProviders = enabledProviders; // which sign-in buttons the auth pages show

// Public routes. Logged-in visitors skip the landing page and go straight to their Daily List.
app.get('/', guestOnly, (req, res) =>
  res.render('home', {
    title: 'Agendal: plan the week, live the day',
    description:
      'A free planner for students: tasks, habits and projects in one place, with a Kanban board, a calendar and a daily list that stay in sync.',
    canonicalPath: '/',
  })
);
app.get('/privacy', (req, res) =>
  res.render('legal/privacy', {
    title: 'Privacy · Agendal',
    description: 'What Agendal stores about you, why, and the choices you have.',
    canonicalPath: '/privacy',
  })
);
app.get('/terms', (req, res) =>
  res.render('legal/terms', {
    title: 'Terms of use · Agendal',
    description: 'The simple rules for using Agendal, a student project.',
    canonicalPath: '/terms',
  })
);
app.use(authRoutes);
app.use(oauthRoutes);

// Admin console: its own layout and routes. Non-admins fall through to the 404 below.
app.use('/admin', requireLogin, adminRoutes);

// Everything below needs a logged-in user. Admin accounts are sent to /admin instead.
app.use(requireLogin, keepAdminsInConsole, requireOnboarding, loadShell);
app.get(WELCOME_PATH, welcome.show);
app.post(WELCOME_PATH, welcome.complete);
app.use(dailyRoutes);
app.use(boardRoutes);
app.use(calendarRoutes);
app.use(eventRoutes);
app.use(settingsRoutes);
app.use(projectRoutes);
app.use(taskRoutes);
app.use(habitRoutes);
if (process.env.NODE_ENV !== 'production') app.use(require('./routes/components'));

// No route matched: the same page for every unknown address (and for /admin when you are not an admin).
app.use((req, res) => res.status(404).render('errors/404', { title: 'Page not found · Agendal' }));

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
