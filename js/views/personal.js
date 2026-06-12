/* js/views/personal.js — "Persönlich": per-person view (Gehalt, Fixkosten, private Ausgaben).
   Switch between the two partners; everything is scoped to the selected person and month. */
/* global App, Store, Analysis, Views, Charts */
(function () {
  'use strict';

  window.Views = window.Views || {};

  // module-level state (persists across re-renders)
  var selectedPerson = 'p1';   // 'p1' | 'p2'
  var selectedMonth = null;    // 'YYYY-MM'; synced via App.getMonth()/setMonth()

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
      App.setMonth(selectedMonth);
      App.rerender();
    });

    var title = App.el('div', 'month-nav-title', App.fmtMonth(selectedMonth));

    var next = App.el('button', 'month-nav-btn');
    next.type = 'button';
    next.setAttribute('aria-label', 'Nächster Monat');
    next.appendChild(chevron('right'));
    // future months are allowed: shows upcoming due items per person
    next.addEventListener('click', function () {
      selectedMonth = App.addMonths(selectedMonth, 1);
      App.setMonth(selectedMonth);
      App.rerender();
    });

    nav.appendChild(prev);
    nav.appendChild(title);
    nav.appendChild(next);
    return nav;
  }

  // --- small line for the summary card ---
  function summaryLine(label, cents, sign, tone) {
    var row = App.el('div', 'personal-summary-line');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'baseline';
    var l = App.el('span', '', label);
    l.style.color = 'var(--text-2)';
    l.style.fontSize = '15px';
    var v = App.el('span', '', (sign || '') + App.fmtEUR(cents));
    v.style.fontSize = '15px';
    v.style.fontWeight = '600';
    v.style.fontVariantNumeric = 'tabular-nums';
    if (tone === 'pos') v.style.color = 'var(--green)';
    else if (tone === 'neg') v.style.color = 'var(--red)';
    else if (tone === 'saving') v.style.color = 'var(--teal)';
    row.appendChild(l);
    row.appendChild(v);
    return row;
  }

  function chartLegend(label, cents, color, tone) {
    var row = App.el('div', 'personal-chart-legend-row');
    var labelWrap = App.el('div', 'personal-chart-legend-label');
    var dot = App.el('span', 'dot');
    dot.style.background = color;
    labelWrap.appendChild(dot);
    labelWrap.appendChild(App.el('span', '', label));
    row.appendChild(labelWrap);

    var value = App.el('span', tone === 'saving' ? 'amount-saving' : 'amount-neg', App.fmtEUR(cents));
    row.appendChild(value);
    return row;
  }

  function buildPersonalChart(sum) {
    var savings = Math.max(0, sum.savingsCents || 0);
    var privateSpent = Math.max(0, sum.privateSpentCents || 0);
    var total = savings + privateSpent;
    var wrap = App.el('div', 'personal-chart');

    if (total <= 0) {
      wrap.appendChild(App.el('p', 'row-sub', 'Noch keine privaten Ausgaben oder Sparraten in diesem Monat.'));
      return wrap;
    }

    var chart = App.el('div', 'personal-chart-donut');
    Charts.donut(chart, [
      { label: 'Gespart', value: savings, color: 'var(--teal)' },
      { label: 'Private Ausgaben', value: privateSpent, color: 'var(--red)' }
    ], {
      size: 154,
      stroke: 18,
      centerTitle: App.fmtEUR(total),
      centerSub: 'privat'
    });
    wrap.appendChild(chart);

    var legend = App.el('div', 'personal-chart-legend');
    legend.appendChild(chartLegend('Gespart', savings, 'var(--teal)', 'saving'));
    legend.appendChild(chartLegend('Private Ausgaben', privateSpent, 'var(--red)', 'neg'));
    wrap.appendChild(legend);
    return wrap;
  }

  function buildSummaryCard(sum) {
    var card = App.el('div', 'card');
    card.appendChild(App.cardHead('Überblick', function () {
      var blocks = [
        { row: ['Gehalt & Einnahmen', '+' + App.fmtEUR(sum.incomeCents), 'pos'] },
        { row: ['Gemeinsame Fixkosten (Anteil)', '−' + App.fmtEUR(sum.fixedCents), 'neg'] }
      ];
      if (sum.privateRecurringCents > 0) {
        blocks.push({ row: ['Private laufende Kosten', '−' + App.fmtEUR(sum.privateRecurringCents), 'neg'] });
      }
      if (sum.nonMonthlyDueCents > 0) {
        blocks.push({ row: ['Diesen Monat zusätzlich fällig', '−' + App.fmtEUR(sum.nonMonthlyDueCents), 'neg'] });
      }
      if (sum.savingsCents > 0) {
        blocks.push({ row: ['Gespart', '−' + App.fmtEUR(sum.savingsCents), 'saving'] });
      }
      blocks.push({ row: ['Private Ausgaben (gebucht)', '−' + App.fmtEUR(sum.privateSpentCents), 'neg'] });
      if (sum.sharedVariableCents > 0) {
        blocks.push({ row: ['Gemeinsame Ausgaben (½)', '−' + App.fmtEUR(sum.sharedVariableCents), 'neg'] });
      }
      blocks.push(
        { hr: true },
        { row: ['Bleibt übrig', App.fmtEUR(sum.leftoverCents), sum.leftoverCents >= 0 ? 'pos' : 'neg'] },
        { p: 'Deine Monatsrechnung. Gemeinsame Fixkosten zählen zur Hälfte. Private laufende Kosten bleiben bei dir.' }
      );
      return App.infoContent(blocks);
    }));

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

    card.appendChild(buildPersonalChart(sum));

    card.appendChild(summaryLine('Gehalt & Einnahmen', sum.incomeCents, '+', 'pos'));
    card.appendChild(summaryLine('Gemeinsame Fixkosten (Anteil)', sum.fixedCents, '−', 'neg'));
    if (sum.privateRecurringCents > 0) {
      card.appendChild(summaryLine('Private laufende Kosten', sum.privateRecurringCents, '−', 'neg'));
    }
    if (sum.nonMonthlyDueCents > 0) {
      card.appendChild(summaryLine('Diesen Monat zusätzlich fällig', sum.nonMonthlyDueCents, '−', 'neg'));
      sum.nonMonthlyItems.forEach(function (item) {
        var word = item.interval === 'quarterly' ? 'vierteljährlich' : 'jährlich';
        var row = App.el('div', 'row-sub');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '4px';
        row.style.padding = '0 0 4px 12px';
        row.appendChild(App.icon('calendar-days', 12));
        row.appendChild(document.createTextNode(
          item.name + (item.shared ? ' (½ gemeinsam)' : ' (privat)') + ' · ' + word + ' · ' + App.fmtEUR(item.shareCents)));
        card.appendChild(row);
      });
    }
    if (sum.savingsCents > 0) {
      card.appendChild(summaryLine('Gespart', sum.savingsCents, '−', 'saving'));
    }
    card.appendChild(summaryLine('Private Ausgaben (gebucht)', sum.privateSpentCents, '−', 'neg'));
    if (sum.sharedVariableCents > 0) {
      card.appendChild(summaryLine('Gemeinsame Ausgaben (½)', sum.sharedVariableCents, '−', 'neg'));
    }

    var note = App.el('p', 'row-sub', 'Gemeinsame Posten zählen für beide je zur Hälfte.');
    note.style.textAlign = 'center';
    note.style.marginTop = '8px';
    card.appendChild(note);
    return card;
  }

  // --- generic transaction row (tappable → opens the booking editor) ---
  function txRow(tx) {
    var cat = App.cat(tx.category);
    var row = App.el('div', 'list-row');
    row.setAttribute('role', 'button');

    var icon = App.catIcon(tx.category);

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

    var icon = App.catIcon(rule.category);

    var word = rule.interval === 'quarterly' ? 'vierteljährlich'
      : rule.interval === 'yearly' ? 'jährlich' : 'monatlich';

    var main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', rule.name || cat.label));
    var sub = App.el('div', 'row-sub');
    sub.style.display = 'flex';
    sub.style.alignItems = 'center';
    sub.style.gap = '4px';
    sub.appendChild(App.icon('repeat', 12));
    sub.appendChild(document.createTextNode(word + ' · ' + cat.label +
      (rule.shared === true
        ? ' · Gemeinsam (zählt ½) · zahlt ' + (personName(rule.payerId))
        : (rule.type === 'expense' ? ' · Privat' : ''))));
    main.appendChild(sub);

    var trailing = App.el('div', 'row-trailing');
    var isIncome = rule.type === 'income';
    trailing.appendChild(App.el('span', isIncome ? 'amount-pos' : 'amount-neg',
      (isIncome ? '+' : '−') + App.fmtEUR(rule.amountCents)));

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
    row.addEventListener('click', function () {
      if (Views.recurring && Views.recurring.openEditor) Views.recurring.openEditor(rule);
    });
    return row;
  }

  function txSwipeRow(tx) {
    return App.swipeToDelete(txRow(tx), function () {
      var removed = Store.deleteTransaction(tx.id);
      App.toast('Buchung gelöscht', removed ? { actionText: 'Rückgängig', onAction: function () {
        Store.restoreTransaction(removed); App.toast('Wiederhergestellt ✓'); } } : undefined);
    }, { ariaLabel: 'Buchung löschen' });
  }

  function ruleSwipeRow(rule) {
    return App.swipeToDelete(ruleRow(rule), function () {
      var removed = Store.deleteRecurring(rule.id);
      App.toast('Eintrag gelöscht', removed ? { actionText: 'Rückgängig', onAction: function () {
        Store.restoreRecurring(removed); App.toast('Wiederhergestellt ✓'); } } : undefined);
    }, { ariaLabel: 'Regel löschen' });
  }

  function sumAmounts(items) {
    return (items || []).reduce(function (sum, item) {
      return sum + (Number(item && item.amountCents) || 0);
    }, 0);
  }

  function totalFooter(count, cents, tone, label) {
    var footer = App.el('div', 'section-total');
    var countLabel = count === 1 ? 'Eintrag' : 'Einträge';
    footer.appendChild(App.el('span', '', count + ' ' + countLabel + ' · ' + (label || 'Summe')));
    footer.appendChild(App.el('span', tone === 'pos' ? 'amount-pos' : tone === 'saving' ? 'amount-saving' : 'amount-neg',
      App.fmtEUR(cents)));
    return footer;
  }

  function sectionCard(title, rows, emptyText, addBtn, footer) {
    var card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', title));
    if (rows.length) {
      var group = App.el('div', 'list-group');
      group.style.boxShadow = 'none';
      rows.forEach(function (r) { group.appendChild(r); });
      card.appendChild(group);
    } else {
      card.appendChild(emptyState(emptyText));
    }
    if (addBtn) card.appendChild(addBtn);
    if (footer) card.appendChild(footer);
    return card;
  }

  // a button that opens the recurring editor preset for this person + type
  function addRecurringBtn(label, type, opts) {
    var btn = App.el('button', 'btn btn-secondary', label);
    btn.type = 'button';
    btn.style.marginTop = '12px';
    btn.addEventListener('click', function () {
      if (Views.recurring && Views.recurring.openEditor) {
        var defaults = { type: type, payerId: selectedPerson };
        Object.keys(opts || {}).forEach(function (key) {
          defaults[key] = opts[key];
        });
        Views.recurring.openEditor(null, defaults);
      }
    });
    return btn;
  }

  function render(root) {
    selectedMonth = App.getMonth(); // shared across tabs — pick up switches made elsewhere

    root.innerHTML = '';
    var view = App.el('div', 'view');

    var txs = Store.getTransactions();
    var rules = Store.getRecurring();
    var sum = Analysis.personalSummary(txs, rules, selectedPerson, selectedMonth);

    view.appendChild(buildPersonSwitch());
    view.appendChild(buildMonthNav());
    view.appendChild(buildSummaryCard(sum));

    // Gehalt & wiederkehrende Einnahmen — recurring income rules (auto every month,
    // shared ones count half for each partner) plus one-off income bookings this month
    var incomeRules = rules
      .filter(function (r) {
        return r.active && r.type === 'income' &&
          (r.payerId === selectedPerson || r.shared === true);
      });
    var incomeRuleRows = incomeRules.map(ruleSwipeRow);
    var oneOffIncomeTxs = txs
      .filter(function (t) {
        return t.payerId === selectedPerson && t.type === 'income' && !t.recurringId &&
          t.category !== 'ausgleich' && App.monthKey(t.date) === selectedMonth;
      });
    var oneOffIncomeRows = oneOffIncomeTxs.map(txSwipeRow);
    var incomeRows = incomeRuleRows.concat(oneOffIncomeRows);
    view.appendChild(sectionCard('Gehalt & wiederkehrende Einnahmen',
      incomeRows,
      'Lege z. B. dein Gehalt als wiederkehrende Einnahme an – es erscheint dann jeden Monat automatisch.',
      addRecurringBtn('+ Wiederkehrende Einnahme', 'income'),
      totalFooter(incomeRows.length, sumAmounts(incomeRules) + sumAmounts(oneOffIncomeTxs), 'pos')));

    // Gemeinsame monatliche Fixkosten — shared monthly rules only. They count
    // half for each person, regardless of who actually pays the bill.
    var monthlySharedRules = rules
      .filter(function (r) {
        return r.active && r.type === 'expense' && r.shared === true &&
          r.interval === 'monthly' && r.category !== 'sparen';
      });
    var monthlySharedRows = monthlySharedRules.map(ruleSwipeRow);
    view.appendChild(sectionCard('Gemeinsame monatliche Fixkosten', monthlySharedRows,
      'Noch keine gemeinsamen monatlichen Fixkosten. Miete, Nebenkosten, Kredite oder Lebensmittel-Beiträge hier als „Gemeinsam“ anlegen.',
      addRecurringBtn('+ Monatliche Fixkosten', 'expense', {
        shared: true,
        interval: 'monthly',
        title: 'Neue gemeinsame Fixkosten'
      }),
      totalFooter(monthlySharedRows.length, sumAmounts(monthlySharedRules), 'neg', 'Summe gemeinsam')));

    // Gemeinsame Jahres-/Quartalskosten — shared non-monthly rules live here
    // so annual bills are visibly separate from the monthly baseline.
    var nonMonthlySharedRules = rules
      .filter(function (r) {
        return r.active && r.type === 'expense' && r.shared === true &&
          r.interval !== 'monthly' && r.category !== 'sparen';
      });
    var nonMonthlySharedRows = nonMonthlySharedRules.map(ruleSwipeRow);
    view.appendChild(sectionCard('Gemeinsame Jahres-/Quartalskosten', nonMonthlySharedRows,
      'Keine gemeinsamen jährlichen oder vierteljährlichen Kosten. Camper-Versicherung, GEZ oder Steuer hier anlegen.',
      addRecurringBtn('+ Gemeinsame Jahreskosten', 'expense', {
        shared: true,
        interval: 'yearly',
        title: 'Neue gemeinsame Jahreskosten'
      }),
      totalFooter(nonMonthlySharedRows.length, sumAmounts(nonMonthlySharedRules), 'neg', 'Summe gemeinsam')));

    // Sparen & Anlegen — wealth building, never counted as consumption: savings
    // rules (own or shared) plus one-off savings bookings this month.
    var savingRules = rules
      .filter(function (r) {
        return r.active && r.type === 'expense' && r.category === 'sparen' &&
          (r.payerId === selectedPerson || r.shared === true);
      });
    var savingRuleRows = savingRules.map(ruleSwipeRow);
    var savingTxs = txs.filter(function (t) {
      return t.type === 'expense' && t.category === 'sparen' && !t.recurringId &&
        (t.payerId === selectedPerson || t.shared === true) &&
        App.monthKey(t.date) === selectedMonth;
    });
    var savingRows = savingRuleRows.concat(savingTxs.map(txSwipeRow));
    view.appendChild(sectionCard('Sparen & Anlegen', savingRows,
      'Noch keine Sparraten. Lege z. B. deinen ETF-Sparplan als wiederkehrende Sparrate an.',
      addRecurringBtn('+ Sparrate anlegen', 'expense', {
        category: 'sparen',
        title: 'Neue Sparrate'
      }),
      totalFooter(savingRows.length, sumAmounts(savingRules) + sumAmounts(savingTxs), 'saving')));

    // Private laufende Kosten — recurring costs that belong only to this person.
    var privRules = rules
      .filter(function (r) {
        return r.active && r.type === 'expense' && r.payerId === selectedPerson &&
          r.shared !== true && r.category !== 'sparen';
      });
    var privRuleRows = privRules.map(ruleSwipeRow);
    view.appendChild(sectionCard('Private laufende Kosten', privRuleRows,
      'Keine privaten laufenden Kosten. Abos, Kontoführung, Sport oder persönliche Versicherungen hier anlegen.',
      addRecurringBtn('+ Private laufende Kosten', 'expense', {
        shared: false,
        privateExpense: true,
        category: 'abos',
        title: 'Private laufende Kosten'
      }),
      totalFooter(privRuleRows.length, sumAmounts(privRules), 'neg')));

    // Private Ausgaben — one-off expenses this month.
    var privTxs = txs.filter(function (t) {
      return t.payerId === selectedPerson && t.type === 'expense' && t.shared !== true &&
        t.category !== 'sparen' &&
        t.category !== 'ausgleich' && App.monthKey(t.date) === selectedMonth;
    });
    var privRows = privTxs.map(txSwipeRow);
    view.appendChild(sectionCard('Private Ausgaben', privRows,
      'In diesem Monat keine privaten Ausgaben.',
      null,
      totalFooter(privRows.length, sumAmounts(privTxs), 'neg')));

    root.appendChild(view);
  }

  window.Views.personal = {
    title: 'Persönlich',
    render: render
  };
})();
