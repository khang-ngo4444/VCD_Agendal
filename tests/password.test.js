const { validatePassword, validateRegistration } = require('../validators/auth');

const me = { email: 'khang.ngo@example.com', name: 'Khang Ngo' };

describe('password policy', () => {
  test('a short password says how many characters are needed', () => {
    expect(validatePassword('abc123', me)).toBe('Use at least 8 characters.');
  });

  // bcrypt reads only 72 bytes: without this limit a 100-character password would quietly be stored as its first 72.
  test('a password over 72 bytes is refused rather than silently cut', () => {
    expect(validatePassword('a1'.repeat(37), me)).toMatch(/too long/);
    expect(validatePassword('correct horse battery staple', me)).toBeNull();
  });

  test('multi-byte characters count by bytes, because bcrypt does', () => {
    expect(validatePassword('é'.repeat(40), me)).toMatch(/too long/); // 40 characters but 80 bytes
  });

  test('the most common passwords are refused even when long enough', () => {
    for (const bad of ['password', 'Password123', '12345678', 'QWERTYUIOP', 'iloveyou']) {
      expect(validatePassword(bad, me)).toMatch(/too easy to guess/);
    }
  });

  test('repeated patterns are refused', () => {
    expect(validatePassword('aaaaaaaa', me)).toMatch(/too easy/);
    expect(validatePassword('abcabcabc', me)).toMatch(/too easy/);
  });

  test('a password built from the person’s own name or email is refused', () => {
    expect(validatePassword('khang.ngo@example.com', me)).toMatch(/name or email/);
    expect(validatePassword('ilovekhang2026', me)).toMatch(/name or email/);
    expect(validatePassword('KhangNgo!!', me)).toMatch(/name or email/);
  });

  test('there are no composition rules: a long plain passphrase is fine', () => {
    expect(validatePassword('purple lanterns drift slowly', me)).toBeNull();
  });
});

describe('registration', () => {
  test('reports every bad field at once so the form can show them together', () => {
    const errors = validateRegistration({ name: 'x'.repeat(81), email: 'nope', password: '123' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'password']);
  });

  test('an over-long email is refused', () => {
    expect(validateRegistration({ email: `${'a'.repeat(250)}@b.co`, password: 'purple lanterns drift' }).email).toBeDefined();
  });
});
