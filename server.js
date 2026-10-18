import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loadKey, sessionConfig } from './lib/session.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/core.js', ['core.js', 'text/javascript']],
]);
const publicDir = new URL('./public/', import.meta.url);
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'microphone=(self), camera=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { ...headers, 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

export function createApp({ env = process.env, fetchImpl = fetch, keyLoader = () => loadKey(env) } = {}) {
  let attempts = [];
  let hourlyAttempts = [];
  const production = env.NODE_ENV === 'production';
  const publicOrigin = env.PUBLIC_ORIGIN || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '');
  const configuredOrigin = publicOrigin ? new URL(publicOrigin) : null;
  const accessPassword = env.APP_ACCESS_PASSWORD;
  const hash = value => createHash('sha256').update(value).digest();
  return http.createServer(async (req, res) => {
    try {
      // Railway readiness probes use an internal Host header, without user credentials.
      if (req.method === 'GET' && req.url === '/healthz') {
        let ready = !production || Boolean(accessPassword && configuredOrigin?.protocol === 'https:');
        try { await keyLoader(); } catch { ready = false; }
        return send(res, ready ? 200 : 503, { ready });
      }
      const host = req.headers.host || '';
      const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
      if (production && (!accessPassword || configuredOrigin?.protocol !== 'https:')) return send(res, 503, { error: 'Dịch vụ chưa cấu hình xong.' });
      if (production ? host !== configuredOrigin.host : !localHost) return send(res, 403, { error: 'Tên miền truy cập không hợp lệ.' });
      if (accessPassword) {
        const authorization = req.headers.authorization || '';
        const credentials = authorization.startsWith('Basic ') ? Buffer.from(authorization.slice(6), 'base64').toString('utf8') : '';
        if (!timingSafeEqual(hash(credentials), hash(`songngu:${accessPassword}`))) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Song Ngu", charset="UTF-8"');
          return send(res, 401, { error: 'Nhập tài khoản và mật khẩu truy cập website.' });
        }
      }
      const path = new URL(req.url, `http://${host}`).pathname;
      if (req.method === 'GET' && path === '/api/health') {
        let configured = false;
        try { await keyLoader(); configured = true; } catch { /* No secret in errors. */ }
        return send(res, 200, { configured, model: sessionConfig(env).model });
      }
      if (req.method === 'POST' && path === '/api/session') {
        if (req.headers.origin !== (production ? configuredOrigin.origin : `http://${host}`) || req.headers['x-translation-client'] !== '1') {
          return send(res, 403, { error: 'Yêu cầu không hợp lệ.' });
        }
        if (!req.headers['content-type']?.startsWith('application/sdp')) return send(res, 415, { error: 'Định dạng kết nối không hợp lệ.' });
        const now = Date.now();
        attempts = attempts.filter(t => now - t < 60000);
        hourlyAttempts = hourlyAttempts.filter(t => now - t < 3600000);
        if (hourlyAttempts.length >= 60) return send(res, 429, { error: 'Đã đạt giới hạn 60 phiên mỗi giờ. Vui lòng thử lại sau.' });
        if (attempts.length >= 6) return send(res, 429, { error: 'Bạn đã kết nối nhiều lần. Hãy thử lại sau một phút.' });
        attempts.push(now);
        hourlyAttempts.push(now);
        let key;
        try { key = await keyLoader(); } catch { return send(res, 503, { error: 'Chưa đọc được API key. Kiểm tra cấu hình máy chủ.' }); }
        let body = '';
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 65536) return send(res, 413, { error: 'Yêu cầu quá lớn.' });
        }
        if (!body.startsWith('v=0') || !body.includes('m=audio')) return send(res, 400, { error: 'Kết nối âm thanh không hợp lệ.' });
        const form = new FormData();
        form.set('sdp', body); form.set('session', JSON.stringify(sessionConfig(env)));
        const upstream = await fetchImpl('https://api.openai.com/v1/realtime/calls', {
          method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(20000),
        });
        if (!upstream.ok) {
          const messages = { 401: 'API key không hợp lệ hoặc đã hết hạn.', 403: 'API key chưa được cấp quyền dùng Realtime.', 429: 'Hạn mức API đã hết hoặc đang bị giới hạn. Kiểm tra thanh toán và thử lại.' };
          // Never forward provider error bodies: they may include request details.
          return send(res, 502, { error: messages[upstream.status] || 'Không tạo được phiên dịch. Kiểm tra quyền truy cập model và kết nối mạng.', upstreamStatus: upstream.status });
        }
        return send(res, 200, await upstream.text(), 'application/sdp');
      }
      if (req.method === 'GET' && assets.has(path)) {
        const [file, type] = assets.get(path);
        return send(res, 200, await readFile(new URL(file, publicDir)), type);
      }
      return send(res, 404, { error: 'Không tìm thấy.' });
    } catch {
      if (!res.headersSent) send(res, 502, { error: 'Kết nối bị gián đoạn hoặc hết thời gian chờ. Hãy thử lại.' });
      else res.end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
  const server = createApp().listen(port, host, () => console.log(`Song Ngữ đang chạy trên cổng ${port}`));
  process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000).unref(); });
}
