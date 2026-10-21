const express = require('express');
const errors = require('../middleware/errors');

async function request(status, accept) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', require('node:path').join(__dirname, '../views'));
  app.get('/', () => { throw Object.assign(new Error('private database details'), { status }); });
  app.use(errors);
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { Accept: accept } });
    return { status: response.status, body: await response.text(), cache: response.headers.get('cache-control'), type: response.headers.get('content-type') };
  } finally { server.close(); }
}

test('a server error offers recovery without leaking internal details in development', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = await request(500, 'text/html');
    expect(result).toMatchObject({ status: 500, cache: 'no-store' });
    expect(result.body).toContain('Return to Agendal');
    expect(result.body).not.toContain('private database details');
    expect(log).toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

test('an expired CSRF token produces actionable JSON for API clients', async () => {
  const result = await request(403, 'application/json');
  expect(result.status).toBe(403);
  expect(result.type).toContain('application/json');
  expect(JSON.parse(result.body).error).toContain('Reload the page');
  expect(result.body).not.toContain('private database details');
});
