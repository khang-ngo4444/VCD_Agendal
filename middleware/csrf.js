const crypto = require('node:crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// One secret token per session. Forms send it as the hidden `_csrf` field (views/partials/csrf.ejs),
// fetch calls as the X-CSRF-Token header. Another site can make the browser post here but can't read the token.
function csrf(req, res, next) {
  // A function, so the token (and the session it lives in) is only created when a page renders a form.
  res.locals.csrfToken = () => (req.session.csrfToken ??= crypto.randomBytes(32).toString('hex'));

  if (SAFE_METHODS.has(req.method)) return next();

  const sent = req.body?._csrf ?? req.get('X-CSRF-Token') ?? '';
  if (!tokensMatch(sent, req.session.csrfToken)) {
    return next(Object.assign(new Error('Invalid or missing CSRF token'), { status: 403 }));
  }
  next();
}

function tokensMatch(sent, expected) {
  if (typeof sent !== 'string' || !expected) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = csrf;
