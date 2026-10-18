import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.js';

async function setup(t, overrides = {}) {
  const env = { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://translate.example.com', APP_ACCESS_PASSWORD: 'test-password-only', ...overrides };
  const app = createApp({ env, keyLoader: async () => 'fixture-only', fetchImpl: async () => new Response('v=0\r\nanswer') });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { app.closeAllConnections(); app.close(resolve); }));
  return (path, { auth = true, host = 'translate.example.com', method = 'GET', origin = env.PUBLIC_ORIGIN } = {}) => new Promise((resolve, reject) => {
    const headers = { Host: host, Origin: origin, 'Content-Type': 'application/sdp', 'X-Translation-Client': '1' };
    if (auth) headers.Authorization = 'Basic ' + Buffer.from('songngu:test-password-only').toString('base64');
    const req = http.request({ host: '127.0.0.1', port: app.address().port, path, method, headers }, res => {
      let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end(method === 'POST' ? 'v=0\r\nm=audio 9 RTP/AVP 0' : undefined);
  });
}
test('Railway healthcheck works independently of its internal hostname and auth', async t => {
  const request = await setup(t);
  assert.equal((await request('/healthz', { auth: false, host: 'healthcheck.railway.app' })).status, 200);
});
test('production requires authentication for page and paid API, accepts configured HTTPS origin', async t => {
  const request = await setup(t);
  assert.equal((await request('/', { auth: false })).status, 401);
  assert.equal((await request('/api/session', { auth: false, method: 'POST' })).status, 401);
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/api/session', { method: 'POST' })).status, 200);
  assert.equal((await request('/api/session', { method: 'POST', origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/', { host: 'evil.example' })).status, 403);
});
test('production fails closed if access password is not configured', async t => {
  const request = await setup(t, { APP_ACCESS_PASSWORD: '' });
  assert.equal((await request('/')).status, 503);
  assert.equal((await request('/healthz', { auth: false })).status, 503);
});
