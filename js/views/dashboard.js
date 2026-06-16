/* js/views/dashboard.js — "Übersicht": month dashboard (stats, balance, fixed costs, donut, recent). */
/* global App, Store, Analysis, Charts, Views */
(function () {
  'use strict';

  window.Views = window.Views || {};

  // ---------------------------------------------------------------------------
  // Module-level state (persists across re-renders)
  // ---------------------------------------------------------------------------
  let selectedMonth = null; // 'YYYY-MM'; lazily initialized to the current month
  let chartPerson = 'p1';   // person selected in the "Ausgaben pro Person" chart
  const FIXED_COST_COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF375F', '#BF5AF2', '#64D2FF', '#FFD60A', '#8E8E93'];

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  // Static markup only — never user content.
  function chevron(dir) {
    const span = document.createElement('span');
    span.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="' + (dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>';
    return span.firstChild;
  }

  function emptyState(iconName, text) {
    const box = App.el('div', 'empty-state');
    const iconWrap = App.el('div');
    iconWrap.style.marginBottom = '8px';
    iconWrap.appendChild(App.icon(iconName, 40));
    box.appendChild(iconWrap);
    box.appendChild(App.el('div', '', text));
    return box;
  }

  function signedAmountSpan(tx) {
    const isIncome = tx.type === 'income';
    return App.el(
      'span',
      isIncome ? 'amount-pos' : 'amount-neg',
      (isIncome ? '+' : '−') + App.fmtEUR(tx.amountCents)
    );
  }

  // ---------------------------------------------------------------------------
  // 1. Month navigation
  // ---------------------------------------------------------------------------
  function buildMonthNav() {
    const nav = App.el('div', 'month-nav');

    const prev = App.el('button', 'month-nav-btn');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Vorheriger Monat');
    prev.appendChild(chevron('left'));
    prev.addEventListener('click', function () {
      selectedMonth = App.addMonths(selectedMonth, -1);
      App.setMonth(selectedMonth);
      App.rerender();
    });

    const title = App.el('div', 'month-nav-title', App.fmtMonth(selectedMonth));

    const next = App.el('button', 'month-nav-btn');
    next.type = 'button';
    next.setAttribute('aria-label', 'Nächster Monat');
    next.appendChild(chevron('right'));
    // future months are allowed: the plan-based budget shows what will be due
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

  // ---------------------------------------------------------------------------
  // 2. Stat grid (Einnahmen / Ausgaben / Übrig) — tappable, each opens an
  //    explanation sheet with the month's breakdown
  // ---------------------------------------------------------------------------
  function statCard(label, cents, tone, makeContent) {
    const stat = App.el('div', 'stat');
    stat.appendChild(App.el('div', 'stat-label', label));
    stat.appendChild(App.el('div', 'stat-value ' + tone, App.fmtEUR(cents)));
    if (makeContent) {
      stat.setAttribute('role', 'button');
      stat.setAttribute('aria-label', label + ' erklären');
      stat.appendChild(App.el('span', 'info-glyph stat-hint', 'i'));
      stat.addEventListener('click', function () {
        App.showSheet({ title: label + ' · ' + App.fmtMonth(selectedMonth), content: makeContent() });
      });
    }
    return stat;
  }

  // up to maxRows label/value rows for the given bookings, then a "+ n weitere" line
  function txRows(list, tone) {
    const MAX = 8;
    const blocks = list.slice(0, MAX).map(function (tx) {
      const cat = App.cat(tx.category);
      return { row: [
        (tx.note || cat.label) + ' · ' + (App.memberName(tx.payerId) || '–'),
        (tone === 'pos' ? '+' : '−') + App.fmtEUR(tx.amountCents),
        tone
      ] };
    });
    if (list.length > MAX) {
      blocks.push({ p: '+ ' + (list.length - MAX) + ' weitere Buchungen' });
    }
    return blocks;
  }

  function buildStatGrid(summary, txs, budget) {
    const monthTxs = txs.filter(function (t) {
      return App.monthKey(t.date) === selectedMonth && t.category !== 'ausgleich';
    });

    const grid = App.el('div', 'stat-grid');
    grid.style.marginBottom = '14px';

    grid.appendChild(statCard('Einnahmen', summary.incomeCents, 'pos', function () {
      const incomeTxs = monthTxs.filter(function (t) { return t.type === 'income'; });
      return App.infoContent([].concat(
        txRows(incomeTxs, 'pos'),
        [
          { hr: true },
          { row: ['Gesamt', App.fmtEUR(summary.incomeCents), 'pos'] },
          { p: 'Alle Einnahmen, die diesen Monat gebucht wurden.' }
        ]
      ));
    }));

    grid.appendChild(statCard('Ausgaben', summary.expenseCents, 'neg', function () {
      const catBlocks = summary.byCategory.map(function (c) {
        const cat = App.cat(c.category);
        return { row: [cat.label, '−' + App.fmtEUR(c.cents), 'neg'] };
      });
      return App.infoContent([].concat(
        catBlocks,
        [
          { hr: true },
          { row: ['Gesamt', App.fmtEUR(summary.expenseCents), 'neg'] },
          { p: 'Alle Ausgaben dieses Monats – ohne Sparraten, die stehen unter „Gespart“.' }
        ]
      ));
    }));

    grid.appendChild(statCard('Gespart', summary.savingsCents, 'saving', function () {
      const savingsTxs = monthTxs.filter(function (t) {
        return t.type === 'expense' && t.category === 'sparen';
      });
      return App.infoContent([].concat(
        txRows(savingsTxs, 'saving'),
        [
          { hr: true },
          { row: ['Gesamt', App.fmtEUR(summary.savingsCents), 'saving'] },
          { p: 'Was ihr diesen Monat in Sparen & Anlegen gesteckt habt – Vermögensaufbau, ' +
               'keine Ausgabe.' }
        ]
      ));
    }));

    const savedTone = summary.savedCents >= 0 ? 'pos' : 'neg';
    grid.appendChild(statCard('Übrig', summary.savedCents, savedTone, function () {
      return App.infoContent([
        { row: ['Gebuchte Einnahmen', '+' + App.fmtEUR(summary.incomeCents), 'pos'] },
        { row: ['Gebuchte Ausgaben', '−' + App.fmtEUR(summary.expenseCents), 'neg'] },
        { row: ['Gespart', '−' + App.fmtEUR(summary.savingsCents), 'saving'] },
        { hr: true },
        { row: ['Übrig', App.fmtEUR(summary.savedCents), savedTone] },
        { p: 'Was von den gebuchten Einnahmen übrig bleibt. („Frei verfügbar“ oben rechnet ' +
             'zusätzlich geplante Posten ein.)' }
      ]);
    }));

    return grid;
  }

  // ---------------------------------------------------------------------------
  // 2b. "Frei verfügbar diesen Monat" — disposable budget
  // ---------------------------------------------------------------------------
  function memberColor(id) {
    const members = (Store.getSettings().members) || [];
    for (let i = 0; i < members.length; i++) {
      if (members[i].id === id) return members[i].color || 'var(--gray)';
    }
    return 'var(--gray)';
  }

  function budgetLine(label, cents, sign, tone, small) {
    const row = App.el('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'baseline';
    row.style.padding = small ? '4px 0' : '6px 0';

    const l = App.el('span', '', label);
    l.style.color = 'var(--text-2)';
    l.style.fontSize = small ? '14px' : '15px';
    if (small) l.style.display = 'flex', l.style.alignItems = 'center', l.style.gap = '8px';

    const v = App.el('span', '', (sign || '') + App.fmtEUR(cents));
    v.style.fontSize = small ? '14px' : '15px';
    v.style.fontWeight = '600';
    v.style.fontVariantNumeric = 'tabular-nums';
    if (tone === 'pos') v.style.color = 'var(--green)';
    else if (tone === 'neg') v.style.color = 'var(--red)';
    else if (tone === 'saving') v.style.color = 'var(--teal)';

    row.appendChild(l);
    row.appendChild(v);
    return row;
  }

  function ownerSuffix(item) {
    const name = App.memberName(item.payerId) || item.payerId || '';
    return item.shared ? 'Gemeinsam · zahlt ' + name : name;
  }

  function intervalWord(interval) {
    return interval === 'quarterly' ? 'vierteljährlich'
      : interval === 'halfyearly' ? 'halbjährlich'
      : interval === 'yearly' ? 'jährlich' : 'monatlich';
  }

  function buildBudgetCard(budget) {
    const t = budget.total;
    const planAvailable = t.plannedIncomeCents - t.fixedCents - t.nonMonthlyDueCents;

    const card = App.el('div', 'card hero-card');
    card.appendChild(App.cardHead('Zusammen frei verfügbar · ' + App.fmtMonth(selectedMonth), function () {
      const blocks = [
        { row: ['Geplante Einnahmen', '+' + App.fmtEUR(t.plannedIncomeCents), 'pos'] },
        { row: ['Gemeinsame Fixkosten', '−' + App.fmtEUR(t.fixedCents), 'neg'] },
        { row: ['Diesen Monat zusätzlich fällig', '−' + App.fmtEUR(t.nonMonthlyDueCents), 'neg'] },
        { hr: true },
        { row: ['Frei verfügbar', App.fmtEUR(planAvailable), planAvailable >= 0 ? 'pos' : 'neg'] },
        { p: 'Diese Karte zeigt nur den gemeinsamen Monatsplan. Private laufende Kosten stehen im Tab „Persönlich“.' }
      ];
      return App.infoContent(blocks);
    }));

    const big = App.el('div', 'hero-amount', App.fmtEUR(planAvailable));
    big.style.color = planAvailable >= 0 ? 'var(--green)' : 'var(--red)';
    card.appendChild(big);
    card.appendChild(App.el('div', 'hero-sub',
      planAvailable >= 0
        ? 'bleiben euch nach gemeinsamen Fixkosten'
        : 'über dem geplanten Budget'));

    const bd = App.el('div');
    bd.style.marginTop = '10px';
    bd.appendChild(budgetLine('Geplante Einnahmen', t.plannedIncomeCents, '+', 'pos', false));
    bd.appendChild(budgetLine('Gemeinsame Fixkosten', t.fixedCents, '−', 'neg', false));

    const dueItems = budget.nonMonthlyItems || [];
    bd.appendChild(dueItems.length
      ? buildDueDetails(t.nonMonthlyDueCents, dueItems)
      : budgetLine('Diesen Monat zusätzlich fällig', t.nonMonthlyDueCents, '−', 'neg', false));
    card.appendChild(bd);

    return card;
  }

  function buildDueDetails(totalCents, items) {
    const details = App.el('details', 'budget-details');

    const summary = App.el('summary');
    summary.style.cursor = 'pointer';
    summary.appendChild(budgetLine('Diesen Monat zusätzlich fällig', totalCents, '−', 'neg', false));
    details.appendChild(summary);

    const list = App.el('div');
    list.style.padding = '0 0 0 14px';
    (items || []).forEach(function (item) {
      const suffix = ownerSuffix(item);
      const label = (item.name || App.cat(item.category).label) + ' · ' + intervalWord(item.interval) +
        (suffix ? ' · ' + suffix : '');
      list.appendChild(budgetLine(label, item.amountCents, '−', 'neg', true));
    });
    details.appendChild(list);
    return details;
  }

  function personMonthBlock(pid, sum) {
    const wrap = App.el('div');
    wrap.style.padding = '12px 0';
    wrap.style.borderTop = '0.5px solid var(--sep)';

    const head = App.el('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'baseline';
    head.style.gap = '12px';

    const name = App.el('div', '', App.memberName(pid) || (pid === 'p1' ? 'Partner 1' : 'Partner 2'));
    name.style.fontWeight = '700';
    name.style.fontSize = '17px';
    name.style.color = memberColor(pid);
    head.appendChild(name);

    // no amount next to the name — it would duplicate the "Bleibt" row below
    const spent = sum.fixedCents + sum.privateRecurringCents + sum.nonMonthlyDueCents +
      sum.privateSpentCents + sum.sharedVariableCents;
    wrap.appendChild(head);

    const rows = App.el('div');
    rows.style.marginTop = '6px';
    rows.appendChild(budgetLine('Einnahmen', sum.incomeCents, '+', 'pos', true));
    rows.appendChild(budgetLine('Bleibt', sum.leftoverCents, '', sum.leftoverCents >= 0 ? 'pos' : 'neg', true));
    wrap.appendChild(rows);

    const details = App.el('details', 'person-month-details');
    details.appendChild(App.el('summary', '', 'Details'));
    const detailRows = App.el('div', 'person-detail-rows');

    detailRows.appendChild(budgetLine('Kosten gesamt', spent, '−', 'neg', true));
    detailRows.appendChild(budgetLine('Gemeinsame Fixkosten (Anteil)', sum.fixedCents, '−', 'neg', true));
    if (sum.privateRecurringCents > 0) {
      detailRows.appendChild(budgetLine('Private laufende Kosten', sum.privateRecurringCents, '−', 'neg', true));
    }
    if (sum.nonMonthlyDueCents > 0) {
      detailRows.appendChild(budgetLine('Zusätzlich fällig', sum.nonMonthlyDueCents, '−', 'neg', true));
    }
    detailRows.appendChild(budgetLine('Private Ausgaben (gebucht)', sum.privateSpentCents, '−', 'neg', true));
    if (sum.sharedVariableCents > 0) {
      detailRows.appendChild(budgetLine('Gemeinsame Ausgaben (½)', sum.sharedVariableCents, '−', 'neg', true));
    }
    if (sum.savingsCents > 0) {
      detailRows.appendChild(budgetLine('Gespart', sum.savingsCents, '−', 'saving', true));
    }
    details.appendChild(detailRows);
    wrap.appendChild(details);
    return wrap;
  }

  function buildPersonMonthCard(txs, rules) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Monat nach Person', function () {
      return App.infoContent([
        { p: 'Zeigt pro Person, welche Einnahmen da sind und welche Kosten dagegen laufen.' },
        { p: 'Gemeinsame Monats-Fixkosten zählen je zur Hälfte. Private laufende Kosten bleiben bei der Person, die sie bezahlt.' }
      ]);
    }));
    ['p1', 'p2'].forEach(function (pid) {
      card.appendChild(personMonthBlock(pid, Analysis.personalSummary(txs, rules, pid, selectedMonth)));
    });
    return card;
  }

  function expenseCategorySummary(txs, monthKey) {
    const catMap = new Map();
    let expenseCents = 0;
    (txs || []).forEach(function (tx) {
      if (!tx || tx.type !== 'expense' || tx.category === 'ausgleich' ||
          App.monthKey(tx.date) !== monthKey) return;
      const amount = Number(tx.amountCents) || 0;
      expenseCents += amount;
      let entry = catMap.get(tx.category);
      if (!entry) {
        entry = { category: tx.category, cents: 0, count: 0 };
        catMap.set(tx.category, entry);
      }
      entry.cents += amount;
      entry.count += 1;
    });
    return {
      expenseCents: expenseCents,
      byCategory: Array.from(catMap.values()).sort(function (a, b) {
        return b.cents - a.cents;
      })
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Upcoming fixed costs
  // ---------------------------------------------------------------------------
  function bookRule(item) {
    const rule = item.rule;
    Store.addTransaction({
      type: rule.type,
      amountCents: rule.amountCents,
      category: rule.category,
      note: rule.name,
      date: item.dueDateISO,
      payerId: rule.payerId,
      shared: rule.shared,
      recurringId: rule.id
    });
    App.toast('Gebucht ✓');
  }

  function upcomingRow(item) {
    const rule = item.rule;

    const row = App.el('div', 'list-row');

    const icon = App.catIcon(rule.category);

    const main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', rule.name));
    main.appendChild(App.el('div', 'row-sub',
      App.fmtDate(item.dueDateISO) + ' · ' +
      (rule.shared === true ? 'Gemeinsam · zahlt ' : 'Privat · ') +
      (App.memberName(rule.payerId) || rule.payerId || '')));

    const trailing = App.el('div', 'row-trailing');
    const isIncome = rule.type === 'income';
    trailing.appendChild(App.el(
      'span',
      isIncome ? 'amount-pos' : 'amount-neg',
      (isIncome ? '+' : '−') + App.fmtEUR(rule.amountCents)
    ));

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);

    if (item.status !== 'paid') {
      const btn = App.el('button', 'btn btn-secondary btn-small', 'Buchen');
      btn.type = 'button';
      btn.style.marginLeft = '10px';
      btn.addEventListener('click', function () { bookRule(item); });
      row.appendChild(btn);
    }
    return row;
  }

  function buildUpcomingCard(rules, txs) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Anstehende wiederkehrende Kosten', function () {
      return App.infoContent([
        { p: 'Wiederkehrende Kosten, die diesen Monat fällig sind. Gemeinsame und private Posten bleiben erkennbar getrennt.' }
      ]);
    }));

    const upcoming = Analysis.upcomingForMonth(rules, txs, selectedMonth, App.todayISO());
    if (!upcoming.length) {
      card.appendChild(App.el('p', 'row-sub', 'In diesem Monat sind keine wiederkehrenden Kosten fällig.'));
    } else {
      upcoming.slice(0, 5).forEach(function (item) {
        card.appendChild(upcomingRow(item));
      });
    }

    const link = App.el('div', 'link-row', 'Kosten verwalten →');
    link.setAttribute('role', 'button');
    link.addEventListener('click', function () { App.switchTab('personal'); });
    card.appendChild(link);
    return card;
  }

  // ---------------------------------------------------------------------------
  // 5. Expenses by category (donut + legend)
  // ---------------------------------------------------------------------------
  function legendRow(catKey, cents, totalCents) {
    const cat = App.cat(catKey);
    const row = App.el('div', 'legend-row');

    const dot = App.el('span', 'dot');
    dot.style.background = cat.color;
    row.appendChild(dot);

    const label = App.el('span', '', cat.label);
    label.style.flex = '1';
    label.style.minWidth = '0';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';
    row.appendChild(label);

    row.appendChild(App.el('span', '', App.fmtEUR(cents)));

    const pct = totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0;
    const pctEl = App.el('span', '', pct + ' %');
    pctEl.style.color = 'var(--text-2)';
    pctEl.style.minWidth = '42px';
    pctEl.style.textAlign = 'right';
    row.appendChild(pctEl);

    return row;
  }

  // donut + legend for a pre-computed summary; returns false if there is nothing to draw
  function appendDonut(card, summary, centerSub) {
    const items = summary.byCategory.map(function (c) {
      const cat = App.cat(c.category);
      return { label: cat.label, value: c.cents, color: cat.color };
    });

    const chartWrap = App.el('div');
    const drawn = Charts.donut(chartWrap, items, {
      centerTitle: App.fmtEUR(summary.expenseCents),
      centerSub: centerSub
    });
    if (!drawn) return false;

    card.appendChild(chartWrap);
    summary.byCategory.forEach(function (c) {
      card.appendChild(legendRow(c.category, c.cents, summary.expenseCents));
    });
    return true;
  }

  function intervalMonths(interval) {
    if (interval === 'quarterly') return 3;
    if (interval === 'halfyearly') return 6;
    if (interval === 'yearly') return 12;
    return 1;
  }

  function fixedCostAmount(rule, mode) {
    const amount = Number(rule && rule.amountCents) || 0;
    if (mode === 'annual') return Math.round(amount * 12 / intervalMonths(rule.interval));
    return Math.round(amount / intervalMonths(rule.interval));
  }

  function costLegendRow(entry, totalCents) {
    const row = App.el('div', 'legend-row');

    const dot = App.el('span', 'dot');
    dot.style.background = entry.color;
    row.appendChild(dot);

    const labelWrap = App.el('span');
    labelWrap.style.flex = '1';
    labelWrap.style.minWidth = '0';

    const label = App.el('span', '', entry.label);
    label.style.display = 'block';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';
    labelWrap.appendChild(label);

    if (entry.sub) {
      const sub = App.el('span', '', entry.sub);
      sub.style.display = 'block';
      sub.style.color = 'var(--text-2)';
      sub.style.fontSize = '12px';
      sub.style.overflow = 'hidden';
      sub.style.textOverflow = 'ellipsis';
      sub.style.whiteSpace = 'nowrap';
      labelWrap.appendChild(sub);
    }
    row.appendChild(labelWrap);

    row.appendChild(App.el('span', '', App.fmtEUR(entry.cents)));

    const pct = totalCents > 0 ? Math.round((entry.cents / totalCents) * 100) : 0;
    const pctEl = App.el('span', '', pct + ' %');
    pctEl.style.color = 'var(--text-2)';
    pctEl.style.minWidth = '42px';
    pctEl.style.textAlign = 'right';
    row.appendChild(pctEl);

    return row;
  }

  function fixedCostEntries(rules, mode) {
    return (rules || [])
      .filter(function (rule) {
        if (!rule || !rule.active || rule.type !== 'expense' || rule.shared !== true || rule.category === 'sparen') return false;
        return mode === 'monthly' ? rule.interval === 'monthly' : rule.interval !== 'monthly';
      })
      .map(function (rule, index) {
        const cat = App.cat(rule.category);
        const cents = fixedCostAmount(rule, mode === 'annual' ? 'annual' : 'monthly');
        const interval = intervalWord(rule.interval);
        const sub = mode === 'annual'
          ? interval + ' · ' + cat.label + ' · ' + App.fmtEUR(rule.amountCents) + ' je Zahlung'
          : cat.label + ' · zahlt ' + (App.memberName(rule.payerId) || '–');
        return {
          label: rule.name || cat.label,
          sub: sub,
          cents: cents,
          color: FIXED_COST_COLORS[index % FIXED_COST_COLORS.length]
        };
      })
      .filter(function (entry) { return entry.cents > 0; })
      .sort(function (a, b) { return b.cents - a.cents; });
  }

  function buildFixedCostChartCard(rules, mode) {
    const isAnnual = mode === 'annual';
    const title = isAnnual ? 'Gemeinsame Jahreskosten' : 'Gemeinsame monatliche Fixkosten';
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead(title, function () {
      return App.infoContent([
        { p: isAnnual
          ? 'Alle gemeinsamen jährlichen, halbjährlichen und vierteljährlichen Regeln als Jahressumme. So zählt GEZ vierteljährlich viermal pro Jahr.'
          : 'Alle gemeinsamen monatlichen Fixkosten aus dem Bereich „Persönlich".' }
      ]);
    }));

    const entries = fixedCostEntries(rules, isAnnual ? 'annual' : 'monthly');
    const totalCents = entries.reduce(function (sum, entry) { return sum + entry.cents; }, 0);
    const chartWrap = App.el('div');
    const drawn = Charts.donut(chartWrap, entries.map(function (entry) {
      return { label: entry.label, value: entry.cents, color: entry.color };
    }), {
      centerTitle: App.fmtEUR(totalCents),
      centerSub: isAnnual ? 'pro Jahr' : 'pro Monat'
    });

    if (!drawn) {
      card.appendChild(emptyState(isAnnual ? 'calendar-days' : 'receipt-text', isAnnual
        ? 'Keine gemeinsamen Jahres- oder Quartalskosten angelegt.'
        : 'Keine gemeinsamen monatlichen Fixkosten angelegt.'));
      return card;
    }

    card.appendChild(chartWrap);
    entries.forEach(function (entry) {
      card.appendChild(costLegendRow(entry, totalCents));
    });
    return card;
  }

  // shared (gemeinsame) expense bookings of the month, by category
  function buildSharedCategoryCard(txs) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Gemeinsame Ausgaben nach Kategorie', function () {
      return App.infoContent([
        { p: 'Eure gemeinsamen Ausgaben dieses Monats nach Kategorie – alles, was als „Gemeinsam“ markiert ist.' }
      ]);
    }));

    const sharedTxs = txs.filter(function (t) { return t.shared === true; });
    const summary = Analysis.monthlySummary(sharedTxs, selectedMonth);

    if (!appendDonut(card, summary, 'Gemeinsam')) {
      card.appendChild(emptyState('handshake', 'Keine gemeinsamen Ausgaben in diesem Monat.'));
    }
    return card;
  }

  // per-person expense bookings of the month: own private bookings at full
  // amount plus half of every shared booking (same 50/50 rule as everywhere)
  function buildPersonCategoryCard(txs) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Ausgaben pro Person', function () {
      return App.infoContent([
        { p: 'Eigene Ausgaben plus die Hälfte aller gemeinsamen – pro Person.' }
      ]);
    }));

    const seg = App.el('div', 'segmented');
    seg.style.marginBottom = '10px';
    ['p1', 'p2'].forEach(function (pid) {
      const btn = App.el('button', 'segment' + (pid === chartPerson ? ' active' : ''),
        App.memberName(pid) || (pid === 'p1' ? 'Partner 1' : 'Partner 2'));
      btn.type = 'button';
      btn.addEventListener('click', function () {
        if (chartPerson === pid) return;
        chartPerson = pid;
        App.rerender();
      });
      seg.appendChild(btn);
    });
    card.appendChild(seg);

    const personTxs = txs
      .filter(function (t) { return t.shared !== true && t.payerId === chartPerson; })
      .concat(txs
        .filter(function (t) { return t.shared === true; })
        .map(function (t) {
          // deterministic odd-cent split (p1 floor, p2 ceil) so that both
          // person charts together equal the shared total exactly
          const half = chartPerson === 'p1'
            ? Math.floor(t.amountCents / 2)
            : Math.ceil(t.amountCents / 2);
          return Object.assign({}, t, { amountCents: half });
        }));
    const summary = Analysis.monthlySummary(personTxs, selectedMonth);

    if (appendDonut(card, summary, App.memberName(chartPerson))) {
      const note = App.el('p', 'row-sub', 'Private Ausgaben plus die Hälfte der gemeinsamen Ausgaben.');
      note.style.marginTop = '8px';
      card.appendChild(note);
    } else {
      card.appendChild(emptyState('coins', 'Keine Ausgaben von ' +
        (App.memberName(chartPerson) || 'dieser Person') + ' in diesem Monat.'));
    }
    return card;
  }

  function buildExpenseCategoryCard(txs) {
    const card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Ausgaben nach Kategorie'));

    const summary = expenseCategorySummary(txs, selectedMonth);
    if (!appendDonut(card, summary, 'Ausgaben')) {
      card.appendChild(emptyState('chart-pie', 'Keine Ausgaben in diesem Monat.'));
    }
    return card;
  }

  // ---------------------------------------------------------------------------
  // 6. Recent transactions of the month
  // ---------------------------------------------------------------------------
  function txRow(tx) {
    const cat = App.cat(tx.category);
    const row = App.el('div', 'list-row');

    const icon = App.catIcon(tx.category);

    const main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', tx.note ? tx.note : cat.label));
    const subParts = [cat.label, App.memberName(tx.payerId)];
    if (tx.shared) subParts.push('geteilt');
    main.appendChild(App.el('div', 'row-sub', subParts.filter(Boolean).join(' · ')));

    const trailing = App.el('div', 'row-trailing');
    trailing.appendChild(signedAmountSpan(tx));

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
    row.addEventListener('click', function () {
      window.Views.transactions.openEditor(tx);
    });
    return row;
  }

  function buildRecentCard(txs) {
    const card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Letzte Buchungen'));

    const monthTxs = txs.filter(function (t) {
      return App.monthKey(t.date) === selectedMonth;
    });

    if (!monthTxs.length) {
      card.appendChild(emptyState('receipt-text', 'Keine Buchungen in diesem Monat.'));
    } else {
      monthTxs.slice(0, 5).forEach(function (tx) {
        card.appendChild(txRow(tx));
      });
    }

    const link = App.el('div', 'link-row', 'Alle anzeigen →');
    link.setAttribute('role', 'button');
    link.addEventListener('click', function () {
      if (window.Views.transactions && window.Views.transactions.setScope) {
        window.Views.transactions.setScope('all');
      }
      App.switchTab('transactions');
    });
    card.appendChild(link);
    return card;
  }

  // ---------------------------------------------------------------------------
  // Detected recurring costs (moved here from the former Fixkosten tab)
  // ---------------------------------------------------------------------------
  const INTERVAL_WORDS = { monthly: 'monatlich', quarterly: 'vierteljährlich', halfyearly: 'halbjährlich', yearly: 'jährlich' };

  function buildSuggestionsCard(txs, rules) {
    const suggestions = Analysis.detectRecurring(txs, rules, Store.getDismissed());
    if (!suggestions.length) return null;

    const card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Wiederkehrende Kosten erkannt'));

    suggestions.slice(0, 3).forEach(function (s) {
      const item = App.el('div', 'suggestion-card');
      const title = App.el('div');
      title.style.display = 'flex';
      title.style.alignItems = 'center';
      title.style.gap = '6px';
      title.style.fontWeight = '600';
      title.appendChild(App.icon('search', 18));
      title.appendChild(App.el('span', '', s.name));
      item.appendChild(title);
      item.appendChild(App.el('div', 'row-sub',
        App.fmtEUR(s.amountCents) + ' ' + (INTERVAL_WORDS[s.interval] || s.interval) + ' (' + s.count + '×)'));

      const row = App.el('div', 'form-row');
      row.style.marginTop = '10px';
      const accept = App.el('button', 'btn btn-primary btn-small', 'Übernehmen');
      accept.type = 'button';
      accept.addEventListener('click', function () {
        Store.addRecurring({
          name: s.name, type: 'expense', amountCents: s.amountCents, category: s.category,
          interval: s.interval,
          dueDay: s.dueDay,
          dueMonth: s.interval === 'yearly' ? (parseInt(String(s.lastDate).slice(5, 7), 10) || 1) : 1,
          anchorMonth: App.monthKey(s.lastDate), payerId: 'p1', shared: false, active: true, source: 'detected'
        });
        Store.dismissSuggestion(s.key);
        App.toast('Als Fixkosten übernommen ✓');
      });
      const ignore = App.el('button', 'btn btn-secondary btn-small', 'Ignorieren');
      ignore.type = 'button';
      ignore.addEventListener('click', function () { Store.dismissSuggestion(s.key); });
      row.appendChild(accept);
      row.appendChild(ignore);
      item.appendChild(row);
      card.appendChild(item);
    });
    return card;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render(root) {
    selectedMonth = App.getMonth(); // shared across tabs — pick up switches made elsewhere

    root.innerHTML = '';
    const view = App.el('div', 'view');

    const txs = Store.getTransactions();
    const rules = Store.getRecurring();
    const budget = Analysis.availableBudget(txs, rules, selectedMonth);

    view.appendChild(buildMonthNav());
    view.appendChild(buildBudgetCard(budget));       // hero: combined + per-person
    view.appendChild(buildPersonMonthCard(txs, rules));
    view.appendChild(buildFixedCostChartCard(rules, 'monthly'));
    view.appendChild(buildFixedCostChartCard(rules, 'annual'));

    root.appendChild(view);
  }

  window.Views.dashboard = {
    title: 'Übersicht',
    render: render
  };
})();
