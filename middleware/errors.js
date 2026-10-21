// The default Express handler exposes stack traces in development and leaves users on a raw error page.
function errors(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  if (status >= 500) console.error(err);
  const messages = {
    403: ['This action couldn’t be verified', 'Your session may have expired. Reload the page and try again.'],
    404: ['Page not found', 'The item may have been removed or you may not have access to it.'],
    413: ['That upload is too large', 'Choose a smaller file and try again.'],
    422: ['Check your input', 'Review the information you entered and try again.'],
    500: ['Something went wrong', 'We couldn’t finish the request. Your last action may not have completed. Check its result before trying again.'],
  };
  const [heading, message] = messages[status] ?? ['Request couldn’t be completed', 'Return to the app and try again.'];
  res.status(status);
  res.set('Cache-Control', 'no-store');
  if (req.accepts(['html', 'json']) === 'json') return res.json({ error: message });
  res.render('errors/error', { title: `${heading} · Agendal`, status, heading, message });
}

module.exports = errors;
