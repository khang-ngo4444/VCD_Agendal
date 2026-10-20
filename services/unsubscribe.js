// Signed links that turn email reminders off without logging in (the link in every reminder email).
// The token is the user id plus an HMAC of it, so it can't be forged or pointed at another account.
const crypto = require('node:crypto');

const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set');
  return value;
};

const signature = (userId) =>
  crypto.createHmac('sha256', secret()).update(`unsubscribe:email:${userId}`).digest('base64url');

const unsubscribeToken = (userId) => `${userId}.${signature(String(userId))}`;

// The user id the token was made for, or null when it is malformed or tampered with.
function readUnsubscribeToken(token) {
  if (typeof token !== 'string') return null;
  const [userId, sent, extra] = token.split('.');
  if (!userId || !sent || extra !== undefined || !/^[a-f0-9]{24}$/.test(userId)) return null;
  const expected = Buffer.from(signature(userId));
  const given = Buffer.from(sent);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? userId : null;
}

module.exports = { unsubscribeToken, readUnsubscribeToken };
