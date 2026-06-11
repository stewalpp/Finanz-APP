/* js/views/dashboard.js — "Übersicht": month dashboard (stats, balance, fixed costs, donut, recent). */
/* global App, Store, Analysis, Charts, Views */
(function () {
  'use strict';

  window.Views = window.Views || {};

  // ---------------------------------------------------------------------------
  // Module-level state (persists across re-renders)
  // ---------------------------------------------------------------------------
  let selectedMonth = null; // 'YYYY-MM'; lazily initialized to the current month

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
    const atCurrent = selectedMonth >= currentMonthKey();
    if (atCurrent) {
      next.disabled = true;
      next.style.opacity = '0.35';
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

  // ---------------------------------------------------------------------------
  // 2. Stat grid (Einnahmen / Ausgaben / Übrig)
  // ---------------------------------------------------------------------------
  function statCard(label, cents, tone) {
    const stat = App.el('div', 'stat');
    stat.appendChild(App.el('div', 'stat-label', label));
    stat.appendChild(App.el('div', 'stat-value ' + tone, App.fmtEUR(cents)));
    return stat;
  }

  function buildStatGrid(summary) {
    const grid = App.el('div', 'stat-grid');
    grid.style.marginBottom = '14px';
    grid.appendChild(statCard('Einnahmen', summary.incomeCents, 'pos'));
    grid.appendChild(statCard('Ausgaben', summary.expenseCents, 'neg'));
    grid.appendChild(statCard('Übrig', summary.savedCents, summary.savedCents >= 0 ? 'pos' : 'neg'));
    return grid;
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
    card.appendChild(App.el('div', 'card-title', 'Paar-Bilanz'));

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
      card.appendChild(line);

      const sub = App.el(
        'p', 'row-sub',
        'Gemeinsame Ausgaben: ' + App.memberName('p1') + ' ' + App.fmtEUR(balance.paidSharedCents.p1) +
        ' · ' + App.memberName('p2') + ' ' + App.fmtEUR(balance.paidSharedCents.p2)
      );
      sub.style.margin = '6px 0 12px';
      card.appendChild(sub);

      const btn = App.el('button', 'btn btn-secondary', 'Ausgleichen');
      btn.type = 'button';
      btn.addEventListener('click', function () { settleUp(balance); });
      card.appendChild(btn);
    } else {
      const line = App.el('p', '', 'Ihr seid quitt ✓');
      line.style.fontSize = '16px';
      line.style.fontWeight = '600';
      card.appendChild(line);
    }
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

  function statusBadge(status) {
    if (status === 'paid') return App.el('span', 'badge badge-green', 'Bezahlt ✓');
    if (status === 'overdue') return App.el('span', 'badge badge-red', 'Überfällig');
    return App.el('span', 'badge badge-orange', 'Fällig');
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
    trailing.appendChild(statusBadge(item.status));

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
    card.appendChild(App.el('div', 'card-title', 'Anstehende Fixkosten'));

    const upcoming = Analysis.upcomingForMonth(rules, txs, selectedMonth, App.todayISO());
    if (!upcoming.length) {
      card.appendChild(App.el('p', 'row-sub', 'In diesem Monat sind keine Fixkosten fällig.'));
    } else {
      upcoming.slice(0, 5).forEach(function (item) {
        card.appendChild(upcomingRow(item));
      });
    }

    const link = App.el('div', 'link-row', 'Alle Fixkosten →');
    link.setAttribute('role', 'button');
    link.addEventListener('click', function () { App.switchTab('recurring'); });
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

  function buildCategoryCard(summary) {
    const card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Ausgaben nach Kategorie'));

    const items = summary.byCategory.map(function (c) {
      const cat = App.cat(c.category);
      return { label: cat.label, value: c.cents, color: cat.color };
    });

    const chartWrap = App.el('div');
    const drawn = Charts.donut(chartWrap, items, {
      centerTitle: App.fmtEUR(summary.expenseCents),
      centerSub: 'Ausgaben'
    });

    if (!drawn) {
      card.appendChild(emptyState('🪙', 'Keine Ausgaben in diesem Monat.'));
      return card;
    }

    card.appendChild(chartWrap);
    summary.byCategory.forEach(function (c) {
      card.appendChild(legendRow(c.category, c.cents, summary.expenseCents));
    });
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
    link.addEventListener('click', function () { App.switchTab('transactions'); });
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

    view.appendChild(buildMonthNav());
    view.appendChild(buildStatGrid(summary));
    view.appendChild(buildBalanceCard(txs));
    if (rules.length) view.appendChild(buildUpcomingCard(rules, txs));
    view.appendChild(buildCategoryCard(summary));
    view.appendChild(buildRecentCard(txs));

    root.appendChild(view);
  }

  window.Views.dashboard = {
    title: 'Übersicht',
    render: render
  };
})();
