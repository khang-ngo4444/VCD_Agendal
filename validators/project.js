const MAX_NAME_LENGTH = 60;
const COLOUR = /^#[0-9a-f]{6}$/i;
const text = (value) => typeof value === 'string' ? value : '';
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function parseProject(body = {}, defaults = {}) {
  const values = {
    name: text(body.name).trim(),
    colour: body.colour === undefined ? defaults.colour || '#2f6fde' : text(body.colour).trim(),
    icon: body.icon === undefined ? defaults.icon || '' : text(body.icon).trim(),
  };
  const errors = {};
  if (!values.name) errors.name = 'Give this item a name.';
  else if (values.name.length > MAX_NAME_LENGTH) errors.name = `Use at most ${MAX_NAME_LENGTH} characters.`;
  if (!COLOUR.test(values.colour)) errors.colour = 'Enter a six-digit colour, such as #2f6fde.';
  if (values.icon && (values.icon.length > 32 || [...segmenter.segment(values.icon)].length !== 1 || !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(values.icon))) {
    errors.icon = 'Use one emoji, or leave this empty for a colour dot.';
  }
  return { values, errors };
}

module.exports = { MAX_NAME_LENGTH, COLOUR, parseProject };
