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

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function currentMonthKey() {
    return App.monthKey(App.todayISO());
  }

  // Static markup only — never user content.
  function chevron(dir) {
    const span = document.createElement('span');
    span.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="' + (dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>';
    return span.firstChild;
  }

  function emptyState(emoji, text) {
    const box = App.el('div', 'empty-state');
    const em = App.el('div', '', emoji);
    em.style.fontSize = '40px';
    em.style.marginBottom = '8px';
    box.appendChild(em);
    box.appendChild(App.el('div', '', text));
    return box;
  }

  function otherMemberId(id) {
    return id === 'p1' ? 'p2' : 'p1';
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
        return { row: [cat.emoji + ' ' + cat.label, '−' + App.fmtEUR(c.cents), 'neg'] };
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

  // a horizontal bar visualising one person's available amount, in their colour
  function personBar(pid, cents, maxCents) {
    const wrap = App.el('div');
    wrap.style.padding = '8px 0 2px';

    const top = App.el('div');
    top.style.display = 'flex';
    top.style.justifyContent = 'space-between';
    top.style.alignItems = 'baseline';
    top.style.marginBottom = '6px';

    const nameEl = App.el('span', '', App.memberName(pid) || (pid === 'p1' ? 'Partner 1' : 'Partner 2'));
    nameEl.style.fontSize = '14px';
    nameEl.style.color = 'var(--text)';

    const amt = App.el('span', '', App.fmtEUR(cents));
    amt.style.fontSize = '15px';
    amt.style.fontWeight = '700';
    amt.style.fontVariantNumeric = 'tabular-nums';
    amt.style.color = cents >= 0 ? 'var(--text)' : 'var(--red)';

    top.appendChild(nameEl);
    top.appendChild(amt);
    wrap.appendChild(top);

    const track = App.el('div');
    track.style.height = '8px';
    track.style.borderRadius = '100px';
    track.style.background = 'var(--bg-input)';
    track.style.overflow = 'hidden';

    const pct = Math.max(3, Math.min(100, Math.round((Math.abs(cents) / maxCents) * 100)));
    const fill = App.el('div');
    fill.style.height = '100%';
    fill.style.width = pct + '%';
    fill.style.borderRadius = '100px';
    fill.style.background = cents >= 0 ? memberColor(pid) : 'var(--red)';
    fill.style.transition = 'width 0.4s cubic-bezier(0.32,0.72,0,1)';
    track.appendChild(fill);
    wrap.appendChild(track);
    return wrap;
  }

  function buildBudgetCard(budget) {
    const t = budget.total;

    const card = App.el('div', 'card hero-card');
    card.appendChild(App.cardHead('Zusammen frei verfügbar · ' + App.fmtMonth(selectedMonth), function () {
      const blocks = [
        { row: ['Geplante Einnahmen', '+' + App.fmtEUR(t.plannedIncomeCents), 'pos'] },
        { row: ['Monatliche Fixkosten', '−' + App.fmtEUR(t.fixedCents), 'neg'] }
      ];
      if (t.nonMonthlyDueCents > 0) {
        blocks.push({ row: ['Quartals-/Jahreskosten (diesen Monat fällig)', '−' + App.fmtEUR(t.nonMonthlyDueCents), 'neg'] });
      }
      if (t.savingsCents > 0) {
        blocks.push({ row: ['Sparraten', '−' + App.fmtEUR(t.savingsCents), 'saving'] });
      }
      blocks.push(
        { row: ['Bereits ausgegeben', '−' + App.fmtEUR(t.variableSpentCents), 'neg'] },
        { hr: true },
        { row: ['Frei verfügbar', App.fmtEUR(t.availableCents), t.availableCents >= 0 ? 'pos' : 'neg'] },
        { p: 'So viel bleibt euch diesen Monat voraussichtlich. Gemeinsames zählt pro Person ' +
             'zur Hälfte.' }
      );
      return App.infoContent(blocks);
    }));

    // combined hero number ("wieviel wir zusammen haben")
    const big = App.el('div', 'hero-amount', App.fmtEUR(t.availableCents));
    big.style.color = t.availableCents >= 0 ? 'var(--green)' : 'var(--red)';
    card.appendChild(big);
    card.appendChild(App.el('div', 'hero-sub',
      t.availableCents >= 0
        ? 'bleiben euch diesen Monat nach Fixkosten & Ausgaben'
        : 'über dem geplanten Budget'));

    // breakdown
    const bd = App.el('div');
    bd.style.marginTop = '10px';
    bd.appendChild(budgetLine('Geplante Einnahmen', t.plannedIncomeCents, '+', 'pos', false));
    bd.appendChild(budgetLine('Monatliche Fixkosten', t.fixedCents, '−', 'neg', false));
    // quarterly + yearly costs due this month, listed individually
    // (never smoothed into the monthly fixed costs)
    if (budget.nonMonthlyItems.length) {
      const yTitle = App.el('div', '', 'Diesen Monat zusätzlich fällig');
      yTitle.style.color = 'var(--text-3)';
      yTitle.style.fontSize = '12px';
      yTitle.style.textTransform = 'uppercase';
      yTitle.style.letterSpacing = '0.05em';
      yTitle.style.marginTop = '6px';
      bd.appendChild(yTitle);
      budget.nonMonthlyItems.forEach(function (item) {
        const word = item.interval === 'quarterly' ? 'vierteljährlich' : 'jährlich';
        bd.appendChild(budgetLine('📅 ' + item.name + ' (' + word + ')', item.amountCents, '−', 'neg', true));
      });
    }
    if (t.savingsCents > 0) {
      bd.appendChild(budgetLine('Sparraten', t.savingsCents, '−', 'saving', false));
    }
    bd.appendChild(budgetLine('Bereits ausgegeben', t.variableSpentCents, '−', 'neg', false));
    card.appendChild(bd);

    // per-person visualisation ("jeder einzeln")
    const sep = App.el('div');
    sep.style.height = '0.5px';
    sep.style.background = 'var(--sep)';
    sep.style.margin = '12px 0 6px';
    card.appendChild(sep);

    const perTitle = App.el('div', '', 'Pro Person');
    perTitle.style.color = 'var(--text-3)';
    perTitle.style.fontSize = '12px';
    perTitle.style.textTransform = 'uppercase';
    perTitle.style.letterSpacing = '0.05em';
    card.appendChild(perTitle);

    const maxRef = Math.max(
      Math.abs(budget.byPerson.p1.availableCents),
      Math.abs(budget.byPerson.p2.availableCents),
      1
    );
    ['p1', 'p2'].forEach(function (pid) {
      card.appendChild(personBar(pid, budget.byPerson[pid].availableCents, maxRef));
    });

    return card;
  }

  // ---------------------------------------------------------------------------
  // 3. Couple balance card ("wer schuldet wem")
  // ---------------------------------------------------------------------------
  function settleUp(balance) {
    const debtorId = balance.debtorId;
    const creditorId = otherMemberId(debtorId);
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

  function buildBalanceCard(txs) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Gemeinsamer Topf', function () {
      const bal = Analysis.coupleBalance(txs);
      const debtor = bal.debtorId;
      return App.infoContent([
        { h: 'Eingezahlt (alle Monate)' },
        { row: [App.memberName('p1') || 'p1', App.fmtEUR(bal.paidSharedCents.p1)] },
        { row: [App.memberName('p2') || 'p2', App.fmtEUR(bal.paidSharedCents.p2)] },
        { hr: true },
        debtor
          ? { row: [(App.memberName(debtor) || debtor) + ' schuldet ' +
              (App.memberName(otherMemberId(debtor)) || ''), App.fmtEUR(bal.owesCents), 'neg'] }
          : { row: ['Offen', App.fmtEUR(0)] },
        { p: 'Jede „Gemeinsam“-Buchung zahlt in den Topf ein. Wer weniger eingezahlt hat, ' +
             'schuldet dem anderen die halbe Differenz.' }
      ]);
    }));

    // contributions to the pot in the selected month
    const paid = { p1: 0, p2: 0 };
    txs.forEach(function (t) {
      if (t.shared === true && t.type === 'expense' && t.category !== 'ausgleich' &&
          App.monthKey(t.date) === selectedMonth && paid[t.payerId] !== undefined) {
        paid[t.payerId] += t.amountCents;
      }
    });
    const caption = App.el('div', '', 'Eingezahlt im ' + App.fmtMonth(selectedMonth));
    caption.style.color = 'var(--text-3)';
    caption.style.fontSize = '12px';
    caption.style.textTransform = 'uppercase';
    caption.style.letterSpacing = '0.05em';
    card.appendChild(caption);

    const maxPaid = Math.max(paid.p1, paid.p2, 1);
    ['p1', 'p2'].forEach(function (pid) {
      card.appendChild(personBar(pid, paid[pid], maxPaid));
    });

    const sep = App.el('div');
    sep.style.height = '0.5px';
    sep.style.background = 'var(--sep)';
    sep.style.margin = '12px 0 10px';
    card.appendChild(sep);

    // running balance across all months (settlements included)
    const balance = Analysis.coupleBalance(txs);

    if (balance.owesCents > 0 && balance.debtorId) {
      const debtorName = App.memberName(balance.debtorId);
      const creditorName = App.memberName(otherMemberId(balance.debtorId));
      const line = App.el(
        'p', '',
        debtorName + ' schuldet ' + creditorName + ' ' + App.fmtEUR(balance.owesCents)
      );
      line.style.fontSize = '16px';
      line.style.fontWeight = '600';
      line.style.margin = '0 0 12px';
      card.appendChild(line);

      const btn = App.el('button', 'btn btn-secondary', 'Ausgleichen');
      btn.type = 'button';
      btn.addEventListener('click', function () { settleUp(balance); });
      card.appendChild(btn);
    } else {
      const line = App.el('p', '', 'Ihr seid quitt ✓');
      line.style.fontSize = '16px';
      line.style.fontWeight = '600';
      line.style.margin = '0';
      card.appendChild(line);
    }

    const link = App.el('div', 'link-row', 'Gemeinsamen Topf öffnen →');
    link.setAttribute('role', 'button');
    link.addEventListener('click', function () {
      if (window.Views.transactions && window.Views.transactions.setScope) {
        window.Views.transactions.setScope('pot');
      }
      App.switchTab('transactions');
    });
    card.appendChild(link);
    return card;
  }

  // ---------------------------------------------------------------------------
  // 4. Upcoming fixed costs
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
    const cat = App.cat(rule.category);

    const row = App.el('div', 'list-row');

    const icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

    const main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', rule.name));
    main.appendChild(App.el('div', 'row-sub', App.fmtDate(item.dueDateISO)));

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
    card.appendChild(App.cardHead('Anstehende Fixkosten', function () {
      return App.infoContent([
        { p: 'Fixkosten, die diesen Monat fällig sind. „Buchen“ trägt sie als Buchung ein.' }
      ]);
    }));

    const upcoming = Analysis.upcomingForMonth(rules, txs, selectedMonth, App.todayISO());
    if (!upcoming.length) {
      card.appendChild(App.el('p', 'row-sub', 'In diesem Monat sind keine Fixkosten fällig.'));
    } else {
      upcoming.slice(0, 5).forEach(function (item) {
        card.appendChild(upcomingRow(item));
      });
    }

    const link = App.el('div', 'link-row', 'Fixkosten verwalten →');
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

  // shared (gemeinsame) expense bookings of the month, by category
  function buildSharedCategoryCard(txs) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Gemeinsame Ausgaben nach Kategorie', function () {
      return App.infoContent([
        { p: 'Eure gemeinsamen Ausgaben dieses Monats nach Kategorie – alles, was im Topf ' +
             'gelandet ist.' }
      ]);
    }));

    const sharedTxs = txs.filter(function (t) { return t.shared === true; });
    const summary = Analysis.monthlySummary(sharedTxs, selectedMonth);

    if (!appendDonut(card, summary, 'Gemeinsam')) {
      card.appendChild(emptyState('🤝', 'Keine gemeinsamen Ausgaben in diesem Monat.'));
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
      card.appendChild(emptyState('🪙', 'Keine Ausgaben von ' +
        (App.memberName(chartPerson) || 'dieser Person') + ' in diesem Monat.'));
    }
    return card;
  }

  // ---------------------------------------------------------------------------
  // 6. Recent transactions of the month
  // ---------------------------------------------------------------------------
  function txRow(tx) {
    const cat = App.cat(tx.category);
    const row = App.el('div', 'list-row');

    const icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

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
      card.appendChild(emptyState('🧾', 'Keine Buchungen in diesem Monat.'));
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
  // First use (no transactions at all)
  // ---------------------------------------------------------------------------
  function buildFirstUse() {
    const box = App.el('div', 'empty-state');

    const em = App.el('div', '', '👋');
    em.style.fontSize = '40px';
    em.style.marginBottom = '8px';
    box.appendChild(em);

    const title = App.el('div', '', 'Willkommen bei euren Finanzen!');
    title.style.fontSize = '17px';
    title.style.fontWeight = '700';
    title.style.color = 'var(--text)';
    title.style.marginBottom = '6px';
    box.appendChild(title);

    box.appendChild(App.el('div', '',
      'Erfasst eure Ausgaben und Einnahmen gemeinsam – schnell, privat und offline.'));

    const startBtn = App.el('button', 'btn btn-primary', 'Erste Buchung');
    startBtn.type = 'button';
    startBtn.style.marginTop = '18px';
    startBtn.addEventListener('click', function () {
      window.Views.transactions.openEditor(null);
    });
    box.appendChild(startBtn);

    const demoBtn = App.el('button', 'btn btn-secondary', 'Demo-Daten laden');
    demoBtn.type = 'button';
    demoBtn.style.marginTop = '10px';
    demoBtn.addEventListener('click', function () { App.switchTab('settings'); });
    box.appendChild(demoBtn);

    const hint = App.el('div', '', 'Tipp: Demo-Daten findest du unter „Mehr“.');
    hint.style.fontSize = '13px';
    hint.style.marginTop = '10px';
    box.appendChild(hint);

    return box;
  }

  // ---------------------------------------------------------------------------
  // Detected recurring costs (moved here from the former Fixkosten tab)
  // ---------------------------------------------------------------------------
  const INTERVAL_WORDS = { monthly: 'monatlich', quarterly: 'vierteljährlich', yearly: 'jährlich' };

  function buildSuggestionsCard(txs, rules) {
    const suggestions = Analysis.detectRecurring(txs, rules, Store.getDismissed());
    if (!suggestions.length) return null;

    const card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Wiederkehrende Kosten erkannt'));

    suggestions.slice(0, 3).forEach(function (s) {
      const item = App.el('div', 'suggestion-card');
      const title = App.el('div', '', '🔍 ' + s.name);
      title.style.fontWeight = '600';
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
    if (!selectedMonth) selectedMonth = currentMonthKey();

    root.innerHTML = '';
    const view = App.el('div', 'view');

    const txs = Store.getTransactions();
    if (!txs.length) {
      view.appendChild(buildFirstUse());
      root.appendChild(view);
      return;
    }

    const rules = Store.getRecurring();
    const summary = Analysis.monthlySummary(txs, selectedMonth);
    const budget = Analysis.availableBudget(txs, rules, selectedMonth);

    view.appendChild(buildMonthNav());
    view.appendChild(buildBudgetCard(budget));       // hero: combined + per-person
    view.appendChild(buildStatGrid(summary, txs, budget));
    var suggestionsCard = buildSuggestionsCard(txs, rules);
    if (suggestionsCard) view.appendChild(suggestionsCard);
    view.appendChild(buildSharedCategoryCard(txs));
    view.appendChild(buildPersonCategoryCard(txs));
    view.appendChild(buildBalanceCard(txs));
    if (rules.length) view.appendChild(buildUpcomingCard(rules, txs));
    view.appendChild(buildRecentCard(txs));

    root.appendChild(view);
  }

  window.Views.dashboard = {
    title: 'Übersicht',
    render: render
  };
})();
