// Tests du chiffrement : node crypto.test.js <chemin de crypto.js>
const assert = require('assert');
require(process.argv[2]);
const C = globalThis.QueenCrypto;

(async () => {
  const t0 = Date.now();
  // Deux personnes
  const va = await C.createIdentity(), vb = await C.createIdentity();
  const ka = await C.loadKeys(va), kb = await C.loadKeys(vb);
  const ba = await C.publicBundle(va, ka), bb = await C.publicBundle(vb, kb);
  assert(await C.verifySpk(ba) && await C.verifySpk(bb), 'bundles signés');

  // Message A -> B
  const env = await C.encrypt(ka, bb, { t: 'text', id: 'm1', body: 'Je t\'aime' }, 'A', 'B');
  assert(!JSON.stringify(env).includes('aime'), 'pas de texte en clair');
  const r = await C.decrypt(kb, ba.sign_pub, env, 'B');
  assert.strictEqual(r.payload.body, 'Je t\'aime');
  assert.strictEqual(r.payload._p, undefined);
  console.log('ok  A -> B déchiffré');

  // Taille cachée : textes courts et moyens = même taille chiffrée
  const e1 = await C.encrypt(ka, bb, { t: 'text', id: 'x', body: 'oui' }, 'A', 'B');
  const e2 = await C.encrypt(ka, bb, { t: 'text', id: 'x', body: 'a'.repeat(300) }, 'A', 'B');
  assert.strictEqual(e1.ct.length, e2.ct.length);
  console.log('ok  longueur masquée');

  // Falsifications
  const bad = Object.assign({}, env, { ct: env.ct.slice(0, -4) + (env.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA') });
  await assert.rejects(C.decrypt(kb, ba.sign_pub, bad, 'B'), e => e.code === 'SIG');
  const h2 = JSON.parse(env.h); h2.to = 'C';
  await assert.rejects(C.decrypt(kb, ba.sign_pub, Object.assign({}, env, { h: JSON.stringify(h2) }), 'B'), e => e.code === 'SIG');
  await assert.rejects(C.decrypt(kb, bb.sign_pub, env, 'B'), e => e.code === 'SIG'); // mauvais expéditeur
  await assert.rejects(C.decrypt(ka, ba.sign_pub, env, 'A'), e => e.code === 'DEST');
  console.log('ok  falsifications refusées');

  // Un pirate qui remplace la clé de B sur le serveur : la signature ne colle pas
  const vm = await C.createIdentity(), km = await C.loadKeys(vm), bm = await C.publicBundle(vm, km);
  const fake = Object.assign({}, bb, { spk_pub: bm.spk_pub });
  assert(!(await C.verifySpk(fake)), 'prékey remplacée détectée');
  await assert.rejects(C.encrypt(ka, fake, { t: 'text' }, 'A', 'B'), e => e.code === 'BUNDLE');
  console.log('ok  clé remplacée détectée');

  // Coffre et code secret
  const { blob } = await C.sealVault(va, '482915', 1000);
  await assert.rejects(C.openVault(blob, '000000'), e => e.code === 'PIN');
  const op = await C.openVault(blob, '482915');
  assert.strictEqual(op.vault.sign.pub, va.sign.pub);
  const blob2 = await C.resealVault(op.vault, op.pinKey, blob);
  assert.strictEqual((await C.openVault(blob2, '482915')).vault.db, va.db);
  console.log('ok  coffre : bon code ouvre, mauvais code refusé');

  // Rotation : un message envoyé avec l'ancienne prékey reste lisible, puis expire après 30 jours
  const old = await C.encrypt(ka, bb, { t: 'text', id: 'o', body: 'ancien' }, 'A', 'B');
  const now = Date.now();
  assert(await C.rotateIfNeeded(vb, now + 8 * 864e5));
  assert.strictEqual(vb.spks.length, 2);
  let kb2 = await C.loadKeys(vb);
  assert.strictEqual((await C.decrypt(kb2, ba.sign_pub, old, 'B')).payload.body, 'ancien');
  const bb2 = await C.publicBundle(vb, kb2);
  assert.notStrictEqual(bb2.spk_id, bb.spk_id);
  const nw = await C.encrypt(ka, bb2, { t: 'text', id: 'n', body: 'nouveau' }, 'A', 'B');
  assert.strictEqual((await C.decrypt(kb2, ba.sign_pub, nw, 'B')).payload.body, 'nouveau');
  assert(await C.rotateIfNeeded(vb, now + 40 * 864e5));
  kb2 = await C.loadKeys(vb);
  await assert.rejects(C.decrypt(kb2, ba.sign_pub, old, 'B'), e => e.code === 'SPK');
  console.log('ok  prékeys tournantes (anciens messages illisibles après 30 jours)');

  // Code de sécurité identique des deux côtés, différent si la clé change
  const sA = await C.safetyNumber({ uid: 'A', pub: va.sign.pub }, { uid: 'B', pub: vb.sign.pub });
  const sB = await C.safetyNumber({ uid: 'B', pub: vb.sign.pub }, { uid: 'A', pub: va.sign.pub });
  assert.strictEqual(sA, sB); assert.strictEqual(sA.length, 60); assert(/^\d+$/.test(sA));
  const sM = await C.safetyNumber({ uid: 'A', pub: va.sign.pub }, { uid: 'B', pub: vm.sign.pub });
  assert.notStrictEqual(sA, sM);
  console.log('ok  code de sécurité : ' + sA.match(/.{5}/g).join(' '));

  // Stockage local
  const box = await C.localSeal(ka.db, { body: 'secret' });
  assert.strictEqual((await C.localOpen(ka.db, box)).body, 'secret');
  await assert.rejects(C.localOpen(kb.db, box));
  console.log('ok  historique local chiffré');

  // Gros message (vocal de 2 Mo)
  const big = 'data:audio/mp4;base64,' + 'A'.repeat(2e6);
  const bb3 = await C.publicBundle(vb, kb2);
  const eb = await C.encrypt(ka, bb3, { t: 'audio', id: 'v', body: { data: big } }, 'A', 'B');
  assert.strictEqual((await C.decrypt(kb2, ba.sign_pub, eb, 'B')).payload.body.data.length, big.length);
  console.log('ok  vocal de 2 Mo');
  const na = await C.notifKey(ka, bb), nb = await C.notifKey(kb, ba);
  const hint = await C.notifSeal(na, { k: 'photo' });
  assert.strictEqual((await C.notifOpen(nb, hint)).k, 'photo');
  assert.strictEqual(hint.length, (await C.notifSeal(na, { k: 'message' })).length, 'taille fixe');
  await assert.rejects(C.notifOpen(await C.notifKey(km, ba), hint));
  const fakeNk = Object.assign({}, bb, { nk_pub: bm.nk_pub });
  assert(!(await C.verifySpk(fakeNk)), 'clé de notification remplacée détectée');
  console.log('ok  aperçu de notification chiffré');
  const vid = new Uint8Array(20e6); for (let i = 0; i < vid.length; i += 4096) vid[i] = i % 251;
  const sf = await C.sealFile(vid);
  const back = new Uint8Array(await C.openFile(sf, sf.ct));
  assert.strictEqual(back.length, vid.length); assert.strictEqual(back[4096 * 7], vid[4096 * 7]);
  const broken = new Uint8Array(sf.ct.slice(0)); broken[10] ^= 1;
  await assert.rejects(C.openFile(sf, broken.buffer));
  const lb = await C.localSealBytes(ka.db, vid);
  assert.strictEqual(new Uint8Array(await C.localOpenBytes(ka.db, lb)).length, vid.length);
  console.log('ok  vidéo de 20 Mo chiffrée / déchiffrée');
  console.log('Tous les tests passent (' + (Date.now() - t0) + ' ms)');
})().catch(e => { console.error('ÉCHEC', e); process.exit(1); });
