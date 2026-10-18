const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../models/User');

// OAuth providers that have credentials in .env. Routes and sign-in buttons only exist for these,
// so a missing key hides the button instead of sending people to a broken login.
const enabledProviders = new Set();

// Finds or creates the account for a Google profile:
// 1. already linked by googleId, 2. same verified email → link it, 3. otherwise a new account (no password yet).
async function findOrCreateGoogleUser(profile) {
  const linked = await User.findOne({ googleId: profile.id });
  if (linked) return linked;

  const email = profile.emails?.find((entry) => entry.verified)?.value?.toLowerCase();
  if (!email) return null; // without a verified email we can't safely match or create an account

  const existing = await User.findOne({ email });
  if (existing) {
    existing.googleId = profile.id;
    // Local accounts are not email-verified, so someone could have registered this address with a password they know.
    // Linking Google must not hand the account to them: drop the password and end every session. Google now owns it.
    if (existing.passwordHash) {
      existing.passwordHash = undefined;
      existing.sessionVersion += 1;
      existing.passwordReset = undefined;
      existing.$locals.passwordRemoved = true; // lets the route tell the user
    }
    return existing.save();
  }
  return User.create({ email, name: profile.displayName, googleId: profile.id });
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const appUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${appUrl}/auth/google/callback`,
        scope: ['profile', 'email'],
        state: true, // stores a random value in the session and rejects callbacks that don't echo it back
      },
      (accessToken, refreshToken, profile, done) =>
        findOrCreateGoogleUser(profile).then((user) => done(null, user || false), done)
    )
  );
  enabledProviders.add('google');
}

module.exports = { passport, enabledProviders, findOrCreateGoogleUser };
