// Stockage local du téléphone (IndexedDB). Tout ce qui est sensible y est déjà chiffré.
(function (g) {
  'use strict';
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('the-queen', 1);
      r.onupgradeneeded = () => { const d = r.result; ['kv', 'msgs', 'media'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function run(store, mode, fn) {
    return open().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }
  g.QueenStore = {
    get: (s, k) => run(s, 'readonly', o => o.get(k)),
    put: (s, k, v) => run(s, 'readwrite', o => o.put(v, k)),
    del: (s, k) => run(s, 'readwrite', o => o.delete(k)),
    all: s => run(s, 'readonly', o => o.getAll()),
    keys: s => run(s, 'readonly', o => o.getAllKeys()),
    clear: s => run(s, 'readwrite', o => o.clear()),
    async persist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {} return false; }
  };
})(self);
