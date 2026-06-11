/* js/views/insights.js — "Analyse": 6-month trend, savings rate, tips, category comparison. */
/* global App, Store, Analysis, Charts, Views */
(function () {
  'use strict';

  window.Views = window.Views || {};

  const GREEN = '#30D158';
  const RED = '#FF453A';

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
    card.appendChild(App.el('div', 'card-title', 'Einnahmen & Ausgaben'));

    const trend = Analysis.trend(txs, 6, currentMonth);
    const data = trend.map(function (t) {
      return {
        label: monthShortLabel(t.month),
        series: [
          { value: t.incomeCents, color: GREEN },
          { value: t.expenseCents, color: RED }
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
    card.appendChild(legend);

    return card;
  }

  // ---------------------------------------------------------------------------
  // 2. Savings rate card (current month)
  // ---------------------------------------------------------------------------
  function buildSavingsCard(txs, currentMonth) {
    const card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Sparquote'));

    const summary = Analysis.monthlySummary(txs, currentMonth);
    if (summary.incomeCents <= 0) {
      card.appendChild(App.el(
        'p', 'row-sub',
        'Für diesen Monat sind noch keine Einnahmen erfasst. Sobald Einnahmen da sind, siehst du hier deine Sparquote.'
      ));
      return card;
    }

    const pct = Math.round((summary.savedCents / summary.incomeCents) * 100);

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
      'Du hast ' + App.fmtEUR(summary.savedCents) + ' von ' + App.fmtEUR(summary.incomeCents) + ' übrig.'
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

    view.appendChild(buildTrendCard(txs, currentMonth));
    view.appendChild(buildSavingsCard(txs, currentMonth));
    view.appendChild(buildTipsCard(txs, rules));
    view.appendChild(buildCompareCard(txs, currentMonth));

    root.appendChild(view);
  }

  window.Views.insights = {
    title: 'Analyse',
    render: render
  };
})();
