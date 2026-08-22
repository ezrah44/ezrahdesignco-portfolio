/**
 * Tiny local-only save server for testing the custom CMS admin (admin.js)
 * without needing Netlify Identity / Git Gateway.
 *
 * Not deployed — Netlify only serves static files from this repo, so this
 * script never runs in production. There, admin.js writes straight to
 * GitHub via Netlify's Git Gateway instead (see gitGatewaySave in admin.js).
 *
 * Usage: node admin/local-save-server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8935;

// Only allow writes under these directories, as a safety guard against a
// stray/malicious path ever reaching outside the project.
const ALLOWED_PREFIXES = ['content/', 'assets/uploads/'];

function isAllowed(relPath) {
  const normalized = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) && !normalized.includes('..');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/save') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const { path: relPath, content, encoding } = JSON.parse(body);
      if (!relPath || !isAllowed(relPath)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Path not allowed: ' + relPath }));
        return;
      }
      const fullPath = path.join(ROOT, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8'));
      console.log('Saved', relPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
});

server.listen(PORT, () => {
  console.log('Local CMS save server listening on http://localhost:' + PORT);
});
