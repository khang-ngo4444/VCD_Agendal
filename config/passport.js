const passport = require('passport');

// OAuth providers that have credentials in .env. Routes and sign-in buttons only exist for these,
// so a missing key hides the button instead of sending people to a broken login.
const enabledProviders = new Set();

module.exports = { passport, enabledProviders };
