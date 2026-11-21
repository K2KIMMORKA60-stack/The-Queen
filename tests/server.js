const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const APP = process.argv[2], PORT = +process.argv[3];
const S = { allowed: ['khaldor@test.fr', 'reine@test.fr'], users: {}, keys: {}, msgs: [], files: {}, notified: [], log: [] };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const json = (res, data, error) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(error ? { error } : { data })); };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/mock/')) {
    const op = u.pathname.slice(6);
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const raw = Buffer.concat(chunks);
      if (op === 'upload') { S.files[u.searchParams.get('path')] = raw; S.log.push('upload ' + raw.length); return json(res, true); }
      if (op === 'download') { const f = S.files[u.searchParams.get('path')]; if (!f) { res.writeHead(404); return res.end(); } res.writeHead(200); return res.end(f); }
      if (op === 'state') return json(res, { users: S.users, msgs: S.msgs, files: Object.keys(S.files), notified: S.notified, keys: S.keys });
      const b = raw.length ? JSON.parse(raw) : {};
      switch (op) {
        case 'signup': {
          if (!S.allowed.includes(b.email)) return json(res, null, 'Database error saving new user');
          const id = crypto.randomUUID(); S.users[b.email] = { id, pw: b.password };
          return json(res, { user: { id, email: b.email } });
        }
        case 'signin': { const x = S.users[b.email]; if (!x || x.pw !== b.password) return json(res, null, 'Invalid login credentials'); return json(res, { user: { id: x.id, email: b.email } }); }
        case 'member': return json(res, S.allowed.includes(b.email));
        case 'publish': S.keys[b.user_id] = b; return json(res, true);
        case 'peer': return json(res, Object.values(S.keys).find(k => k.user_id !== b.me) || null);
        case 'send': { if (!S.keys[b.to]) return json(res, null, 'rls'); const id = crypto.randomUUID(); S.msgs.push({ id, sender: b.from, recipient: b.to, env: b.env, notif: b.notif, created_at: Date.now() }); return json(res, id); }
        case 'notify': S.notified.push(b.id); return json(res, true);
        case 'inbox': return json(res, S.msgs.filter(m => m.recipient === b.me).map(m => ({ id: m.id, env: m.env })));
        case 'remove': S.msgs = S.msgs.filter(m => m.id !== b.id); return json(res, true);
        case 'rmfile': delete S.files[b.path]; return json(res, true);
      }
      json(res, null, 'op');
    });
    return;
  }
  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  let file = path.join(APP, p);
  if (p === '/api.js') file = path.join(__dirname, 'mock-api.js');
  if (p === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('self.QUEEN_CONFIG={supabaseUrl:"https://test.supabase.co",supabaseAnonKey:"test",vapidPublicKey:""};'); }
  fs.readFile(file, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT, () => console.log('listening ' + PORT));
