/* js/views/transactions.js — Buchungen view (list + filters + editor sheet) */
(function () {
  'use strict';

  window.Views = window.Views || {};

  // ---- module-level state (persists across re-renders) ----
  // Zwei Ansichten: „Gemeinsamer Topf" (nur gemeinsame Buchungen + Ausgleichszahlungen,
  // mit Einzahlungs-Übersicht pro Person) und „Alle Buchungen" (kompletter Monats-Ledger).
  var state = {
    scope: 'pot',      // 'pot' | 'all'
    month: null,       // 'YYYY-MM' — lazily initialized to current month
    search: ''
  };

  // closer of the currently open swipe cell (only one open at a time)
  var openSwipe = null;

  var SVG_CHEVRON_LEFT =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="15 18 9 12 15 6"></polyline></svg>';
  var SVG_CHEVRON_RIGHT =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="9 18 15 12 9 6"></polyline></svg>';

  function ensureMonth() {
    if (!state.month) state.month = App.monthKey(App.todayISO());
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

    view.appendChild(buildScopeSwitch(root));
    view.appendChild(buildMonthNav(root));
    view.appendChild(buildSearchbar(listWrap));
    view.appendChild(listWrap);
    renderList(listWrap);

    root.appendChild(view);
  }

  function buildScopeSwitch(root) {
    var seg = App.el('div', 'segmented');
    seg.style.marginBottom = '14px';
    [
      { key: 'pot', label: 'Gemeinsamer Topf' },
      { key: 'all', label: 'Alle Buchungen' }
    ].forEach(function (d) {
      var btn = App.el('button', 'segment' + (state.scope === d.key ? ' active' : ''), d.label);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        if (state.scope === d.key) return;
        state.scope = d.key;
        state.search = '';      // a search from the other scope would silently filter here
        render(root);
        window.scrollTo(0, 0);
      });
      seg.appendChild(btn);
    });
    return seg;
  }

  function buildMonthNav(root) {
    var nav = App.el('div', 'month-nav');

    var prev = App.el('button', 'month-nav-btn');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Vorheriger Monat');
    prev.innerHTML = SVG_CHEVRON_LEFT;
    prev.addEventListener('click', function () {
      state.month = App.addMonths(state.month, -1);
      render(root);
    });

    var title = App.el('div', 'month-nav-title', App.fmtMonth(state.month));

    var next = App.el('button', 'month-nav-btn');
    next.type = 'button';
    next.setAttribute('aria-label', 'Nächster Monat');
    next.innerHTML = SVG_CHEVRON_RIGHT;
    next.addEventListener('click', function () {
      state.month = App.addMonths(state.month, 1);
      render(root);
    });

    nav.appendChild(prev);
    nav.appendChild(title);
    nav.appendChild(next);
    return nav;
  }

  function buildSearchbar(listWrap) {
    var bar = App.el('div', 'searchbar');
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Suchen…';
    input.autocomplete = 'off';
    input.value = state.search;
    input.setAttribute('aria-label', 'Buchungen durchsuchen');
    input.addEventListener('input', function () {
      state.search = input.value;
      renderList(listWrap);
    });
    bar.appendChild(input);
    return bar;
  }

  // ------------------------------------------------------------------ list

  // Monthly ledger: real transactions plus due recurring rules that are not booked yet.
  function ruleDueDate(rule) {
    var day = Math.min(28, Math.max(1, parseInt(rule.dueDay, 10) || 1));
    return state.month + '-' + String(day).padStart(2, '0');
  }

  function entryDate(entry) {
    return entry.kind === 'rule' ? entry.item.dueDateISO : entry.item.date;
  }

  function entryCreatedAt(entry) {
    return entry.kind === 'tx' ? (entry.item.createdAt || '') : '';
  }

  function getLedgerEntries() {
    var q = state.search.trim().toLowerCase();
    var txs = Store.getTransactions();
    var rules = Store.getRecurring();
    var entries = [];

    txs.forEach(function (tx) {
      var isSettlement = tx.category === 'ausgleich';
      if (state.scope === 'pot') {
        // pot: shared bookings + settlement transfers (traceable history)
        if (tx.shared !== true && !isSettlement) return;
      } else if (isSettlement) {
        return;
      }
      if (App.monthKey(tx.date) !== state.month) return;
      if (q) {
        var cat = App.cat(tx.category);
        var txHay = [
          tx.note || '',
          cat.label,
          App.memberName(tx.payerId),
          tx.shared === true ? 'gemeinsam geteilt' : 'privat',
          tx.type === 'income' ? 'einnahme' : 'ausgabe'
        ].join(' ').toLowerCase();
        if (txHay.indexOf(q) === -1) return;
      }
      entries.push({ kind: 'tx', item: tx });
    });

    Analysis.upcomingForMonth(rules, txs, state.month, App.todayISO()).forEach(function (item) {
      if (item.status === 'paid') return;
      var rule = item.rule;
      if (state.scope === 'pot' && rule.shared !== true) return;
      if (q) {
        var cat = App.cat(rule.category);
        var ruleHay = [
          rule.name || '',
          cat.label,
          App.memberName(rule.payerId),
          rule.shared === true ? 'gemeinsam geteilt' : 'privat',
          rule.type === 'income' ? 'einnahme'
            : (rule.privateExpense === true ? 'private ausgabe' : 'fixkosten ausgabe')
        ].join(' ').toLowerCase();
        if (ruleHay.indexOf(q) === -1) return;
      }
      entries.push({ kind: 'rule', item: item });
    });

    entries.sort(function (a, b) {
      var ad = entryDate(a);
      var bd = entryDate(b);
      if (ad !== bd) return ad < bd ? 1 : -1;
      var ac = entryCreatedAt(a);
      var bc = entryCreatedAt(b);
      if (ac !== bc) return ac < bc ? 1 : -1;
      if (a.kind !== b.kind) return a.kind === 'rule' ? -1 : 1;
      return 0;
    });

    return entries;
  }

  // Live total card — always visible, recomputed on every render/search/data change.
  function buildTotalCard(entries) {
    var expenseSum = 0;   // consumption + open fixed costs (savings excluded)
    var savingsSum = 0;   // transfers into 'sparen' (booked or still open)
    var incomeSum = 0;
    entries.forEach(function (entry) {
      var item = entry.kind === 'rule' ? entry.item.rule : entry.item;
      if (item.type === 'income') incomeSum += item.amountCents;
      else if (item.type === 'expense' && item.category === 'sparen') savingsSum += item.amountCents;
      else if (item.type === 'expense') expenseSum += item.amountCents;
    });
    var card = App.el('div', 'card hero-card');
    card.appendChild(App.cardHead('Ausgaben & Fixkosten · ' + App.fmtMonth(state.month), function () {
      return App.infoContent([
        { p: 'Der Monats-Ledger: alle Buchungen dieses Monats – private und gemeinsame – plus die ' +
             'noch nicht gebuchten Fixkosten (orange markiert, mit „Buchen“-Knopf).' },
        { row: ['Ausgaben (inkl. offener Fixkosten)', '−' + App.fmtEUR(expenseSum), 'neg'] },
        { row: ['Sparraten', '−' + App.fmtEUR(savingsSum), 'saving'] },
        { row: ['Einnahmen', '+' + App.fmtEUR(incomeSum), 'pos'] },
        { p: 'Die große Zahl zeigt die Ausgaben; Sparraten sind Vermögensaufbau und stehen ' +
             'separat darunter. Ausgleichszahlungen zählen hier nicht mit – ihre Historie ' +
             'findest du im Gemeinsamen Topf.' }
      ]);
    }));
    var big = App.el('div', 'hero-amount', App.fmtEUR(expenseSum));
    card.appendChild(big);
    var n = entries.length;
    var subText = (n === 1 ? '1 Eintrag' : n + ' Eintr\u00e4ge');
    if (savingsSum > 0) subText += ' · Sparraten ' + App.fmtEUR(savingsSum);
    if (incomeSum > 0) subText += ' · Einnahmen ' + App.fmtEUR(incomeSum);
    var sub = App.el('div', 'hero-sub', subText);
    card.appendChild(sub);
    return card;
  }

  // ---------------------------------------------------------------- pot card

  function settleUp(balance) {
    var debtorId = balance.debtorId;
    var creditorId = debtorId === 'p1' ? 'p2' : 'p1';
    App.confirm({
      title: 'Ausgleichen',
      message:
        App.memberName(debtorId) + ' zahlt ' + App.memberName(creditorId) + ' ' +
        App.fmtEUR(balance.owesCents) + '. Eine Ausgleichs-Buchung wird erstellt.',
      confirmText: 'Ausgleichen'
    }).then(function (ok) {
      if (!ok) return;
      Store.addTransaction({
        type: 'expense',
        amountCents: balance.owesCents,
        category: 'ausgleich',
        note: 'Ausgleich',
        date: App.todayISO(),
        payerId: debtorId,
        shared: false,
        recurringId: null
      });
      App.toast('Ausgleich gebucht ✓');
    });
  }

  // Pot hero: shared expenses booked this month, contributions per person,
  // running balance (all-time, after settlements) + settle button + quick add.
  function buildPotCard(entries) {
    var card = App.el('div', 'card hero-card');
    card.appendChild(App.cardHead('Gemeinsamer Topf · ' + App.fmtMonth(state.month), function () {
      var allTxs = Store.getTransactions();
      var bal = Analysis.coupleBalance(allTxs);
      var name1 = App.memberName('p1') || 'p1';
      var name2 = App.memberName('p2') || 'p2';
      var settledSum = 0;
      allTxs.forEach(function (t) {
        if (t.category === 'ausgleich') settledSum += t.amountCents;
      });

      var blocks = [
        { p: 'So funktioniert der Topf: Markiert eine Buchung als „Gemeinsam“ – egal, wer sie ' +
             'anlegt. Sie landet hier mit Name und Farbe der Person, die bezahlt hat. Unten in der ' +
             'Liste steht die komplette Historie, inklusive Ausgleichszahlungen.' },
        { h: 'Abrechnung über alle Monate' },
        { row: ['Eingezahlt ' + name1, App.fmtEUR(bal.paidSharedCents.p1)] },
        { row: ['Eingezahlt ' + name2, App.fmtEUR(bal.paidSharedCents.p2)] },
        // same formula as coupleBalance: shared income held by one partner
        // counts against what they fronted
        { row: ['Hälfte der Differenz', App.fmtEUR(Math.round(Math.abs(
          (bal.paidSharedCents.p1 - bal.paidSharedCents.p2) -
          (bal.receivedSharedCents.p1 - bal.receivedSharedCents.p2)) / 2))] }
      ];
      if (bal.receivedSharedCents.p1 > 0 || bal.receivedSharedCents.p2 > 0) {
        blocks.push({ row: ['Gemeinsame Einnahmen ' + name1, App.fmtEUR(bal.receivedSharedCents.p1)] });
        blocks.push({ row: ['Gemeinsame Einnahmen ' + name2, App.fmtEUR(bal.receivedSharedCents.p2)] });
      }
      if (settledSum > 0) {
        blocks.push({ row: ['Ausgleichszahlungen (verrechnet)', App.fmtEUR(settledSum)] });
      }
      blocks.push(
        { hr: true },
        bal.debtorId
          ? { row: [(App.memberName(bal.debtorId) || bal.debtorId) + ' schuldet ' +
              (App.memberName(bal.debtorId === 'p1' ? 'p2' : 'p1') || ''), App.fmtEUR(bal.owesCents), 'neg'] }
          : { row: ['Offen', App.fmtEUR(0)] },
        { p: 'Es zahlt immer, wer weniger eingezahlt hat: die Hälfte der Differenz, abzüglich ' +
             'bereits gebuchter Ausgleichszahlungen. „Ausgleichen“ bucht die Rückzahlung – danach ' +
             'seid ihr quitt.' }
      );
      return App.infoContent(blocks);
    }));

    var expenseSum = 0;
    var paid = { p1: 0, p2: 0 };
    entries.forEach(function (entry) {
      if (entry.kind !== 'tx') return;
      var tx = entry.item;
      if (tx.category === 'ausgleich' || tx.shared !== true || tx.type !== 'expense') return;
      expenseSum += tx.amountCents;
      if (paid[tx.payerId] !== undefined) paid[tx.payerId] += tx.amountCents;
    });

    card.appendChild(App.el('div', 'hero-amount', App.fmtEUR(expenseSum)));
    card.appendChild(App.el('div', 'hero-sub', 'gemeinsame Ausgaben in diesem Monat'));

    // contributions per person (single note instead of two zero rows)
    if (paid.p1 === 0 && paid.p2 === 0) {
      var none = App.el('p', 'row-sub', 'Noch keine Einzahlungen in diesem Monat.');
      none.style.margin = '2px 0 0';
      card.appendChild(none);
    } else {
      ['p1', 'p2'].forEach(function (pid) {
        var row = App.el('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '5px 0';
        var label = App.el('span');
        label.style.display = 'inline-flex';
        label.style.alignItems = 'center';
        label.style.gap = '8px';
        var dot = App.el('span', 'dot');
        dot.style.background = memberColor(pid);
        label.appendChild(dot);
        label.appendChild(App.el('span', '', (App.memberName(pid) || pid) + ' hat eingezahlt'));
        var val = App.el('span', '', App.fmtEUR(paid[pid]));
        val.style.fontWeight = '600';
        val.style.fontVariantNumeric = 'tabular-nums';
        row.appendChild(label);
        row.appendChild(val);
        card.appendChild(row);
      });
    }

    var sep = App.el('div');
    sep.style.height = '0.5px';
    sep.style.background = 'var(--sep)';
    sep.style.margin = '10px 0';
    card.appendChild(sep);

    // running balance across all months (settlements included)
    var balance = Analysis.coupleBalance(Store.getTransactions());
    if (balance.owesCents > 0 && balance.debtorId) {
      var creditor = balance.debtorId === 'p1' ? 'p2' : 'p1';
      var line = App.el('p', '',
        (App.memberName(balance.debtorId) || balance.debtorId) + ' schuldet ' +
        (App.memberName(creditor) || creditor) + ' ' + App.fmtEUR(balance.owesCents));
      line.style.fontSize = '15px';
      line.style.fontWeight = '600';
      line.style.margin = '0 0 10px';
      card.appendChild(line);

      var settleBtn = App.el('button', 'btn btn-secondary', 'Ausgleichen');
      settleBtn.type = 'button';
      settleBtn.addEventListener('click', function () { settleUp(balance); });
      card.appendChild(settleBtn);
    } else {
      var quitt = App.el('p', '', 'Ihr seid quitt ✓');
      quitt.style.fontSize = '15px';
      quitt.style.fontWeight = '600';
      quitt.style.margin = '0';
      card.appendChild(quitt);
    }

    var addBtn = App.el('button', 'btn btn-primary', '+ Gemeinsame Ausgabe');
    addBtn.type = 'button';
    addBtn.style.marginTop = '12px';
    addBtn.addEventListener('click', function () {
      openEditor(null, { shared: true });
    });
    card.appendChild(addBtn);

    return card;
  }

  function renderList(wrap) {
    wrap.innerHTML = '';
    var entries = getLedgerEntries();

    // live summary always on top
    wrap.appendChild(state.scope === 'pot' ? buildPotCard(entries) : buildTotalCard(entries));

    if (!entries.length) {
      var hasSearch = state.search.trim() !== '';
      var empty = App.el('div', 'empty-state');
      var em = App.el('span', '', '🧾');
      em.style.fontSize = '40px';
      em.style.display = 'block';
      empty.appendChild(em);
      empty.appendChild(App.el('p', '', hasSearch
        ? 'Keine Treffer für deine Suche.'
        : (state.scope === 'pot'
          ? 'Noch keine gemeinsamen Buchungen in diesem Monat. Tippe auf „+ Gemeinsame Ausgabe“.'
          : 'Noch keine Buchungen in diesem Monat.')));
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
        if (entry.kind === 'rule') {
          listGroup.appendChild(buildRuleEntryRow(entry.item));
          return;
        }
        var tx = entry.item;
        listGroup.appendChild(makeSwipeable(
          buildTxRow(tx),
          function () { openEditor(tx); },
          function () {
            Store.deleteTransaction(tx.id);
            App.toast('Buchung gelöscht');
          }
        ));
      });
      wrap.appendChild(listGroup);
    });
  }

  function bookRule(item) {
    var rule = item.rule;
    Store.addTransaction({
      type: rule.type,
      amountCents: rule.amountCents,
      category: rule.category,
      note: rule.name,
      date: item.dueDateISO || ruleDueDate(rule),
      payerId: rule.payerId,
      shared: rule.shared,
      recurringId: rule.id
    });
    App.toast('Eintrag gebucht');
  }

  function buildTxRow(tx) {
    var cat = App.cat(tx.category);
    var isIncome = tx.type === 'income';
    var row = App.el('div', 'list-row');
    row.setAttribute('role', 'button');
    // coloured left edge by direction: red = Ausgabe (Minus), grün = Einnahme (Plus)
    row.style.boxShadow = 'inset 4px 0 0 0 ' + (isIncome ? 'var(--green)' : 'var(--red)');
    // faint matching tint so the tile reads as money-out / money-in at a glance
    row.style.background = isIncome
      ? 'color-mix(in srgb, var(--green) 7%, var(--bg-card))'
      : 'color-mix(in srgb, var(--red) 7%, var(--bg-card))';

    var icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

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

  function buildRuleEntryRow(item) {
    var rule = item.rule;
    var cat = App.cat(rule.category);
    var isIncome = rule.type === 'income';
    var row = App.el('div', 'list-row rule-entry-row');
    row.setAttribute('role', 'button');
    row.style.boxShadow = 'inset 4px 0 0 0 var(--orange)';
    row.style.background = 'color-mix(in srgb, var(--orange) 8%, var(--bg-card))';

    var icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

    var main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', rule.name || cat.label));

    var sub = App.el('div', 'row-sub');
    sub.style.display = 'flex';
    sub.style.alignItems = 'center';
    sub.style.gap = '6px';
    var dot = App.el('span', 'dot');
    dot.style.background = memberColor(rule.payerId);
    dot.style.width = '7px';
    dot.style.height = '7px';
    sub.appendChild(dot);
    sub.appendChild(document.createTextNode(
      (isIncome ? 'Wiederkehrend' : (rule.privateExpense === true ? 'Private Ausgabe' : 'Fixkosten')) +
      ' \u00b7 ' + cat.label + ' \u00b7 ' + (App.memberName(rule.payerId) || '-') +
      ' \u00b7 ' + (rule.shared === true ? 'Gemeinsam' : 'Privat')
    ));
    main.appendChild(sub);

    var trailing = App.el('div', 'row-trailing');
    trailing.appendChild(App.el('span', isIncome ? 'amount-pos' : 'amount-neg',
      (isIncome ? '+' : '\u2212') + App.fmtEUR(rule.amountCents)));

    var btn = App.el('button', 'btn btn-secondary btn-small', 'Buchen');
    btn.type = 'button';
    btn.style.marginLeft = '10px';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      bookRule(item);
    });

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
    row.appendChild(btn);
    row.addEventListener('click', function () {
      if (Views.recurring && Views.recurring.openEditor) Views.recurring.openEditor(rule);
    });
    return row;
  }

  // Wrap a list row so it can be swiped left to reveal a red "Löschen" action.
  // onTap fires on a normal tap (when closed); onDelete on the action or a full swipe.
  function makeSwipeable(rowEl, onTap, onDelete) {
    var ACTION_W = 88;
    var cell = App.el('div', 'swipe-cell');
    var action = App.el('button', 'swipe-action', 'Löschen');
    action.type = 'button';
    action.setAttribute('aria-label', 'Buchung löschen');
    cell.appendChild(action);
    cell.appendChild(rowEl);

    var open = false;
    var startX = 0, startY = 0, curX = 0, base = 0;
    var dragging = false, decided = false, suppressClick = false;

    function setX(x) {
      curX = x;
      rowEl.style.transform = x ? 'translateX(' + x + 'px)' : '';
    }
    function openCell() {
      open = true;
      cell.classList.remove('dragging');
      cell.classList.add('open');
      setX(-ACTION_W);
      openSwipe = closeCell;
    }
    function closeCell() {
      open = false;
      cell.classList.remove('dragging');
      cell.classList.remove('open');
      setX(0);
      if (openSwipe === closeCell) openSwipe = null;
    }
    function doDelete() {
      cell.classList.remove('open');
      if (openSwipe === closeCell) openSwipe = null;
      onDelete();
    }

    function onMove(e) {
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { end(); return; } // vertical → allow scroll
        decided = true;
        dragging = true;
        cell.classList.add('dragging');
        try { rowEl.setPointerCapture(e.pointerId); } catch (err) { /* not critical */ }
        if (openSwipe && openSwipe !== closeCell) openSwipe();
      }
      if (e.cancelable) e.preventDefault();
      var x = base + dx;
      if (x > 0) x = x * 0.2;                                  // rubber-band right
      if (x < -ACTION_W) x = -ACTION_W + (x + ACTION_W) * 0.3; // resist past the action
      setX(x);
    }
    function onUp() {
      if (dragging) {
        cell.classList.remove('dragging');
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 80);
        if (curX < -ACTION_W * 1.5) doDelete();
        else if (curX < -ACTION_W * 0.5) openCell();
        else closeCell();
      }
      end();
    }
    function end() {
      rowEl.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragging = false;
      decided = false;
    }

    rowEl.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      base = open ? -ACTION_W : 0;
      decided = false;
      dragging = false;
      rowEl.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    rowEl.addEventListener('click', function (e) {
      if (suppressClick) { e.preventDefault(); suppressClick = false; return; }
      if (open) { closeCell(); return; }
      onTap();
    });

    action.addEventListener('click', function (e) {
      e.stopPropagation();
      doDelete();
    });

    return cell;
  }

  // ---------------------------------------------------------------- editor

  // defaults (optional): { shared, payerId } to preset a NEW booking
  // (used by the pot's "+ Gemeinsame Ausgabe" button)
  function openEditor(tx, defaults) {
    // Settlements must not be edited: the editor has no 'ausgleich' category, so a
    // type switch would silently convert the transfer into a regular booking and
    // corrupt the couple balance. Delete + re-settle instead.
    if (tx && tx.category === 'ausgleich') {
      App.toast('Ausgleichszahlung: zum Korrigieren löschen (nach links wischen) und neu ausgleichen.');
      return;
    }
    var isEdit = !!tx;
    defaults = defaults || {};
    var members = getMembers();
    var st = {
      type: isEdit ? tx.type : 'expense',
      category: isEdit ? tx.category : 'lebensmittel',
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
        var em = App.el('span', '', c.emoji);
        em.style.fontSize = '20px';
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
    dateInput.value = isEdit ? tx.date : App.todayISO();
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
    noteInput.placeholder = 'Notiz (z. B. Rewe, Netflix …)';
    noteInput.autocomplete = 'off';
    noteInput.value = isEdit ? (tx.note || '') : '';
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
          Store.deleteTransaction(tx.id);
          App.closeSheet();
          App.toast('Gelöscht');
        });
      });
      content.appendChild(delBtn);
    }

    App.showSheet({
      title: isEdit ? 'Buchung bearbeiten' : 'Neue Buchung',
      content: content
    });

  }

  window.Views.transactions = {
    title: 'Buchungen',
    render: render,
    openEditor: openEditor,
    // preset the scope before switching to this tab (used by the dashboard's pot link)
    setScope: function (scope) {
      if (scope === 'pot' || scope === 'all') state.scope = scope;
    }
  };
})();
