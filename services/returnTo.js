// Only same-site paths, so a crafted returnTo can't bounce the user to another site. Parsed with URL, because
// browsers read tricks like "/\evil.example" as "//evil.example".
function safeReturnTo(path, fallback = '/inbox') {
  if (typeof path !== 'string' || !path.startsWith('/')) return fallback;
  const url = new URL(path, 'http://agendal.invalid');
  return url.origin === 'http://agendal.invalid' ? url.pathname + url.search : fallback;
}

module.exports = { safeReturnTo };
