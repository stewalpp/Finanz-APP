/* js/views/transactions.js — Buchungen view (list + filters + editor sheet) */
(function () {
  'use strict';

  window.Views = window.Views || {};

  // ---- module-level state (persists across re-renders) ----
  // Buchungen ist ein reines Monatsjournal: nur echte Buchungen, keine offenen Regeln.
  var state = {
    month: null        // 'YYYY-MM' — lazily initialized to current month
  };

  var SVG_CHEVRON_LEFT =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="15 18 9 12 15 6"></polyline></svg>';
  var SVG_CHEVRON_RIGHT =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="9 18 15 12 9 6"></polyline></svg>';

  function ensureMonth() {
    state.month = App.getMonth(); // shared across tabs — pick up switches made elsewhere
  }

  function centsToInput(cents) {
    return (cents / 100).toFixed(2).replace('.', ',');
  }

  function getMembers() {
    var settings = Store.getSettings() || {};
    return settings.members || [
      { id: 'p1', name: 'Partner 1', color: '#0A84FF' },
      { id: 'p2', name: 'Partner 2', color: '#FF375F' }
    ];
  }

  function memberColor(id) {
    var members = getMembers();
    for (var i = 0; i < members.length; i++) {
      if (members[i].id === id) return members[i].color || 'var(--gray)';
    }
    return 'var(--gray)';
  }

  // ---------------------------------------------------------------- render

  function render(root) {
    ensureMonth();
    root.innerHTML = '';
    var view = App.el('div', 'view');

    var listWrap = App.el('div', '');

    view.appendChild(buildMonthNav(root));
    view.appendChild(listWrap);
    renderList(listWrap);

    root.appendChild(view);
  }

  function buildMonthNav(root) {
    var nav = App.el('div', 'month-nav');

    var prev = App.el('button', 'month-nav-btn');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Vorheriger Monat');
    prev.innerHTML = SVG_CHEVRON_LEFT;
    prev.addEventListener('click', function () {
      App.setMonth(App.addMonths(state.month, -1));
      render(root);
    });

    var title = App.el('div', 'month-nav-title', App.fmtMonth(state.month));

    var next = App.el('button', 'month-nav-btn');
    next.type = 'button';
    next.setAttribute('aria-label', 'Nächster Monat');
    next.innerHTML = SVG_CHEVRON_RIGHT;
    next.addEventListener('click', function () {
      App.setMonth(App.addMonths(state.month, 1));
      render(root);
    });

    nav.appendChild(prev);
    nav.appendChild(title);
    nav.appendChild(next);
    return nav;
  }

  // ------------------------------------------------------------------ list

  // Monthly ledger: only real transactions. Recurring rules live in the planning views.
  function entryDate(entry) {
    return entry.item.date;
  }

  function entryCreatedAt(entry) {
    return entry.item.createdAt || '';
  }

  function getLedgerEntries() {
    var txs = Store.getTransactions();
    var entries = [];

    txs.forEach(function (tx) {
      if (App.monthKey(tx.date) !== state.month) return;
      entries.push({ kind: 'tx', item: tx });
    });

    entries.sort(function (a, b) {
      var ad = entryDate(a);
      var bd = entryDate(b);
      if (ad !== bd) return ad < bd ? 1 : -1;
      var ac = entryCreatedAt(a);
      var bc = entryCreatedAt(b);
      if (ac !== bc) return ac < bc ? 1 : -1;
      return 0;
    });

    return entries;
  }

  // Live total card — always visible, recomputed on every render/data change.
  function buildTotalCard(entries) {
    var expenseSum = 0;
    var incomeSum = 0;
    entries.forEach(function (entry) {
      var item = entry.item;
      if (item.type === 'income') incomeSum += item.amountCents;
      else if (item.type === 'expense') expenseSum += item.amountCents;
    });
    var balance = incomeSum - expenseSum;
    var card = App.el('div', 'card hero-card');
    card.appendChild(App.cardHead('Alle Ausgaben im ' + App.fmtMonth(state.month), function () {
      return App.infoContent([
        { row: ['Gebuchte Ausgaben', '−' + App.fmtEUR(expenseSum), 'neg'] },
        { row: ['Einnahmen', '+' + App.fmtEUR(incomeSum), 'pos'] },
        { row: ['Saldo', (balance >= 0 ? '+' : '−') + App.fmtEUR(Math.abs(balance)), balance >= 0 ? 'pos' : 'neg'] },
        { p: 'Unten stehen alle echten Buchungen dieses Monats. Die große Zahl ist die Summe der Ausgaben.' }
      ]);
    }));
    var big = App.el('div', 'hero-amount', App.fmtEUR(expenseSum));
    card.appendChild(big);
    var n = entries.length;
    var subText = (n === 1 ? '1 Buchung im Monat' : n + ' Buchungen im Monat');
    if (incomeSum > 0) subText += ' · Einnahmen ' + App.fmtEUR(incomeSum);
    var sub = App.el('div', 'hero-sub', subText);
    card.appendChild(sub);
    return card;
  }

  function renderList(wrap) {
    wrap.innerHTML = '';
    var entries = getLedgerEntries();

    // live summary always on top
    wrap.appendChild(buildTotalCard(entries));

    if (!entries.length) {
      var empty = App.el('div', 'empty-state');
      var emptyIcon = App.el('div', '');
      emptyIcon.appendChild(App.icon('receipt-text', 40));
      empty.appendChild(emptyIcon);
      empty.appendChild(App.el('p', '', 'Noch keine Buchungen in diesem Monat.'));
      wrap.appendChild(empty);
      return;
    }

    // group by date (entries are sorted date DESC)
    var groups = [];
    var current = null;
    entries.forEach(function (entry) {
      var date = entryDate(entry);
      if (!current || current.date !== date) {
        current = { date: date, items: [] };
        groups.push(current);
      }
      current.items.push(entry);
    });

    groups.forEach(function (g) {
      wrap.appendChild(App.el('div', 'section-title', App.fmtDateShort(g.date)));
      var listGroup = App.el('div', 'list-group');
      g.items.forEach(function (entry) {
        var tx = entry.item;
        listGroup.appendChild(App.swipeToDelete(buildTxRow(tx), function () {
          var removed = Store.deleteTransaction(tx.id);
          App.toast('Buchung gelöscht', removed ? {
            actionText: 'Rückgängig',
            onAction: function () {
              Store.restoreTransaction(removed);
              App.toast('Wiederhergestellt ✓');
            }
          } : undefined);
        }, { ariaLabel: 'Buchung löschen' }));
      });
      wrap.appendChild(listGroup);
    });
  }

  function buildTxRow(tx) {
    var cat = App.cat(tx.category);
    var isIncome = tx.type === 'income';
    var row = App.el('div', 'list-row');
    // coloured left edge by direction: red = Ausgabe (Minus), grün = Einnahme (Plus)
    row.style.boxShadow = 'inset 4px 0 0 0 ' + (isIncome ? 'var(--green)' : 'var(--red)');
    // faint matching tint so the tile reads as money-out / money-in at a glance
    row.style.background = isIncome
      ? 'color-mix(in srgb, var(--green) 7%, var(--bg-card))'
      : 'color-mix(in srgb, var(--red) 7%, var(--bg-card))';

    var icon = App.catIcon(tx.category);

    var main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', tx.note || cat.label));
    // who booked it → small dot in the payer's colour + name
    var sub = App.el('div', 'row-sub');
    sub.style.display = 'flex';
    sub.style.alignItems = 'center';
    sub.style.gap = '6px';
    var dot = App.el('span', 'dot');
    dot.style.background = memberColor(tx.payerId);
    dot.style.width = '7px';
    dot.style.height = '7px';
    sub.appendChild(dot);
    sub.appendChild(document.createTextNode(
      cat.label + ' · ' + (App.memberName(tx.payerId) || '–') +
      ' · ' + (tx.category === 'ausgleich' ? 'Ausgleichszahlung'
        : (tx.shared === true ? 'Gemeinsam' : 'Privat'))
    ));
    main.appendChild(sub);

    var trailing = App.el('div', 'row-trailing');
    trailing.appendChild(App.el('span', isIncome ? 'amount-pos' : 'amount-neg',
      (isIncome ? '+' : '−') + App.fmtEUR(tx.amountCents)));

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
    return row;
  }

  // ---------------------------------------------------------------- editor

  // defaults (optional): { type, category, shared, payerId, date, note, notePlaceholder, title }
  // to preset a new booking from writable views.
  function openEditor(tx, defaults) {
    // Settlements must not be edited: the editor has no 'ausgleich' category, so a
    // type switch would silently convert the transfer into a regular booking and
    // corrupt the couple balance. Delete + re-settle instead.
    if (tx && tx.category === 'ausgleich') {
      App.toast('Ausgleichszahlung: zum Korrigieren löschen und neu ausgleichen.');
      return;
    }
    var isEdit = !!tx;
    defaults = defaults || {};
    var members = getMembers();
    var defType = defaults.type === 'income' ? 'income' : 'expense';
    var defCategory = typeof defaults.category === 'string' ? defaults.category : null;
    var defList = App.catList(defType);
    var defCategoryValid = defCategory && defList.some(function (cat) { return cat.key === defCategory; });
    var st = {
      type: isEdit ? tx.type : defType,
      category: isEdit ? tx.category : (defCategoryValid ? defCategory : (defType === 'income' ? 'gehalt' : 'lebensmittel')),
      payerId: isEdit ? tx.payerId : (defaults.payerId === 'p2' ? 'p2' : 'p1'),
      shared: isEdit ? !!tx.shared : defaults.shared === true   // default: privat (zählt nicht in die Paar-Bilanz)
    };

    var content = App.el('div', '');

    // --- type segmented ---
    var typeGroup = App.el('div', 'form-group');
    var segType = App.el('div', 'segmented');
    var typeDefs = [
      { key: 'expense', label: 'Ausgabe' },
      { key: 'income', label: 'Einnahme' }
    ];
    var typeSegEls = {};
    typeDefs.forEach(function (d) {
      var seg = App.el('button', 'segment', d.label);
      seg.type = 'button';
      if (st.type === d.key) seg.classList.add('active');
      seg.addEventListener('click', function () {
        if (st.type === d.key) return;
        st.type = d.key;
        typeDefs.forEach(function (t) {
          typeSegEls[t.key].classList.toggle('active', t.key === st.type);
        });
        var list = App.catList(st.type);
        var stillValid = list.some(function (c) { return c.key === st.category; });
        if (!stillValid) st.category = (st.type === 'income') ? 'gehalt' : 'lebensmittel';
        buildCatGrid();
        updateSharedLabel();
        payerLabel.textContent = (st.type === 'income') ? 'Empfänger' : 'Bezahlt von';
      });
      typeSegEls[d.key] = seg;
      segType.appendChild(seg);
    });
    typeGroup.appendChild(segType);
    content.appendChild(typeGroup);

    // --- amount (built here, appended with the lower option fields) ---
    var amountGroup = App.el('div', 'form-group');
    amountGroup.appendChild(App.el('div', 'form-label', 'Betrag (€)'));
    var amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.className = 'input amount-field';
    amountInput.inputMode = 'decimal';
    amountInput.placeholder = '0,00';
    amountInput.autocomplete = 'off';
    amountInput.setAttribute('aria-label', 'Betrag in Euro');
    if (isEdit) amountInput.value = centsToInput(tx.amountCents);
    amountGroup.appendChild(amountInput);

    // --- category grid ---
    var catGroup = App.el('div', 'form-group');
    catGroup.appendChild(App.el('div', 'form-label', 'Kategorie'));
    var catGrid = App.el('div', 'cat-grid');
    catGroup.appendChild(catGrid);
    content.appendChild(catGroup);

    function buildCatGrid() {
      catGrid.innerHTML = '';
      App.catList(st.type).forEach(function (c) {
        var chip = App.el('button', 'cat-chip');
        chip.type = 'button';
        var em = App.el('span', '');
        em.style.color = c.color;
        em.appendChild(App.icon(c.icon, 22));
        chip.appendChild(em);
        chip.appendChild(App.el('span', '', c.label));
        if (c.key === st.category) chip.classList.add('active');
        chip.addEventListener('click', function () {
          st.category = c.key;
          Array.prototype.forEach.call(catGrid.children, function (el) {
            el.classList.remove('active');
          });
          chip.classList.add('active');
        });
        catGrid.appendChild(chip);
      });
    }
    buildCatGrid();

    // --- date ---
    var dateGroup = App.el('div', 'form-group');
    dateGroup.appendChild(App.el('div', 'form-label', 'Datum'));
    var dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'input';
    dateInput.value = isEdit ? tx.date : (typeof defaults.date === 'string' ? defaults.date : App.todayISO());
    dateGroup.appendChild(dateInput);
    content.appendChild(dateGroup);

    // --- payer segmented ---
    var payerGroup = App.el('div', 'form-group');
    var payerLabel = App.el('div', 'form-label', st.type === 'income' ? 'Empfänger' : 'Bezahlt von');
    payerGroup.appendChild(payerLabel);
    var segPayer = App.el('div', 'segmented');
    var payerSegEls = {};
    members.forEach(function (m) {
      var seg = App.el('button', 'segment', m.name || m.id);
      seg.type = 'button';
      if (st.payerId === m.id) seg.classList.add('active');
      seg.addEventListener('click', function () {
        st.payerId = m.id;
        members.forEach(function (mm) {
          payerSegEls[mm.id].classList.toggle('active', mm.id === st.payerId);
        });
      });
      payerSegEls[m.id] = seg;
      segPayer.appendChild(seg);
    });
    payerGroup.appendChild(segPayer);
    content.appendChild(payerGroup);

    // --- private / shared segmented (for both income and expense) ---
    var sharedGroup = App.el('div', 'form-group');
    var sharedLabelEl = App.el('div', 'form-label', 'Zuordnung');
    sharedGroup.appendChild(sharedLabelEl);
    var segShared = App.el('div', 'segmented');
    var sharedDefs = [
      { val: false, label: 'Privat' },
      { val: true, label: 'Gemeinsam' }
    ];
    var sharedSegEls = [];
    sharedDefs.forEach(function (d) {
      var seg = App.el('button', 'segment', d.label);
      seg.type = 'button';
      if (st.shared === d.val) seg.classList.add('active');
      seg.addEventListener('click', function () {
        st.shared = d.val;
        sharedSegEls.forEach(function (el, i) {
          el.classList.toggle('active', sharedDefs[i].val === st.shared);
        });
      });
      sharedSegEls.push(seg);
      segShared.appendChild(seg);
    });
    sharedGroup.appendChild(segShared);
    var sharedHint = App.el('div', 'form-label', 'Nur „Gemeinsam“ zählt in die Paar-Bilanz.');
    sharedHint.style.margin = '6px 0 0';
    sharedGroup.appendChild(sharedHint);
    content.appendChild(sharedGroup);

    // Keep money entry together with the concrete booking options.
    content.appendChild(amountGroup);

    // keeps the helper text in sync when the type toggles (purely cosmetic)
    function updateSharedLabel() {
      sharedHint.textContent = (st.type === 'income')
        ? 'Gemeinsame Einnahmen werden in der Paar-Bilanz 50/50 geteilt.'
        : 'Nur „Gemeinsam“ zählt in die Paar-Bilanz.';
    }
    updateSharedLabel();

    // --- note ---
    var noteGroup = App.el('div', 'form-group');
    noteGroup.appendChild(App.el('div', 'form-label', 'Notiz'));
    var noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'input';
    noteInput.placeholder = defaults.notePlaceholder || 'Notiz (z. B. Rewe, Netflix …)';
    noteInput.autocomplete = 'off';
    noteInput.value = isEdit ? (tx.note || '') : (typeof defaults.note === 'string' ? defaults.note : '');
    noteGroup.appendChild(noteInput);
    content.appendChild(noteGroup);

    // --- save ---
    var saveBtn = App.el('button', 'btn btn-primary', 'Speichern');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', function () {
      var cents = App.parseEUR(amountInput.value);
      if (cents === null || cents <= 0) {
        App.toast('Bitte gültigen Betrag eingeben');
        return;
      }
      var data = {
        type: st.type,
        amountCents: cents,
        category: st.category,
        note: noteInput.value.trim(),
        date: dateInput.value || App.todayISO(),
        payerId: st.payerId,
        shared: st.shared
      };
      if (isEdit) {
        Store.updateTransaction(tx.id, data);
      } else {
        data.recurringId = null;
        Store.addTransaction(data);
      }
      App.closeSheet();
      App.toast('Gespeichert ✓');
    });
    content.appendChild(saveBtn);

    // --- delete (edit only) ---
    if (isEdit) {
      var delBtn = App.el('button', 'btn btn-destructive', 'Löschen');
      delBtn.type = 'button';
      delBtn.style.marginTop = '10px';
      delBtn.addEventListener('click', function () {
        App.confirm({
          title: 'Buchung löschen?',
          message: 'Diese Buchung wird dauerhaft entfernt.',
          confirmText: 'Löschen',
          destructive: true
        }).then(function (ok) {
          if (!ok) return;
          var removed = Store.deleteTransaction(tx.id);
          App.closeSheet();
          App.toast('Gelöscht', removed ? {
            actionText: 'Rückgängig',
            onAction: function () {
              Store.restoreTransaction(removed);
              App.toast('Wiederhergestellt ✓');
            }
          } : undefined);
        });
      });
      content.appendChild(delBtn);
    }

    App.showSheet({
      title: isEdit ? 'Buchung bearbeiten' : (defaults.title || 'Neue Buchung'),
      content: content
    });

  }

  window.Views.transactions = {
    title: 'Buchungen',
    render: render,
    openEditor: openEditor,
    // Historical API kept harmless for old callers; the tab now always shows all bookings.
    setScope: function () {
    }
  };
})();
