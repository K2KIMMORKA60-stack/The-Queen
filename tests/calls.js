const { chromium } = require('playwright');
const assert = require('assert');
const P = 8766, OUT = process.argv[2];
const wait = (pg, fn, arg, t = 20000) => pg.waitForFunction(fn, arg, { timeout: t });
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const opts = { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, permissions: ['camera', 'microphone'] };
  const cA = await b.newContext(opts), cB = await b.newContext(opts);
  const A = await cA.newPage(), B = await cB.newPage();
  for (const [n, pg] of [['A', A], ['B', B]]) pg.on('pageerror', e => console.log(n, 'ERREUR', e.message));
  async function setup(pg, origin, email, nom, pin) {
    await pg.goto(origin); await pg.click('text=Créer un compte');
    await pg.fill('#email', email); await pg.fill('#pw', 'motdepasse123'); await pg.click('button[type=submit]');
    await pg.waitForSelector('#pin1'); await pg.fill('#nom', nom); await pg.fill('#pin1', pin); await pg.fill('#pin2', pin);
    await pg.click('button[type=submit]'); await pg.waitForSelector('.chat', { timeout: 20000 });
  }
  await setup(A, `http://localhost:${P}/`, 'khaldor@test.fr', 'Khaldor', '482915');
  await setup(B, `http://127.0.0.1:${P}/`, 'reine@test.fr', 'Amina', '739164');
  await A.reload(); await A.fill('#pin', '482915'); await A.click('button[type=submit]'); await A.waitForSelector('button[aria-label="Appel vidéo"]', { timeout: 20000 });

  // Appel vidéo A -> B
  await A.click('button[aria-label="Appel vidéo"]');
  await B.waitForSelector('button[aria-label="Décrocher"]', { timeout: 20000 });
  await B.screenshot({ path: OUT + '/6-appel-entrant.png' });
  console.log('ok  B voit l’appel vidéo entrant');
  await B.click('button[aria-label="Décrocher"]');
  await wait(A, () => QueenApp.call.start > 0);
  await wait(B, () => QueenApp.call.start > 0);
  await wait(B, () => { const v = document.querySelector('.cremote'); return v && v.videoWidth > 0; });
  await wait(A, () => { const v = document.querySelector('.cremote'); return v && v.videoWidth > 0; });
  const enc = await A.evaluate(async () => { const st = await QueenApp.call.pc.getStats(); let dtls = false; st.forEach(r => { if (r.type === 'transport' && r.dtlsState === 'connected') dtls = true; }); return dtls; });
  assert(enc, 'transport DTLS chiffré');
  console.log('ok  appel connecté, image reçue des deux côtés, transport chiffré (DTLS)');
  await new Promise(r => setTimeout(r, 2500));
  await A.screenshot({ path: OUT + '/7-appel-video.png' });
  await A.click('button[aria-label="Raccrocher"]');
  await wait(B, () => !document.querySelector('.call'));
  await wait(B, () => /Appel vidéo · /.test(document.querySelector('.list').textContent));
  await wait(A, () => /Appel vidéo · /.test(document.querySelector('.list').textContent));
  console.log('ok  raccroché, durée notée des deux côtés');

  // Appel vocal B -> A refusé
  await B.click('button[aria-label="Appel vocal"]');
  await A.waitForSelector('button[aria-label="Refuser"]', { timeout: 20000 });
  await A.click('button[aria-label="Refuser"]');
  await wait(B, () => !document.querySelector('.call'));
  await wait(A, () => /Appel vocal refusé/.test(document.querySelector('.list').textContent));
  console.log('ok  appel vocal refusé, l’appelant est prévenu');

  // Appel vocal A -> B, accepté
  await A.click('button[aria-label="Appel vocal"]');
  await B.waitForSelector('button[aria-label="Décrocher"]', { timeout: 20000 });
  await B.click('button[aria-label="Décrocher"]');
  await wait(A, () => QueenApp.call.start > 0);
  await A.screenshot({ path: OUT + '/8-appel-vocal.png' });
  await B.click('button[aria-label="Raccrocher"]');
  await wait(A, () => !document.querySelector('.call'));
  console.log('ok  appel vocal connecté puis raccroché');
  await b.close();
  console.log('TOUS LES TESTS D’APPEL PASSENT');
})().catch(e => { console.error('ÉCHEC', e); process.exit(1); });
