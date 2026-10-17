// Text typed into a search box, matched literally: "demo+1@x" must not turn "+" into a regex quantifier.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };
