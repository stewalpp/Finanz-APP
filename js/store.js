/* ============================================================================
   js/store.js — window.Store
   Offline-first dual-mode data store for "Unsere Finanzen".

   Mode 'local': localStorage only.
   Mode 'cloud': the user's own Firebase project (Firestore with offline
   persistence). localStorage always keeps a mirror for instant boot.

   Classic script. The only dynamic import() allowed in this app lives here
   (Firebase JS SDK 10.12.5 from the gstatic CDN), loaded lazily on connect.
   ========================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------- constants

  const LS_TX = 'cf.transactions';
  const LS_RULES = 'cf.rules';
  const LS_SETTINGS = 'cf.settings';
  const LS_DISMISSED = 'cf.dismissed';
  const LS_CLOUD = 'cf.cloud';

  const FB_BASE = 'https://www.gstatic.com/firebasejs/10.12.5/';
  const FB_APP_NAME = 'unsere-finanzen';

  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const BATCH_LIMIT = 450; // Firestore allows 500 ops per batch; stay below.

  // -------------------------------------------------------------------- state

  let transactions = [];
  let rules = [];
  let settings = defaultSettings();
  let dismissed = [];

  let mode = 'local';            // 'local' | 'cloud'
  let cloud = null;              // { app, db, auth, fs, code, projectId, unsubs[] }
  let cloudMeta = null;          // { code, projectId } from 'cf.cloud' (even if offline)
  let fbMods = null;             // cached Firebase module namespaces

  const listeners = [];

  // ------------------------------------------------------------ tiny helpers

  function nowISO() { return new Date().toISOString(); }

  function currentMonthKey() { return App.todayISO().slice(0, 7); }

  function emit() {
    for (const fn of listeners) {
      try { fn(); } catch (e) { console.error('Store-Listener fehlgeschlagen:', e); }
    }
  }

  function fail(message) {
    const err = new Error(message);
    err.german = true;
    throw err;
  }

  // Remove keys whose value is `undefined` (so a patch can never poison state).
  function scrub(obj) {
    const out = {};
    for (const k of Object.keys(obj || {})) {
      if (obj[k] !== undefined) out[k] = obj[k];
    }
    return out;
  }

  // Deep-copy a value for Firestore: every `undefined` becomes `null`
  // (Firestore rejects undefined). Arrays/objects handled recursively.
  function clean(value) {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) return value.map(clean);
    if (typeof value === 'object') {
      const out = {};
      for (const k of Object.keys(value)) out[k] = clean(value[k]);
      return out;
    }
    return value;
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // ------------------------------------------------------ localStorage access

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      const value = JSON.parse(raw);
      return value === null || value === undefined ? fallback : value;
    } catch (e) {
      console.warn('Konnte "' + key + '" nicht lesen:', e);
      return fallback;
    }
  }

  function readArray(key) {
    const v = readJSON(key, []);
    return Array.isArray(v) ? v : [];
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Konnte "' + key + '" nicht speichern:', e);
    }
  }

  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function persistTx() { writeJSON(LS_TX, transactions); }
  function persistRules() { writeJSON(LS_RULES, rules); }
  function persistSettings() { writeJSON(LS_SETTINGS, settings); }
  function persistDismissed() { writeJSON(LS_DISMISSED, dismissed); }
  function persistAll() { persistTx(); persistRules(); persistSettings(); persistDismissed(); }

  // ------------------------------------------------------------- data shapes

  function defaultSettings() {
    return {
      onboarded: false,
      members: [
        { id: 'p1', name: 'Partner 1', color: '#0A84FF' },
        { id: 'p2', name: 'Partner 2', color: '#FF375F' }
      ]
    };
  }

  function normalizeSettings(raw) {
    const def = defaultSettings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return def;
    const out = Object.assign({}, def, scrub(raw));
    out.onboarded = !!out.onboarded;
    const given = Array.isArray(raw.members) ? raw.members : [];
    out.members = def.members.map((dm) => {
      const found = given.find((m) => m && m.id === dm.id) || {};
      return {
        id: dm.id,
        name: typeof found.name === 'string' && found.name ? found.name : dm.name,
        color: typeof found.color === 'string' && found.color ? found.color : dm.color
      };
    });
    return out;
  }

  // Build a complete, Firestore-safe Transaction object (no undefined fields).
  function normalizeTx(raw) {
    const amount = Math.round(Number(raw.amountCents));
    const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.date)
      ? raw.date.slice(0, 10)
      : App.todayISO();
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : App.uid(),
      type: raw.type === 'income' ? 'income' : 'expense',
      amountCents: isFinite(amount) ? amount : 0,
      category: typeof raw.category === 'string' && raw.category ? raw.category : 'sonstiges',
      note: typeof raw.note === 'string' ? raw.note : '',
      date: date,
      payerId: raw.payerId === 'p2' ? 'p2' : 'p1',
      shared: !!raw.shared,
      recurringId: typeof raw.recurringId === 'string' && raw.recurringId ? raw.recurringId : null,
      createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : nowISO(),
      updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : nowISO()
    };
  }

  // Build a complete, Firestore-safe RecurringRule object.
  function normalizeRule(raw) {
    const amount = Math.round(Number(raw.amountCents));
    const type = raw.type === 'income' ? 'income' : 'expense';
    const rawInterval = raw.interval === 'semiannual' ? 'halfyearly' : raw.interval;
    const interval = rawInterval === 'quarterly' || rawInterval === 'halfyearly' || rawInterval === 'yearly'
      ? rawInterval
      : 'monthly';
    const shared = !!raw.shared;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : App.uid(),
      name: typeof raw.name === 'string' ? raw.name : '',
      type: type,
      amountCents: isFinite(amount) ? amount : 0,
      category: typeof raw.category === 'string' && raw.category ? raw.category : 'sonstiges',
      interval: interval,
      dueDay: clampInt(raw.dueDay, 1, 28, 1),
      dueMonth: clampInt(raw.dueMonth, 1, 12, 1),
      anchorMonth: typeof raw.anchorMonth === 'string' && /^\d{4}-\d{2}$/.test(raw.anchorMonth)
        ? raw.anchorMonth
        : currentMonthKey(),
      payerId: raw.payerId === 'p2' ? 'p2' : 'p1',
      shared: shared,
      privateExpense: type === 'expense' && !shared && raw.privateExpense === true,
      active: raw.active !== false,
      source: raw.source === 'detected' ? 'detected' : 'manual',
      createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : nowISO(),
      updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : nowISO()
    };
  }

  // Import validators: return null for rows that are beyond repair.
  function importTx(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const amount = Math.round(Number(raw.amountCents));
    if (!isFinite(amount) || amount <= 0) return null;
    if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(raw.date)) return null;
    return normalizeTx(raw);
  }

  function importRule(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const amount = Math.round(Number(raw.amountCents));
    if (!isFinite(amount) || amount <= 0) return null;
    if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
    return normalizeRule(raw);
  }

  // -------------------------------------------------------- cloud: SDK & app

  async function loadFirebase() {
    if (fbMods) return fbMods;
    try {
      const [appM, authM, fsM] = await Promise.all([
        import(FB_BASE + 'firebase-app.js'),
        import(FB_BASE + 'firebase-auth.js'),
        import(FB_BASE + 'firebase-firestore.js')
      ]);
      fbMods = { app: appM, auth: authM, fs: fsM };
      return fbMods;
    } catch (e) {
      console.warn('Firebase-SDK-Import fehlgeschlagen:', e);
      fail('Firebase-SDK konnte nicht geladen werden – bitte prüfe deine Internetverbindung.');
    }
  }

  // Lenient parsing of the firebaseConfig the user copies from the Firebase
  // console. Accepts strict JSON as well as the JS object literal snippet
  // (bare keys, single quotes, trailing commas, surrounding code/comments).
  function parseConfig(text) {
    const MSG = 'Konfiguration unvollständig – bitte den kompletten firebaseConfig-Block einfügen.';
    if (typeof text !== 'string' || !text.trim()) fail(MSG);
    const raw = text.trim();
    let obj = null;
    try { obj = JSON.parse(raw); } catch (e) { /* not strict JSON, try lenient path */ }
    if (!obj || typeof obj !== 'object') {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        let s = match[0];
        // strip // line comments (but not the "//" inside "https://..." values)
        s = s.replace(/(^|[{},\s])\/\/[^\n]*/g, '$1');
        // single-quoted strings -> double-quoted
        s = s.replace(/'([^'\n]*)'/g, '"$1"');
        // quote bare keys:  apiKey:  ->  "apiKey":
        s = s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
        // drop trailing commas
        s = s.replace(/,\s*([}\]])/g, '$1');
        try { obj = JSON.parse(s); } catch (e) { obj = null; }
      }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail(MSG);
    if (!obj.apiKey || !obj.projectId || !obj.appId) fail(MSG);
    return obj;
  }

  // Map raw Firebase errors to readable German messages.
  function germanError(e) {
    if (e && e.german) return e;
    const code = String((e && e.code) || '');
    let msg;
    if (code === 'auth/operation-not-allowed' ||
        code === 'auth/configuration-not-found' ||
        code === 'auth/admin-restricted-operation') {
      msg = 'Anonyme Anmeldung ist in Firebase nicht aktiviert (Authentication → Sign-in method → Anonym).';
    } else if (/api-key/.test(code)) {
      msg = 'Der API-Schlüssel ist ungültig – bitte prüfe die Web-App-Konfiguration.';
    } else if (code === 'auth/network-request-failed' || code === 'unavailable') {
      msg = 'Keine Verbindung zu Firebase – bitte prüfe deine Internetverbindung.';
    } else if (code === 'permission-denied') {
      msg = 'Zugriff verweigert – bitte prüfe die Firestore-Sicherheitsregeln.';
    } else {
      msg = 'Verbindung fehlgeschlagen: ' + ((e && (e.message || e.code)) || 'Unbekannter Fehler');
    }
    const err = new Error(msg);
    err.german = true;
    return err;
  }

  // ------------------------------------------------------- cloud: connection

  async function connect(config, code, opts) {
    const mods = await loadFirebase();
    let app = null;
    try {
      // Remove a stale app instance from an earlier connect in this session.
      const prior = mods.app.getApps().find((a) => a.name === FB_APP_NAME);
      if (prior) {
        try { await mods.app.deleteApp(prior); } catch (e) { /* ignore */ }
      }
      app = mods.app.initializeApp(config, FB_APP_NAME);

      let db;
      try {
        db = mods.fs.initializeFirestore(app, {
          localCache: mods.fs.persistentLocalCache({
            tabManager: mods.fs.persistentMultipleTabManager()
          })
        });
      } catch (e) {
        db = mods.fs.getFirestore(app);
      }

      // Auth: wait for a possibly persisted anonymous user first (works
      // offline), only then sign in anonymously if needed.
      const auth = mods.auth.getAuth(app);
      await new Promise((resolve) => {
        const stop = mods.auth.onAuthStateChanged(auth, () => { stop(); resolve(); }, () => resolve());
      });
      if (!auth.currentUser) await mods.auth.signInAnonymously(auth);

      if (opts.createHousehold) {
        await mods.fs.setDoc(mods.fs.doc(db, 'households', code), { createdAt: nowISO() }, { merge: true });
        await mods.fs.setDoc(mods.fs.doc(db, 'households', code, 'meta', 'settings'), clean(settings));
      } else if (opts.verifyHousehold) {
        const snap = await mods.fs.getDoc(mods.fs.doc(db, 'households', code));
        if (!snap.exists()) fail('Kein Haushalt mit diesem Code gefunden.');
      }

      cloud = {
        app: app,
        db: db,
        auth: auth,
        fs: mods.fs,
        code: code,
        projectId: typeof config.projectId === 'string' ? config.projectId : null,
        unsubs: []
      };

      if (opts.uploadLocal) await uploadAllToCloud();

      wireSnapshots();
      mode = 'cloud';
      cloudMeta = { code: code, projectId: cloud.projectId };
    } catch (e) {
      cloud = null;
      mode = 'local';
      if (app) {
        try { await mods.app.deleteApp(app); } catch (e2) { /* ignore */ }
      }
      throw germanError(e);
    }
  }

  function wireSnapshots() {
    const fs = cloud.fs;
    const db = cloud.db;
    const code = cloud.code;
    const onErr = (label) => (err) => console.warn('Firestore-Snapshot (' + label + ') fehlgeschlagen:', err);

    cloud.unsubs.push(fs.onSnapshot(
      fs.collection(db, 'households', code, 'tx'),
      (snap) => {
        // An empty pure-cache snapshot carries no information; keep the mirror.
        if (snap.metadata && snap.metadata.fromCache && snap.empty && transactions.length > 0) return;
        transactions = snap.docs.map((d) => normalizeTx(d.data()));
        persistTx();
        emit();
      },
      onErr('Buchungen')
    ));

    cloud.unsubs.push(fs.onSnapshot(
      fs.collection(db, 'households', code, 'rules'),
      (snap) => {
        if (snap.metadata && snap.metadata.fromCache && snap.empty && rules.length > 0) return;
        rules = snap.docs.map((d) => normalizeRule(d.data()));
        persistRules();
        emit();
      },
      onErr('Fixkosten')
    ));

    cloud.unsubs.push(fs.onSnapshot(
      fs.doc(db, 'households', code, 'meta', 'settings'),
      (snap) => {
        if (!snap.exists()) return;
        settings = normalizeSettings(snap.data());
        persistSettings();
        emit();
      },
      onErr('Einstellungen')
    ));
  }

  function teardownCloud() {
    if (cloud) {
      for (const unsub of cloud.unsubs) {
        try { unsub(); } catch (e) { /* ignore */ }
      }
      const app = cloud.app;
      cloud = null;
      if (fbMods && fbMods.app && app) {
        fbMods.app.deleteApp(app).catch(() => { /* ignore */ });
      }
    }
    mode = 'local';
  }

  // ----------------------------------------------------- cloud: doc plumbing

  function txRef(id) { return cloud.fs.doc(cloud.db, 'households', cloud.code, 'tx', id); }
  function ruleRef(id) { return cloud.fs.doc(cloud.db, 'households', cloud.code, 'rules', id); }
  function settingsRef() { return cloud.fs.doc(cloud.db, 'households', cloud.code, 'meta', 'settings'); }
  function householdRef() { return cloud.fs.doc(cloud.db, 'households', cloud.code); }

  // ops: array of ['set', ref, data] | ['delete', ref] — committed in chunks.
  async function commitOps(ops) {
    const fs = cloud.fs;
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = fs.writeBatch(cloud.db);
      for (const op of ops.slice(i, i + BATCH_LIMIT)) {
        if (op[0] === 'set') batch.set(op[1], op[2]);
        else batch.delete(op[1]);
      }
      await batch.commit();
    }
  }

  async function uploadAllToCloud() {
    const ops = [];
    for (const t of transactions) ops.push(['set', txRef(t.id), clean(t)]);
    for (const r of rules) ops.push(['set', ruleRef(r.id), clean(r)]);
    if (ops.length) await commitOps(ops);
  }

  function cloudSetTx(tx) {
    if (mode !== 'cloud' || !cloud) return;
    cloud.fs.setDoc(txRef(tx.id), clean(tx))
      .catch((e) => console.warn('Cloud-Schreibvorgang (Buchung) fehlgeschlagen:', e));
  }

  function cloudDeleteTx(id) {
    if (mode !== 'cloud' || !cloud) return;
    cloud.fs.deleteDoc(txRef(id))
      .catch((e) => console.warn('Cloud-Löschvorgang (Buchung) fehlgeschlagen:', e));
  }

  function cloudSetRule(rule) {
    if (mode !== 'cloud' || !cloud) return;
    cloud.fs.setDoc(ruleRef(rule.id), clean(rule))
      .catch((e) => console.warn('Cloud-Schreibvorgang (Fixkosten) fehlgeschlagen:', e));
  }

  function cloudDeleteRule(id) {
    if (mode !== 'cloud' || !cloud) return;
    cloud.fs.deleteDoc(ruleRef(id))
      .catch((e) => console.warn('Cloud-Löschvorgang (Fixkosten) fehlgeschlagen:', e));
  }

  function cloudSetSettings() {
    if (mode !== 'cloud' || !cloud) return;
    cloud.fs.setDoc(settingsRef(), clean(settings))
      .catch((e) => console.warn('Cloud-Schreibvorgang (Einstellungen) fehlgeschlagen:', e));
  }

  // After importJSON in cloud mode: make Firestore match the imported state.
  async function replaceCloudData(removedTxIds, removedRuleIds) {
    const ops = [];
    for (const id of removedTxIds) ops.push(['delete', txRef(id)]);
    for (const id of removedRuleIds) ops.push(['delete', ruleRef(id)]);
    for (const t of transactions) ops.push(['set', txRef(t.id), clean(t)]);
    for (const r of rules) ops.push(['set', ruleRef(r.id), clean(r)]);
    ops.push(['set', settingsRef(), clean(settings)]);
    await commitOps(ops);
  }

  // ----------------------------------------------------------------- the API

  async function init() {
    transactions = readArray(LS_TX).filter((t) => t && typeof t === 'object' && t.id).map(normalizeTx);
    rules = readArray(LS_RULES).filter((r) => r && typeof r === 'object' && r.id).map(normalizeRule);
    settings = normalizeSettings(readJSON(LS_SETTINGS, null));
    dismissed = readArray(LS_DISMISSED).filter((k) => typeof k === 'string');

    const stored = readJSON(LS_CLOUD, null);
    if (stored && typeof stored === 'object' && stored.config && stored.code) {
      cloudMeta = {
        code: String(stored.code),
        projectId: stored.projectId ? String(stored.projectId) : null
      };
      try {
        const config = parseConfig(String(stored.config));
        // Silent reconnect: household was verified at setup time; snapshots
        // (served from the persistent cache when offline) bring the data in.
        await connect(config, cloudMeta.code, {
          createHousehold: false,
          verifyHousehold: false,
          uploadLocal: false
        });
      } catch (e) {
        console.warn('Cloud-Reconnect fehlgeschlagen:', e);
        if (window.App && App.toast) {
          App.toast('Cloud-Sync nicht erreichbar – du arbeitest mit lokalen Daten.');
        }
      }
    }
  }

  function getMode() { return mode; }

  function cloudInfo() {
    return {
      connected: mode === 'cloud' && !!cloud,
      code: cloud ? cloud.code : (cloudMeta ? cloudMeta.code : null),
      projectId: cloud ? cloud.projectId : (cloudMeta ? cloudMeta.projectId : null)
    };
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function unsubscribe() {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  // -------- transactions

  function getTransactions() {
    return transactions
      .map((t) => Object.assign({}, t))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        const ca = a.createdAt || '';
        const cb = b.createdAt || '';
        return ca < cb ? 1 : ca > cb ? -1 : 0;
      });
  }

  function addTransaction(data) {
    const now = nowISO();
    const tx = normalizeTx(Object.assign({}, scrub(data), {
      id: App.uid(),
      createdAt: now,
      updatedAt: now
    }));
    transactions.push(tx);
    persistTx();
    cloudSetTx(tx);
    emit();
    return Object.assign({}, tx);
  }

  function updateTransaction(id, patch) {
    const idx = transactions.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const existing = transactions[idx];
    const merged = normalizeTx(Object.assign({}, existing, scrub(patch), {
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowISO()
    }));
    transactions[idx] = merged;
    persistTx();
    cloudSetTx(merged);
    emit();
    return Object.assign({}, merged);
  }

  // Returns a copy of the removed transaction so callers can offer undo.
  function deleteTransaction(id) {
    const idx = transactions.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const removed = transactions[idx];
    transactions.splice(idx, 1);
    persistTx();
    cloudDeleteTx(id);
    emit();
    return Object.assign({}, removed);
  }

  // Undo: re-insert a previously deleted transaction unchanged (same id,
  // so the cloud document is recreated under its original key).
  function restoreTransaction(tx) {
    if (!tx || !tx.id) return null;
    if (transactions.some((t) => t.id === tx.id)) return null;
    const restored = normalizeTx(scrub(tx));
    transactions.push(restored);
    persistTx();
    cloudSetTx(restored);
    emit();
    return Object.assign({}, restored);
  }

  // -------- recurring rules

  function getRecurring() {
    return rules
      .map((r) => Object.assign({}, r))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return String(a.name).localeCompare(String(b.name), 'de');
      });
  }

  function addRecurring(data) {
    const now = nowISO();
    const rule = normalizeRule(Object.assign({}, scrub(data), {
      id: App.uid(),
      createdAt: now,
      updatedAt: now
    }));
    rules.push(rule);
    persistRules();
    cloudSetRule(rule);
    emit();
    return Object.assign({}, rule);
  }

  function updateRecurring(id, patch) {
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const existing = rules[idx];
    const merged = normalizeRule(Object.assign({}, existing, scrub(patch), {
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowISO()
    }));
    rules[idx] = merged;
    persistRules();
    cloudSetRule(merged);
    emit();
    return Object.assign({}, merged);
  }

  // Returns a copy of the removed rule so callers can offer undo.
  function deleteRecurring(id) {
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const removed = rules[idx];
    rules.splice(idx, 1);
    persistRules();
    cloudDeleteRule(id);
    emit();
    return Object.assign({}, removed);
  }

  // Undo: re-insert a previously deleted rule unchanged (same id).
  function restoreRecurring(rule) {
    if (!rule || !rule.id) return null;
    if (rules.some((r) => r.id === rule.id)) return null;
    const restored = normalizeRule(scrub(rule));
    rules.push(restored);
    persistRules();
    cloudSetRule(restored);
    emit();
    return Object.assign({}, restored);
  }

  // -------- settings

  function getSettings() {
    return Object.assign({}, settings, {
      members: settings.members.map((m) => Object.assign({}, m))
    });
  }

  function updateSettings(patch) {
    patch = scrub(patch || {});
    const next = Object.assign({}, settings, patch);
    if (patch.members) {
      // Merge member patches against the CURRENT members so a partial
      // members array never resets the other partner's name/color.
      const given = Array.isArray(patch.members) ? patch.members : [];
      next.members = settings.members.map((cur) => {
        const upd = given.find((m) => m && m.id === cur.id) || {};
        return {
          id: cur.id,
          name: typeof upd.name === 'string' && upd.name ? upd.name : cur.name,
          color: typeof upd.color === 'string' && upd.color ? upd.color : cur.color
        };
      });
    }
    settings = normalizeSettings(next);
    persistSettings();
    cloudSetSettings();
    emit();
    return getSettings();
  }

  // -------- dismissed suggestions (local only, never synced)

  function getDismissed() {
    return dismissed.slice();
  }

  function dismissSuggestion(key) {
    if (typeof key !== 'string' || !key) return;
    if (dismissed.indexOf(key) !== -1) return;
    dismissed.push(key);
    persistDismissed();
    emit();
  }

  // -------- cloud setup / teardown

  function generateCode() {
    let code = '';
    try {
      const buf = new Uint32Array(8);
      crypto.getRandomValues(buf);
      for (let i = 0; i < 8; i++) code += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    } catch (e) {
      code = '';
      for (let i = 0; i < 8; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }

  async function setupCloud(opts) {
    opts = opts || {};
    const config = parseConfig(opts.configText);
    const code = String(opts.code || '').trim().toUpperCase();
    if (!code) fail('Bitte gib einen Haushalts-Code ein.');
    if (!/^[A-Z0-9]{4,16}$/.test(code)) {
      fail('Der Code darf nur Buchstaben und Ziffern enthalten (4–16 Zeichen).');
    }

    // Drop any existing connection before establishing the new one.
    teardownCloud();

    await connect(config, code, {
      createHousehold: !!opts.create,
      verifyHousehold: !opts.create,
      uploadLocal: !!opts.uploadLocal
    });

    // Persist 'cf.cloud' only after the first successful connect.
    writeJSON(LS_CLOUD, {
      config: String(opts.configText),
      code: code,
      projectId: config.projectId ? String(config.projectId) : null
    });
    emit();
  }

  function disconnectCloud() {
    removeKey(LS_CLOUD);
    teardownCloud();
    cloudMeta = null;
    // Current in-memory data simply stays as the local copy.
    persistAll();
    emit();
  }

  // -------- backup / restore / wipe

  function exportJSON() {
    return JSON.stringify({
      version: 1,
      exportedAt: nowISO(),
      transactions: getTransactions(),
      rules: getRecurring(),
      settings: getSettings()
    }, null, 2);
  }

  function importJSON(str) {
    let data = null;
    try {
      data = JSON.parse(String(str));
    } catch (e) {
      fail('Die Datei ist kein gültiges JSON-Backup.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      fail('Ungültiges Backup-Format.');
    }
    if (!Array.isArray(data.transactions) || !Array.isArray(data.rules)) {
      fail('Ungültiges Backup – es fehlen Buchungen oder Fixkosten.');
    }

    const newTx = data.transactions.map(importTx).filter(Boolean);
    const newRules = data.rules.map(importRule).filter(Boolean);
    const newSettings = normalizeSettings(data.settings);

    const removedTxIds = transactions.map((t) => t.id).filter((id) => !newTx.some((t) => t.id === id));
    const removedRuleIds = rules.map((r) => r.id).filter((id) => !newRules.some((r) => r.id === id));

    transactions = newTx;
    rules = newRules;
    settings = newSettings;
    persistAll();

    if (mode === 'cloud' && cloud) {
      replaceCloudData(removedTxIds, removedRuleIds)
        .catch((e) => console.warn('Cloud-Abgleich nach Import fehlgeschlagen:', e));
    }
    emit();
  }

  async function wipeAll() {
    if (mode === 'cloud' && cloud) {
      try {
        const ops = [];
        for (const t of transactions) ops.push(['delete', txRef(t.id)]);
        for (const r of rules) ops.push(['delete', ruleRef(r.id)]);
        ops.push(['delete', settingsRef()]);
        ops.push(['delete', householdRef()]);
        await commitOps(ops);
      } catch (e) {
        console.warn('Cloud-Löschung fehlgeschlagen:', e);
      }
    }
    transactions = [];
    rules = [];
    dismissed = [];
    settings = defaultSettings();
    persistAll();
    emit();
  }

  // ------------------------------------------------------------------ expose

  window.Store = {
    init: init,
    getMode: getMode,
    cloudInfo: cloudInfo,
    onChange: onChange,
    getTransactions: getTransactions,
    addTransaction: addTransaction,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,
    restoreTransaction: restoreTransaction,
    getRecurring: getRecurring,
    addRecurring: addRecurring,
    updateRecurring: updateRecurring,
    deleteRecurring: deleteRecurring,
    restoreRecurring: restoreRecurring,
    getSettings: getSettings,
    updateSettings: updateSettings,
    getDismissed: getDismissed,
    dismissSuggestion: dismissSuggestion,
    generateCode: generateCode,
    setupCloud: setupCloud,
    disconnectCloud: disconnectCloud,
    exportJSON: exportJSON,
    importJSON: importJSON,
    wipeAll: wipeAll
  };
})();
