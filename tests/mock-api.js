// Faux serveur pour les tests (remplace api.js).
(function (g) {
  const post = async (p, body) => {
    const r = await fetch('/mock/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json(); if (j.error) throw new Error(j.error); return j.data;
  };
  let cbs = [];
  const sess = () => { try { return JSON.parse(localStorage.getItem('mock-session')); } catch (e) { return null; } };
  g.QueenAPI = {
    init() {},
    async session() { return sess(); },
    onAuth(cb) { cbs.push(cb); },
    async signUp(email, password) { const s = await post('signup', { email, password }); localStorage.setItem('mock-session', JSON.stringify(s)); return { session: s }; },
    async signIn(email, password) { const s = await post('signin', { email, password }); localStorage.setItem('mock-session', JSON.stringify(s)); return s; },
    async signOut() { localStorage.removeItem('mock-session'); },
    async resetPw() {}, async updatePw() {},
    async isMember() { return post('member', { email: sess().user.email }); },
    async publishKeys(row) { return post('publish', row); },
    async peerKeys(me) { return post('peer', { me }); },
    async send(from, to, env, notif) { return post('send', { from, to, env, notif }); },
    async notify(id) { return post('notify', { id }); },
    async turn() { return { iceServers: [] }; },
    async savePush() {}, async removePush() {},
    async upload(path, bytes) { const r = await fetch('/mock/upload?path=' + encodeURIComponent(path), { method: 'POST', body: bytes }); const j = await r.json(); if (j.error) throw new Error(j.error); },
    async download(path) { const r = await fetch('/mock/download?path=' + encodeURIComponent(path)); if (!r.ok) throw new Error('404'); return r.arrayBuffer(); },
    async removeFile(path) { return post('rmfile', { path }); },
    async inbox(me) { return post('inbox', { me }); },
    async remove(id) { return post('remove', { id }); },
    presence(room, onMsg) {
      const me = Math.random().toString(36).slice(2); let since = 0, live = true;
      const tick = async () => { if (!live) return; try { const r = await post('presget', { room, me, since }); for (const x of r) { since = Math.max(since, x.n); onMsg(x.d); } } catch (e) {} if (live) setTimeout(tick, 300); };
      post('presget', { room, me, since: -1 }).then(n => { since = n; tick(); }).catch(() => tick());
      return { send(d) { post('pres', { room, me, d }).catch(() => {}); }, close() { live = false; } };
    },
    subscribe(me, cb) { const t = setInterval(() => cb({}), 800); return () => clearInterval(t); }
  };
})(self);
