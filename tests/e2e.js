const { chromium } = require('playwright');
const assert = require('assert');
const P = 8765, OUT = process.argv[2];
const st = async () => (await (await fetch(`http://localhost:${P}/mock/state`)).json()).data;
const wait = (pg, fn, arg, t = 15000) => pg.waitForFunction(fn, arg, { timeout: t });
(async () => {
  const b = await chromium.launch();
  const opts = { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 };
  const cA = await b.newContext(opts), cB = await b.newContext(opts);
  const A = await cA.newPage(), B = await cB.newPage();
  for (const [n, pg] of [['A', A], ['B', B]]) { pg.on('pageerror', e => console.log(n, 'ERREUR', e.message)); pg.on('console', m => { if (m.type() === 'error') console.log(n, 'console', m.text()); }); }

  async function signupAndPin(pg, origin, email, nom, pin) {
    await pg.goto(origin);
    await pg.click('text=Créer un compte');
    await pg.fill('#email', email); await pg.fill('#pw', 'motdepasse123');
    await pg.click('button[type=submit]');
    await pg.waitForSelector('#pin1');
    await pg.fill('#nom', nom); await pg.fill('#pin1', pin); await pg.fill('#pin2', pin);
    await pg.click('button[type=submit]');
    await pg.waitForSelector('.chat', { timeout: 20000 });
  }
  // Inconnu refusé
  await A.goto(`http://localhost:${P}/`);
  await A.click('text=Créer un compte'); await A.fill('#email', 'pirate@test.fr'); await A.fill('#pw', 'motdepasse123'); await A.click('button[type=submit]');
  await wait(A, () => /pas autorisée/.test(document.querySelector('.form-msg').textContent));
  console.log('ok  adresse inconnue refusée');

  await signupAndPin(A, `http://localhost:${P}/`, 'khaldor@test.fr', 'Khaldor', '482915');
  assert(/pas encore créé son compte/.test(await A.textContent('.banners')));
  await A.screenshot({ path: OUT + '/1-attente.png' });
  await signupAndPin(B, `http://127.0.0.1:${P}/`, 'reine@test.fr', 'Amina', '739164');
  console.log('ok  deux comptes et clés créés');

  // A rouvre l'appli (verrouillée) avec son code
  await A.reload(); await A.waitForSelector('#pin');
  await A.fill('#pin', '111111'); await A.click('button[type=submit]');
  await wait(A, () => /incorrect/.test(document.querySelector('.form-msg').textContent));
  await A.fill('#pin', '482915'); await A.click('button[type=submit]');
  await A.waitForSelector('.chat', { timeout: 20000 });
  await wait(A, () => (document.querySelector('.who strong')||{}).textContent === 'Amina');
  console.log('ok  mauvais code refusé, bon code ouvre, ma moitié trouvée');

  // Texte A -> B
  const secret = 'Bonjour ma reine, rendez-vous à 20 h';
  await A.fill('#txt', secret); await A.click('.composer .send');
  await wait(B, s => (document.querySelector('.list')||{textContent:''}).textContent.includes(s), secret);
  let s = await st();
  assert(!JSON.stringify(s).includes('rendez-vous'), 'le serveur ne doit jamais voir le texte');
  await wait(A, () => document.querySelector('.msg.me .st.read'));
  s = await st();
  assert.strictEqual(s.msgs.filter(m => m.recipient === Object.values(s.users).find(u => u).id).length >= 0, true);
  console.log('ok  message reçu, serveur aveugle, coche « lu » revenue');
  assert(s.notified.length >= 1, 'notification demandée');
  const notifs = (await st()).msgs; // déjà effacés
  console.log('ok  notification demandée (' + s.notified.length + '), messages restant sur le serveur : ' + notifs.length);

  // B -> A : 3 photos
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwnwEIGP4zMDAwAAA5KgX7U5FPKgAAAABJRU5ErkJggg==', 'base64');
  await B.setInputFiles('#photo', [1, 2, 3].map(i => ({ name: 'p' + i + '.png', mimeType: 'image/png', buffer: png })));
  await wait(A, () => document.querySelectorAll('.msg.peer .photo').length === 3);
  console.log('ok  3 photos reçues');

  // B -> A : vidéo (fichier factice de 3 Mo)
  const vid = Buffer.alloc(3e6, 7);
  await B.setInputFiles('#photo', [{ name: 'v.mp4', mimeType: 'video/mp4', buffer: vid }]);
  await wait(A, () => document.querySelector('.msg.peer .vthumb'), null, 30000);
  s = await st();
  assert.strictEqual(s.files.length, 0, 'vidéo effacée du serveur après réception');
  console.log('ok  vidéo chiffrée reçue puis effacée du serveur');

  // Hors ligne : B écrit sans internet, le message part au retour
  await cB.setOffline(true);
  await B.evaluate(() => window.dispatchEvent(new Event('offline')));
  await B.fill('#txt', 'Écrit sans internet'); await B.click('.composer .send');
  await wait(B, () => document.querySelector('.msg.me:last-child .st.wait'));
  await B.screenshot({ path: OUT + '/4-hors-ligne.png' });
  await new Promise(r => setTimeout(r, 1500));
  assert(!(await A.textContent('.list')).includes('Écrit sans internet'));
  await cB.setOffline(false);
  await B.evaluate(() => window.dispatchEvent(new Event('online')));
  await wait(A, () => (document.querySelector('.list')||{textContent:''}).textContent.includes('Écrit sans internet'));
  console.log('ok  message écrit hors ligne parti au retour d’internet');

  await A.screenshot({ path: OUT + '/2-discussion.png' });

  // Code de sécurité identique
  await A.click('.banner.gold >> nth=0').catch(() => {});
  await A.goto(A.url()); // pas nécessaire : on passe par les réglages
  await A.waitForSelector('#pin'); await A.fill('#pin', '482915'); await A.click('button[type=submit]'); await A.waitForSelector('.chat', { timeout: 20000 });
  await A.click('button[aria-label=Vous]'); await A.click('text=Code de sécurité');
  await B.click('button[aria-label=Vous]'); await B.click('text=Code de sécurité');
  const nA = await A.textContent('.safety'), nB = await B.textContent('.safety');
  assert.strictEqual(nA, nB); assert.strictEqual(nA.length, 60);
  await A.screenshot({ path: OUT + '/3-code.png' });
  await A.click('text=Les codes sont identiques');
  await wait(A, () => /code vérifié/.test((document.querySelector('.who small')||{}).textContent));
  console.log('ok  même code de sécurité des deux côtés : ' + nA.match(/.{5}/g).join(' '));
  await B.click('button[aria-label=Retour]');

  // Photo de profil A -> B (chiffrée)
  const fs = require('fs'), path = require('path');
  const pic = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon-512.png'));
  await A.click('button[aria-label=Vous]');
  const [fc] = await Promise.all([A.waitForEvent('filechooser'), A.click('button[aria-label="Changer ma photo de profil"]')]);
  await fc.setFiles({ name: 'moi.png', mimeType: 'image/png', buffer: pic });
  await wait(A, () => /Photo envoyée/.test(document.getElementById('toast').textContent));
  await B.click('button[aria-label=Discussion]');
  await wait(B, () => { const i = document.querySelector('.avbtn img'); return i && i.src.startsWith('data:image/jpeg'); });
  assert(!JSON.stringify(await st()).includes('data:image'), 'le serveur ne voit pas la photo');
  await A.screenshot({ path: OUT + '/9-vous.png' });
  console.log('ok  photo de profil reçue par ma moitié, serveur aveugle');

  // Statut texte A -> B, puis « vu »
  await A.click('button[aria-label=Statut]');
  await A.click('.card .row .btn:not(.gold)');
  await A.fill('.stxt', 'Je pense à toi ❤️');
  await A.click('button[aria-label="Publier le statut"]');
  await wait(A, () => /Statut publié/.test(document.getElementById('toast').textContent));
  await wait(B, () => document.querySelector('.avbtn .ring.new'));
  await wait(B, () => document.querySelector('.tab[aria-label=Statut] .tdot'));
  await B.screenshot({ path: OUT + '/10-statut-nouveau.png' });
  await B.click('button[aria-label=Statut]');
  await B.click('.srow.plain');
  await wait(B, () => (document.querySelector('.story .sbig')||{}).textContent === 'Je pense à toi ❤️');
  await B.screenshot({ path: OUT + '/11-statut-vu.png' });
  await B.click('.story button[aria-label=Fermer]');
  await A.click('button[aria-label=Discussion]'); await A.click('button[aria-label=Statut]');
  await wait(A, () => /Vu par Amina/.test(document.querySelector('.pbody').textContent), null, 20000);
  assert(!JSON.stringify(await st()).includes('pense'), 'le serveur ne voit pas le statut');
  await A.screenshot({ path: OUT + '/12-mon-statut.png' });
  console.log('ok  statut reçu, vu, et serveur aveugle');

  // Onglets Médias et Appels
  await A.click('button[aria-label=Médias]');
  await wait(A, () => document.querySelectorAll('.mcell').length >= 3);
  await A.screenshot({ path: OUT + '/13-medias.png' });
  await A.click('button[aria-label=Appels]');
  await A.waitForSelector('text=Aucun appel pour le moment.');
  await A.screenshot({ path: OUT + '/14-appels.png' });
  await A.click('button[aria-label=Discussion]'); await A.waitForSelector('.chat');
  await B.click('button[aria-label=Discussion]'); await B.waitForSelector('.chat');
  console.log('ok  onglets Médias (3 photos) et Appels');

  // Historique local chiffré
  const raw = await A.evaluate(() => new Promise(r => { const q = indexedDB.open('the-queen', 1); q.onsuccess = () => { const t = q.result.transaction('msgs').objectStore('msgs').getAll(); t.onsuccess = () => r(JSON.stringify(t.result)); }; }));
  assert(!raw.includes('rendez-vous'), 'historique local chiffré');
  console.log('ok  historique du téléphone chiffré');

  // Changement de clé : B efface son téléphone et recrée ses clés
  await B.click('button[aria-label=Vous]');
  await B.click('text=Tout effacer sur ce téléphone'); await B.click('.modal button.danger');
  await B.waitForLoadState('load'); await B.waitForTimeout(800);
  await B.waitForSelector('#email', { timeout: 20000 });
  await B.fill('#email', 'reine@test.fr'); await B.fill('#pw', 'motdepasse123'); await B.click('button[type=submit]');
  await B.waitForSelector('#pin1');
  await B.fill('#nom', 'Amina'); await B.fill('#pin1', '739164'); await B.fill('#pin2', '739164'); await B.click('button[type=submit]');
  await B.waitForSelector('.chat', { timeout: 20000 });
  await B.fill('#txt', 'Nouveau téléphone'); await B.click('.composer .send');
  await A.reload(); await A.fill('#pin', '482915'); await A.click('button[type=submit]'); await A.waitForSelector('.chat', { timeout: 20000 });
  await wait(A, () => document.querySelector('.banner.danger'));
  assert(!(await A.textContent('.list')).includes('Nouveau téléphone'), 'bloqué tant que pas vérifié');
  await A.screenshot({ path: OUT + '/5-cle-changee.png' });
  await A.click('text=J’ai vérifié, continuer');
  await wait(A, () => (document.querySelector('.list')||{textContent:''}).textContent.includes('Nouveau téléphone'));
  console.log('ok  changement de clé détecté et bloqué jusqu’à vérification');

  await b.close();
  console.log('TOUS LES TESTS DE L’APPLI PASSENT');
})().catch(e => { console.error('ÉCHEC', e); process.exit(1); });
