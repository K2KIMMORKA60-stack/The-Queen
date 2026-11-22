// The Queen : chiffrement de bout en bout (Web Crypto du navigateur, aucune bibliothèque externe).
//
// - Chaque téléphone crée ses clés. Les clés privées ne quittent jamais le téléphone.
// - Clé d'identité ECDSA P-256 : signe chaque message (preuve que c'est bien elle / lui).
// - Clé de réception ECDH P-256 (« prékey »), signée, changée tous les 7 jours.
// - Chaque message utilise une clé éphémère neuve : ECDH + HKDF-SHA-256 -> AES-256-GCM.
// - Les clés privées et l'historique local sont chiffrés par le code secret (PBKDF2, 600 000 tours).
(function (g) {
  'use strict';
  const subtle = g.crypto.subtle;
  const te = new TextEncoder(), td = new TextDecoder();
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
  const SIG = { name: 'ECDSA', hash: 'SHA-256' };
  const ITER = 600000;
  const DAY = 86400000;
  const SPK_ROTATE = 7 * DAY, SPK_KEEP = 30 * DAY;

  function b64(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  const rand = n => g.crypto.getRandomValues(new Uint8Array(n));
  const randId = () => Array.from(rand(16), b => b.toString(16).padStart(2, '0')).join('');
  const err = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };

  async function aesEnc(key, bytes, aad) {
    const iv = rand(12);
    const p = { name: 'AES-GCM', iv };
    if (aad) p.additionalData = aad;
    return { iv: b64(iv), ct: b64(await subtle.encrypt(p, key, bytes)) };
  }
  async function aesDec(key, box, aad) {
    const p = { name: 'AES-GCM', iv: unb64(box.iv) };
    if (aad) p.additionalData = aad;
    return new Uint8Array(await subtle.decrypt(p, key, unb64(box.ct)));
  }

  async function genSpk() {
    const kp = await subtle.generateKey(ECDH, true, ['deriveBits']);
    return {
      id: randId().slice(0, 16),
      priv: await subtle.exportKey('jwk', kp.privateKey),
      pub: b64(await subtle.exportKey('raw', kp.publicKey)),
      created: Date.now()
    };
  }

  async function createIdentity() {
    const s = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
    const n = await subtle.generateKey(ECDH, true, ['deriveBits']);
    return {
      v: 1,
      sign: { priv: await subtle.exportKey('jwk', s.privateKey), pub: b64(await subtle.exportKey('raw', s.publicKey)) },
      // clé fixe qui sert seulement à l'aperçu des notifications (type du message, jamais son contenu)
      nk: { priv: await subtle.exportKey('jwk', n.privateKey), pub: b64(await subtle.exportKey('raw', n.publicKey)) },
      spks: [await genSpk()],
      db: b64(rand(32))
    };
  }

  // ---- Coffre protégé par le code secret ----
  async function derivePin(pin, salt, iter) {
    const base = await subtle.importKey('raw', te.encode(String(pin).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const VAULT_AAD = te.encode('queen-vault-v1');
  async function sealVault(vault, pin, iter = ITER) {
    const salt = rand(16);
    const pinKey = await derivePin(pin, salt, iter);
    const box = await aesEnc(pinKey, te.encode(JSON.stringify(vault)), VAULT_AAD);
    return { blob: { v: 1, salt: b64(salt), iter, iv: box.iv, ct: box.ct }, pinKey };
  }
  async function resealVault(vault, pinKey, oldBlob) {
    const box = await aesEnc(pinKey, te.encode(JSON.stringify(vault)), VAULT_AAD);
    return { v: 1, salt: oldBlob.salt, iter: oldBlob.iter, iv: box.iv, ct: box.ct };
  }
  async function openVault(blob, pin) {
    const pinKey = await derivePin(pin, unb64(blob.salt), blob.iter);
    let bytes;
    try { bytes = await aesDec(pinKey, blob, VAULT_AAD); } catch (e) { throw err('PIN', 'Code incorrect'); }
    return { vault: JSON.parse(td.decode(bytes)), pinKey };
  }

  // Clés utilisables en mémoire (non exportables).
  async function loadKeys(vault) {
    const signPriv = await subtle.importKey('jwk', vault.sign.priv, ECDSA, false, ['sign']);
    const spks = new Map();
    for (const s of vault.spks) spks.set(s.id, await subtle.importKey('jwk', s.priv, ECDH, false, ['deriveBits']));
    const db = await subtle.importKey('raw', unb64(vault.db), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const nkPriv = await subtle.importKey('jwk', vault.nk.priv, ECDH, false, ['deriveBits']);
    return { signPriv, signPub: vault.sign.pub, spks, db, nkPriv };
  }

  const currentSpk = vault => vault.spks.reduce((a, b) => (b.created > a.created ? b : a));

  // Ajoute une nouvelle prékey tous les 7 jours, oublie celles de plus de 30 jours.
  async function rotateIfNeeded(vault, now = Date.now()) {
    let changed = false;
    if (now - currentSpk(vault).created > SPK_ROTATE) { vault.spks.push(await genSpk()); changed = true; }
    const cur = currentSpk(vault);
    const kept = vault.spks.filter(s => s === cur || now - s.created < SPK_KEEP);
    if (kept.length !== vault.spks.length) { vault.spks = kept; changed = true; }
    return changed;
  }

  const spkMsg = (id, pub) => te.encode('queen-spk-v1|' + id + '|' + pub);
  const nkMsg = pub => te.encode('queen-nk-v1|' + pub);
  async function publicBundle(vault, keys) {
    const s = currentSpk(vault);
    const sig = b64(await subtle.sign(SIG, keys.signPriv, spkMsg(s.id, s.pub)));
    const nsig = b64(await subtle.sign(SIG, keys.signPriv, nkMsg(vault.nk.pub)));
    return { sign_pub: vault.sign.pub, spk_pub: s.pub, spk_id: s.id, spk_sig: sig, nk_pub: vault.nk.pub, nk_sig: nsig };
  }
  const importSignPub = p => subtle.importKey('raw', unb64(p), ECDSA, false, ['verify']);
  async function verifySpk(bundle) {
    try {
      const k = await importSignPub(bundle.sign_pub);
      return await subtle.verify(SIG, k, unb64(bundle.spk_sig), spkMsg(bundle.spk_id, bundle.spk_pub)) &&
        await subtle.verify(SIG, k, unb64(bundle.nk_sig), nkMsg(bundle.nk_pub));
    } catch (e) { return false; }
  }

  // Clé commune aux deux téléphones, pour l'aperçu des notifications seulement.
  // Elle reste lisible par le service des notifications même quand l'appli est verrouillée.
  async function notifKey(keys, peer) {
    const pub = await subtle.importKey('raw', unb64(peer.nk_pub), ECDH, false, []);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: pub }, keys.nkPriv, 256);
    const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: te.encode('queen-notif-v1') },
      ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const NOTIF_AAD = te.encode('queen-notif-v1');
  async function notifSeal(key, obj) {
    const raw = JSON.stringify(obj);
    const box = await aesEnc(key, te.encode(raw + ' '.repeat(Math.max(0, 48 - raw.length))), NOTIF_AAD);
    return box.iv + '.' + box.ct;
  }
  async function notifOpen(key, str) {
    const [iv, ct] = String(str).split('.');
    return JSON.parse(td.decode(await aesDec(key, { iv, ct }, NOTIF_AAD)).trim());
  }

  // Fichiers (vidéos) : chiffrés avec une clé neuve, envoyée dans le message chiffré.
  async function sealFile(bytes) {
    const raw = rand(32), iv = rand(12);
    const k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode('queen-file-v1') }, k, bytes);
    return { key: b64(raw), iv: b64(iv), ct };
  }
  async function openFile(meta, ct) {
    const k = await subtle.importKey('raw', unb64(meta.key), 'AES-GCM', false, ['decrypt']);
    return subtle.decrypt({ name: 'AES-GCM', iv: unb64(meta.iv), additionalData: te.encode('queen-file-v1') }, k, ct);
  }
  // Stockage local des fichiers, chiffré avec la clé du coffre.
  async function localSealBytes(dbKey, bytes) {
    const iv = rand(12);
    return { iv, ct: await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: LOCAL_AAD }, dbKey, bytes) };
  }
  async function localOpenBytes(dbKey, box) {
    return subtle.decrypt({ name: 'AES-GCM', iv: box.iv, additionalData: LOCAL_AAD }, dbKey, box.ct);
  }

  async function msgKey(shared, ephPub, header) {
    const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: unb64(ephPub), info: te.encode('queen-msg-v1|' + header) },
      ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // Remplissage : la taille chiffrée est arrondie à 512 octets, pour cacher la longueur réelle.
  function padded(payload) {
    const raw = JSON.stringify(payload);
    const target = Math.ceil((raw.length + 16) / 512) * 512;
    return JSON.stringify(Object.assign({}, payload, { _p: 'x'.repeat(Math.max(0, target - raw.length - 8)) }));
  }

  async function encrypt(keys, peer, payload, from, to) {
    if (!(await verifySpk(peer))) throw err('BUNDLE', 'Clé de réception invalide');
    const eph = await subtle.generateKey(ECDH, true, ['deriveBits']);
    const ephPub = b64(await subtle.exportKey('raw', eph.publicKey));
    const spkPub = await subtle.importKey('raw', unb64(peer.spk_pub), ECDH, false, []);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: spkPub }, eph.privateKey, 256);
    const h = JSON.stringify({ v: 1, from, to, eph: ephPub, spk: peer.spk_id, ts: Date.now() });
    const mk = await msgKey(shared, ephPub, h);
    const box = await aesEnc(mk, te.encode(padded(payload)), te.encode(h));
    const sig = b64(await subtle.sign(SIG, keys.signPriv, te.encode(h + '|' + box.iv + '|' + box.ct)));
    return { h, iv: box.iv, ct: box.ct, sig };
  }

  async function decrypt(keys, senderSignPub, env, me) {
    if (!env || typeof env.h !== 'string' || typeof env.sig !== 'string') throw err('FORMAT');
    const vk = await importSignPub(senderSignPub);
    let ok = false;
    try { ok = await subtle.verify(SIG, vk, unb64(env.sig), te.encode(env.h + '|' + env.iv + '|' + env.ct)); } catch (e) { ok = false; }
    if (!ok) throw err('SIG', 'Signature invalide');
    const h = JSON.parse(env.h);
    if (h.v !== 1 || h.to !== me) throw err('DEST');
    const spk = keys.spks.get(h.spk);
    if (!spk) throw err('SPK', 'Clé de réception expirée');
    const ephPub = await subtle.importKey('raw', unb64(h.eph), ECDH, false, []);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: ephPub }, spk, 256);
    const mk = await msgKey(shared, h.eph, env.h);
    let bytes;
    try { bytes = await aesDec(mk, env, te.encode(env.h)); } catch (e) { throw err('DECRYPT'); }
    const payload = JSON.parse(td.decode(bytes));
    delete payload._p;
    return { header: h, payload };
  }

  // Code de sécurité : 60 chiffres, identiques sur les deux téléphones.
  async function fingerprint(pub, uid) {
    const key = unb64(pub);
    let h = new Uint8Array([...te.encode('queen-fp-v1|' + uid + '|'), ...key]);
    for (let i = 0; i < 5200; i++) {
      const buf = new Uint8Array(h.length + key.length);
      buf.set(h); buf.set(key, h.length);
      h = new Uint8Array(await subtle.digest('SHA-512', buf));
    }
    let out = '';
    for (let i = 0; i < 30; i += 5) {
      const n = ((h[i] * 2 ** 32) + (h[i + 1] * 2 ** 24) + (h[i + 2] << 16) + (h[i + 3] << 8) + h[i + 4]) % 100000;
      out += String(n).padStart(5, '0');
    }
    return out;
  }
  async function safetyNumber(a, b) {
    const [x, y] = [a, b].sort((p, q) => (p.uid < q.uid ? -1 : 1));
    return (await fingerprint(x.pub, x.uid)) + (await fingerprint(y.pub, y.uid));
  }

  // Historique local chiffré.
  const LOCAL_AAD = te.encode('queen-local-v1');
  async function localSeal(dbKey, obj) { return aesEnc(dbKey, te.encode(JSON.stringify(obj)), LOCAL_AAD); }
  async function localOpen(dbKey, box) { return JSON.parse(td.decode(await aesDec(dbKey, box, LOCAL_AAD))); }

  g.QueenCrypto = {
    createIdentity, sealVault, resealVault, openVault, loadKeys, rotateIfNeeded, currentSpk,
    publicBundle, verifySpk, encrypt, decrypt, safetyNumber, localSeal, localOpen, randId,
    notifKey, notifSeal, notifOpen, sealFile, openFile, localSealBytes, localOpenBytes,
    _test: { SPK_ROTATE, SPK_KEEP }
  };
})(typeof self !== 'undefined' ? self : globalThis);
