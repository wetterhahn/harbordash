const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Single-owner authentication. Session bearer tokens never reach disk.
function createAuth({ directory, env = process.env }) {
  const origin = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : '';
  const insecure = env.ALLOW_INSECURE_HTTP === 'true';
  if (!insecure && (!origin || !origin.startsWith('https://'))) {
    throw new Error('APP_ORIGIN must be an https:// URL (local development: ALLOW_INSECURE_HTTP=true).');
  }
  const password = env.ADMIN_PASSWORD_FILE
    ? fs.readFileSync(env.ADMIN_PASSWORD_FILE, 'utf8').trimEnd()
    : env.ADMIN_PASSWORD || '';
  if (password.length < 16) throw new Error('ADMIN_PASSWORD must contain at least 16 characters.');
  const days = Number(env.SESSION_DAYS || 180);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('SESSION_DAYS must be between 1 and 365.');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  fs.mkdirSync(directory, { recursive: true });
  const saltFile = path.join(directory, 'auth-salt');
  if (!fs.existsSync(saltFile)) fs.writeFileSync(saltFile, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
  const salt = fs.readFileSync(saltFile);
  const expected = crypto.scryptSync(password, salt, 64);
  const version = expected.toString('hex');
  const cookieName = insecure ? 'harbordash_session' : '__Host-harbordash_session';
  const filename = path.join(directory, 'sessions.json');
  fs.mkdirSync(directory, { recursive: true });
  let state = { version, sessions: [] };
  if (fs.existsSync(filename)) {
    const stored = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (stored.version === version && Array.isArray(stored.sessions)) state = stored;
  }
  const persist = () => {
    state.sessions = state.sessions.filter(s => s.expiresAt > Date.now());
    fs.writeFileSync(`${filename}.tmp`, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(`${filename}.tmp`, filename);
  };
  persist();
  const token = req => {
    const entry = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`));
    return entry ? entry.slice(cookieName.length + 1) : '';
  };
  const session = req => {
    const value = token(req);
    if (!/^[a-f0-9]{64}$/.test(value)) return null;
    return state.sessions.find(s => s.hash === digest(value) && s.expiresAt > Date.now()) || null;
  };
  const cookie = (res, value, seconds) => res.setHeader('Set-Cookie',
    `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax${insecure ? '' : '; Secure'}${seconds === undefined ? '' : `; Max-Age=${seconds}`}`);
  const fail = (res, code, error) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error }));
  };
  const attempts = new Map();
  let globalAttempts = { count: 0, until: 0 };
  return {
    days,
    authenticated: req => Boolean(session(req)),
    // Origin is configured explicitly. Forwarded headers never authorize a request.
    guard(req, res) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://www.google.com");
      if (!insecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const allowedOrigin = origin || `http://${req.headers.host}`;
        if ((req.headers.origin && req.headers.origin !== allowedOrigin) ||
            ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) {
          fail(res, 403, 'Anfrage von einer fremden Seite blockiert.');
          return false;
        }
        // Reject HTML form submissions, including requests without Origin.
        const content = String(req.headers['content-type'] || '').split(';')[0];
        if (req.headers['transfer-encoding'] || Number(req.headers['content-length']) > 0) {
          if (!['application/json', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream'].includes(content)) {
            fail(res, 415, 'Nicht unterstützter Inhaltstyp.');
            return false;
          }
        }
      }
      return true;
    },
    login(req, res, body) {
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      // Deliberately use the socket peer: spoofed X-Forwarded-For must not reset limits.
      const key = req.socket.remoteAddress || 'unknown';
      const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
      if (globalAttempts.until <= now) globalAttempts = { count: 0, until: now + 15 * 60 * 1000 };
      if (entry.count >= 10 || globalAttempts.count >= 100) {
        res.setHeader('Retry-After', String(Math.ceil(((entry.count >= 10 ? entry.until : globalAttempts.until) - now) / 1000)));
        fail(res, 429, 'Zu viele Versuche. Bitte später erneut versuchen.');
        return false;
      }
      entry.count++;
      globalAttempts.count++;
      attempts.set(key, entry);
      const supplied = typeof body.password === 'string' && body.password.length <= 1024 ? body.password : '';
      const actual = crypto.scryptSync(supplied, salt, 64);
      if (!crypto.timingSafeEqual(actual, expected)) {
        fail(res, 401, 'Passwort stimmt nicht.');
        return false;
      }
      attempts.delete(key);
      const remember = body.remember === true;
      const duration = remember ? days * 86400 : 12 * 3600;
      const value = crypto.randomBytes(32).toString('hex');
      const previous = session(req);
      if (previous) state.sessions = state.sessions.filter(s => s.id !== previous.id);
      state.sessions.push({ id: crypto.randomUUID(), hash: digest(value),
        label: String(body.deviceName || req.headers['user-agent'] || 'Browser').slice(0, 120),
        createdAt: now, expiresAt: now + duration * 1000, remember });
      // Bound the store; oldest sessions are evicted when registering a 101st device.
      state.sessions = state.sessions.slice(-100);
      persist();
      cookie(res, value, remember ? duration : undefined);
      return true;
    },
    logout(req, res) {
      const current = session(req);
      if (current) state.sessions = state.sessions.filter(s => s.id !== current.id);
      persist();
      cookie(res, '', 0);
    },
    list(req) {
      const current = session(req);
      return state.sessions.filter(s => s.expiresAt > Date.now()).map(({ hash, ...s }) => ({ ...s, current: s.id === current?.id }));
    },
    revoke(req, res, id) {
      const current = session(req);
      state.sessions = id === 'others' ? state.sessions.filter(s => s.id === current?.id) : state.sessions.filter(s => s.id !== id);
      persist();
      if (id === current?.id) cookie(res, '', 0);
    }
  };
}

module.exports = { createAuth };
