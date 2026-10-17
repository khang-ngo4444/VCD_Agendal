const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Returns { field: message } for every invalid field; an empty object means valid.
function validateRegistration({ email, password }) {
  const errors = {};
  if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter an email address like name@example.com.';
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return errors;
}

module.exports = { MIN_PASSWORD_LENGTH, validateRegistration };
