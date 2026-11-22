// The Queen : messagerie privée à deux, chiffrée de bout en bout.
(function () {
  'use strict';
  const C = self.QueenCrypto, S = self.QueenStore, A = self.QueenAPI;
  const VERSION = '1.2.0';
  const root = document.getElementById('app');
  const DAY = 86400000;
  const MAX_ABOUT = 140, MAX_STATUS_TXT = 700, MAX_STATUS_IMG = 1.2e6, MAX_AVATAR = 250000;
  const STATUS_BG = ['#0f3a73', '#1c3d5a', '#2f5d3a', '#5a3d7a', '#7a5a1c', '#111111'];
  const MAX_TEXT = 8000, MAX_AUDIO_S = 180, MAX_MEDIA = 4.5e6, MAX_VIDEO = 50 * 1024 * 1024;
  const KIND = { text: 'message', image: 'photo', audio: 'vocal', video: 'video' };

  // ---------- état ----------
  const st = {
    me: null, blob: null, vault: null, pinKey: null, keys: null, settings: null,
    peer: null, keyChanged: null, msgs: new Map(), els: new Map(),
    unsub: null, timers: [], nkey: null, pulling: false, pullAgain: false, hiddenAt: 0,
    rq: { delivered: new Set(), read: new Set() }, status: { mine: [], peer: [] }, tab: 'chat', rqTimer: 0, rec: null, unlocked: false, flushing: false
  };
  const uid = () => st.me && st.me.id;

  // ---------- outils ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  // Icônes (constantes du code, jamais de texte reçu)
  const ICON = {
    send: '<svg viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="currentColor"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z" fill="currentColor"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 14a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><path d="M17 9V7A5 5 0 0 0 7 7v2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zM9 7a3 3 0 0 1 6 0v2H9zm4 9.7V18h-2v-1.3a2 2 0 1 1 2 0z" fill="currentColor"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15.5 4 7.5 12l8 8 1.4-1.4L10.3 12l6.6-6.6z" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5z" fill="currentColor"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z" fill="currentColor"/></svg>',
    clock: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    tick: '<svg viewBox="0 0 18 12"><path d="m1 6.5 3.6 3.6L11.5 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ticks: '<svg viewBox="0 0 18 12"><path d="m1 6.5 3.6 3.6L11.5 2M8 9.6l.5.5L15.9 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.55)"/><path d="M10 8v8l6-4z" fill="#fff"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1z" fill="currentColor"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="currentColor"/></svg>',
    video: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" fill="currentColor"/></svg>',
    hang: '<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .4-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.4-.02L.3 13.08a1 1 0 0 1 0-1.41C3.4 8.75 7.5 7 12 7s8.6 1.75 11.7 4.67a1 1 0 0 1 0 1.41l-2.48 2.47a1 1 0 0 1-1.4.02 11.3 11.3 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z" fill="currentColor"/></svg>',
    micoff: '<svg viewBox="0 0 24 24"><path d="M19 11a7 7 0 0 1-1.2 3.9l-1.45-1.45A5 5 0 0 0 17 11zM15 11.2 9 5.2V5a3 3 0 0 1 6 0zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.5 2.6l1.5 1.5A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 3.4-1.4L19.7 21 21 19.7z" fill="currentColor"/></svg>',
    flip: '<svg viewBox="0 0 24 24"><path d="M20 5h-3.2L15 3H9L7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-8 13a5 5 0 0 1-4.9-4H5l3-3 3 3H9.1A3 3 0 0 0 15 13h2a5 5 0 0 1-5 5zm4-4-3-3h1.9A3 3 0 0 0 9 12H7a5 5 0 0 1 9.9-1H19z" fill="currentColor"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.4 1.1 4.6 3 6.2L4.2 22l4.4-2.2c1.1.3 2.2.5 3.4.5 5.5 0 10-3.9 10-8.6S17.5 3 12 3z" fill="currentColor"/></svg>',
    status: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4.2 2.6"/><circle cx="12" cy="12" r="4.2" fill="currentColor"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor"/><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor"/><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor"/><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.5" fill="currentColor"/><path d="M3.5 21c.6-4.3 4.1-7 8.5-7s7.9 2.7 8.5 7z" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M5 4h14v3h-2V6h-4v12h2v2H9v-2h2V6H7v1H5z" fill="currentColor"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" fill="currentColor"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z" fill="currentColor"/></svg>',
    timer: '<svg viewBox="0 0 16 16"><path d="M6 1h4M8 5v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="9.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
  };
  const icon = (name, cls) => { const s = h('span', { class: 'ic ' + (cls || ''), 'aria-hidden': 'true' }); s.innerHTML = ICON[name]; return s; };
  const btnIcon = (name, label, onclick, cls) => h('button', { class: 'ibtn ' + (cls || ''), type: 'button', 'aria-label': label, title: label, onclick }, icon(name));

  let toastT = 0;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function screen(...kids) { root.replaceChildren(...kids.filter(k => k != null && k !== false)); }
  function ask(title, text, buttons) {
    return new Promise(res => {
      const close = v => { m.remove(); res(v); };
      const m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'sheet' }, h('h3', { text: title }), text ? h('p', { text }) : null,
          h('div', { class: 'actions' }, buttons.map(b => h('button', { class: 'btn ' + (b.cls || ''), type: 'button', text: b.label, onclick: () => close(b.value) })))));
      m.addEventListener('click', e => { if (e.target === m) close(null); });
      document.body.append(m);
    });
  }
  const fmtTime = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  function fmtDay(ts) {
    const d = new Date(ts), now = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, now)) return "Aujourd'hui";
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (same(d, y)) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  const TTL_LABEL = { 0: 'Désactivés', 86400: '24 heures', 604800: '7 jours', 7776000: '90 jours' };
  const peerName = () => (st.settings && st.settings.peerNick) || (st.peer && st.peer.nom) || (st.settings && st.settings.peerBundle && st.settings.peerBundle.nom) || 'Ma moitié';
  const online = () => navigator.onLine !== false;

  function authError(e) {
    const m = String((e && (e.message || e.error_description)) || e || '');
    if (/Database error saving new user|Inscription refus/i.test(m)) return "Cette adresse n'est pas autorisée dans The Queen.";
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return "Confirme d'abord ton adresse : ouvre le lien reçu par e-mail.";
    if (/already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse. Connecte-toi.';
    if (/Password should be|weak/i.test(m)) return 'Mot de passe trop faible : au moins 8 caractères, mélange lettres et chiffres.';
    if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Pas de connexion internet.';
    return 'Erreur : ' + m;
  }


  // ---------- thème (couleur et fond, sur ce téléphone seulement) ----------
  const THEMES = {
    bleu: ['Bleu', '#3d9bff', '#8cc8ff', '#1e6fe0', '#4aa3ff', '#0f2e57', '#174683'],
    vert: ['Vert', '#25c26e', '#8ee6b4', '#128c4a', '#2fd47d', '#0d3d27', '#145c3a'],
    turquoise: ['Turquoise', '#1fc8c8', '#8ff0ee', '#0f9a9a', '#2ad8d0', '#0b3b3d', '#11595a'],
    violet: ['Violet', '#a070ff', '#cdb4ff', '#6c3bd9', '#9a6bff', '#2b1752', '#3d2273'],
    rose: ['Rose', '#ff5fa2', '#ffb3d4', '#d63384', '#ff6fae', '#4d1430', '#6b1d44'],
    orange: ['Orange', '#ff9a3d', '#ffc98c', '#e0701e', '#ffa24a', '#4a2508', '#6b360c'],
    or: ['Or', '#d9b45a', '#f3d98a', '#b8862f', '#d9b45a', '#3a2d10', '#544118'],
    rouge: ['Rouge', '#ff4d5e', '#ff9aa4', '#e0001b', '#ff4d5e', '#3c0c17', '#52111f'],
    gris: ['Argent', '#a9b4c2', '#dfe6ee', '#5d6b7c', '#8796a8', '#2a3038', '#3a424d']
  };
  const WALLS = {
    noir: ['Noir', 'none'],
    nuit: ['Nuit', 'linear-gradient(180deg, #0a1730 0%, #0b0a0e 75%)'],
    aube: ['Aube', 'linear-gradient(180deg, #1d2b5a 0%, #3a3f6b 45%, #6b6a5a 100%)'],
    aurore: ['Aurore', 'radial-gradient(120% 60% at 50% 100%, #0f5a5a 0%, transparent 60%), linear-gradient(180deg, #06121f, #0a0f1a)'],
    galaxie: ['Galaxie', 'radial-gradient(80% 50% at 20% 20%, #3a1d6b 0%, transparent 60%), radial-gradient(70% 50% at 80% 80%, #10306b 0%, transparent 60%), linear-gradient(#07060c, #07060c)'],
    rosee: ['Rosée', 'linear-gradient(180deg, #3b1a2c 0%, #1a0f17 70%)'],
    foret: ['Forêt', 'linear-gradient(180deg, #0e2a1c 0%, #0a120d 70%)'],
    sable: ['Sable', 'linear-gradient(180deg, #3d2a17 0%, #16100a 75%)'],
    ocean: ['Océan', 'linear-gradient(180deg, #06324a 0%, #041622 70%)']
  };
  function getTheme() {
    let t = {};
    try { t = JSON.parse(localStorage.getItem('queen-theme') || '{}') || {}; } catch (e) {}
    return { c: THEMES[t.c] ? t.c : 'bleu', w: WALLS[t.w] ? t.w : 'noir' };
  }
  function applyTheme(t) {
    t = t || getTheme();
    const v = THEMES[t.c], r = document.documentElement.style;
    [['--gold', 1], ['--gold2', 2], ['--red', 3], ['--red2', 4], ['--me', 5], ['--me2', 6]].forEach(([k, i]) => r.setProperty(k, v[i]));
    r.setProperty('--wall', WALLS[t.w][1]);
  }
  function setTheme(patch) {
    const t = Object.assign(getTheme(), patch);
    try { localStorage.setItem('queen-theme', JSON.stringify(t)); } catch (e) {}
    applyTheme(t);
    return t;
  }
  applyTheme();
  function themeCard() {
    const t = getTheme();
    const card = h('section', { class: 'card' }, h('h3', { text: 'Thème' }),
      h('p', { class: 'hint', text: 'Choisis ta couleur et ton fond d’écran. Seul ce téléphone change.' }),
      h('div', { class: 'swgrid' }, Object.keys(THEMES).map(k => h('button', { class: 'swatch' + (k === t.c ? ' on' : ''), type: 'button', 'aria-label': 'Couleur ' + THEMES[k][0], onclick: () => { setTheme({ c: k }); card.replaceWith(themeCard()); } },
        h('span', { class: 'dot', style: 'background: linear-gradient(160deg, ' + THEMES[k][2] + ', ' + THEMES[k][3] + ')' }), h('span', { text: THEMES[k][0] })))),
      h('label', { text: 'Fond de la discussion' }),
      h('div', { class: 'wgrid' }, Object.keys(WALLS).map(k => h('button', { class: 'wall' + (k === t.w ? ' on' : ''), type: 'button', 'aria-label': 'Fond ' + WALLS[k][0], style: 'background-image: ' + WALLS[k][1], onclick: () => { setTheme({ w: k }); card.replaceWith(themeCard()); } },
        h('i', { class: 'a' }), h('i', { class: 'b' }), h('span', { text: WALLS[k][0] })))));
    return card;
  }

  // ---------- démarrage ----------
  function logoBlock(sub) {
    return h('div', { class: 'brand' },
      h('img', { src: 'icons/logo-512.png', alt: '', class: 'brand-logo', width: '132', height: '132' }),
      h('h1', { class: 'brand-name', text: 'The Queen' }),
      sub ? h('p', { class: 'brand-sub', text: sub }) : null);
  }

  async function boot() {
    const cfg = self.QUEEN_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || /VOTRE/.test(cfg.supabaseUrl)) {
      screen(h('div', { class: 'page center' }, logoBlock('Configuration à terminer'),
        h('p', { class: 'note', text: "Il manque l'adresse du serveur dans config.js. Suis le fichier LISEZ-MOI." })));
      return;
    }
    S.persist();
    A.init(cfg);
    A.onAuth((ev, s) => {
      if (ev === 'PASSWORD_RECOVERY') viewNewPassword();
      if (ev === 'SIGNED_OUT' && st.me) { lock(true); st.me = null; viewAuth('login'); }
    });
    let session = null;
    try { session = await A.session(); } catch (e) {}
    if (!session) {
      // Hors ligne avec un coffre déjà présent : on peut quand même ouvrir.
      const last = await S.get('kv', 'last-user').catch(() => null);
      if (last && !online()) { st.me = last; const blob = await S.get('kv', 'vault:' + last.id); if (blob) return viewUnlock(blob); }
      return viewAuth('login');
    }
    afterLogin(session);
  }

  async function afterLogin(session) {
    st.me = { id: session.user.id, email: session.user.email };
    await S.put('kv', 'last-user', st.me);
    const blob = await S.get('kv', 'vault:' + st.me.id);
    let member = null;
    try { member = await A.isMember(); } catch (e) { member = null; }
    if (member === false) return viewNotMember();
    if (!blob) {
      if (member === null) return screen(h('div', { class: 'page center' }, logoBlock(), h('p', { class: 'note', text: 'Connecte-toi à internet pour la première ouverture.' })));
      return viewNewPin();
    }
    viewUnlock(blob);
  }

  // ---------- compte ----------
  function viewAuth(mode) {
    const email = h('input', { id: 'email', type: 'email', autocomplete: 'email', required: true, placeholder: 'ton-adresse@exemple.com' });
    const pw = h('input', { id: 'pw', type: 'password', autocomplete: mode === 'signup' ? 'new-password' : 'current-password', required: true, minlength: '8', placeholder: 'Au moins 8 caractères' });
    const msg = h('p', { class: 'form-msg', role: 'status' });
    const btn = h('button', { class: 'btn gold', type: 'submit', text: mode === 'signup' ? 'Créer mon compte' : 'Se connecter' });
    const form = h('form', { class: 'card form', onsubmit: async e => {
      e.preventDefault(); msg.textContent = ''; btn.disabled = true;
      try {
        if (mode === 'signup') {
          const r = await A.signUp(email.value.trim(), pw.value);
          if (r.session) return afterLogin(r.session);
          msg.textContent = 'Compte créé. Ouvre le lien reçu par e-mail pour le confirmer, puis reviens ici te connecter.';
        } else {
          const s = await A.signIn(email.value.trim(), pw.value);
          return afterLogin(s);
        }
      } catch (err) { msg.textContent = authError(err); }
      btn.disabled = false;
    } },
      h('div', { class: 'seg' },
        h('button', { type: 'button', class: mode === 'login' ? 'on' : '', text: 'Connexion', onclick: () => viewAuth('login') }),
        h('button', { type: 'button', class: mode === 'signup' ? 'on' : '', text: 'Créer un compte', onclick: () => viewAuth('signup') })),
      h('label', { for: 'email', text: 'Adresse e-mail' }), email,
      h('label', { for: 'pw', text: 'Mot de passe' }), pw,
      btn, msg,
      mode === 'login' ? h('button', { type: 'button', class: 'link', text: 'Mot de passe oublié ?', onclick: async () => {
        if (!email.value.trim()) { msg.textContent = "Écris d'abord ton adresse e-mail."; return; }
        try { await A.resetPw(email.value.trim()); msg.textContent = 'Un lien pour changer ton mot de passe a été envoyé.'; } catch (err) { msg.textContent = authError(err); }
      } }) : null);
    screen(h('div', { class: 'page center' }, logoBlock('Rien que vous deux'), form,
      h('p', { class: 'note small', text: 'Seules deux adresses e-mail peuvent entrer dans The Queen.' })));
  }

  function viewNewPassword() {
    const pw = h('input', { id: 'npw', type: 'password', autocomplete: 'new-password', minlength: '8', required: true });
    const msg = h('p', { class: 'form-msg', role: 'status' });
    screen(h('div', { class: 'page center' }, logoBlock('Nouveau mot de passe'),
      h('form', { class: 'card form', onsubmit: async e => {
        e.preventDefault();
        try { await A.updatePw(pw.value); toast('Mot de passe changé.'); const s = await A.session(); if (s) afterLogin(s); else viewAuth('login'); }
        catch (err) { msg.textContent = authError(err); }
      } }, h('label', { for: 'npw', text: 'Nouveau mot de passe (8 caractères ou plus)' }), pw, h('button', { class: 'btn gold', type: 'submit', text: 'Enregistrer' }), msg)));
  }

  function viewNotMember() {
    screen(h('div', { class: 'page center' }, logoBlock(),
      h('p', { class: 'note', text: "Ce compte n'est pas autorisé. The Queen est réservée à deux personnes." }),
      h('button', { class: 'btn', type: 'button', text: 'Se déconnecter', onclick: async () => { await A.signOut(); viewAuth('login'); } })));
  }

  // ---------- code secret ----------
  function viewNewPin() {
    const nom = h('input', { id: 'nom', type: 'text', maxlength: '40', required: true, autocomplete: 'given-name', placeholder: 'Ex. Khaldor' });
    const p1 = h('input', { id: 'pin1', type: 'password', required: true, minlength: '6', autocomplete: 'new-password', inputmode: 'numeric', placeholder: '6 chiffres ou plus' });
    const p2 = h('input', { id: 'pin2', type: 'password', required: true, minlength: '6', autocomplete: 'new-password', inputmode: 'numeric' });
    const msg = h('p', { class: 'form-msg', role: 'status' });
    const btn = h('button', { class: 'btn gold', type: 'submit', text: 'Créer mes clés secrètes' });
    screen(h('div', { class: 'page center' }, logoBlock('Protège ce téléphone'),
      h('form', { class: 'card form', onsubmit: async e => {
        e.preventDefault(); msg.textContent = '';
        if (p1.value.length < 6) { msg.textContent = 'Le code doit faire au moins 6 caractères.'; return; }
        if (p1.value !== p2.value) { msg.textContent = 'Les deux codes ne sont pas identiques.'; return; }
        if (/^(\d)\1+$|^(012345|123456|654321|000000)/.test(p1.value)) { msg.textContent = 'Ce code est trop facile à deviner.'; return; }
        btn.disabled = true; btn.textContent = 'Création des clés…';
        try {
          const vault = await C.createIdentity();
          const { blob, pinKey } = await C.sealVault(vault, p1.value);
          await S.put('kv', 'vault:' + uid(), blob);
          st.settings = { nom: nom.value.trim(), peerNick: '', ttl: 0, lockAfter: 60, peerPin: null, peerBundle: null };
          await startSession(vault, pinKey, blob, true);
        } catch (err) { msg.textContent = 'Erreur : ' + err.message; btn.disabled = false; btn.textContent = 'Créer mes clés secrètes'; }
      } },
        h('label', { for: 'nom', text: 'Ton prénom (vu par ta moitié)' }), nom,
        h('label', { for: 'pin1', text: 'Ton code secret' }), p1,
        h('label', { for: 'pin2', text: 'Le même code, encore une fois' }), p2,
        btn, msg,
        h('ul', { class: 'facts' },
          h('li', { text: 'Ce code ouvre The Queen et protège tes clés sur ce téléphone.' }),
          h('li', { text: "Il n'est jamais envoyé sur internet. Personne ne peut le retrouver, même pas moi." }),
          h('li', { text: 'Si tu l’oublies, les messages gardés sur ce téléphone sont perdus.' }),
          h('li', { text: 'Utilise un seul téléphone pour ton compte.' })))));
  }

  async function failState() { return (await S.get('kv', 'fails:' + uid())) || { n: 0, until: 0 }; }

  function viewUnlock(blob) {
    st.blob = blob;
    const pin = h('input', { id: 'pin', type: 'password', required: true, autocomplete: 'current-password', inputmode: 'numeric', placeholder: 'Code secret' });
    const msg = h('p', { class: 'form-msg', role: 'status' });
    const btn = h('button', { class: 'btn gold', type: 'submit', text: 'Ouvrir' });
    screen(h('div', { class: 'page center' }, logoBlock(),
      h('form', { class: 'card form', onsubmit: async e => {
        e.preventDefault(); msg.textContent = '';
        const f = await failState();
        if (f.until > Date.now()) { msg.textContent = 'Trop d’essais. Attends ' + Math.ceil((f.until - Date.now()) / 1000) + ' secondes.'; return; }
        btn.disabled = true; btn.textContent = 'Ouverture…';
        try {
          const { vault, pinKey } = await C.openVault(blob, pin.value);
          await S.put('kv', 'fails:' + uid(), { n: 0, until: 0 });
          await startSession(vault, pinKey, blob, false);
        } catch (err) {
          if (err.code === 'PIN') {
            f.n++; if (f.n >= 5) f.until = Date.now() + Math.min(3600e3, 30e3 * 2 ** (f.n - 5));
            await S.put('kv', 'fails:' + uid(), f);
            msg.textContent = 'Code incorrect.' + (f.n >= 5 ? ' Prochain essai dans ' + Math.round((f.until - Date.now()) / 1000) + ' s.' : '');
          } else msg.textContent = 'Erreur : ' + err.message;
          btn.disabled = false; btn.textContent = 'Ouvrir'; pin.value = ''; pin.focus();
        }
      } }, h('label', { for: 'pin', text: 'Ton code secret' }), pin, btn, msg,
        h('button', { type: 'button', class: 'link', text: 'Code oublié ?', onclick: forgotPin }))));
    setTimeout(() => pin.focus(), 50);
  }

  async function forgotPin() {
    const r = await ask('Code oublié', "Sans ton code, personne ne peut ouvrir les messages gardés sur ce téléphone. Tu peux tout effacer et repartir avec de nouvelles clés. Ta moitié verra que ton code de sécurité a changé.", [
      { label: 'Annuler', value: null }, { label: 'Tout effacer', value: 'wipe', cls: 'danger' }]);
    if (r === 'wipe') { await wipeDevice(); location.reload(); }
  }

  // ---------- session ouverte ----------
  async function startSession(vault, pinKey, blob, fresh) {
    st.vault = vault; st.pinKey = pinKey; st.blob = blob;
    if (await C.rotateIfNeeded(vault)) { st.blob = await C.resealVault(vault, pinKey, blob); await S.put('kv', 'vault:' + uid(), st.blob); }
    st.keys = await C.loadKeys(vault);
    if (!fresh) st.settings = await loadSettings();
    await saveSettings();
    await loadLocal();
    await loadStatus();
    st.unlocked = true;
    viewChat();
    purgeExpired();
    connect();
  }

  async function connect() {
    try {
      const bundle = await C.publicBundle(st.vault, st.keys);
      await A.publishKeys(Object.assign({ user_id: uid(), nom: st.settings.nom || 'Moi', updated_at: new Date().toISOString() }, bundle));
    } catch (e) { /* hors ligne : on réessaiera */ }
    await refreshPeer();
    await pullInbox();
    flushOutbox();
    shareProfileIfNeeded();
    if ((await notifMode()) !== 'off') enablePush(false);
    if (!st.unsub) { try { st.unsub = A.subscribe(uid(), () => pullInbox()); } catch (e) {} }
    if (!st.timers.length) {
      st.timers.push(setInterval(() => { if (document.visibilityState === 'visible' && online()) pullInbox(); }, 15000));
      st.timers.push(setInterval(purgeExpired, 30000));
      st.timers.push(setInterval(() => { if (online()) { refreshPeer(); flushOutbox(); } }, 120000));
    }
  }

  function lock(silent) {
    if (call.active || call.incoming) endCall(true, 'lock');
    if (st.rec) stopRecording(false);
    if (st.unsub) { st.unsub(); st.unsub = null; }
    st.timers.forEach(clearInterval); st.timers = [];
    st.vault = st.pinKey = st.keys = null; st.unlocked = false;
    st.msgs = new Map(); st.els = new Map(); st.peer = null; st.status = { mine: [], peer: [] };
    document.querySelectorAll('.modal,.viewer').forEach(m => m.remove());
    if (!silent && st.me && st.blob) viewUnlock(st.blob);
  }

  async function loadSettings() {
    const box = await S.get('kv', 'settings:' + uid());
    if (!box) return { nom: '', peerNick: '', ttl: 0, lockAfter: 60, peerPin: null, peerBundle: null };
    return C.localOpen(st.keys.db, box);
  }
  async function saveSettings() { await S.put('kv', 'settings:' + uid(), await C.localSeal(st.keys.db, st.settings)); }

  async function loadLocal() {
    st.msgs = new Map();
    const all = await S.all('msgs');
    const me = uid();
    for (const r of all) {
      if (!r || r.u !== me) continue;
      try { const m = await C.localOpen(st.keys.db, r.box); st.msgs.set(m.id, m); } catch (e) {}
    }
  }
  async function saveMsg(m) { st.msgs.set(m.id, m); await S.put('msgs', m.id, { u: uid(), ts: m.ts, box: await C.localSeal(st.keys.db, m) }); }
  async function dropMsg(id) {
    const m = st.msgs.get(id);
    if (m && m.body && m.body.mid) await S.del('media', m.body.mid).catch(() => {});
    st.msgs.delete(id); st.els.delete(id); await S.del('msgs', id);
  }
  async function addSystem(text) { await saveMsg({ id: C.randId(), from: 'sys', t: 'sys', body: text, ts: Date.now() }); renderList(); if (st.tab === 'calls' && !call.active && !document.querySelector('.call')) viewCalls(); }

  // ---------- clé de ma moitié ----------
  async function refreshPeer() {
    let row = null;
    try { row = await A.peerKeys(uid()); } catch (e) { row = null; }
    if (!row) { // hors ligne : dernière clé connue
      if (!st.peer && st.settings.peerBundle) st.peer = st.settings.peerBundle;
      renderHeader(); return;
    }
    if (!(await C.verifySpk(row))) { renderHeader(); return; }
    const pin = st.settings.peerPin;
    if (!pin) {
      st.settings.peerPin = { id: row.user_id, sign_pub: row.sign_pub, verified: false, since: Date.now() };
    } else if (pin.sign_pub !== row.sign_pub || pin.id !== row.user_id) {
      st.keyChanged = row; st.peer = null; renderHeader(); return;
    }
    st.keyChanged = null;
    st.peer = row;
    st.settings.peerBundle = row;
    await saveSettings();
    await setupNotifKey(row);
    renderHeader();
  }

  // ---------- notifications ----------
  async function setupNotifKey(peer) {
    try {
      st.nkey = await C.notifKey(st.keys, peer);
      await S.put('kv', 'notif-key', st.nkey);          // clé non exportable, lue par le service des notifications
      await S.put('kv', 'notif-name', peerName());
    } catch (e) { st.nkey = null; }
  }
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!(self.QUEEN_CONFIG || {}).vapidPublicKey;
  async function notifMode() { return (await S.get('kv', 'notif-mode')) || 'type'; }
  function b64uToBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  async function enablePush(fromClick) {
    if (!pushSupported()) { if (fromClick) toast(isIOS() && !standalone() ? 'Sur iPhone : ajoute d’abord The Queen à l’écran d’accueil.' : 'Les notifications ne sont pas possibles ici.'); return false; }
    try {
      if (Notification.permission === 'default') { if (!fromClick) return false; if ((await Notification.requestPermission()) !== 'granted') return false; }
      if (Notification.permission !== 'granted') { if (fromClick) toast('Notifications refusées : autorise-les dans les réglages du téléphone.'); return false; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(self.QUEEN_CONFIG.vapidPublicKey) });
      await A.savePush(sub);
      return true;
    } catch (e) { if (fromClick) toast('Activation impossible : ' + e.message); return false; }
  }
  async function disablePush() {
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      const sub = reg && reg.pushManager && await reg.pushManager.getSubscription();
      if (sub) { await A.removePush(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
    } catch (e) {}
  }
  async function clearNotifs() {
    try { await S.del('kv', 'notif-pending'); } catch (e) {}
    try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) (await reg.getNotifications()).forEach(n => n.close()); } catch (e) {}
  }
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  async function acceptNewKey() {
    const row = st.keyChanged; if (!row) return;
    st.settings.peerPin = { id: row.user_id, sign_pub: row.sign_pub, verified: false, since: Date.now() };
    st.settings.peerBundle = row;
    st.keyChanged = null; st.peer = row;
    await saveSettings();
    await setupNotifKey(row);
    await addSystem('Le code de sécurité de ' + peerName() + ' a changé. Comparez-le à nouveau ensemble.');
    renderHeader();
    pullInbox(); flushOutbox();
  }

  // ---------- réception ----------
  async function pullInbox() {
    if (!st.unlocked) return;
    if (st.pulling) { st.pullAgain = true; return; }
    st.pulling = true;
    try {
      const rows = await A.inbox(uid());
      for (const r of rows) { if (!st.unlocked) break; await handleRow(r); }
    } catch (e) { /* hors ligne */ }
    finally {
      st.pulling = false;
      if (st.pullAgain) { st.pullAgain = false; pullInbox(); }
    }
    markRead();
  }

  const RANK = { envoi: 0, attente: 0, echec: 0, envoye: 1, delivered: 2, read: 3 };
  const okData = (v, kind) => typeof v === 'string' && v.length < MAX_MEDIA * 1.4 &&
    (kind === 'image' ? /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) : /^data:audio\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*;base64,[A-Za-z0-9+/=]+$/i.test(v));

  async function handleRow(r) {
    if (!st.peer || st.keyChanged) return;           // on attend la bonne clé
    let res;
    try { res = await C.decrypt(st.keys, st.settings.peerPin.sign_pub, r.env, uid()); }
    catch (e) {
      if (e.code === 'SIG') {
        await refreshPeer();
        if (st.keyChanged) return;                     // nouvelle clé : on attend l'accord
        await A.remove(r.id).catch(() => {});
        return addSystem('Un message a été refusé : sa signature ne correspond pas.');
      }
      await A.remove(r.id).catch(() => {});
      return addSystem(e.code === 'SPK' ? 'Un ancien message n’a pas pu être ouvert (clé expirée).' : 'Un message n’a pas pu être ouvert.');
    }
    const p = res.payload || {};
    if (res.header.from !== st.peer.user_id) { await A.remove(r.id).catch(() => {}); return; }
    if (p.t === 'call') {
      await A.remove(r.id).catch(() => {});
      return onCallSignal(p);
    }
    if (p.t === 'receipt' && Array.isArray(p.ids)) {
      for (const id of p.ids.slice(0, 500)) {
        const m = st.msgs.get(id);
        if (m && m.from === 'me' && (RANK[p.k] || 0) > (RANK[m.status] || 0)) { m.status = p.k; await saveMsg(m); }
      }
      renderList();
    } else if (p.t === 'del' && typeof p.id === 'string') {
      const m = st.msgs.get(p.id);
      if (m && m.from === 'peer') { if (m.body && m.body.mid) await S.del('media', m.body.mid).catch(() => {}); m.deleted = true; m.body = null; await saveMsg(m); renderList(); }
    } else if (p.t === 'profile') {
      if (p.photo === null || okAvatar(p.photo)) st.settings.peerPhoto = p.photo || null;
      if (typeof p.about === 'string') st.settings.peerAbout = p.about.slice(0, MAX_ABOUT);
      await saveSettings(); renderHeader(); refreshTab();
    } else if (p.t === 'status' && typeof p.sid === 'string' && p.sid.length <= 40) {
      const ts = Math.min(Number(p.ts) || Date.now(), Date.now());
      const ok = p.kind === 'image' ? okData(p.data, 'image') && p.data.length <= MAX_STATUS_IMG * 1.4
        : p.kind === 'text' && typeof p.text === 'string' && p.text.trim().length > 0;
      if (ok && ts > Date.now() - DAY && !st.status.peer.some(x => x.sid === p.sid)) {
        st.status.peer.push({ sid: p.sid, kind: p.kind, data: p.kind === 'image' ? p.data : null, text: p.kind === 'text' ? p.text.slice(0, MAX_STATUS_TXT) : (typeof p.text === 'string' ? p.text.slice(0, 200) : ''), bg: (Number(p.bg) | 0) % STATUS_BG.length, ts, seen: false });
        if (st.status.peer.length > 30) st.status.peer.splice(0, st.status.peer.length - 30);
        await saveStatus(); renderHeader(); refreshTab();
      }
    } else if (p.t === 'status-del' && typeof p.sid === 'string') {
      const n = st.status.peer.length; st.status.peer = st.status.peer.filter(x => x.sid !== p.sid);
      if (n !== st.status.peer.length) { await saveStatus(); renderHeader(); refreshTab(); }
    } else if (p.t === 'status-seen' && typeof p.sid === 'string') {
      const x = st.status.mine.find(y => y.sid === p.sid);
      if (x && !x.seenAt) { x.seenAt = Date.now(); await saveStatus(); refreshTab(); }
    } else if (p.t === 'ttl' && TTL_LABEL[p.ttl] !== undefined) {
      st.settings.ttl = p.ttl; await saveSettings();
      await addSystem(peerName() + (p.ttl ? ' a activé les messages éphémères : ' + TTL_LABEL[p.ttl] + '.' : ' a désactivé les messages éphémères.'));
    } else if ((p.t === 'text' || p.t === 'image' || p.t === 'audio' || p.t === 'video') && typeof p.id === 'string' && p.id.length <= 40) {
      let body = null;
      if (p.t === 'video' && !st.msgs.has(p.id)) {
        body = await receiveVideo(p);
        if (body === 'retry') return;                  // téléchargement impossible : on réessaiera
      }
      if (p.t === 'text' && typeof p.body === 'string') body = p.body.slice(0, MAX_TEXT);
      if (p.t === 'image' && p.body && okData(p.body.data, 'image')) body = { data: p.body.data };
      if (p.t === 'audio' && p.body && okData(p.body.data, 'audio')) body = { data: p.body.data, dur: Math.min(MAX_AUDIO_S, Number(p.body.dur) || 0) };
      const ts = Math.min(Number(p.ts) || Date.now(), Date.now() + 60000);
      const ttl = TTL_LABEL[p.ttl] !== undefined ? p.ttl : 0;
      const exp = ttl ? ts + ttl * 1000 : 0;
      if (body != null && body !== 'retry' && !st.msgs.has(p.id) && !(exp && exp < Date.now())) {
        await saveMsg({ id: p.id, from: 'peer', t: p.t, body, ts, exp, status: 'recu' });
        st.rq.delivered.add(p.id); queueReceipts();
        renderList(); notifyNew();
      }
    }
    await A.remove(r.id).catch(() => {});
  }

  async function receiveVideo(p) {
    const b = p.body || {}, f = b.file || {};
    const pathOk = typeof f.path === 'string' && f.path.startsWith(uid() + '/' + st.peer.user_id + '-') && f.path.length < 200;
    if (!pathOk || typeof f.key !== 'string' || typeof f.iv !== 'string' || !/^video\/[a-z0-9.+-]+$/i.test(b.mime || '') || !(b.size > 0 && b.size <= MAX_VIDEO)) return null;
    let ct;
    try { ct = await A.download(f.path); } catch (e) { return 'retry'; }
    let bytes;
    try { bytes = await C.openFile(f, ct); } catch (e) { await A.removeFile(f.path).catch(() => {}); return null; }
    const mid = C.randId();
    await S.put('media', mid, await C.localSealBytes(st.keys.db, bytes));
    await A.removeFile(f.path).catch(() => {});
    return { mid, mime: b.mime, size: bytes.byteLength, dur: Math.min(36000, Number(b.dur) || 0), thumb: okData(b.thumb, 'image') ? b.thumb : null };
  }

  function queueReceipts() { clearTimeout(st.rqTimer); st.rqTimer = setTimeout(sendReceipts, 700); }
  async function sendReceipts() {
    for (const k of ['read', 'delivered']) {
      const ids = [...st.rq[k]]; if (!ids.length) continue;
      if (k === 'delivered') ids.forEach(i => { if (st.rq.read.has(i)) ids.splice(ids.indexOf(i), 1); });
      st.rq[k].clear();
      if (ids.length) sendControl({ t: 'receipt', k, ids });
    }
  }
  function markRead() {
    if (!st.unlocked || document.visibilityState !== 'visible' || !document.querySelector('.chat')) return;
    let n = 0;
    for (const m of st.msgs.values()) if (m.from === 'peer' && m.status === 'recu') { m.status = 'lu'; saveMsg(m); st.rq.read.add(m.id); st.rq.delivered.delete(m.id); n++; }
    if (n) queueReceipts();
    setBadge(0); clearNotifs();
  }
  function notifyNew() {
    if (st.tab !== 'chat') refreshTab();
    if (document.visibilityState === 'visible') return markRead();
    const n = [...st.msgs.values()].filter(m => m.from === 'peer' && m.status === 'recu').length;
    setBadge(n);
  }
  function setBadge(n) {
    document.title = n ? '(' + n + ') The Queen' : 'The Queen';
    try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) {}
  }

  // ---------- envoi ----------
  async function sendControl(payload, notifKind) {
    if (!st.peer || st.keyChanged || !st.unlocked) return false;
    try {
      const env = await C.encrypt(st.keys, st.peer, Object.assign({ id: C.randId(), ts: Date.now() }, payload), uid(), st.peer.user_id);
      let hint = null;
      if (notifKind) { if (!st.nkey) await setupNotifKey(st.peer); if (st.nkey) hint = await C.notifSeal(st.nkey, { k: notifKind }); }
      const rowId = await A.send(uid(), st.peer.user_id, env, hint);
      if (notifKind) A.notify(rowId);
      return true;
    } catch (e) { return false; }
  }

  async function sendMessage(t, body) {
    if (!st.peer && !st.settings.peerBundle) { toast('Ta moitié n’a pas encore créé son compte.'); return; }
    if (st.keyChanged) { toast('Vérifiez d’abord le nouveau code de sécurité.'); return; }
    const ts = Date.now(), ttl = st.settings.ttl || 0;
    const m = { id: C.randId(), from: 'me', t, body, ts, exp: ttl ? ts + ttl * 1000 : 0, ttl, status: 'attente' };
    await saveMsg(m); renderList(true);
    flushOutbox();
    return m;
  }

  async function sendVideo(file) {
    if (file.size > MAX_VIDEO) { toast('Vidéo trop lourde : 50 Mo au maximum.'); return; }
    toast('Préparation de la vidéo…');
    const { thumb, dur } = await videoThumb(file);
    const bytes = await file.arrayBuffer();
    const mid = C.randId();
    await S.put('media', mid, await C.localSealBytes(st.keys.db, bytes));
    await sendMessage('video', { mid, mime: (file.type || 'video/mp4').split(';')[0], size: file.size, dur, thumb });
  }
  function videoThumb(file) {
    return new Promise(res => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      let done = false;
      const fin = (thumb, dur) => { if (done) return; done = true; URL.revokeObjectURL(url); res({ thumb, dur: Math.round(dur || 0) }); };
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (e) { fin(null, v.duration); } };
      v.onseeked = () => {
        try {
          const k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
          const c = document.createElement('canvas');
          c.width = Math.round(v.videoWidth * k) || 320; c.height = Math.round(v.videoHeight * k) || 240;
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          fin(c.toDataURL('image/jpeg', 0.6), v.duration);
        } catch (e) { fin(null, v.duration); }
      };
      v.onerror = () => fin(null, 0);
      setTimeout(() => fin(null, v.duration), 8000);
      v.src = url;
    });
  }
  async function openVideo(m) {
    try {
      const box = await S.get('media', m.body.mid);
      if (!box) return toast('Vidéo introuvable sur ce téléphone.');
      const bytes = await C.localOpenBytes(st.keys.db, box);
      const url = URL.createObjectURL(new Blob([bytes], { type: m.body.mime }));
      const vid = h('video', { src: url, controls: true, autoplay: true, playsinline: true });
      const close = () => { vid.pause(); URL.revokeObjectURL(url); v.remove(); };
      const v = h('div', { class: 'viewer', role: 'dialog', 'aria-label': 'Vidéo' }, vid, btnIcon('x', 'Fermer', close, 'close'));
      v.addEventListener('click', e => { if (e.target === v) close(); });
      document.body.append(v);
    } catch (e) { toast('Cette vidéo n’a pas pu être ouverte.'); }
  }

  // File d'attente : les messages partent dès qu'internet est là.
  async function flushOutbox() {
    if (st.flushing || !st.unlocked) return;
    const peer = st.peer || (!st.keyChanged && st.settings.peerBundle);
    if (!peer || st.keyChanged) return;
    st.flushing = true;
    try {
      const waiting = [...st.msgs.values()].filter(m => m.from === 'me' && (m.status === 'attente' || m.status === 'envoi')).sort((a, b) => a.ts - b.ts);
      for (const m of waiting) {
        if (!online()) break;
        m.status = 'envoi'; renderList();
        try {
          let body = m.body;
          if (m.t === 'video') {
            if (!m.up) {                                   // chiffrer et déposer la vidéo une seule fois
              const box = await S.get('media', m.body.mid);
              const bytes = await C.localOpenBytes(st.keys.db, box);
              const sealed = await C.sealFile(bytes);
              const path = peer.user_id + '/' + uid() + '-' + m.body.mid;
              await A.upload(path, sealed.ct);
              m.up = { path, key: sealed.key, iv: sealed.iv };
              await saveMsg(m);
            }
            body = { file: m.up, mime: m.body.mime, size: m.body.size, dur: m.body.dur, thumb: m.body.thumb };
          }
          const env = await C.encrypt(st.keys, peer, { t: m.t, id: m.id, body, ts: m.ts, ttl: m.ttl || 0 }, uid(), peer.user_id);
          if (!st.nkey) await setupNotifKey(peer);
          const hint = st.nkey ? await C.notifSeal(st.nkey, { k: KIND[m.t] || 'message' }) : null;
          const rowId = await A.send(uid(), peer.user_id, env, hint);
          m.status = 'envoye';
          delete m.up;
          A.notify(rowId);
        } catch (e) {
          m.status = 'attente';
          if (e && e.code === 'BUNDLE') { await refreshPeer(); }
          await saveMsg(m); renderList();
          break;
        }
        await saveMsg(m); renderList();
      }
    } finally { st.flushing = false; }
  }

  // ---------- écran principal ----------
  let listEl, headEl, bannerEl, composerEl;
  function viewChat() {
    headEl = h('header', { class: 'bar' });
    bannerEl = h('div', { class: 'banners' });
    listEl = h('div', { class: 'list', role: 'log', 'aria-live': 'polite' });
    composerEl = buildComposer();
    st.tab = 'chat';
    screen(h('div', { class: 'chat tabbed' }, headEl, bannerEl, listEl, composerEl, tabbar('chat')));
    renderHeader(); renderList(true); markRead();
  }

  function renderHeader() {
    if (!headEl || !st.unlocked) return;
    const verified = st.settings.peerPin && st.settings.peerPin.verified && !st.keyChanged;
    const hasPeer = st.peer || st.settings.peerBundle;
    headEl.replaceChildren(
      avatarBtn(),
      h('button', { class: 'who', type: 'button', onclick: viewPeerProfile },
        h('strong', { text: hasPeer ? peerName() : 'The Queen' }),
        h('small', { class: verified ? 'ok' : '' }, icon('lock', 'tiny'), verified ? ' Chiffré · code vérifié' : ' Chiffré de bout en bout')),
      btnIcon('phone', 'Appel vocal', () => startCall(false)),
      btnIcon('video', 'Appel vidéo', () => startCall(true)),
      btnIcon('lock', 'Verrouiller', () => lock()));
    bannerEl.replaceChildren();
    if (st.keyChanged) {
      bannerEl.append(h('div', { class: 'banner danger' },
        h('p', { text: 'Le code de sécurité de ' + peerName() + ' a changé. Cela arrive si elle a réinstallé l’appli ou changé de téléphone. Vérifiez ensemble avant de continuer.' }),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', text: 'Voir le code', onclick: () => viewSecurity(st.keyChanged) }),
          h('button', { class: 'btn small gold', type: 'button', text: 'J’ai vérifié, continuer', onclick: acceptNewKey }))));
    } else if (!hasPeer) {
      bannerEl.append(h('div', { class: 'banner' }, h('p', { text: 'Ta moitié n’a pas encore créé son compte. Dès que c’est fait, vous pourrez vous écrire.' })));
    } else if (!verified) {
      bannerEl.append(h('button', { class: 'banner gold', type: 'button', onclick: () => viewSecurity() },
        icon('shield'), h('span', { text: 'Comparez une fois vos codes de sécurité (en appel vidéo, lisez les chiffres). Touchez ici.' })));
    }
    if (hasPeer && !st.keyChanged && pushSupported() && Notification.permission === 'default' && !st.pushAsked) {
      bannerEl.append(h('button', { class: 'banner gold', type: 'button', onclick: async () => { st.pushAsked = true; if (await enablePush(true)) toast('Notifications activées.'); renderHeader(); } },
        icon('bell'), h('span', { text: 'Active les notifications pour savoir quand ' + peerName() + ' t’écrit.' })));
    } else if (hasPeer && isIOS() && !standalone()) {
      bannerEl.append(h('div', { class: 'banner muted' }, h('p', { text: 'Pour les notifications sur iPhone : touche Partager puis « Sur l’écran d’accueil », et ouvre The Queen depuis l’icône.' })));
    }
    if (!online()) bannerEl.append(h('div', { class: 'banner muted' }, h('p', { text: 'Hors ligne. Tes messages partiront dès le retour d’internet.' })));
  }

  function bubbleSig(m) { return [m.status, m.deleted ? 1 : 0, m.exp].join('|'); }
  function buildBubble(m) {
    if (m.from === 'sys') return h('div', { class: 'sys' }, h('span', { text: m.body }));
    const mine = m.from === 'me';
    const content = h('div', { class: 'content' });
    if (m.deleted) content.append(h('em', { class: 'gone', text: mine ? 'Tu as supprimé ce message' : 'Ce message a été supprimé' }));
    else if (m.t === 'text') content.append(h('p', { class: 'txt', text: m.body }));
    else if (m.t === 'image') {
      const img = h('img', { class: 'photo', alt: 'Photo', loading: 'lazy', src: m.body.data });
      img.addEventListener('click', () => openViewer(m.body.data));
      content.append(img);
    } else if (m.t === 'video') {
      const fmtDur = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      const tile = h('button', { class: 'vthumb', type: 'button', 'aria-label': 'Lire la vidéo', onclick: () => openVideo(m) },
        m.body.thumb ? h('img', { src: m.body.thumb, alt: '' }) : h('span', { class: 'vph', text: 'Vidéo' }),
        icon('play', 'playic'), m.body.dur ? h('span', { class: 'vdur', text: fmtDur(m.body.dur) }) : null);
      content.append(tile);
    } else if (m.t === 'audio') {
      content.append(h('div', { class: 'voice' }, icon('mic', 'tiny'), h('audio', { controls: true, preload: 'metadata', src: m.body.data })));
    }
    const meta = h('span', { class: 'meta' });
    if (m.exp) meta.append(icon('timer', 'tiny'));
    meta.append(fmtTime(m.ts));
    if (mine && !m.deleted) {
      if (m.status === 'attente' || m.status === 'envoi') meta.append(icon('clock', 'st wait'));
      else if (m.status === 'envoye') meta.append(icon('tick', 'st'));
      else if (m.status === 'delivered') meta.append(icon('ticks', 'st'));
      else if (m.status === 'read') meta.append(icon('ticks', 'st read'));
    }
    content.append(meta);
    const el = h('div', { class: 'msg ' + (mine ? 'me' : 'peer'), 'data-id': m.id }, content);
    let t = 0;
    el.addEventListener('contextmenu', e => { e.preventDefault(); msgMenu(m); });
    el.addEventListener('touchstart', () => { t = setTimeout(() => msgMenu(m), 520); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t), { passive: true }));
    return el;
  }

  let rlPending = false;
  function renderList(toBottom) {
    if (!listEl || !st.unlocked) return;
    if (rlPending) { if (toBottom) rlPending = 'bottom'; return; }
    rlPending = toBottom ? 'bottom' : true;
    requestAnimationFrame(() => {
      const wantBottom = rlPending === 'bottom' || (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120);
      rlPending = false;
      const arr = [...st.msgs.values()].sort((a, b) => a.ts - b.ts);
      const nodes = [];
      let day = '';
      if (!arr.length) nodes.push(h('div', { class: 'empty' },
        h('img', { src: 'icons/logo-512.png', alt: '', width: '96', height: '96' }),
        h('p', { text: 'Votre espace à deux. Chaque message est chiffré sur ce téléphone avant de partir.' })));
      for (const m of arr) {
        const d = new Date(m.ts).toDateString();
        if (d !== day) { day = d; nodes.push(h('div', { class: 'day' }, h('span', { text: fmtDay(m.ts) }))); }
        const sig = bubbleSig(m), c = st.els.get(m.id);
        let el;
        if (c && c.sig === sig) el = c.el; else { el = buildBubble(m); st.els.set(m.id, { el, sig }); }
        nodes.push(el);
      }
      listEl.replaceChildren(...nodes);
      if (wantBottom) listEl.scrollTop = listEl.scrollHeight;
    });
  }

  async function msgMenu(m) {
    if (m.from === 'sys') return;
    const btns = [];
    if (m.t === 'text' && !m.deleted) btns.push({ label: 'Copier', value: 'copy' });
    btns.push({ label: 'Supprimer pour moi', value: 'me', cls: 'danger' });
    if (m.from === 'me' && !m.deleted && Date.now() - m.ts < 2 * DAY) btns.push({ label: 'Supprimer pour nous deux', value: 'all', cls: 'danger' });
    btns.push({ label: 'Annuler', value: null });
    const r = await ask('Message', null, btns);
    if (r === 'copy') { try { await navigator.clipboard.writeText(m.body); toast('Copié.'); } catch (e) { toast('Copie impossible.'); } }
    if (r === 'me') { await dropMsg(m.id); renderList(); }
    if (r === 'all') {
      const ok = await sendControl({ t: 'del', id: m.id });
      if (!ok) return toast('Pas de connexion : réessaie plus tard.');
      if (m.body && m.body.mid) await S.del('media', m.body.mid).catch(() => {});
      m.deleted = true; m.body = null; await saveMsg(m); renderList();
    }
  }

  function openViewer(src) {
    const v = h('div', { class: 'viewer', role: 'dialog', 'aria-label': 'Photo' }, h('img', { src, alt: 'Photo' }), btnIcon('x', 'Fermer', () => v.remove(), 'close'));
    v.addEventListener('click', e => { if (e.target === v) v.remove(); });
    document.body.append(v);
  }

  // ---------- zone d'écriture ----------
  function buildComposer() {
    const ta = h('textarea', { id: 'txt', rows: '1', placeholder: 'Message', maxlength: String(MAX_TEXT), 'aria-label': 'Écrire un message' });
    const file = h('input', { id: 'photo', type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true });
    const action = h('button', { class: 'ibtn send', type: 'button', 'aria-label': 'Enregistrer un vocal' }, icon('mic'));
    const setAction = () => {
      const has = ta.value.trim().length > 0;
      action.replaceChildren(icon(has ? 'send' : 'mic'));
      action.setAttribute('aria-label', has ? 'Envoyer' : 'Enregistrer un vocal');
    };
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; setAction(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); action.click(); } });
    action.addEventListener('click', () => {
      const v = ta.value.trim();
      if (v) { sendMessage('text', v); ta.value = ''; ta.style.height = 'auto'; setAction(); ta.focus(); }
      else startRecording();
    });
    file.addEventListener('change', async () => {
      const files = [...(file.files || [])].slice(0, 30); file.value = '';
      for (const f of files) {
        if (/^video\//.test(f.type)) { await sendVideo(f).catch(() => toast('Cette vidéo n’a pas pu être préparée.')); continue; }
        try { const data = await shrinkImage(f); await sendMessage('image', { data }); }
        catch (e) { toast('Cette photo n’a pas pu être préparée.'); }
      }
    });
    const cam = btnIcon('cam', 'Envoyer des photos ou une vidéo', () => file.click());
    return h('footer', { class: 'composer' }, cam, file, h('div', { class: 'field' }, ta), action);
  }

  function shrinkImage(f) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = 0.82, out = c.toDataURL('image/jpeg', q);
        while (out.length > MAX_MEDIA && q > 0.4) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
        out.length > MAX_MEDIA ? rej(new Error('trop grande')) : res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }

  async function startRecording() {
    if (st.rec) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Les vocaux ne sont pas possibles sur ce navigateur.');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return toast('Autorise le micro pour envoyer un vocal.'); }
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const start = Date.now();
    const timeEl = h('span', { class: 'rec-time', text: '0:00' });
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      timeEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (s >= MAX_AUDIO_S) stopRecording(true);
    }, 250);
    st.rec = { rec, stream, chunks, start, tick, send: false };
    rec.onstop = () => {
      const r = st.rec; st.rec = null;
      clearInterval(r.tick); r.stream.getTracks().forEach(t => t.stop());
      composerEl.replaceWith(composerEl = buildComposer());
      if (!r.send) return;
      const blob = new Blob(r.chunks, { type: rec.mimeType || mime || 'audio/webm' });
      const dur = Math.round((Date.now() - r.start) / 1000);
      if (dur < 1) return toast('Vocal trop court.');
      const fr = new FileReader();
      fr.onload = () => {
        const data = String(fr.result).replace(/^data:([^;,]+)(;[^,]*)?;base64,/, (all, type) => 'data:' + type.split(';')[0] + ';base64,');
        if (data.length > MAX_MEDIA * 1.3) return toast('Vocal trop long.');
        sendMessage('audio', { data, dur });
      };
      fr.readAsDataURL(blob);
    };
    rec.start(1000);
    const bar = h('footer', { class: 'composer recording' },
      btnIcon('x', 'Annuler le vocal', () => stopRecording(false)),
      h('div', { class: 'rec' }, h('span', { class: 'dot' }), h('span', { text: 'Enregistrement' }), timeEl),
      h('button', { class: 'ibtn send', type: 'button', 'aria-label': 'Envoyer le vocal', onclick: () => stopRecording(true) }, icon('send')));
    composerEl.replaceWith(bar); composerEl = bar;
  }
  function stopRecording(send) { if (!st.rec) return; st.rec.send = send; try { st.rec.rec.stop(); } catch (e) {} }


  // ---------- appels vocaux et vidéo ----------
  // Les appels passent en direct entre vos deux téléphones (WebRTC, chiffrement DTLS-SRTP).
  // L'invitation et la réponse voyagent dans des messages chiffrés et signés :
  // personne ne peut se glisser au milieu, même pas le relais.
  const call = { active: false, incoming: null, pc: null, cid: null, dir: null, video: false, local: null, start: 0,
    ui: null, statusEl: null, remoteV: null, localV: null, ringT: 0, tickT: 0, fastT: 0, discT: 0, tone: null, muted: false, camOff: false, facing: 'user' };
  const SDP_OK = s => typeof s === 'string' && s.length < 30000 && s.startsWith('v=0');

  async function iceServers() {
    if (st.ice && st.ice.exp > Date.now()) return st.ice.list;
    let list = [{ urls: 'stun:stun.cloudflare.com:3478' }];
    try { const r = await A.turn(); if (r && r.iceServers) list = [].concat(r.iceServers).concat(list); } catch (e) {}
    st.ice = { list, exp: Date.now() + 6 * 3600e3 };
    return list;
  }
  function waitIce(pc) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 3500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }
  async function getMedia(video, facing) {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode: facing || 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
    });
  }

  // Sonneries (générées, aucun fichier externe)
  let actx = null;
  function audioCtx() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx; }
  document.addEventListener('pointerdown', () => audioCtx(), { once: true });
  function playTone(kind) {
    stopTone();
    const ctx = audioCtx(); if (!ctx) return;
    const pattern = kind === 'ring' ? [[880, 0, .35], [660, .4, .35]] : [[440, 0, 1.2]];
    const period = kind === 'ring' ? 2000 : 3500;
    const beep = () => {
      const now = ctx.currentTime;
      for (const [f, at, dur] of pattern) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0, now + at); g.gain.linearRampToValueAtTime(kind === 'ring' ? .25 : .12, now + at + .03);
        g.gain.linearRampToValueAtTime(0, now + at + dur);
        o.connect(g).connect(ctx.destination); o.start(now + at); o.stop(now + at + dur + .05);
      }
      if (kind === 'ring' && navigator.vibrate) navigator.vibrate([300, 150, 300]);
    };
    beep(); call.tone = setInterval(beep, period);
  }
  function stopTone() { if (call.tone) { clearInterval(call.tone); call.tone = null; } try { navigator.vibrate && navigator.vibrate(0); } catch (e) {} }

  function fastPoll(on) {
    clearInterval(call.fastT); call.fastT = 0;
    if (on) call.fastT = setInterval(() => pullInbox(), 1000);
  }
  const fmtDur = s => (s >= 60 ? Math.floor(s / 60) + ' min ' : '') + String(s % 60).padStart(2, '0') + ' s';

  function callUI(mode) {
    if (call.ui) call.ui.remove();
    const name = peerName();
    call.statusEl = h('p', { class: 'cstatus', text: '' });
    call.remoteV = h('video', { class: 'cremote', autoplay: true, playsinline: true });
    call.localV = h('video', { class: 'clocal', autoplay: true, playsinline: true, muted: true });
    call.localV.muted = true;
    const top = h('div', { class: 'ctop' }, h('img', { src: 'icons/logo-512.png', alt: '', class: 'cavatar' }), h('h2', { text: name }), call.statusEl,
      h('small', { class: 'csecure' }, icon('lock', 'tiny'), ' Appel chiffré de bout en bout'));
    let ctrls;
    if (mode === 'incoming') {
      ctrls = h('div', { class: 'cctrls' },
        h('button', { class: 'cbtn red', type: 'button', 'aria-label': 'Refuser', onclick: declineCall }, icon('hang')),
        h('button', { class: 'cbtn green', type: 'button', 'aria-label': 'Décrocher', onclick: acceptCall }, icon(call.incoming && call.incoming.video ? 'video' : 'phone')));
    } else {
      const mute = h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Couper le micro', onclick: () => {
        call.muted = !call.muted; call.local && call.local.getAudioTracks().forEach(t => { t.enabled = !call.muted; });
        mute.classList.toggle('on', call.muted); mute.replaceChildren(icon(call.muted ? 'micoff' : 'mic'));
      } }, icon('mic'));
      const cam = call.video ? h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Couper la caméra', onclick: () => {
        call.camOff = !call.camOff; call.local && call.local.getVideoTracks().forEach(t => { t.enabled = !call.camOff; });
        cam.classList.toggle('on', call.camOff);
      } }, icon('video')) : null;
      const flip = call.video ? h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Changer de caméra', onclick: flipCamera }, icon('flip')) : null;
      ctrls = h('div', { class: 'cctrls' }, mute, cam, flip,
        h('button', { class: 'cbtn red', type: 'button', 'aria-label': 'Raccrocher', onclick: () => endCall(true, 'hangup') }, icon('hang')));
    }
    call.ui = h('div', { class: 'call' + (call.video || (call.incoming && call.incoming.video) ? ' isvideo' : '') + (mode === 'incoming' ? ' ringing' : ''), role: 'dialog', 'aria-label': 'Appel' },
      call.remoteV, call.localV, top, ctrls);
    document.body.append(call.ui);
    if (call.local) { call.localV.srcObject = call.local; }
  }
  function setStatus(t) { if (call.statusEl) call.statusEl.textContent = t; }

  async function makePc() {
    const pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: 'max-bundle' });
    pc.ontrack = e => {
      if (call.remoteV && e.streams[0]) { call.remoteV.srcObject = e.streams[0]; call.remoteV.play().catch(() => {}); }
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        clearTimeout(call.discT); clearTimeout(call.ringT); stopTone();
        if (!call.start) {
          call.start = Date.now(); fastPoll(false);
          call.tickT = setInterval(() => setStatus(fmtDur(Math.floor((Date.now() - call.start) / 1000))), 1000);
          if (call.ui) call.ui.classList.add('live');
        }
      } else if (s === 'disconnected') {
        setStatus('Connexion faible…');
        clearTimeout(call.discT); call.discT = setTimeout(() => { if (pc.connectionState !== 'connected') { toast('Appel coupé : connexion perdue.'); endCall(true, 'lost'); } }, 10000);
      } else if (s === 'failed') { toast('Appel impossible : connexion bloquée par le réseau.'); endCall(true, 'failed'); }
    };
    return pc;
  }

  async function startCall(video) {
    if (call.active || call.incoming) return;
    if (!st.peer && !st.keyChanged) return toast('Ta moitié n’a pas encore créé son compte. Les appels marcheront dès que ce sera fait.');
    if (!st.peer || st.keyChanged) return toast('Appel impossible pour le moment.');
    if (!online()) return toast('Pas de connexion internet.');
    if (!window.RTCPeerConnection || !navigator.mediaDevices) return toast('Les appels ne sont pas possibles sur ce navigateur.');
    Object.assign(call, { active: true, dir: 'out', video, cid: C.randId(), start: 0, muted: false, camOff: false, facing: 'user' });
    try { call.local = await getMedia(video); }
    catch (e) { call.active = false; return toast(video ? 'Autorise la caméra et le micro pour appeler.' : 'Autorise le micro pour appeler.'); }
    callUI('out'); setStatus('Connexion…');
    try {
      call.pc = await makePc();
      call.local.getTracks().forEach(t => call.pc.addTrack(t, call.local));
      if (!video) call.pc.addTransceiver('video', { direction: 'recvonly' });
      await call.pc.setLocalDescription(await call.pc.createOffer());
      await waitIce(call.pc);
      if (!call.active) return;
      const ok = await sendControl({ t: 'call', a: 'offer', cid: call.cid, video, sdp: call.pc.localDescription.sdp }, video ? 'appel-video' : 'appel');
      if (!ok) { toast('L’appel n’a pas pu partir.'); return endCall(false, 'neterr'); }
      setStatus('Ça sonne…'); playTone('back'); fastPoll(true);
      call.ringT = setTimeout(() => { if (!call.start) { toast('Pas de réponse.'); endCall(true, 'noanswer'); } }, 45000);
    } catch (e) { toast('Erreur d’appel : ' + e.message); endCall(true, 'error'); }
  }

  async function onCallSignal(p) {
    if (typeof p.cid !== 'string' || p.cid.length > 40) return;
    const age = Date.now() - (Number(p.ts) || 0);
    if (p.a === 'offer') {
      if (!SDP_OK(p.sdp)) return;
      const label = p.video ? 'Appel vidéo manqué' : 'Appel vocal manqué';
      if (age > 60000) return addSystem(label + ' · ' + fmtTime(p.ts));
      if (call.active || call.incoming) { sendControl({ t: 'call', a: 'busy', cid: p.cid }); return addSystem(label + ' · ' + fmtTime(p.ts)); }
      call.incoming = { cid: p.cid, video: !!p.video, sdp: p.sdp, ts: p.ts };
      call.video = !!p.video;
      callUI('incoming'); setStatus(p.video ? 'Appel vidéo entrant' : 'Appel vocal entrant');
      playTone('ring'); fastPoll(true);
      call.ringT = setTimeout(() => { if (call.incoming && call.incoming.cid === p.cid) { closeIncoming(); addSystem(label + ' · ' + fmtTime(p.ts)); } }, Math.max(5000, 45000 - age));
      return;
    }
    if (p.a === 'answer' && call.active && call.dir === 'out' && p.cid === call.cid && SDP_OK(p.sdp) && call.pc && !call.pc.currentRemoteDescription) {
      setStatus('Connexion…'); stopTone();
      try { await call.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp }); } catch (e) { endCall(true, 'error'); }
      return;
    }
    if (p.a === 'end' || p.a === 'busy') {
      if (call.incoming && call.incoming.cid === p.cid) {
        const label = call.incoming.video ? 'Appel vidéo manqué' : 'Appel vocal manqué';
        const ts = call.incoming.ts; closeIncoming(); return addSystem(label + ' · ' + fmtTime(ts));
      }
      if (call.active && call.cid === p.cid) {
        if (p.a === 'busy') toast(peerName() + ' est déjà en appel.');
        else if (p.reason === 'decline') toast(peerName() + ' ne peut pas répondre.');
        endCall(false, p.a === 'busy' ? 'busy' : (p.reason === 'decline' ? 'declined' : 'remote'));
      }
    }
  }

  function closeIncoming() { clearTimeout(call.ringT); stopTone(); fastPoll(false); call.incoming = null; if (call.ui) { call.ui.remove(); call.ui = null; } }

  async function acceptCall() {
    const inc = call.incoming; if (!inc) return;
    clearTimeout(call.ringT); stopTone();
    Object.assign(call, { active: true, dir: 'in', video: inc.video, cid: inc.cid, start: 0, muted: false, camOff: false, facing: 'user' });
    call.incoming = null;
    try { call.local = await getMedia(inc.video); }
    catch (e) {
      try { call.local = await getMedia(false); call.video = false; } catch (e2) { toast('Autorise le micro pour répondre.'); sendControl({ t: 'call', a: 'end', cid: inc.cid, reason: 'decline' }); return endCall(false, 'nomic'); }
    }
    callUI('in'); setStatus('Connexion…');
    try {
      call.pc = await makePc();
      call.local.getTracks().forEach(t => call.pc.addTrack(t, call.local));
      await call.pc.setRemoteDescription({ type: 'offer', sdp: inc.sdp });
      await call.pc.setLocalDescription(await call.pc.createAnswer());
      await waitIce(call.pc);
      const ok = await sendControl({ t: 'call', a: 'answer', cid: call.cid, sdp: call.pc.localDescription.sdp });
      if (!ok) { toast('Pas de connexion.'); return endCall(false, 'neterr'); }
      call.ringT = setTimeout(() => { if (!call.start) { toast('Appel impossible : connexion bloquée par le réseau.'); endCall(true, 'failed'); } }, 25000);
    } catch (e) { toast('Erreur d’appel : ' + e.message); endCall(true, 'error'); }
  }

  async function declineCall() {
    const inc = call.incoming; if (!inc) return;
    sendControl({ t: 'call', a: 'end', cid: inc.cid, reason: 'decline' });
    closeIncoming();
    addSystem((inc.video ? 'Appel vidéo' : 'Appel vocal') + ' refusé · ' + fmtTime(inc.ts));
  }

  async function flipCamera() {
    if (!call.pc || !call.local) return;
    call.facing = call.facing === 'user' ? 'environment' : 'user';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: call.facing } });
      const nt = s.getVideoTracks()[0];
      const sender = call.pc.getSenders().find(x => x.track && x.track.kind === 'video');
      if (sender) await sender.replaceTrack(nt);
      call.local.getVideoTracks().forEach(t => { t.stop(); call.local.removeTrack(t); });
      call.local.addTrack(nt); call.localV.srcObject = call.local;
    } catch (e) { toast('Une seule caméra disponible.'); }
  }

  function endCall(notify, reason) {
    if (call.incoming) closeIncoming();
    if (!call.active) return;
    if (notify) sendControl({ t: 'call', a: 'end', cid: call.cid, reason });
    const kind = call.video ? 'Appel vidéo' : 'Appel vocal';
    if (call.start) addSystem(kind + ' · ' + fmtDur(Math.round((Date.now() - call.start) / 1000)));
    else if (call.dir === 'out' && reason !== 'neterr') addSystem(kind + ' sans réponse · ' + fmtTime(Date.now()));
    clearTimeout(call.ringT); clearTimeout(call.discT); clearInterval(call.tickT); stopTone(); fastPoll(false);
    try { call.local && call.local.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { call.pc && call.pc.close(); } catch (e) {}
    if (call.ui) call.ui.remove();
    Object.assign(call, { active: false, pc: null, local: null, ui: null, cid: null, start: 0, dir: null });
  }

  // ---------- effacement auto ----------
  async function purgeExpired() {
    if (!st.unlocked) return;
    const now = Date.now(); let n = 0;
    for (const m of [...st.msgs.values()]) if (m.exp && m.exp < now) { await dropMsg(m.id); n++; }
    if (n) renderList();
    if (pruneStatus()) { await saveStatus(); refreshTab(); }
  }

  // ---------- barre du bas, statut, appels, médias, profil ----------
  const TABS = [['status', 'Statut', 'status'], ['calls', 'Appels', 'phone'], ['media', 'Médias', 'grid'], ['chat', 'Discussion', 'chat'], ['me', 'Vous', 'user']];
  function tabbar(active) {
    const unread = [...st.msgs.values()].filter(m => m.from === 'peer' && m.status === 'recu').length;
    const newStatus = st.status.peer.some(x => !x.seen);
    return h('nav', { class: 'tabbar', 'aria-label': 'Navigation' }, TABS.map(([id, label, ic]) => {
      let ico = icon(ic, 'tabic');
      if (id === 'me' && st.settings.myPhoto) ico = h('img', { class: 'tabav', src: st.settings.myPhoto, alt: '' });
      const badge = id === 'chat' && unread && active !== 'chat' ? h('span', { class: 'tbadge', text: unread > 99 ? '99+' : String(unread) })
        : id === 'status' && newStatus ? h('span', { class: 'tdot' }) : null;
      return h('button', { class: 'tab' + (id === active ? ' on' : ''), type: 'button', 'aria-label': label, 'aria-current': id === active ? 'page' : null, onclick: () => openTab(id) },
        h('span', { class: 'tpill' }, ico, badge), h('span', { class: 'tlabel', text: label }));
    }));
  }
  function openTab(id) {
    ({ status: viewStatus, calls: viewCalls, media: viewMedia, chat: viewChat, me: viewSettings })[id]();
  }
  function refreshTab() {
    if (!st.unlocked) return;
    if (st.tab === 'status' && !document.querySelector('.story')) viewStatus();
    else if (st.tab === 'me' && document.querySelector('.tabbed')) { const nav = document.querySelector('.tabbar'); if (nav) nav.replaceWith(tabbar('me')); }
    else { const nav = document.querySelector('.tabbar'); if (nav) nav.replaceWith(tabbar(st.tab)); }
  }
  function tabPage(title, id, ...body) {
    st.tab = id;
    screen(h('div', { class: 'panel tabbed' }, h('header', { class: 'bar' }, h('strong', { class: 'ptitle big', text: title })),
      h('div', { class: 'pbody' }, ...body), tabbar(id)));
  }
  function avatarImg(src, cls, ring) {
    const img = h('img', { src: src || 'icons/logo-512.png', alt: '', class: 'avatar ' + (cls || '') });
    return ring ? h('span', { class: 'ring ' + ring }, img) : img;
  }
  function avatarBtn() {
    const active = st.status.peer.length, unseen = st.status.peer.some(x => !x.seen);
    const b = h('button', { class: 'avbtn', type: 'button', 'aria-label': active ? 'Voir son statut' : 'Voir son profil',
      onclick: () => active ? openStories(st.status.peer, true) : viewPeerProfile() },
      avatarImg(st.settings.peerPhoto, '', active ? (unseen ? 'new' : 'seen') : ''));
    return b;
  }

  const okAvatar = v => typeof v === 'string' && v.length <= MAX_AVATAR * 1.4 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
  function squareImage(f, size, maxLen) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(f); const img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
        c.width = c.height = Math.min(size, s);
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = 0.85, out = c.toDataURL('image/jpeg', q);
        while (out.length > maxLen && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        out.length > maxLen ? rej(new Error('trop grande')) : res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }
  function fitImage(f, max, maxLen) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(f); const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        let q = 0.8, out = c.toDataURL('image/jpeg', q);
        while (out.length > maxLen && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        out.length > maxLen ? rej(new Error('trop grande')) : res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }
  function pickFile(accept) {
    return new Promise(res => {
      const f = h('input', { type: 'file', accept, hidden: true });
      f.addEventListener('change', () => { res(f.files && f.files[0] || null); f.remove(); });
      document.body.append(f); f.click();
    });
  }

  // profil : partagé chiffré, une fois par clé de ta moitié
  async function shareProfile() {
    const ok = await sendControl({ t: 'profile', photo: st.settings.myPhoto || null, about: st.settings.about || '' });
    if (ok && st.peer) { st.settings.profileSentFor = st.peer.sign_pub; await saveSettings(); }
    return ok;
  }
  function shareProfileIfNeeded() {
    if (st.peer && !st.keyChanged && (st.settings.myPhoto || st.settings.about) && st.settings.profileSentFor !== st.peer.sign_pub) shareProfile();
  }
  function profileCard() {
    const about = h('input', { id: 'set-about', type: 'text', maxlength: String(MAX_ABOUT), value: st.settings.about || '', placeholder: 'Ex. : Toujours à toi ❤️' });
    const photo = h('button', { class: 'bigav', type: 'button', 'aria-label': 'Changer ma photo de profil', onclick: async () => {
      const f = await pickFile('image/*'); if (!f) return;
      try { st.settings.myPhoto = await squareImage(f, 480, MAX_AVATAR); } catch (e) { return toast('Photo impossible à utiliser.'); }
      await saveSettings(); viewSettings();
      toast((await shareProfile()) ? 'Photo envoyée à ' + peerName() + ', chiffrée.' : 'Photo enregistrée. Elle partira dès que possible.');
    } }, avatarImg(st.settings.myPhoto, 'xl'), h('span', { class: 'camdot' }, icon('cam', 'tiny')));
    return h('section', { class: 'card profile' }, photo,
      h('strong', { class: 'pname', text: st.settings.nom || 'Moi' }),
      h('small', { class: 'muted', text: st.me ? st.me.email : '' }),
      h('label', { for: 'set-about', text: 'Infos (vues par ta moitié)' }), about,
      h('div', { class: 'row' },
        h('button', { class: 'btn gold', type: 'button', text: 'Enregistrer', onclick: async () => {
          st.settings.about = about.value.trim().slice(0, MAX_ABOUT); await saveSettings();
          toast((await shareProfile()) ? 'Infos envoyées.' : 'Enregistré. Envoi dès le retour d’internet.');
        } }),
        st.settings.myPhoto ? h('button', { class: 'btn', type: 'button', text: 'Retirer la photo', onclick: async () => {
          st.settings.myPhoto = null; await saveSettings(); await shareProfile(); viewSettings();
        } }) : null));
  }
  function viewPeerProfile() {
    const hasPeer = st.peer || st.settings.peerBundle;
    const pic = st.settings.peerPhoto;
    st.tab = st.tab || 'chat';
    panel(peerName(),
      h('section', { class: 'card profile' },
        h('button', { class: 'bigav', type: 'button', 'aria-label': 'Agrandir la photo', onclick: () => pic && openViewer(pic) }, avatarImg(pic, 'xl', st.status.peer.length ? (st.status.peer.some(x => !x.seen) ? 'new' : 'seen') : '')),
        h('strong', { class: 'pname', text: peerName() }),
        h('p', { class: 'about', text: st.settings.peerAbout || (hasPeer ? 'Pas encore d’infos.' : 'Pas encore de compte.') }),
        h('div', { class: 'row center' },
          btnIcon('chat', 'Écrire', viewChat, 'round'), btnIcon('phone', 'Appel vocal', () => { viewChat(); startCall(false); }, 'round'),
          btnIcon('video', 'Appel vidéo', () => { viewChat(); startCall(true); }, 'round'))),
      st.status.peer.length ? h('button', { class: 'rowbtn', type: 'button', onclick: () => openStories(st.status.peer, true) }, icon('status'), h('span', { text: 'Voir son statut (' + st.status.peer.length + ')' })) : null,
      h('button', { class: 'rowbtn', type: 'button', onclick: () => viewSecurity() }, icon('shield'), h('span', { text: 'Code de sécurité' })));
  }

  // statut : 24 h, chiffré de bout en bout comme les messages
  async function loadStatus() {
    st.status = { mine: [], peer: [] };
    const box = await S.get('kv', 'status:' + uid()).catch(() => null);
    if (box) { try { const v = await C.localOpen(st.keys.db, box); if (v && Array.isArray(v.mine) && Array.isArray(v.peer)) st.status = v; } catch (e) {} }
    if (pruneStatus()) await saveStatus();
  }
  async function saveStatus() { if (st.keys) await S.put('kv', 'status:' + uid(), await C.localSeal(st.keys.db, st.status)); }
  function pruneStatus() {
    const lim = Date.now() - DAY, a = st.status.mine.length + st.status.peer.length;
    st.status.mine = st.status.mine.filter(x => x.ts > lim); st.status.peer = st.status.peer.filter(x => x.ts > lim);
    return a !== st.status.mine.length + st.status.peer.length;
  }
  const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'à l’instant' : m < 60 ? 'il y a ' + m + ' min' : 'il y a ' + Math.round(m / 60) + ' h'; };
  async function postStatus(item) {
    if (!st.peer || st.keyChanged) return toast('Ta moitié n’a pas encore de compte : le statut ne peut pas partir.');
    const x = Object.assign({ sid: C.randId(), ts: Date.now(), seenAt: 0 }, item);
    const ok = await sendControl({ t: 'status', sid: x.sid, kind: x.kind, data: x.data || undefined, text: x.text || '', bg: x.bg || 0, ts: x.ts });
    if (!ok) return toast('Pas de connexion : statut non envoyé.');
    st.status.mine.push(x); await saveStatus(); viewStatus(); toast('Statut publié pour 24 h.');
  }
  function viewStatus() {
    pruneStatus();
    const mine = st.status.mine, peer = st.status.peer, last = a => a[a.length - 1];
    const addPhoto = async () => {
      const f = await pickFile('image/*'); if (!f) return;
      let data; try { data = await fitImage(f, 1280, MAX_STATUS_IMG); } catch (e) { return toast('Photo trop lourde.'); }
      const cap = await askText('Ajouter une légende ?', 'Légende (facultatif)', 200);
      if (cap === null) return;
      postStatus({ kind: 'image', data, text: cap });
    };
    const addText = () => composeTextStatus();
    tabPage('Statut', 'status',
      h('section', { class: 'card' },
        h('div', { class: 'srow' },
          h('button', { class: 'avbtn', type: 'button', 'aria-label': mine.length ? 'Voir mon statut' : 'Ajouter un statut', onclick: () => mine.length ? openStories(mine, false) : addPhoto() },
            avatarImg(st.settings.myPhoto, 'md', mine.length ? 'seen' : ''), mine.length ? null : h('span', { class: 'plusdot' }, icon('plus', 'tiny'))),
          h('div', { class: 'stext' }, h('strong', { text: 'Mon statut' }),
            h('small', { class: 'muted', text: mine.length ? mine.length + ' publié' + (mine.length > 1 ? 's' : '') + ' · ' + ago(last(mine).ts) : 'Partage une photo ou un texte pendant 24 h' }))),
        h('div', { class: 'row' },
          h('button', { class: 'btn gold', type: 'button', onclick: addPhoto }, icon('cam', 'tiny'), ' Photo'),
          h('button', { class: 'btn', type: 'button', onclick: addText }, icon('text', 'tiny'), ' Texte'))),
      mine.length ? h('section', { class: 'card' }, h('h3', { text: 'Mes statuts' }),
        [...mine].reverse().map(x => h('div', { class: 'srow' },
          h('button', { class: 'thumb', type: 'button', 'aria-label': 'Voir', onclick: () => openStories([x], false), style: x.kind === 'text' ? 'background:' + STATUS_BG[x.bg | 0] : '' },
            x.kind === 'image' ? h('img', { src: x.data, alt: '' }) : h('span', { text: x.text.slice(0, 12) })),
          h('div', { class: 'stext' }, h('strong', { text: ago(x.ts) }),
            h('small', { class: x.seenAt ? 'ok' : 'muted' }, icon('eye', 'tiny'), x.seenAt ? ' Vu par ' + peerName() : ' Pas encore vu')),
          btnIcon('trash', 'Supprimer ce statut', async () => {
            st.status.mine = st.status.mine.filter(y => y.sid !== x.sid); await saveStatus();
            sendControl({ t: 'status-del', sid: x.sid }); viewStatus();
          })))) : null,
      h('section', { class: 'card' }, h('h3', { text: 'Récents' }),
        peer.length ? h('button', { class: 'srow plain', type: 'button', onclick: () => openStories(peer, true) },
          avatarImg(st.settings.peerPhoto, 'md', peer.some(x => !x.seen) ? 'new' : 'seen'),
          h('div', { class: 'stext' }, h('strong', { text: peerName() }), h('small', { class: 'muted', text: ago(last(peer).ts) })))
          : h('p', { class: 'muted', text: 'Aucun statut de ' + peerName() + ' pour le moment.' })),
      h('p', { class: 'note small' }, icon('lock', 'tiny'), ' Vos statuts sont chiffrés de bout en bout et disparaissent après 24 h.'));
  }
  function askText(title, placeholder, max) {
    return new Promise(res => {
      const inp = h('input', { type: 'text', maxlength: String(max), placeholder });
      const close = v => { m.remove(); res(v); };
      const m = h('div', { class: 'modal', role: 'dialog' }, h('div', { class: 'sheet' }, h('h3', { text: title }), inp,
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', text: 'Annuler', onclick: () => close(null) }),
          h('button', { class: 'btn gold', type: 'button', text: 'Publier', onclick: () => close(inp.value.trim()) }))));
      document.body.append(m); setTimeout(() => inp.focus(), 50);
    });
  }
  function composeTextStatus() {
    let bg = 0;
    const ta = h('textarea', { class: 'stxt', maxlength: String(MAX_STATUS_TXT), placeholder: 'Écris ton statut…', 'aria-label': 'Texte du statut' });
    const close = () => ov.remove();
    const ov = h('div', { class: 'story compose', style: 'background:' + STATUS_BG[0] },
      h('div', { class: 'stop' }, btnIcon('x', 'Fermer', close, 'light'),
        h('div', { class: 'swatches' }, STATUS_BG.map((c, i) => h('button', { class: 'sw', type: 'button', 'aria-label': 'Couleur ' + (i + 1), style: 'background:' + c, onclick: () => { bg = i; ov.style.background = c; } })))),
      ta,
      h('button', { class: 'ibtn send big', type: 'button', 'aria-label': 'Publier le statut', onclick: () => { const t = ta.value.trim(); if (!t) return; close(); postStatus({ kind: 'text', text: t, bg }); } }, icon('send')));
    document.body.append(ov); setTimeout(() => ta.focus(), 50);
  }
  function openStories(list, isPeer) {
    if (!list.length) return;
    let i = isPeer ? Math.max(0, list.findIndex(x => !x.seen)) : 0, t = 0;
    const bars = h('div', { class: 'sbars' }), stage = h('div', { class: 'sstage' }), cap = h('p', { class: 'scap' });
    const who = h('div', { class: 'swho' }, avatarImg(isPeer ? st.settings.peerPhoto : st.settings.myPhoto, 'sm'), h('div', {}, h('strong', { text: isPeer ? peerName() : 'Mon statut' }), h('small', { class: 'stime' })));
    const ov = h('div', { class: 'story', role: 'dialog', 'aria-label': 'Statut' }, bars, h('div', { class: 'stop' }, who, btnIcon('x', 'Fermer', () => done(), 'light')), stage, cap);
    const done = () => { clearTimeout(t); ov.remove(); if (st.tab === 'status') viewStatus(); else renderHeader(); };
    const show = () => {
      clearTimeout(t);
      if (i < 0) i = 0; if (i >= list.length) return done();
      const x = list[i];
      bars.replaceChildren(...list.map((_, k) => h('span', { class: k < i ? 'done' : k === i ? 'cur' : '' })));
      ov.style.background = x.kind === 'text' ? STATUS_BG[x.bg | 0] : '#000';
      stage.replaceChildren(x.kind === 'image' ? h('img', { src: x.data, alt: 'Statut' }) : h('p', { class: 'sbig', text: x.text }));
      cap.textContent = x.kind === 'image' ? (x.text || '') : '';
      who.querySelector('.stime').textContent = ago(x.ts);
      if (isPeer && !x.seen) { x.seen = true; saveStatus(); sendControl({ t: 'status-seen', sid: x.sid }); }
      t = setTimeout(() => { i++; show(); }, 6000);
    };
    ov.addEventListener('click', e => { if (e.target.closest('.stop')) return; const r = ov.getBoundingClientRect(); i += (e.clientX - r.left) < r.width / 3 ? -1 : 1; show(); });
    document.body.append(ov); show();
  }

  function viewCalls() {
    const log = [...st.msgs.values()].filter(m => m.from === 'sys' && /^Appel (vocal|vidéo)/.test(m.body || '')).sort((a, b) => b.ts - a.ts).slice(0, 100);
    tabPage('Appels', 'calls',
      h('section', { class: 'card' },
        h('div', { class: 'srow' }, avatarImg(st.settings.peerPhoto, 'md'), h('div', { class: 'stext' }, h('strong', { text: peerName() }), h('small', { class: 'muted' }, icon('lock', 'tiny'), ' Appels chiffrés de bout en bout'))),
        h('div', { class: 'row' },
          h('button', { class: 'btn gold', type: 'button', onclick: () => { viewChat(); startCall(false); } }, icon('phone', 'tiny'), ' Appel vocal'),
          h('button', { class: 'btn gold', type: 'button', onclick: () => { viewChat(); startCall(true); } }, icon('video', 'tiny'), ' Appel vidéo'))),
      h('section', { class: 'card' }, h('h3', { text: 'Récents' }),
        log.length ? log.map(m => {
          const bad = /manqué|refusé|sans réponse/.test(m.body);
          return h('div', { class: 'crow' }, icon(/vidéo/.test(m.body) ? 'video' : 'phone', bad ? 'bad' : ''),
            h('div', { class: 'stext' }, h('strong', { class: bad ? 'bad' : '', text: m.body.split(' · ')[0] }), h('small', { class: 'muted', text: fmtDay(m.ts) + ' · ' + fmtTime(m.ts) + (/ · \d+ ?min|\d+ s$/.test(m.body) ? ' · ' + m.body.split(' · ')[1] : '') })),
            btnIcon(/vidéo/.test(m.body) ? 'video' : 'phone', 'Rappeler', () => { viewChat(); startCall(/vidéo/.test(m.body)); }));
        }) : h('p', { class: 'muted', text: 'Aucun appel pour le moment.' })));
  }

  function viewMedia() {
    const items = [...st.msgs.values()].filter(m => !m.deleted && m.body && (m.t === 'image' || m.t === 'video')).sort((a, b) => b.ts - a.ts);
    tabPage('Médias', 'media',
      items.length ? h('div', { class: 'mgrid' }, items.map(m => m.t === 'image'
        ? h('button', { class: 'mcell', type: 'button', 'aria-label': 'Photo', onclick: () => openViewer(m.body.data) }, h('img', { src: m.body.data, alt: '', loading: 'lazy' }))
        : h('button', { class: 'mcell', type: 'button', 'aria-label': 'Vidéo', onclick: () => openVideo(m) }, m.body.thumb ? h('img', { src: m.body.thumb, alt: '' }) : null, icon('play', 'playic'))))
        : h('div', { class: 'empty' }, icon('grid'), h('p', { text: 'Les photos et vidéos que vous vous envoyez apparaîtront ici.' })),
      h('p', { class: 'note small' }, icon('lock', 'tiny'), ' Gardées seulement sur ce téléphone, chiffrées par ton code.'));
  }

  // ---------- réglages ----------
  function panel(title, ...body) {
    const back = btnIcon('back', 'Retour', () => { st.tab === 'me' ? viewSettings() : viewChat(); });
    screen(h('div', { class: 'panel' }, h('header', { class: 'bar' }, back, h('strong', { class: 'ptitle', text: title })), h('div', { class: 'pbody' }, ...body)));
  }

  function viewSettings() {
    const nom = h('input', { id: 'set-nom', type: 'text', maxlength: '40', value: st.settings.nom || '' });
    const nick = h('input', { id: 'set-nick', type: 'text', maxlength: '40', value: st.settings.peerNick || '', placeholder: (st.peer && st.peer.nom) || '' });
    const ttl = h('select', { id: 'set-ttl' }, Object.keys(TTL_LABEL).map(k => h('option', { value: k, selected: Number(k) === (st.settings.ttl || 0), text: TTL_LABEL[k] })));
    const lk = h('select', { id: 'set-lock' }, [[0, 'Tout de suite'], [60, 'Après 1 minute'], [300, 'Après 5 minutes'], [1800, 'Après 30 minutes']].map(([v, l]) => h('option', { value: String(v), selected: v === st.settings.lockAfter, text: l })));
    const verified = st.settings.peerPin && st.settings.peerPin.verified;
    const notif = h('select', { id: 'set-notif' }, [['type', 'Type de message et nombre'], ['discret', 'Discret : « Nouveau message »'], ['off', 'Désactivées']].map(([v, l]) => h('option', { value: v, text: l })));
    notifMode().then(v => { notif.value = v; });
    notif.addEventListener('change', async () => {
      await S.put('kv', 'notif-mode', notif.value);
      if (notif.value === 'off') { await disablePush(); toast('Notifications désactivées.'); }
      else if (await enablePush(true)) toast('Notifications : ' + notif.options[notif.selectedIndex].text + '.');
    });
    tabPage('Vous', 'me', profileCard(), themeCard(),
      h('section', { class: 'card' }, h('h3', { text: 'Sécurité' }),
        h('button', { class: 'rowbtn', type: 'button', onclick: () => viewSecurity() }, icon('shield'), h('span', { text: 'Code de sécurité' }), h('em', { class: verified ? 'ok' : 'warn', text: verified ? 'Vérifié' : 'À vérifier' })),
        h('label', { for: 'set-ttl', text: 'Messages éphémères (s’effacent tout seuls)' }), ttl,
        h('label', { for: 'set-notif', text: 'Notifications' }), notif,
        h('p', { class: 'hint', text: '« Type de message » affiche Photo, Vidéo ou Vocal et le nombre. « Discret » affiche seulement « Nouveau message ». Le texte des messages n’apparaît jamais.' }),
        h('label', { for: 'set-lock', text: 'Verrouillage quand tu quittes l’appli' }), lk,
        h('button', { class: 'btn', type: 'button', text: 'Changer mon code secret', onclick: viewChangePin })),
      h('section', { class: 'card' }, h('h3', { text: 'Profil' }),
        h('label', { for: 'set-nom', text: 'Ton prénom (vu par ta moitié)' }), nom,
        h('label', { for: 'set-nick', text: 'Comment tu l’appelles (seulement sur ton téléphone)' }), nick,
        h('button', { class: 'btn gold', type: 'button', text: 'Enregistrer', onclick: async () => {
          st.settings.nom = nom.value.trim() || st.settings.nom; st.settings.peerNick = nick.value.trim();
          await saveSettings(); connect(); toast('Enregistré.');
        } })),
      h('section', { class: 'card' }, h('h3', { text: 'Comment vos messages sont protégés' }),
        h('ul', { class: 'facts' },
          h('li', { text: 'Chiffrés sur ton téléphone avant de partir (AES-256, clés P-256). Le serveur ne voit que du code illisible.' }),
          h('li', { text: 'Chaque message a sa propre clé. Tes clés de réception changent tous les 7 jours.' }),
          h('li', { text: 'Chaque message est signé : personne ne peut se faire passer pour l’un de vous.' }),
          h('li', { text: 'Le serveur efface chaque message dès qu’il est reçu. L’historique reste seulement sur vos téléphones, chiffré par votre code.' }),
          h('li', { text: 'Seules vos deux adresses e-mail peuvent avoir un compte.' }),
          h('li', { text: 'Les vidéos sont chiffrées avant d’être déposées, puis effacées du serveur dès réception.' }),
          h('li', { text: 'Les notifications ne contiennent jamais le texte. Le type (Photo, Vocal…) est lui aussi chiffré.' }))),
      h('section', { class: 'card' }, h('h3', { text: 'Ce téléphone' }),
        h('button', { class: 'btn', type: 'button', text: 'Effacer la discussion sur ce téléphone', onclick: async () => {
          if (await ask('Effacer la discussion ?', 'Les messages seront effacés de ce téléphone seulement.', [{ label: 'Annuler', value: null }, { label: 'Effacer', value: 1, cls: 'danger' }])) {
            for (const id of [...st.msgs.keys()]) await dropMsg(id); toast('Discussion effacée.');
          }
        } }),
        h('button', { class: 'btn', type: 'button', text: 'Se déconnecter', onclick: async () => { lock(true); await A.signOut(); st.me = null; viewAuth('login'); } }),
        h('button', { class: 'btn danger', type: 'button', text: 'Tout effacer sur ce téléphone', onclick: async () => {
          if (await ask('Tout effacer ?', 'Clés, messages et réglages de ce téléphone seront détruits. Ta moitié verra un nouveau code de sécurité.', [{ label: 'Annuler', value: null }, { label: 'Tout effacer', value: 1, cls: 'danger' }])) {
            lock(true); await wipeDevice(); await A.signOut().catch(() => {}); location.reload();
          }
        } })),
      h('p', { class: 'note small', text: 'The Queen ' + VERSION + ' · ' + (st.me ? st.me.email : '') }));
    ttl.addEventListener('change', async () => {
      const v = Number(ttl.value);
      st.settings.ttl = v; await saveSettings();
      await addSystem(v ? 'Tu as activé les messages éphémères : ' + TTL_LABEL[v] + '.' : 'Tu as désactivé les messages éphémères.');
      if (!(await sendControl({ t: 'ttl', ttl: v }))) toast('Ta moitié sera prévenue au retour d’internet.');
    });
    lk.addEventListener('change', async () => { st.settings.lockAfter = Number(lk.value); await saveSettings(); });
  }

  async function viewSecurity(otherRow) {
    const peer = otherRow || st.peer || st.settings.peerBundle;
    if (!peer) { toast('Ta moitié n’a pas encore de compte.'); return; }
    const num = await C.safetyNumber({ uid: uid(), pub: st.vault.sign.pub }, { uid: peer.user_id, pub: peer.sign_pub });
    const groups = num.match(/.{5}/g);
    const verified = !otherRow && st.settings.peerPin && st.settings.peerPin.verified;
    panel('Code de sécurité',
      h('section', { class: 'card center-text' },
        h('p', { text: 'Ensemble, ou en appel vidéo en lisant les chiffres à voix haute. Ce code doit être exactement le même chez toi et chez ' + (st.settings.peerNick || peer.nom || 'ta moitié') + '.' }),
        h('div', { class: 'safety', 'aria-label': 'Code de sécurité' }, groups.map(g => h('span', { text: g }))),
        verified ? h('p', { class: 'ok', text: 'Vous avez déjà vérifié ce code.' }) : null,
        !otherRow ? h('div', { class: 'col' },
          h('button', { class: 'btn gold', type: 'button', text: 'Les codes sont identiques', onclick: async () => {
            st.settings.peerPin.verified = true; await saveSettings(); toast('Code vérifié.'); viewChat();
          } }),
          h('button', { class: 'btn', type: 'button', text: 'Les codes sont différents', onclick: () => ask('Codes différents', 'N’envoyez rien de sensible. Fermez puis rouvrez l’appli sur les deux téléphones et comparez encore. Si ça reste différent, quelqu’un essaie peut-être de s’interposer.', [{ label: 'Compris', value: 1 }]) })) : null),
      h('p', { class: 'note small', text: 'Ce code vient de vos clés. Il change seulement si l’un de vous réinstalle l’appli ou change de téléphone.' }));
  }

  function viewChangePin() {
    const o = h('input', { id: 'old', type: 'password', required: true, inputmode: 'numeric', autocomplete: 'current-password' });
    const n1 = h('input', { id: 'new1', type: 'password', required: true, minlength: '6', inputmode: 'numeric', autocomplete: 'new-password' });
    const n2 = h('input', { id: 'new2', type: 'password', required: true, minlength: '6', inputmode: 'numeric', autocomplete: 'new-password' });
    const msg = h('p', { class: 'form-msg', role: 'status' });
    panel('Changer mon code secret', h('form', { class: 'card form', onsubmit: async e => {
      e.preventDefault(); msg.textContent = '';
      if (n1.value.length < 6 || n1.value !== n2.value) { msg.textContent = 'Le nouveau code doit faire 6 caractères ou plus, et être tapé deux fois pareil.'; return; }
      try {
        await C.openVault(st.blob, o.value);
        const { blob, pinKey } = await C.sealVault(st.vault, n1.value);
        await S.put('kv', 'vault:' + uid(), blob); st.blob = blob; st.pinKey = pinKey;
        toast('Code secret changé.'); viewChat();
      } catch (err) { msg.textContent = err.code === 'PIN' ? 'Ancien code incorrect.' : 'Erreur : ' + err.message; }
    } }, h('label', { for: 'old', text: 'Code actuel' }), o, h('label', { for: 'new1', text: 'Nouveau code' }), n1, h('label', { for: 'new2', text: 'Nouveau code, encore une fois' }), n2,
      h('button', { class: 'btn gold', type: 'submit', text: 'Changer' }), msg));
  }

  async function wipeDevice() {
    const me = uid();
    if (me) { await S.del('kv', 'vault:' + me); await S.del('kv', 'settings:' + me); await S.del('kv', 'fails:' + me); }
    const all = await S.keys('msgs');
    const rows = await S.all('msgs');
    for (let i = 0; i < all.length; i++) if (!me || (rows[i] && rows[i].u === me)) await S.del('msgs', all[i]);
    await S.clear('media');
    for (const k of ['notif-key', 'notif-name', 'notif-pending']) await S.del('kv', k);
    await disablePush();
  }

  // ---------- vie privée et verrouillage ----------
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      document.body.classList.add('veil');
      st.hiddenAt = Date.now();
      if (st.unlocked && st.settings && st.settings.lockAfter === 0 && !call.active) lock();
    } else {
      document.body.classList.remove('veil');
      if (st.unlocked && st.settings && st.hiddenAt && !call.active && Date.now() - st.hiddenAt > st.settings.lockAfter * 1000) lock();
      else if (st.unlocked) { pullInbox(); flushOutbox(); markRead(); }
      else clearNotifs();
    }
  });
  window.addEventListener('online', () => { if (st.unlocked) { renderHeader(); refreshPeer().then(() => { pullInbox(); flushOutbox(); }); } });
  window.addEventListener('offline', () => renderHeader());

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  self.QueenApp = { st, call, version: VERSION };
  boot();
})();
