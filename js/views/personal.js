/* js/views/personal.js — "Persönlich": per-person view (Gehalt, Fixkosten, private Ausgaben).
   Switch between the two partners; everything is scoped to the selected person and month. */
/* global App, Store, Analysis, Views */
(function () {
  'use strict';

  window.Views = window.Views || {};

  // module-level state (persists across re-renders)
  var selectedPerson = 'p1';   // 'p1' | 'p2'
  var selectedMonth = null;    // 'YYYY-MM'; lazily set to current month

  function currentMonthKey() {
    return App.monthKey(App.todayISO());
  }

  function personName(id) {
    return App.memberName(id) || (id === 'p1' ? 'Partner 1' : 'Partner 2');
  }

  function chevron(dir) {
    var span = document.createElement('span');
    span.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="' + (dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>';
    return span.firstChild;
  }

  function emptyState(text) {
    var box = App.el('div', 'empty-state');
    box.style.padding = '20px 12px';
    box.appendChild(App.el('div', 'row-sub', text));
    return box;
  }

  // --- person switcher (segmented control) ---
  function buildPersonSwitch() {
    var seg = App.el('div', 'segmented');
    seg.style.marginBottom = '14px';
    ['p1', 'p2'].forEach(function (pid) {
      var btn = App.el('button', 'segment' + (pid === selectedPerson ? ' active' : ''), personName(pid));
      btn.type = 'button';
      btn.addEventListener('click', function () {
        if (selectedPerson === pid) return;
        selectedPerson = pid;
        App.rerender();
      });
      seg.appendChild(btn);
    });
    return seg;
  }

  // --- month navigation ---
  function buildMonthNav() {
    var nav = App.el('div', 'month-nav');

    var prev = App.el('button', 'month-nav-btn');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Vorheriger Monat');
    prev.appendChild(chevron('left'));
    prev.addEventListener('click', function () {
      selectedMonth = App.addMonths(selectedMonth, -1);
      App.rerender();
    });

    var title = App.el('div', 'month-nav-title', App.fmtMonth(selectedMonth));

    var next = App.el('button', 'month-nav-btn');
    next.type = 'button';
    next.setAttribute('aria-label', 'Nächster Monat');
    next.appendChild(chevron('right'));
    var atCurrent = selectedMonth >= currentMonthKey();
    if (atCurrent) {
      next.disabled = true;
      next.style.opacity = '0.3';
    } else {
      next.addEventListener('click', function () {
        selectedMonth = App.addMonths(selectedMonth, 1);
        App.rerender();
      });
    }

    nav.appendChild(prev);
    nav.appendChild(title);
    nav.appendChild(next);
    return nav;
  }

  // --- small line for the summary card ---
  function summaryLine(label, cents, sign, tone) {
    var row = App.el('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'baseline';
    row.style.padding = '6px 0';
    var l = App.el('span', '', label);
    l.style.color = 'var(--text-2)';
    l.style.fontSize = '15px';
    var v = App.el('span', '', (sign || '') + App.fmtEUR(cents));
    v.style.fontSize = '15px';
    v.style.fontWeight = '600';
    v.style.fontVariantNumeric = 'tabular-nums';
    if (tone === 'pos') v.style.color = 'var(--green)';
    else if (tone === 'neg') v.style.color = 'var(--red)';
    row.appendChild(l);
    row.appendChild(v);
    return row;
  }

  function buildSummaryCard(sum) {
    var card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Überblick'));

    var hero = App.el('div');
    hero.style.textAlign = 'center';
    hero.style.padding = '4px 0 12px';
    var big = App.el('div', '', App.fmtEUR(sum.leftoverCents));
    big.style.fontSize = '34px';
    big.style.fontWeight = '700';
    big.style.fontVariantNumeric = 'tabular-nums';
    big.style.color = sum.leftoverCents >= 0 ? 'var(--green)' : 'var(--red)';
    hero.appendChild(big);
    var sub = App.el('div', '', sum.leftoverCents >= 0
      ? 'bleibt ' + personName(selectedPerson) + ' diesen Monat'
      : 'mehr ausgegeben als eingenommen');
    sub.style.color = 'var(--text-2)';
    sub.style.fontSize = '13px';
    sub.style.marginTop = '2px';
    hero.appendChild(sub);
    card.appendChild(hero);

    card.appendChild(summaryLine('Gehalt & Einnahmen', sum.incomeCents, '+', 'pos'));
    card.appendChild(summaryLine('Fixkosten (mtl.)', sum.fixedCents, '−', 'neg'));
    card.appendChild(summaryLine('Private Ausgaben', sum.privateExpenseCents, '−', 'neg'));
    return card;
  }

  // --- generic transaction row (tappable → opens the booking editor) ---
  function txRow(tx) {
    var cat = App.cat(tx.category);
    var row = App.el('div', 'list-row');
    row.setAttribute('role', 'button');

    var icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

    var main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', tx.note || cat.label));
    main.appendChild(App.el('div', 'row-sub', cat.label + ' · ' + App.fmtDate(tx.date)));

    var trailing = App.el('div', 'row-trailing');
    var isIncome = tx.type === 'income';
    trailing.appendChild(App.el('span', isIncome ? 'amount-pos' : 'amount-neg',
      (isIncome ? '+' : '−') + App.fmtEUR(tx.amountCents)));

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
    row.addEventListener('click', function () {
      if (Views.transactions && Views.transactions.openEditor) Views.transactions.openEditor(tx);
    });
    return row;
  }

  // --- rule row (tappable → opens the recurring editor) ---
  function ruleRow(rule) {
    var cat = App.cat(rule.category);
    var row = App.el('div', 'list-row');
    row.setAttribute('role', 'button');

    var icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

    var word = rule.interval === 'quarterly' ? 'vierteljährlich'
      : rule.interval === 'yearly' ? 'jährlich' : 'monatlich';

    var main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', rule.name || cat.label));
    main.appendChild(App.el('div', 'row-sub', cat.label + ' · ' + word));

    var trailing = App.el('div', 'row-trailing');
    trailing.appendChild(App.el('span', 'amount-neg', '−' + App.fmtEUR(rule.amountCents)));

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
    row.addEventListener('click', function () {
      if (Views.recurring && Views.recurring.openEditor) Views.recurring.openEditor(rule);
    });
    return row;
  }

  function listCard(title, rows, emptyText) {
    var card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', title));
    if (!rows.length) {
      card.appendChild(emptyState(emptyText));
      return card;
    }
    var group = App.el('div', 'list-group');
    group.style.boxShadow = 'none';
    rows.forEach(function (r) { group.appendChild(r); });
    card.appendChild(group);
    return card;
  }

  function render(root) {
    if (!selectedMonth) selectedMonth = currentMonthKey();

    root.innerHTML = '';
    var view = App.el('div', 'view');

    var txs = Store.getTransactions();
    var rules = Store.getRecurring();
    var sum = Analysis.personalSummary(txs, rules, selectedPerson, selectedMonth);

    view.appendChild(buildPersonSwitch());
    view.appendChild(buildMonthNav());
    view.appendChild(buildSummaryCard(sum));

    // Gehalt & Einnahmen — actual income bookings of this person this month
    var incomeRows = txs
      .filter(function (t) {
        return t.payerId === selectedPerson && t.type === 'income' &&
          t.category !== 'ausgleich' && App.monthKey(t.date) === selectedMonth;
      })
      .map(txRow);
    view.appendChild(listCard('Gehalt & Einnahmen', incomeRows,
      'In diesem Monat noch keine Einnahmen erfasst.'));

    // Deine Fixkosten — active expense rules of this person
    var ruleRows = rules
      .filter(function (r) {
        return r.active && r.type === 'expense' && r.payerId === selectedPerson;
      })
      .map(ruleRow);
    view.appendChild(listCard('Fixkosten', ruleRows,
      'Noch keine Fixkosten auf ' + personName(selectedPerson) + ' angelegt.'));

    // Private Ausgaben — non-shared expenses of this person this month
    var privTxs = txs.filter(function (t) {
      return t.payerId === selectedPerson && t.type === 'expense' && t.shared !== true &&
        t.category !== 'ausgleich' && App.monthKey(t.date) === selectedMonth;
    });
    var privRows = privTxs.map(txRow);
    var privCard = listCard('Private Ausgaben', privRows,
      'In diesem Monat keine privaten Ausgaben.');
    if (privTxs.length) {
      var footer = App.el('p', 'row-sub',
        privTxs.length + (privTxs.length === 1 ? ' Buchung' : ' Buchungen') +
        ' · Σ ' + App.fmtEUR(sum.privateExpenseCents));
      footer.style.textAlign = 'center';
      footer.style.padding = '10px 0 2px';
      privCard.appendChild(footer);
    }
    view.appendChild(privCard);

    root.appendChild(view);
  }

  window.Views.personal = {
    title: 'Persönlich',
    render: render
  };
})();
