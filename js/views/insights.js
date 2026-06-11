/* js/views/insights.js — "Analyse": 6-month trend, savings rate, tips, category comparison. */
/* global App, Store, Analysis, Charts, Views */
(function () {
  'use strict';

  window.Views = window.Views || {};

  const GREEN = '#30D158';
  const RED = '#FF453A';
  const TEAL = '#00C7BE';   // savings (matches the 'sparen' category colour)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function emptyState(emoji, text) {
    const box = App.el('div', 'empty-state');
    const em = App.el('div', '', emoji);
    em.style.fontSize = '40px';
    em.style.marginBottom = '8px';
    box.appendChild(em);
    box.appendChild(App.el('div', '', text));
    return box;
  }

  function monthShortLabel(monthKey) {
    const y = parseInt(monthKey.slice(0, 4), 10);
    const m = parseInt(monthKey.slice(5, 7), 10);
    return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short' });
  }

  // Compact axis/value caption for the bar chart (cents in, short string out).
  function fmtAxisValue(cents) {
    const eur = cents / 100;
    if (eur >= 10000) {
      return Math.round(eur / 1000).toLocaleString('de-DE') + 'k €';
    }
    if (eur >= 1000) {
      return (Math.round(eur / 100) / 10).toLocaleString('de-DE') + 'k €';
    }
    return Math.round(eur).toLocaleString('de-DE') + ' €';
  }

  function signedPercent(pct) {
    if (pct > 0) return '+' + pct + ' %';
    if (pct < 0) return '−' + Math.abs(pct) + ' %';
    return '± 0 %';
  }

  // ---------------------------------------------------------------------------
  // 1. Trend card (income/expense bars, last 6 months)
  // ---------------------------------------------------------------------------
  function legendItem(color, label) {
    const item = App.el('span');
    item.style.display = 'inline-flex';
    item.style.alignItems = 'center';
    item.style.gap = '6px';
    const dot = App.el('span', 'dot');
    dot.style.background = color;
    item.appendChild(dot);
    item.appendChild(App.el('span', '', label));
    return item;
  }

  function buildTrendCard(txs, currentMonth) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Einnahmen & Ausgaben', function () {
      return App.infoContent([
        { p: 'Einnahmen (grün), Ausgaben (rot) und Gespartes (türkis) der letzten 6 Monate.' }
      ]);
    }));

    const trend = Analysis.trend(txs, 6, currentMonth);
    const data = trend.map(function (t) {
      return {
        label: monthShortLabel(t.month),
        series: [
          { value: t.incomeCents, color: GREEN },
          { value: t.expenseCents, color: RED },
          { value: t.savingsCents, color: TEAL }
        ]
      };
    });

    const chartWrap = App.el('div');
    Charts.bars(chartWrap, data, { height: 180, formatValue: fmtAxisValue });
    card.appendChild(chartWrap);

    const legend = App.el('div', 'legend-row');
    legend.style.justifyContent = 'center';
    legend.style.gap = '18px';
    legend.appendChild(legendItem(GREEN, 'Einnahmen'));
    legend.appendChild(legendItem(RED, 'Ausgaben'));
    legend.appendChild(legendItem(TEAL, 'Gespart'));
    card.appendChild(legend);

    return card;
  }

  // ---------------------------------------------------------------------------
  // 2. Savings rate card (current month)
  // ---------------------------------------------------------------------------
  function buildSavingsCard(txs, currentMonth) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Sparquote', function () {
      return App.infoContent([
        { p: 'Anteil der Einnahmen, der diesen Monat gespart wurde (Sparraten + Übriges). ' +
             'Ab 10 % solide, ab 25 % stark.' }
      ]);
    }));

    const summary = Analysis.monthlySummary(txs, currentMonth);
    if (summary.incomeCents <= 0) {
      card.appendChild(App.el(
        'p', 'row-sub',
        'Für diesen Monat sind noch keine Einnahmen erfasst. Sobald Einnahmen da sind, siehst du hier deine Sparquote.'
      ));
      return card;
    }

    // saved = transfers into 'sparen' + whatever is left over
    const savedTotal = summary.savedCents + summary.savingsCents;
    const pct = Math.round((savedTotal / summary.incomeCents) * 100);

    const big = App.el('div', '', signedPercent(pct).replace('± ', '').replace('+', ''));
    big.textContent = (pct < 0 ? '−' + Math.abs(pct) : String(pct)) + ' %';
    big.style.fontSize = '34px';
    big.style.fontWeight = '700';
    big.style.color = pct >= 0 ? 'var(--green)' : 'var(--red)';
    big.style.marginBottom = '10px';
    card.appendChild(big);

    const progress = App.el('div', 'progress');
    const fill = App.el('div', 'progress-fill');
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    progress.appendChild(fill);
    card.appendChild(progress);

    const sub = App.el(
      'p', 'row-sub',
      'Du hast ' + App.fmtEUR(savedTotal) + ' von ' + App.fmtEUR(summary.incomeCents) +
      ' gespart (davon ' + App.fmtEUR(summary.savingsCents) + ' Sparraten).'
    );
    sub.style.marginTop = '10px';
    card.appendChild(sub);

    return card;
  }

  // ---------------------------------------------------------------------------
  // 3. Savings tips card
  // ---------------------------------------------------------------------------
  function buildTipsCard(txs, rules) {
    const card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Spartipps'));

    const tips = Analysis.tips(txs, rules);
    if (!tips.length) {
      card.appendChild(App.el('p', 'row-sub', 'Noch nicht genug Daten für Spartipps.'));
      return card;
    }

    tips.forEach(function (tip) {
      const tone = tip.tone === 'good' || tip.tone === 'warn' ? tip.tone : 'info';
      const tipEl = App.el('div', 'tip-card tone-' + tone);

      const titleLine = App.el('div', '', tip.emoji + ' ');
      const strong = document.createElement('strong');
      strong.textContent = tip.title;
      titleLine.appendChild(strong);
      titleLine.style.marginBottom = '4px';
      tipEl.appendChild(titleLine);

      tipEl.appendChild(App.el('p', 'row-sub', tip.text));
      card.appendChild(tipEl);
    });

    return card;
  }

  // ---------------------------------------------------------------------------
  // 4. Category comparison card (current vs previous month)
  // ---------------------------------------------------------------------------
  function compareRow(catEntry, prevCents) {
    const cat = App.cat(catEntry.category);
    const row = App.el('div', 'list-row');

    const icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

    const main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', cat.label));
    main.appendChild(App.el('div', 'row-sub', 'Vormonat: ' + App.fmtEUR(prevCents)));

    const trailing = App.el('div', 'row-trailing');
    trailing.appendChild(App.el('span', '', App.fmtEUR(catEntry.cents)));

    const delta = App.el('span', 'row-sub');
    if (prevCents === 0) {
      delta.textContent = '– neu';
      delta.style.color = 'var(--text-3)';
    } else {
      const pct = Math.round(((catEntry.cents - prevCents) / prevCents) * 100);
      if (pct > 0) {
        delta.textContent = '▲ +' + pct + ' %';
        delta.style.color = 'var(--red)';
      } else if (pct < 0) {
        delta.textContent = '▼ −' + Math.abs(pct) + ' %';
        delta.style.color = 'var(--green)';
      } else {
        delta.textContent = '± 0 %';
        delta.style.color = 'var(--text-3)';
      }
    }
    trailing.appendChild(delta);

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
    return row;
  }

  function buildCompareCard(txs, currentMonth) {
    const card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Kategorien im Vergleich'));

    const prevMonth = App.addMonths(currentMonth, -1);
    const current = Analysis.monthlySummary(txs, currentMonth).byCategory; // sorted cents desc
    const previous = Analysis.monthlySummary(txs, prevMonth).byCategory;

    const prevByCat = {};
    previous.forEach(function (c) { prevByCat[c.category] = c.cents; });

    if (!current.length) {
      card.appendChild(emptyState('🗂️', 'Noch keine Ausgaben in diesem Monat.'));
      return card;
    }

    current.slice(0, 8).forEach(function (c) {
      card.appendChild(compareRow(c, prevByCat[c.category] || 0));
    });
    return card;
  }

  // ---------------------------------------------------------------------------
  // 5. Savings trend (cumulative) — "Sparverlauf"
  // ---------------------------------------------------------------------------
  function buildSavingsTrendCard(txs, currentMonth) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Sparverlauf · 6 Monate', function () {
      return App.infoContent([
        { p: 'Euer aufsummiertes Erspartes der letzten 6 Monate (Einnahmen minus Ausgaben; ' +
             'Sparraten zählen als gespart).' }
      ]);
    }));

    const data = Analysis.cumulativeSavings(txs, 6, currentMonth);
    const total = data.length ? data[data.length - 1].cumulativeCents : 0;

    const big = App.el('div', 'hero-amount', App.fmtEUR(total));
    big.style.color = total >= 0 ? 'var(--green)' : 'var(--red)';
    card.appendChild(big);
    card.appendChild(App.el('div', 'hero-sub',
      'in den letzten 6 Monaten gespart (Sparraten + Übriges)'));

    const wrap = App.el('div');
    wrap.style.marginTop = '10px';
    const points = data.map(function (d) { return { label: monthShortLabel(d.month), value: d.cumulativeCents }; });
    Charts.line(wrap, points, { height: 170, color: GREEN, formatValue: fmtAxisValue });
    card.appendChild(wrap);
    return card;
  }

  // ---------------------------------------------------------------------------
  // 6. Key metrics grid
  // ---------------------------------------------------------------------------
  function metric(label, value, tone) {
    const s = App.el('div', 'stat');
    s.appendChild(App.el('div', 'stat-label', label));
    s.appendChild(App.el('div', 'stat-value' + (tone ? ' ' + tone : ''), value));
    return s;
  }

  function buildMetricsCard(txs, rules, currentMonth) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Kennzahlen', function () {
      return App.infoContent([
        { h: 'Ø Ausgaben / Monat' },
        { p: 'Durchschnitt der letzten 6 Monate (ohne Sparraten).' },
        { h: 'Ø Sparquote' },
        { p: 'Wie viel Prozent der Einnahmen im Schnitt gespart wurden.' },
        { h: 'Fixkostenquote' },
        { p: 'Anteil der Fixkosten an den geplanten Einnahmen.' },
        { h: 'Größte Ausgabe' },
        { p: 'Höchste Einzelbuchung des Monats.' }
      ]);
    }));

    const m = Analysis.keyMetrics(txs, rules, currentMonth);
    const grid = App.el('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '10px';
    grid.appendChild(metric('Ø Ausgaben / Monat', App.fmtEUR(m.avgExpenseCents)));
    grid.appendChild(metric('Ø Sparquote', m.avgSavingsRate + ' %', m.avgSavingsRate >= 0 ? 'pos' : 'neg'));
    grid.appendChild(metric('Fixkostenquote', m.fixedSharePct + ' %'));
    grid.appendChild(metric('Größte Ausgabe', m.biggest ? App.fmtEUR(m.biggest.amountCents) : '–'));
    card.appendChild(grid);

    if (m.biggest) {
      const cat = App.cat(m.biggest.category);
      const sub = App.el('div', 'row-sub',
        'Größte Ausgabe: ' + (m.biggest.note || cat.label) + ' · ' + cat.label);
      sub.style.marginTop = '10px';
      card.appendChild(sub);
    }
    return card;
  }

  // ---------------------------------------------------------------------------
  // 7. Shared vs. private split
  // ---------------------------------------------------------------------------
  function svRow(color, label, cents, pct) {
    const row = App.el('div', 'legend-row');
    const dot = App.el('span', 'dot');
    dot.style.background = color;
    row.appendChild(dot);
    const l = App.el('span', '', label);
    l.style.flex = '1';
    row.appendChild(l);
    row.appendChild(App.el('span', '', App.fmtEUR(cents)));
    const p = App.el('span', '', pct + ' %');
    p.style.color = 'var(--text-2)';
    p.style.minWidth = '42px';
    p.style.textAlign = 'right';
    row.appendChild(p);
    return row;
  }

  function buildSharedPrivateCard(txs, currentMonth) {
    const sv = Analysis.sharedVsPrivate(txs, currentMonth);
    const total = sv.sharedCents + sv.privateCents;
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Gemeinsam vs. privat', function () {
      return App.infoContent([
        { p: 'Wie viel eurer Ausgaben diesen Monat gemeinsam war – und wie viel privat.' }
      ]);
    }));

    if (total <= 0) {
      card.appendChild(emptyState('⚖️', 'Noch keine Ausgaben in diesem Monat.'));
      return card;
    }

    const sharedPct = Math.round((sv.sharedCents / total) * 100);
    const bar = App.el('div');
    bar.style.display = 'flex';
    bar.style.height = '14px';
    bar.style.borderRadius = '100px';
    bar.style.overflow = 'hidden';
    bar.style.background = 'var(--bg-input)';
    bar.style.margin = '2px 0 12px';
    const segS = App.el('div');
    segS.style.width = (sv.sharedCents / total * 100) + '%';
    segS.style.background = 'var(--tint)';
    const segP = App.el('div');
    segP.style.width = (sv.privateCents / total * 100) + '%';
    segP.style.background = 'var(--teal)';
    bar.appendChild(segS);
    bar.appendChild(segP);
    card.appendChild(bar);

    card.appendChild(svRow('var(--tint)', 'Gemeinsam', sv.sharedCents, sharedPct));
    card.appendChild(svRow('var(--teal)', 'Privat', sv.privateCents, 100 - sharedPct));
    return card;
  }

  // ---------------------------------------------------------------------------
  // 8. Top expenses of the month
  // ---------------------------------------------------------------------------
  function buildTopExpensesCard(txs, currentMonth) {
    const card = App.el('div', 'card');
    card.appendChild(App.cardHead('Top-Ausgaben diesen Monat', function () {
      return App.infoContent([
        { p: 'Die fünf größten Einzelbuchungen des Monats (ohne Sparraten).' }
      ]);
    }));

    const top = Analysis.topExpenses(txs, currentMonth, 5);
    if (!top.length) {
      card.appendChild(emptyState('💸', 'Noch keine Ausgaben in diesem Monat.'));
      return card;
    }

    const group = App.el('div', 'list-group');
    group.style.boxShadow = 'none';
    top.forEach(function (tx) {
      const cat = App.cat(tx.category);
      const row = App.el('div', 'list-row');
      const icon = App.el('div', 'cat-icon', cat.emoji);
      icon.style.background = cat.color + '2E';
      const main = App.el('div', 'row-main');
      main.appendChild(App.el('div', 'row-title', tx.note || cat.label));
      main.appendChild(App.el('div', 'row-sub', cat.label + ' · ' + App.fmtDate(tx.date)));
      const trailing = App.el('div', 'row-trailing');
      trailing.appendChild(App.el('span', 'amount-neg', '−' + App.fmtEUR(tx.amountCents)));
      row.appendChild(icon);
      row.appendChild(main);
      row.appendChild(trailing);
      group.appendChild(row);
    });
    card.appendChild(group);
    return card;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render(root) {
    root.innerHTML = '';
    const view = App.el('div', 'view');

    const txs = Store.getTransactions();
    const rules = Store.getRecurring();
    const currentMonth = App.monthKey(App.todayISO());

    const hasData = txs.some(function (t) { return t.category !== 'ausgleich'; });
    if (!hasData) {
      view.appendChild(emptyState(
        '📊',
        'Noch nicht genug Daten. Erfasse ein paar Buchungen, dann zeigen wir dir hier Trends, deine Sparquote und Spartipps.'
      ));
      root.appendChild(view);
      return;
    }

    view.appendChild(buildSavingsTrendCard(txs, currentMonth));
    view.appendChild(buildTrendCard(txs, currentMonth));
    view.appendChild(buildMetricsCard(txs, rules, currentMonth));
    view.appendChild(buildSavingsCard(txs, currentMonth));
    view.appendChild(buildSharedPrivateCard(txs, currentMonth));
    view.appendChild(buildTopExpensesCard(txs, currentMonth));
    view.appendChild(buildTipsCard(txs, rules));
    view.appendChild(buildCompareCard(txs, currentMonth));

    root.appendChild(view);
  }

  window.Views.insights = {
    title: 'Analyse',
    render: render
  };
})();
