// Shared OAuth routes: /auth/:provider starts the sign-in, /auth/:provider/callback finishes it.
const { Router } = require('express');
const { passport, enabledProviders } = require('../config/passport');
const { HOME_PATH, WELCOME_PATH, startSession } = require('../middleware/auth');
const { flash } = require('../middleware/flash');

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
      await startSession(req, user);
      res.redirect(user.onboardedAt ? HOME_PATH : WELCOME_PATH);
    } catch (error) {
      next(error);
    }
  })(req, res, next)
);

module.exports = router;
