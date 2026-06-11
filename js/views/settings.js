/* settings.js — "Mehr" tab: persons, cloud sync, data tools, danger zone (SPEC §10 settings.js) */
(function () {
  'use strict';

  window.Views = window.Views || {};

  /* ---------- small builders ---------- */

  function makeRow(title, sub, onClick) {
    var row = App.el('div', 'list-row');
    var main = App.el('div', 'row-main');
    var titleEl = App.el('div', 'row-title');
    titleEl.textContent = title;
    main.appendChild(titleEl);
    if (sub) {
      var subEl = App.el('div', 'row-sub');
      subEl.textContent = sub;
      main.appendChild(subEl);
    }
    row.appendChild(main);
    if (onClick) {
      row.style.cursor = 'pointer';
      var chevron = App.el('span', '', '›');
      chevron.style.color = 'var(--text-3)';
      chevron.style.fontSize = '20px';
      chevron.style.flex = '0 0 auto';
      chevron.setAttribute('aria-hidden', 'true');
      row.appendChild(chevron);
      row.addEventListener('click', onClick);
    }
    return row;
  }

  function makeSwitch(checked) {
    var label = App.el('label', 'switch');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    var track = App.el('span', 'switch-track');
    label.appendChild(input);
    label.appendChild(track);
    return { label: label, input: input };
  }

  function switchRow(text, checked) {
    var row = App.el('div', 'form-row');
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    var span = App.el('span', '', text);
    var sw = makeSwitch(checked);
    row.appendChild(span);
    row.appendChild(sw.label);
    return { row: row, input: sw.input };
  }

  function formGroup(labelText, child) {
    var group = App.el('div', 'form-group');
    var label = App.el('div', 'form-label', labelText);
    group.appendChild(label);
    group.appendChild(child);
    return group;
  }

  /* ---------- persons ---------- */

  function openRenameSheet(memberId) {
    var settings = Store.getSettings();
    var members = settings.members || [];
    var member = null;
    for (var i = 0; i < members.length; i++) {
      if (members[i].id === memberId) member = members[i];
    }

    var content = App.el('div');
    var input = App.el('input', 'input');
    input.type = 'text';
    input.maxLength = 30;
    input.placeholder = 'Name';
    input.value = member ? member.name : '';
    content.appendChild(formGroup('Name', input));

    var saveBtn = App.el('button', 'btn btn-primary', 'Speichern');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', function () {
      var name = input.value.trim();
      if (!name) {
        App.toast('Bitte gib einen Namen ein');
        return;
      }
      var current = Store.getSettings().members || [];
      var updated = current.map(function (m) {
        return m.id === memberId ? Object.assign({}, m, { name: name }) : m;
      });
      Store.updateSettings({ members: updated });
      App.closeSheet();
      App.toast('Gespeichert ✓');
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveBtn.click();
    });
    content.appendChild(saveBtn);

    App.showSheet({ title: 'Person umbenennen', content: content });
    setTimeout(function () {
      input.focus();
      input.select();
    }, 60);
  }

  function personsSection(view) {
    view.appendChild(App.el('div', 'section-title', 'Personen'));
    var group = App.el('div', 'list-group');
    var members = (Store.getSettings().members || []);
    members.forEach(function (member) {
      var row = App.el('div', 'list-row');
      row.style.cursor = 'pointer';
      var dot = App.el('span', 'dot');
      dot.style.background = member.color || 'var(--tint)';
      dot.style.flex = '0 0 auto';
      dot.style.marginRight = '10px';
      row.appendChild(dot);
      var main = App.el('div', 'row-main');
      var title = App.el('div', 'row-title');
      title.textContent = member.name || '';
      var sub = App.el('div', 'row-sub', 'Tippen zum Umbenennen');
      main.appendChild(title);
      main.appendChild(sub);
      row.appendChild(main);
      var chevron = App.el('span', '', '›');
      chevron.style.color = 'var(--text-3)';
      chevron.style.fontSize = '20px';
      chevron.setAttribute('aria-hidden', 'true');
      row.appendChild(chevron);
      row.addEventListener('click', function () { openRenameSheet(member.id); });
      group.appendChild(row);
    });
    view.appendChild(group);
  }

  /* ---------- cloud sync ---------- */

  function openCloudSheet() {
    var mode = 'create';
    var joinCode = '';
    var generatedCode = Store.generateCode();
    var pending = false;

    var content = App.el('div');

    var explainer = App.el('p', 'form-label');
    explainer.style.lineHeight = '1.45';
    explainer.style.marginBottom = '14px';
    explainer.textContent =
      '1. Kostenloses Projekt auf console.firebase.google.com anlegen · ' +
      '2. Anonyme Anmeldung + Firestore aktivieren · ' +
      '3. Web-App-Konfiguration hier einfügen — Details in der ANLEITUNG.';
    content.appendChild(explainer);

    var seg = App.el('div', 'segmented');
    var segCreate = App.el('button', 'segment active', 'Neuen Haushalt erstellen');
    segCreate.type = 'button';
    var segJoin = App.el('button', 'segment', 'Beitreten');
    segJoin.type = 'button';
    seg.appendChild(segCreate);
    seg.appendChild(segJoin);
    var segGroup = App.el('div', 'form-group');
    segGroup.appendChild(seg);
    content.appendChild(segGroup);

    var configInput = document.createElement('textarea');
    configInput.className = 'input';
    configInput.rows = 5;
    configInput.spellcheck = false;
    configInput.placeholder = 'const firebaseConfig = {\n  apiKey: "…",\n  projectId: "…",\n  appId: "…"\n};';
    content.appendChild(formGroup('Firebase-Konfiguration', configInput));

    var codeInput = App.el('input', 'input');
    codeInput.type = 'text';
    codeInput.maxLength = 8;
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    codeInput.setAttribute('autocapitalize', 'characters');
    codeInput.style.textTransform = 'uppercase';
    codeInput.style.letterSpacing = '2px';
    var codeGroup = formGroup('Haushalts-Code', codeInput);
    var codeHint = App.el('div', 'form-label');
    codeHint.style.marginTop = '6px';
    codeGroup.appendChild(codeHint);
    content.appendChild(codeGroup);

    var upload = switchRow('Vorhandene Daten hochladen', true);
    upload.row.classList.add('form-group');
    content.appendChild(upload.row);

    var errEl = App.el('div', 'form-error');
    errEl.style.display = 'none';
    errEl.style.marginBottom = '12px';
    content.appendChild(errEl);

    var connectBtn = App.el('button', 'btn btn-primary', 'Verbinden');
    connectBtn.type = 'button';
    content.appendChild(connectBtn);

    function setMode(next) {
      if (pending) return;
      mode = next;
      segCreate.classList.toggle('active', mode === 'create');
      segJoin.classList.toggle('active', mode === 'join');
      if (mode === 'create') {
        codeInput.value = generatedCode;
        codeInput.readOnly = true;
        codeInput.placeholder = '';
        codeHint.textContent = 'Diesen Code gibst du später auf dem zweiten Gerät ein.';
      } else {
        codeInput.value = joinCode;
        codeInput.readOnly = false;
        codeInput.placeholder = 'Code vom ersten Gerät';
        codeHint.textContent = 'Den 8-stelligen Code findest du auf dem bereits verbundenen Gerät.';
      }
    }
    segCreate.addEventListener('click', function () { setMode('create'); });
    segJoin.addEventListener('click', function () { setMode('join'); });
    codeInput.addEventListener('input', function () {
      if (mode === 'join') {
        codeInput.value = codeInput.value.toUpperCase();
        joinCode = codeInput.value;
      }
    });
    setMode('create');

    connectBtn.addEventListener('click', function () {
      if (pending) return;
      errEl.style.display = 'none';
      errEl.textContent = '';

      var configText = configInput.value.trim();
      var code = mode === 'create' ? generatedCode : codeInput.value.trim().toUpperCase();
      if (!configText) {
        errEl.textContent = 'Bitte füge die Firebase-Konfiguration ein.';
        errEl.style.display = '';
        return;
      }
      if (mode === 'join' && code.length < 4) {
        errEl.textContent = 'Bitte gib den Haushalts-Code ein.';
        errEl.style.display = '';
        return;
      }

      pending = true;
      connectBtn.disabled = true;
      connectBtn.textContent = '';
      connectBtn.appendChild(App.el('span', 'spinner'));

      Store.setupCloud({
        configText: configText,
        code: code,
        create: mode === 'create',
        uploadLocal: upload.input.checked
      }).then(function () {
        pending = false;
        App.closeSheet();
        App.toast('✓ Synchronisation aktiv');
        App.rerender();
      }).catch(function (err) {
        pending = false;
        connectBtn.disabled = false;
        connectBtn.textContent = 'Verbinden';
        errEl.textContent = (err && err.message) || 'Verbindung fehlgeschlagen.';
        errEl.style.display = '';
      });
    });

    App.showSheet({ title: 'Synchronisation einrichten', content: content });
  }

  function syncSection(view) {
    view.appendChild(App.el('div', 'section-title', 'Synchronisation'));
    var group = App.el('div', 'list-group');

    var connected = Store.getMode() === 'cloud';
    var info = Store.cloudInfo();

    var statusText = connected
      ? '✓ Verbunden · Code ' + (info.code || '—') + ' · ' + (info.projectId || '')
      : 'Lokal – nur auf diesem Gerät';
    var statusRow = makeRow(statusText, connected
      ? 'Eure Daten werden zwischen euren Geräten synchronisiert.'
      : 'Richte die Synchronisation ein, um Daten auf zwei Geräten zu teilen.', null);
    group.appendChild(statusRow);

    if (connected) {
      var disconnectRow = makeRow('Trennen…', null, function () {
        App.confirm({
          title: 'Synchronisation trennen?',
          message: 'Die Daten bleiben auf diesem Gerät erhalten, werden aber nicht mehr mit dem anderen Gerät synchronisiert.',
          confirmText: 'Trennen',
          destructive: true
        }).then(function (ok) {
          if (!ok) return;
          Store.disconnectCloud();
          App.toast('Synchronisation getrennt');
          App.rerender();
        });
      });
      disconnectRow.querySelector('.row-title').classList.add('danger');
      group.appendChild(disconnectRow);
    } else {
      var setupRow = makeRow('Synchronisation einrichten…', null, openCloudSheet);
      setupRow.querySelector('.row-title').style.color = 'var(--tint)';
      group.appendChild(setupRow);
    }

    view.appendChild(group);
  }

  /* ---------- demo data ---------- */

  function generateDemoData() {
    var todayISO = App.todayISO();
    var todayDay = parseInt(todayISO.slice(8, 10), 10);
    var curMonth = App.monthKey(todayISO);
    var months = [-3, -2, -1, 0].map(function (n) { return App.addMonths(curMonth, n); });

    function pad2(n) { return String(n).padStart(2, '0'); }
    function daysInMonth(mk) {
      var parts = mk.split('-');
      return new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
    }
    function maxDay(mk) { return mk === curMonth ? todayDay : daysInMonth(mk); }
    function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pick(arr) { return arr[rand(0, arr.length - 1)]; }
    function anyPayer() { return Math.random() < 0.5 ? 'p1' : 'p2'; }
    function dateIn(mk, day) { return mk + '-' + pad2(Math.min(day, daysInMonth(mk))); }

    var txs = [];
    function addTx(mk, day, data) {
      if (day > maxDay(mk)) return;
      txs.push(Object.assign({ note: '', shared: false, recurringId: null }, data, { date: dateIn(mk, day) }));
    }

    /* --- recurring rules + their past booked transactions (so 'paid' detection works) --- */
    var p1Name = App.memberName('p1') || 'Partner 1';
    var p2Name = App.memberName('p2') || 'Partner 2';

    var ruleDefs = [
      { name: 'Gehalt ' + p1Name, type: 'income', amountCents: 285000, category: 'gehalt', dueDay: 1, payerId: 'p1', shared: false },
      { name: 'Gehalt ' + p2Name, type: 'income', amountCents: 245000, category: 'gehalt', dueDay: 1, payerId: 'p2', shared: false },
      { name: 'Miete', type: 'expense', amountCents: 138000, category: 'wohnen', dueDay: 1, payerId: 'p1', shared: true },
      /* Strom is intentionally left unbooked in the current month → shows 'Überfällig'/'Fällig' */
      { name: 'Stadtwerke Strom & Gas', type: 'expense', amountCents: 9800, category: 'nebenkosten', dueDay: 5, payerId: 'p2', shared: true, skipCurrentMonth: true },
      { name: 'Telekom Internet & Handy', type: 'expense', amountCents: 5499, category: 'internet', dueDay: 8, payerId: 'p1', shared: true },
      { name: 'Netflix', type: 'expense', amountCents: 1399, category: 'abos', dueDay: 15, payerId: 'p2', shared: true },
      { name: 'Spotify Duo', type: 'expense', amountCents: 1499, category: 'abos', dueDay: 20, payerId: 'p1', shared: true }
    ];

    ruleDefs.forEach(function (def) {
      var created = Store.addRecurring({
        name: def.name,
        type: def.type,
        amountCents: def.amountCents,
        category: def.category,
        interval: 'monthly',
        dueDay: def.dueDay,
        dueMonth: 1,
        anchorMonth: months[0],
        payerId: def.payerId,
        shared: def.shared,
        active: true,
        source: 'manual'
      });
      var ruleId = created && created.id ? created.id : null;
      if (!ruleId) {
        var all = Store.getRecurring();
        for (var i = 0; i < all.length; i++) {
          if (all[i].name === def.name) { ruleId = all[i].id; break; }
        }
      }
      months.forEach(function (mk) {
        if (def.skipCurrentMonth && mk === curMonth) return;
        var dueISO = dateIn(mk, def.dueDay);
        if (dueISO > todayISO) return;
        txs.push({
          type: def.type,
          amountCents: def.amountCents,
          category: def.category,
          note: def.name,
          date: dueISO,
          payerId: def.payerId,
          shared: def.shared,
          recurringId: ruleId
        });
      });
    });

    /* --- recurring patterns WITHOUT a rule → feed Analysis.detectRecurring suggestions --- */
    months.forEach(function (mk) {
      addTx(mk, 2, { type: 'expense', amountCents: 20000, category: 'sparen', note: 'ETF-Sparplan', payerId: 'p1', shared: false });
      addTx(mk, 3, { type: 'expense', amountCents: 2490, category: 'freizeit', note: 'McFIT Mitgliedschaft', payerId: 'p2', shared: false });
    });

    /* --- groceries: 2–3× per week, 8–90 € --- */
    var stores = ['Rewe', 'Edeka', 'Aldi', 'Lidl', 'Penny', 'Wochenmarkt'];
    months.forEach(function (mk) {
      var last = maxDay(mk);
      for (var day = rand(1, 3); day <= last; day += rand(2, 4)) {
        addTx(mk, day, {
          type: 'expense',
          amountCents: rand(800, 9000),
          category: 'lebensmittel',
          note: pick(stores),
          payerId: anyPayer(),
          shared: Math.random() < 0.85
        });
      }
      /* small bakery runs (varying low amounts) */
      var bakeryCount = rand(3, 5);
      for (var b = 0; b < bakeryCount; b++) {
        addTx(mk, rand(1, last), {
          type: 'expense',
          amountCents: rand(180, 490),
          category: 'lebensmittel',
          note: 'Bäckerei Schmidt',
          payerId: anyPayer(),
          shared: false
        });
      }
    });

    /* --- restaurants & cafés --- */
    var restaurants = ['Pizzeria Da Mario', 'Sushi Time', 'Café Glück', 'Burger Brothers', 'Thai-Imbiss', 'Eiscafé Venezia', 'Brauhaus Krone'];
    months.forEach(function (mk) {
      var n = rand(4, 6);
      for (var i = 0; i < n; i++) {
        addTx(mk, rand(1, maxDay(mk)), {
          type: 'expense',
          amountCents: rand(1400, 6800),
          category: 'restaurant',
          note: pick(restaurants),
          payerId: anyPayer(),
          shared: Math.random() < 0.7
        });
      }
    });

    /* --- transport --- */
    var gasStations = ['Aral Tankstelle', 'Shell Tankstelle'];
    months.forEach(function (mk) {
      addTx(mk, rand(2, 14), { type: 'expense', amountCents: rand(4500, 7800), category: 'transport', note: pick(gasStations), payerId: 'p1', shared: false });
      addTx(mk, rand(15, 28), { type: 'expense', amountCents: rand(4500, 7800), category: 'transport', note: pick(gasStations), payerId: 'p2', shared: false });
      if (Math.random() < 0.6) {
        addTx(mk, rand(1, 28), { type: 'expense', amountCents: rand(1990, 4990), category: 'transport', note: 'DB Bahn-Ticket', payerId: anyPayer(), shared: false });
      }
    });

    /* --- drugstore --- */
    months.forEach(function (mk) {
      var n = rand(1, 2);
      for (var i = 0; i < n; i++) {
        addTx(mk, rand(1, maxDay(mk)), {
          type: 'expense',
          amountCents: rand(900, 3600),
          category: 'gesundheit',
          note: pick(['dm Drogerie', 'Rossmann']),
          payerId: anyPayer(),
          shared: Math.random() < 0.5
        });
      }
    });

    /* --- one-offs across the four months --- */
    var oneOffs = [
      [0, 9, { type: 'expense', amountCents: 13450, category: 'haushalt', note: 'IKEA Regal & Kleinkram', payerId: 'p1', shared: true }],
      [0, 17, { type: 'expense', amountCents: 4500, category: 'geschenke', note: 'Geburtstagsgeschenk Mama', payerId: 'p2', shared: false }],
      [1, 6, { type: 'expense', amountCents: 7995, category: 'kleidung', note: 'Zalando Bestellung', payerId: 'p2', shared: false }],
      [1, 14, { type: 'income', amountCents: 3500, category: 'einnahme', note: 'Flohmarkt-Verkauf', payerId: 'p2', shared: false }],
      [1, 21, { type: 'expense', amountCents: 3200, category: 'freizeit', note: 'Kino & Popcorn', payerId: 'p1', shared: true }],
      [2, 8, { type: 'expense', amountCents: 28900, category: 'urlaub', note: 'Wochenende Hamburg', payerId: 'p1', shared: true }],
      [2, 19, { type: 'expense', amountCents: 1860, category: 'gesundheit', note: 'Apotheke', payerId: 'p2', shared: false }],
      [2, 26, { type: 'expense', amountCents: 5990, category: 'kleidung', note: 'H&M', payerId: 'p1', shared: false }],
      [3, 4, { type: 'expense', amountCents: 1250, category: 'geschenke', note: 'Blumenstrauß', payerId: 'p1', shared: false }],
      [3, 9, { type: 'expense', amountCents: 8420, category: 'haushalt', note: 'Amazon Haushaltszeug', payerId: 'p2', shared: true }]
    ];
    oneOffs.forEach(function (entry) {
      addTx(months[entry[0]], entry[1], entry[2]);
    });

    txs.forEach(function (t) { Store.addTransaction(t); });
    return { txCount: txs.length, ruleCount: ruleDefs.length };
  }

  /* ---------- data section ---------- */

  function exportIcs() {
    var rules = Store.getRecurring();
    var hasActive = rules.some(function (r) { return r.active; });
    if (!hasActive) {
      App.toast('Keine aktiven Fixkosten vorhanden');
      return;
    }
    var members = Store.getSettings().members || [];
    App.downloadFile('fixkosten.ics', Analysis.icsForRules(rules, members), 'text/calendar');
    App.toast('Kalenderdatei erstellt');
  }

  function dataSection(view) {
    view.appendChild(App.el('div', 'section-title', 'Daten'));
    var group = App.el('div', 'list-group');

    group.appendChild(makeRow('Backup exportieren (JSON)', 'Alle Daten als Datei sichern', function () {
      App.downloadFile('finanzen-backup.json', Store.exportJSON(), 'application/json');
      App.toast('Backup erstellt ✓');
    }));

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      file.text().then(function (text) {
        return App.confirm({
          title: 'Backup importieren?',
          message: 'Ersetzt alle aktuellen Daten!',
          confirmText: 'Importieren',
          destructive: true
        }).then(function (ok) {
          if (!ok) return;
          return Promise.resolve().then(function () {
            return Store.importJSON(text);
          }).then(function () {
            App.toast('Backup importiert ✓');
          });
        });
      }).catch(function (err) {
        App.toast((err && err.message) || 'Import fehlgeschlagen');
      });
    });
    group.appendChild(makeRow('Backup importieren', 'Ersetzt alle aktuellen Daten', function () {
      fileInput.click();
    }));

    group.appendChild(makeRow('Kalender-Export Fixkosten (.ics)', 'Erinnerungen im iPhone-Kalender', exportIcs));

    group.appendChild(makeRow('Demo-Daten laden', 'Beispieldaten zum Ausprobieren', function () {
      App.confirm({
        title: 'Demo-Daten laden?',
        message: 'Fügt Beispiel-Buchungen und Fixkosten der letzten 4 Monate hinzu. Vorhandene Daten bleiben erhalten.',
        confirmText: 'Laden'
      }).then(function (ok) {
        if (!ok) return;
        var result = generateDemoData();
        App.toast(result.txCount + ' Buchungen & ' + result.ruleCount + ' Fixkosten geladen ✓');
      });
    }));

    /* hidden input appended after all rows so it does not break the
       `.list-row + .list-row` hairline between adjacent rows */
    group.appendChild(fileInput);

    view.appendChild(group);
  }

  /* ---------- danger zone ---------- */

  function dangerSection(view) {
    view.appendChild(App.el('div', 'section-title', 'Gefahrenzone'));
    var group = App.el('div', 'list-group');

    var row = makeRow('Alle Daten löschen', null, function () {
      var connected = Store.getMode() === 'cloud';
      var info = Store.cloudInfo();
      var message = connected
        ? 'Alle Buchungen, Fixkosten und Einstellungen werden gelöscht – auch im verbundenen Cloud-Haushalt' +
          (info.code ? ' ' + info.code : '') + '. Das kann nicht rückgängig gemacht werden.'
        : 'Alle Buchungen, Fixkosten und Einstellungen auf diesem Gerät werden gelöscht. Das kann nicht rückgängig gemacht werden.';
      App.confirm({
        title: 'Alle Daten löschen?',
        message: message,
        confirmText: 'Löschen',
        destructive: true
      }).then(function (ok) {
        if (!ok) return;
        Promise.resolve(Store.wipeAll()).then(function () {
          App.toast('Alle Daten gelöscht');
          App.rerender();
        }).catch(function (err) {
          App.toast((err && err.message) || 'Löschen fehlgeschlagen');
        });
      });
    });
    row.querySelector('.row-title').classList.add('danger');
    group.appendChild(row);

    view.appendChild(group);
  }

  /* ---------- view ---------- */

  window.Views.settings = {
    title: 'Einstellungen',

    render: function (containerEl) {
      containerEl.innerHTML = '';
      var view = App.el('div', 'view');

      personsSection(view);
      syncSection(view);
      dataSection(view);
      dangerSection(view);

      var about = App.el('div', 'empty-state');
      about.style.fontSize = '13px';
      about.textContent = 'Unsere Finanzen · Version 1.0 · Eure Daten gehören euch.';
      view.appendChild(about);

      containerEl.appendChild(view);
    }
  };
})();
