const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createAuth } = require('../auth');
const PASSWORD = 'testing-only-long-password-987';

async function launch(t, directory, extra = {}) {
  const reserve = http.createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, [path.join(__dirname, '../server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: directory,
      ADMIN_PASSWORD: PASSWORD, APP_ORIGIN: 'https://dash.wetterhahn.com', ALLOW_INSECURE_HTTP: 'false', ...extra },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
  };
  t.after(stop);
  let error = '';
  child.stderr.on('data', chunk => { error += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout: ' + error)), 10000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('HarborDash running')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(error)); });
    child.once('error', reject);
  });
  const request = (endpoint, { method = 'GET', body, cookie, headers = {} } = {}) => fetch(`http://127.0.0.1:${port}${endpoint}`, {
    method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body)
  });
  const login = async (remember = true, cookie) => {
    const response = await request('/api/auth/login', { method: 'POST', body: { password: extra.ADMIN_PASSWORD || PASSWORD, remember, deviceName: 'Test browser' }, cookie });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie');
  };
  return { request, login, stop };
}

function directory() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'harbordash-auth-'));
  return value;
}

test('fails closed for missing password, short password, insecure origin and invalid duration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbordash-config-'));
  try {
    for (const env of [{}, { ADMIN_PASSWORD: 'short', APP_ORIGIN: 'https://example.com' },
      { ADMIN_PASSWORD: PASSWORD, APP_ORIGIN: 'http://example.com' },
      { ADMIN_PASSWORD: PASSWORD, APP_ORIGIN: 'https://example.com', SESSION_DAYS: '0' }]) {
      assert.throws(() => createAuth({ directory: dir, env }));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('all private endpoints protected from first boot; no metadata or IP bypass', async t => {
  const dir = directory(t);
  const app = await launch(t, dir);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const endpoints = [
    ['/api/setup', 'POST'], ['/api/import', 'POST'], ['/api/homebase', 'PUT'],
    ['/api/homebase/settings', 'PUT'], ['/api/homebase/export', 'GET'],
    ['/api/background-image', 'GET'], ['/api/background-images/private.png', 'GET'],
    ['/api/favicon?url=http://127.0.0.1/', 'GET'], ['/api/link-metadata', 'GET'],
    ['/api/link-status', 'GET'], ['/api/status', 'GET'], ['/api/weather', 'GET'],
    ['/api/homeassistant/toggle', 'POST'], ['/api/auth/sessions', 'GET'], ['/api/auth/sessions?id=others', 'DELETE']
  ];
  for (const [endpoint, method] of endpoints) {
    const response = await app.request(endpoint, { method, headers: { 'X-Forwarded-For': '127.0.0.1' } });
    assert.equal(response.status, 401, endpoint);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const cookie = (await app.login()).split(';')[0];
  assert.equal((await app.request('/api/setup', { method: 'POST', cookie, body: { title: 'PRIVATE TITLE', profileName: 'PRIVATE PROFILE' } })).status, 200);
  const data = await (await app.request('/api/homebase')).json();
  assert.equal(data.title, 'HarborDash');
  assert.equal(data.auth.authenticated, false);
  assert.deepEqual(data.profiles, []);
  assert.equal(data.revision, '');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=', 'base64');
  const uploaded = await app.request('/api/background-images', { method: 'POST', cookie, body: png, headers: { 'Content-Type': 'image/png', 'X-File-Name': 'private.png' } });
  assert.equal(uploaded.status, 200);
  const imageUrl = (await uploaded.json()).appearance.backgroundImages[0].url;
  const image = await app.request(imageUrl, { cookie });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.equal((await app.request(imageUrl)).status, 401);
  const favicon = await app.request('/api/favicon?url=invalid', { cookie });
  assert.equal(favicon.headers.get('cache-control'), 'private, no-store');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'homebase.json')));
  saved.admin.allowedIps = ['127.0.0.1'];
  fs.writeFileSync(path.join(dir, 'homebase.json'), JSON.stringify(saved));
  assert.equal((await app.request('/api/homebase/export', { headers: { 'X-Forwarded-For': '127.0.0.1' } })).status, 401);
});

test('secure cookie, persistence, device revocation, logout and password-change invalidation', async t => {
  const dir = directory(t);
  let app = await launch(t, dir);
  const raw = await app.login();
  assert.match(raw, /__Host-harbordash_session=[a-f0-9]{64}/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=15552000']) assert.ok(raw.includes(flag), flag);
  const first = raw.split(';')[0];
  const disk = fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8');
  assert.ok(!disk.includes(first.split('=')[1]));
  assert.ok(!disk.includes(PASSWORD));
  await app.stop();
  app = await launch(t, dir);
  assert.equal((await app.request('/api/homebase/export', { cookie: first })).status, 200);
  const ephemeral = await app.login(false);
  assert.ok(!ephemeral.includes('Max-Age'));
  const second = ephemeral.split(';')[0];
  const devices = await (await app.request('/api/auth/sessions', { cookie: first })).json();
  assert.equal(devices.sessions.length, 2);
  assert.ok(devices.sessions.every(s => !s.hash));
  const other = devices.sessions.find(s => !s.current);
  await app.request('/api/auth/sessions?id=' + other.id, { method: 'DELETE', cookie: first });
  assert.equal((await app.request('/api/homebase/export', { cookie: second })).status, 401);
  const third = (await app.login()).split(';')[0];
  await app.request('/api/auth/sessions?id=others', { method: 'DELETE', cookie: first });
  assert.equal((await app.request('/api/homebase/export', { cookie: third })).status, 401);
  const logout = await app.request('/api/auth/logout', { method: 'POST', cookie: first });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await app.request('/api/homebase/export', { cookie: first })).status, 401);
  const fourth = (await app.login()).split(';')[0];
  await app.stop();
  app = await launch(t, dir, { ADMIN_PASSWORD: PASSWORD + '-changed' });
  assert.equal((await app.request('/api/homebase/export', { cookie: fourth })).status, 401);
  await app.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('expired sessions rejected, cross-origin writes blocked, spoofing cannot bypass throttling', async t => {
  const dir = directory(t);
  let app = await launch(t, dir);
  const cookie = (await app.login()).split(';')[0];
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await app.request('/api/setup', { method: 'POST', body: {}, cookie, headers })).status, 403);
  }
  assert.equal((await app.request('/api/setup', { method: 'POST', body: {}, cookie, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await app.request('/api/setup', { method: 'POST', body: { title: 'Allowed' }, cookie, headers: { Origin: 'https://dash.wetterhahn.com' } })).status, 200);
  await app.stop();
  const file = path.join(dir, 'sessions.json');
  const stored = JSON.parse(fs.readFileSync(file));
  stored.sessions[0].expiresAt = 1;
  fs.writeFileSync(file, JSON.stringify(stored));
  app = await launch(t, dir);
  assert.equal((await app.request('/api/homebase/export', { cookie })).status, 401);
  for (let i = 0; i < 10; i++) {
    assert.equal((await app.request('/api/auth/login', { method: 'POST', body: { password: 'wrong' }, headers: { 'X-Forwarded-For': `10.0.0.${i}` } })).status, 401);
  }
  const limited = await app.request('/api/auth/login', { method: 'POST', body: { password: PASSWORD } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  await app.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});
