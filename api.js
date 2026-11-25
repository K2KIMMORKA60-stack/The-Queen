// Liaison avec le serveur Supabase. Le serveur ne reçoit que des messages déjà chiffrés.
(function (g) {
  'use strict';
  let sb = null;
  const here = () => location.origin + location.pathname;
  const chk = r => { if (r.error) throw r.error; return r.data; };
  g.QueenAPI = {
    init(cfg) {
      sb = g.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    },
    async session() { return chk(await sb.auth.getSession()).session; },
    onAuth(cb) { sb.auth.onAuthStateChange((ev, s) => cb(ev, s)); },
    async signUp(email, password) { return chk(await sb.auth.signUp({ email, password, options: { emailRedirectTo: here() } })); },
    async signIn(email, password) { return chk(await sb.auth.signInWithPassword({ email, password })).session; },
    async signOut() { await sb.auth.signOut(); },
    async resetPw(email) { chk(await sb.auth.resetPasswordForEmail(email, { redirectTo: here() })); },
    async updatePw(password) { chk(await sb.auth.updateUser({ password })); },
    async isMember() { return !!chk(await sb.rpc('est_membre')); },
    async publishKeys(row) { chk(await sb.from('cles').upsert(row)); },
    async peerKeys(myId) {
      const d = chk(await sb.from('cles').select('user_id,nom,sign_pub,spk_pub,spk_id,spk_sig,nk_pub,nk_sig,updated_at').neq('user_id', myId).limit(1));
      return d[0] || null;
    },
    async send(from, to, env, notif) {
      const row = { sender: from, recipient: to, env };
      if (notif) row.notif = notif;
      return chk(await sb.from('messages').insert(row).select('id').single()).id;
    },
    // Demande au serveur de réveiller le téléphone de ta moitié (le contenu reste chiffré).
    async notify(id) { try { await sb.functions.invoke('notifier', { body: { id } }); } catch (e) {} },
    async turn() { const r = await sb.functions.invoke('turn', { body: {} }); if (r.error) throw r.error; return r.data; },
    async savePush(sub) {
      const j = sub.toJSON();
      chk(await sb.from('push_abonnements').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }));
    },
    async removePush(endpoint) { chk(await sb.from('push_abonnements').delete().eq('endpoint', endpoint)); },
    async upload(path, bytes) { chk(await sb.storage.from('coffre').upload(path, new Blob([bytes], { type: 'application/octet-stream' }), { upsert: false, contentType: 'application/octet-stream' })); },
    async download(path) { return (chk(await sb.storage.from('coffre').download(path))).arrayBuffer(); },
    async removeFile(path) { chk(await sb.storage.from('coffre').remove([path])); },
    async inbox(myId) { return chk(await sb.from('messages').select('id,env,created_at').eq('recipient', myId).order('created_at').limit(200)); },
    async remove(id) { chk(await sb.from('messages').delete().eq('id', id)); },
    // Salon de présence : le serveur ne voit que des signaux chiffrés.
    presence(room, onMsg) {
      const ch = sb.channel('pres-' + room, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'p' }, m => { if (m && m.payload && typeof m.payload.d === 'string') onMsg(m.payload.d); })
        .subscribe();
      return {
        send(d) { try { ch.send({ type: 'broadcast', event: 'p', payload: { d } }); } catch (e) {} },
        close() { try { sb.removeChannel(ch); } catch (e) {} }
      };
    },
    subscribe(myId, onNew) {
      const ch = sb.channel('inbox-' + myId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'recipient=eq.' + myId }, p => onNew(p.new))
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    }
  };
})(self);
