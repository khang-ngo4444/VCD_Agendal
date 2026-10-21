const { parseProject } = require('../validators/project');

test.each(['📚', '👩🏽‍💻', '🏳️‍🌈', '🇻🇳', '1️⃣', ''])('an optional custom emoji is supported: %s', (icon) => {
  expect(parseProject({ name: 'Study', colour: '#Ab12Cd', icon }).errors).toEqual({});
});
test.each(['two icons 📚🎨', '📚🎨', 'icon', '<svg onload=alert(1)>', 'x'.repeat(33)])('invalid icon gets a recoverable error: %s', (icon) => {
  expect(parseProject({ name: 'Study', icon }).errors.icon).toBeTruthy();
});
test.each(['red', '#123', 'url(javascript:alert(1))', '#1234567', ['#123456']])('colour is a real six-digit hex: %s', (colour) => {
  const result = parseProject({ name: 'Study', colour });
  expect(result.errors.colour).toBeTruthy();
});
test('validation retains every field and edit defaults; it does not silently clear an existing icon', () => {
  expect(parseProject({ name: ' ' }, { colour: '#123456', icon: '🎯' })).toEqual({ values: { name: '', colour: '#123456', icon: '🎯' }, errors: { name: 'Give this item a name.' } });
  expect(parseProject({ name: 'x'.repeat(61) }).errors.name).toBeTruthy();
  expect(parseProject({ name: '  My course  ', icon: '' }, { icon: '🎯' }).values).toMatchObject({ name: 'My course', icon: '' });
});
