// Shared OAuth routes: /auth/:provider starts the sign-in, /auth/:provider/callback finishes it.
const { Router } = require('express');
const { passport, enabledProviders } = require('../config/passport');
const { HOME_PATH, WELCOME_PATH, ADMIN_LOCKED_MESSAGE, startSession } = require('../middleware/auth');
const { flash } = require('../middleware/flash');
const activity = require('../services/activity');
const { loginDetails } = require('../controllers/authController');

const router = Router();

router.param('provider', (req, res, next, provider) => (enabledProviders.has(provider) ? next() : next('route')));

router.get('/auth/:provider', (req, res, next) => passport.authenticate(req.params.provider, { session: false })(req, res, next));

router.get('/auth/:provider/callback', (req, res, next) =>
  passport.authenticate(req.params.provider, { session: false }, async (err, user) => {
    try {
      // Provider errors (bad code, revoked client) are logged; the person just sees that it didn't work.
      if (err) console.error(`OAuth sign-in with ${req.params.provider} failed:`, err);
      if (err || !user) {
        flash(req, 'error', 'Sign-in didn’t finish. Try again, or use your email and password.');
        return res.redirect('/login');
      }
      if (user.isLockedByAdmin()) {
        await activity.record(req, { action: 'login_failed', user, details: `${req.params.provider} · account locked by an admin` });
        flash(req, 'error', ADMIN_LOCKED_MESSAGE);
        return res.redirect('/login');
      }
      await startSession(req, user);
      const provider = req.params.provider[0].toUpperCase() + req.params.provider.slice(1);
      await activity.record(req, {
        action: user.$locals.signedUp ? 'signup' : 'login',
        user,
        details: loginDetails(req, user, provider),
      });
      if (user.$locals?.passwordRemoved) {
        flash(req, 'info', 'Google is now linked to your account. For safety we removed the old password; set a new one in Settings.');
      }
      res.redirect(user.onboardedAt ? HOME_PATH : WELCOME_PATH);
    } catch (error) {
      next(error);
    }
  })(req, res, next)
);

module.exports = router;
