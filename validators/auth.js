const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254; // the practical limit of an email address (RFC 5321)
const MAX_NAME_LENGTH = 80;

// Password policy, following NIST SP 800-63B: a length floor, a ceiling, and a blocklist instead of composition rules
// ("one capital, one symbol" makes people pick Password1!). The ceiling exists because bcrypt only reads the first
// 72 bytes, so a longer password would silently be a shorter one.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. Avoid common passwords and anything with your name or email.`;

// The passwords people pick most that are long enough to pass the length floor.
const COMMON_PASSWORDS = new Set(
  `password password1 password12 password123 password1234 passw0rd p@ssw0rd p@ssword 12345678 123456789 1234567890
  12341234 123123123 11111111 00000000 87654321 987654321 qwertyui qwerty123 qwertyuiop qwerty12 1q2w3e4r 1qaz2wsx
  zaq12wsx asdfghjk asdfghjkl zxcvbnm1 iloveyou iloveyou1 letmein1 welcome1 welcome123 admin123 administrator
  abc12345 abcd1234 monkey123 dragon123 football football1 baseball sunshine princess superman whatever starwars
  computer michael1 jordan23 shadow12 master123 hello123 freedom1 trustno1 changeme changeme1 login123 test1234
  agendal agendal1 agendal123 student1 student123 university`.split(/\s+/)
);

const isRepetitive = (value) => /^(.)\1+$/.test(value) || /^(.{2,3})\1+$/.test(value); // "aaaaaaaa", "abcabcabc"

// Returns one message that says how to fix the problem, or null when the password is acceptable.
// `context` is the account's own details: a password built from them is guessable by anyone who knows the person.
function validatePassword(password, { email = '', name = '' } = {}) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) return 'That password is too long. Keep it under 72 characters.';

  const lower = password.toLowerCase();
  const emailName = email.split('@')[0].toLowerCase();
  const nameLower = name.trim().toLowerCase();
  const personal = [
    email.toLowerCase(),
    emailName,
    emailName.replace(/[._+-]/g, ''), // khang.ngo -> khangngo
    nameLower,
    nameLower.replace(/\s+/g, ''), // "khang ngo" -> khangngo
    ...nameLower.split(/\s+/), // each word: khang, ngo
  ].filter((part) => part.length >= 4); // shorter fragments would flag harmless passwords
  if (personal.some((part) => lower.includes(part))) return 'Don’t use your name or email in your password.';
  if (COMMON_PASSWORDS.has(lower) || isRepetitive(lower)) {
    return 'That password is too easy to guess. Try three unrelated words instead.';
  }
  return null;
}

// Returns { field: message } for every invalid field; an empty object means valid.
function validateRegistration({ name = '', email, password }) {
  const errors = {};
  if (name.length > MAX_NAME_LENGTH) errors.name = `Use at most ${MAX_NAME_LENGTH} characters.`;
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) errors.email = 'Enter an email address like name@example.com.';
  const passwordError = validatePassword(password, { email, name });
  if (passwordError) errors.password = passwordError;
  return errors;
}

module.exports = {
  EMAIL_PATTERN,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  PASSWORD_HINT,
  validatePassword,
  validateRegistration,
};
