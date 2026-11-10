// CI integration test: real image, unprivileged user, read-only root, writable volume.
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const password = 'ci-container-only-password-12345';
const env = { ...process.env, ADMIN_PASSWORD: password, HARBORDASH_IMAGE: 'harbordash:smoke',
  DASH_PORT: '4318', DASH_BIND_IP: '127.0.0.1', DASH_VOLUME_NAME: 'harbordash_ci_data',
  APP_ORIGIN: 'https://dash.wetterhahn.com' };
const compose = (...args) => execFileSync('docker', ['compose', '-p', 'harbordash_ci', '-f', 'docker-compose.yml', '-f', 'docker-compose.build.yml', ...args], { env, stdio: 'inherit' });
// Compose commands block this test's event loop; do not reuse sockets across a restart.
const request = (route, options = {}) => fetch('http://127.0.0.1:4318' + route, {
  ...options, headers: { ...options.headers, Connection: 'close' }
});
(async () => {
  try {
    compose('up', '-d', '--build', '--wait');
    assert.equal((await request('/api/health')).status, 200);
    assert.equal((await request('/api/homebase/export')).status, 401);
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, remember: true }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const setup = await request('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ title: 'Container persisted', profileName: 'Smoke test' }) });
    assert.equal(setup.status, 200);
    compose('restart');
    compose('up', '-d', '--wait');
    const response = await request('/api/homebase', { headers: { Cookie: cookie } });
    const data = await response.json();
    assert.equal(data.auth.authenticated, true);
    assert.equal(data.title, 'Container persisted');
    console.log('Container smoke test passed: protected endpoints, writable data, persistent session after restart.');
  } finally {
    compose('down', '--volumes');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
