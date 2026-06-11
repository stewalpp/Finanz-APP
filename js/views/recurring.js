/* js/views/recurring.js — Fixkosten view (summary + suggestions + rules + editor sheet) */
(function () {
  'use strict';

  window.Views = window.Views || {};

  var MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  var INTERVAL_WORDS = {
    monthly: 'monatlich',
    quarterly: 'vierteljährlich',
    yearly: 'jährlich'
  };

  var SVG_CALENDAR =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="18" rx="2"></rect>' +
    '<line x1="16" y1="2" x2="16" y2="6"></line>' +
    '<line x1="8" y1="2" x2="8" y2="6"></line>' +
    '<line x1="3" y1="10" x2="21" y2="10"></line></svg>';

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

  function intervalSub(rule) {
    if (rule.interval === 'quarterly') return 'vierteljährlich';
    if (rule.interval === 'yearly') {
      var m = Math.min(12, Math.max(1, parseInt(rule.dueMonth, 10) || 1));
      return 'jährlich im ' + MONTH_NAMES[m - 1];
    }
    return 'monatlich am ' + (parseInt(rule.dueDay, 10) || 1) + '.';
  }

  // ---------------------------------------------------------------- render

  function render(root) {
    root.innerHTML = '';
    var view = App.el('div', 'view');

    var rules = Store.getRecurring();

    view.appendChild(buildSummaryCard(rules));

    var suggestions = Analysis.detectRecurring(
      Store.getTransactions(), rules, Store.getDismissed()
    );
    suggestions.forEach(function (s) {
      view.appendChild(buildSuggestionCard(s));
    });

    view.appendChild(buildRuleList(rules));

    var addBtn = App.el('button', 'btn btn-secondary', 'Neue Fixkosten anlegen');
    addBtn.type = 'button';
    addBtn.style.marginTop = '14px';
    addBtn.addEventListener('click', function () {
      openEditor(null);
    });
    view.appendChild(addBtn);

    root.appendChild(view);
  }

  function buildSummaryCard(rules) {
    var card = App.el('div', 'card');
    card.appendChild(App.el('div', 'card-title', 'Fixkosten gesamt'));

    var monthly = Analysis.fixedMonthlyCents(rules);
    var value = App.el('div', '', App.fmtEUR(monthly) + ' /Monat');
    value.style.fontSize = '28px';
    value.style.fontWeight = '700';
    card.appendChild(value);

    card.appendChild(App.el('div', 'row-sub', '≈ ' + App.fmtEUR(monthly * 12) + ' pro Jahr'));

    // disposable budget this month — same figure as on the dashboard
    var monthKey = App.monthKey(App.todayISO());
    var budget = Analysis.availableBudget(Store.getTransactions(), rules, monthKey);
    var avail = budget.total.availableCents;

    var sep = App.el('div');
    sep.style.height = '0.5px';
    sep.style.background = 'var(--sep)';
    sep.style.margin = '12px 0';
    card.appendChild(sep);

    var row = App.el('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'baseline';
    var lbl = App.el('span', '', 'Frei verfügbar diesen Monat');
    lbl.style.color = 'var(--text-2)';
    lbl.style.fontSize = '15px';
    var val = App.el('span', '', App.fmtEUR(avail));
    val.style.fontWeight = '700';
    val.style.fontSize = '17px';
    val.style.fontVariantNumeric = 'tabular-nums';
    val.style.color = avail >= 0 ? 'var(--green)' : 'var(--red)';
    row.appendChild(lbl);
    row.appendChild(val);
    card.appendChild(row);

    return card;
  }

  // ------------------------------------------------------------ suggestions

  function buildSuggestionCard(s) {
    var card = App.el('div', 'suggestion-card');

    var title = App.el('div', '', '🔍 Erkannt: ' + s.name);
    title.style.fontWeight = '600';
    card.appendChild(title);

    var word = INTERVAL_WORDS[s.interval] || s.interval;
    card.appendChild(App.el('div', 'row-sub',
      App.fmtEUR(s.amountCents) + ' ' + word + ' (' + s.count + '×)'));

    var row = App.el('div', 'form-row');
    row.style.marginTop = '10px';

    var accept = App.el('button', 'btn btn-primary btn-small', 'Übernehmen');
    accept.type = 'button';
    accept.addEventListener('click', function () {
      Store.addRecurring({
        name: s.name,
        type: 'expense',
        amountCents: s.amountCents,
        category: s.category,
        interval: s.interval,
        dueDay: s.dueDay,
        dueMonth: s.interval === 'yearly'
          ? (parseInt(String(s.lastDate).slice(5, 7), 10) || 1)
          : 1,
        anchorMonth: App.monthKey(s.lastDate),
        payerId: 'p1',
        shared: false,
        active: true,
        source: 'detected'
      });
      Store.dismissSuggestion(s.key);
      App.toast('Fixkosten angelegt ✓');
    });

    var ignore = App.el('button', 'btn btn-secondary btn-small', 'Ignorieren');
    ignore.type = 'button';
    ignore.addEventListener('click', function () {
      Store.dismissSuggestion(s.key);
    });

    row.appendChild(accept);
    row.appendChild(ignore);
    card.appendChild(row);
    return card;
  }

  // ------------------------------------------------------------- rules list

  function buildRuleList(rules) {
    var wrap = App.el('div', '');

    if (!rules.length) {
      var empty = App.el('div', 'empty-state');
      var em = App.el('span', '', '📅');
      em.style.fontSize = '40px';
      em.style.display = 'block';
      empty.appendChild(em);
      empty.appendChild(App.el('p', '',
        'Noch keine Fixkosten angelegt. Lege Miete, Strom oder Abos als Regel an – ' +
        'dann erinnert dich die App jeden Monat daran.'));
      wrap.appendChild(empty);
      return wrap;
    }

    wrap.appendChild(App.el('div', 'section-title', 'Deine Fixkosten'));
    var group = App.el('div', 'list-group');
    rules.forEach(function (rule) {
      group.appendChild(buildRuleRow(rule));
    });
    wrap.appendChild(group);
    return wrap;
  }

  function buildRuleRow(rule) {
    var cat = App.cat(rule.category);
    var row = App.el('div', 'list-row');
    row.setAttribute('role', 'button');

    var icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

    var main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', rule.name || cat.label));
    var sub = intervalSub(rule);
    var payer = App.memberName(rule.payerId);
    if (payer) sub += ' · ' + payer;
    main.appendChild(App.el('div', 'row-sub', sub));

    var trailing = App.el('div', 'row-trailing');
    if (rule.type === 'income') {
      trailing.appendChild(App.el('span', 'amount-pos', '+' + App.fmtEUR(rule.amountCents)));
    } else {
      trailing.appendChild(App.el('span', 'amount-neg', '−' + App.fmtEUR(rule.amountCents)));
    }

    var switchLabel = App.el('label', 'switch');
    switchLabel.style.transform = 'scale(.8)';
    switchLabel.style.transformOrigin = 'right center';
    switchLabel.style.marginLeft = '8px';
    var activeInput = document.createElement('input');
    activeInput.type = 'checkbox';
    activeInput.checked = !!rule.active;
    activeInput.setAttribute('aria-label', rule.name ? 'Aktiv: ' + rule.name : 'Aktiv');
    switchLabel.appendChild(activeInput);
    switchLabel.appendChild(App.el('span', 'switch-track'));
    switchLabel.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    activeInput.addEventListener('change', function () {
      Store.updateRecurring(rule.id, { active: activeInput.checked });
      App.toast(activeInput.checked ? 'Aktiviert' : 'Pausiert');
    });

    if (!rule.active) {
      icon.style.opacity = '.5';
      main.style.opacity = '.5';
      trailing.style.opacity = '.5';
    }

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
    row.appendChild(switchLabel);
    row.addEventListener('click', function () {
      openEditor(rule);
    });
    return row;
  }

  // ------------------------------------------------------------ header action

  function headerAction() {
    var btn = App.el('button', 'icon-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Fixkosten als Kalender exportieren');
    btn.innerHTML = SVG_CALENDAR;
    btn.addEventListener('click', function () {
      var rules = Store.getRecurring();
      var hasActive = rules.some(function (r) { return r.active; });
      if (!hasActive) {
        App.toast('Keine aktiven Fixkosten zum Exportieren');
        return;
      }
      var ics = Analysis.icsForRules(rules, getMembers());
      App.downloadFile('fixkosten.ics', ics, 'text/calendar');
      App.toast('Kalenderdatei erstellt');
    });
    return btn;
  }

  // ---------------------------------------------------------------- editor

  function openEditor(rule) {
    var isEdit = !!rule;
    var members = getMembers();
    var st = {
      type: isEdit ? rule.type : 'expense',
      category: isEdit ? rule.category : 'wohnen',
      interval: isEdit ? rule.interval : 'monthly',
      payerId: isEdit ? rule.payerId : 'p1',
      shared: isEdit ? !!rule.shared : false   // default: privat (zählt nicht in die Paar-Bilanz)
    };

    var content = App.el('div', '');

    // --- name ---
    var nameGroup = App.el('div', 'form-group');
    nameGroup.appendChild(App.el('div', 'form-label', 'Name'));
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input';
    nameInput.placeholder = 'Name (z. B. Miete, Netflix …)';
    nameInput.autocomplete = 'off';
    nameInput.value = isEdit ? (rule.name || '') : '';
    var lastAutoName = ''; // tracks auto-filled value so typing wins over auto-fill
    nameGroup.appendChild(nameInput);
    content.appendChild(nameGroup);

    // --- amount ---
    var amountGroup = App.el('div', 'form-group');
    var amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.className = 'amount-input';
    amountInput.inputMode = 'decimal';
    amountInput.placeholder = '0,00';
    amountInput.autocomplete = 'off';
    amountInput.setAttribute('aria-label', 'Betrag in Euro');
    if (isEdit) amountInput.value = centsToInput(rule.amountCents);
    amountGroup.appendChild(amountInput);
    content.appendChild(amountGroup);

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
        if (!stillValid) st.category = (st.type === 'income') ? 'gehalt' : 'wohnen';
        buildCatGrid();
        updateSharedHint();
      });
      typeSegEls[d.key] = seg;
      segType.appendChild(seg);
    });
    typeGroup.appendChild(segType);
    content.appendChild(typeGroup);

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
          // Pre-fill the name with the category label as long as the user
          // hasn't typed an own name (empty or still a previous auto-fill).
          var current = nameInput.value.trim();
          if (!current || current === lastAutoName) {
            nameInput.value = c.label;
            lastAutoName = c.label;
          }
        });
        catGrid.appendChild(chip);
      });
    }
    buildCatGrid();

    // --- interval segmented ---
    var intervalGroup = App.el('div', 'form-group');
    intervalGroup.appendChild(App.el('div', 'form-label', 'Intervall'));
    var segInterval = App.el('div', 'segmented');
    var intervalDefs = [
      { key: 'monthly', label: 'monatlich' },
      { key: 'quarterly', label: 'vierteljährlich' },
      { key: 'yearly', label: 'jährlich' }
    ];
    var intervalSegEls = {};
    intervalDefs.forEach(function (d) {
      var seg = App.el('button', 'segment', d.label);
      seg.type = 'button';
      if (st.interval === d.key) seg.classList.add('active');
      seg.addEventListener('click', function () {
        if (st.interval === d.key) return;
        st.interval = d.key;
        intervalDefs.forEach(function (t) {
          intervalSegEls[t.key].classList.toggle('active', t.key === st.interval);
        });
        monthWrap.style.display = (st.interval === 'yearly') ? '' : 'none';
      });
      intervalSegEls[d.key] = seg;
      segInterval.appendChild(seg);
    });
    intervalGroup.appendChild(segInterval);
    content.appendChild(intervalGroup);

    // --- due day + month (month only for yearly) ---
    var dueGroup = App.el('div', 'form-group');
    var dueRow = App.el('div', 'form-row');

    var dayWrap = App.el('div', '');
    dayWrap.style.flex = '1';
    dayWrap.appendChild(App.el('div', 'form-label', 'Fällig'));
    var daySelect = document.createElement('select');
    daySelect.className = 'input';
    daySelect.setAttribute('aria-label', 'Fälligkeitstag');
    for (var d = 1; d <= 28; d++) {
      var dayOpt = document.createElement('option');
      dayOpt.value = String(d);
      dayOpt.textContent = 'am ' + d + '.';
      daySelect.appendChild(dayOpt);
    }
    daySelect.value = String(isEdit ? (parseInt(rule.dueDay, 10) || 1) : 1);
    dayWrap.appendChild(daySelect);

    var monthWrap = App.el('div', '');
    monthWrap.style.flex = '1';
    monthWrap.appendChild(App.el('div', 'form-label', 'Monat'));
    var monthSelect = document.createElement('select');
    monthSelect.className = 'input';
    monthSelect.setAttribute('aria-label', 'Fälligkeitsmonat');
    MONTH_NAMES.forEach(function (name, i) {
      var monthOpt = document.createElement('option');
      monthOpt.value = String(i + 1);
      monthOpt.textContent = name;
      monthSelect.appendChild(monthOpt);
    });
    monthSelect.value = String(isEdit ? (parseInt(rule.dueMonth, 10) || 1) : 1);
    monthWrap.appendChild(monthSelect);
    monthWrap.style.display = (st.interval === 'yearly') ? '' : 'none';

    dueRow.appendChild(dayWrap);
    dueRow.appendChild(monthWrap);
    dueGroup.appendChild(dueRow);
    content.appendChild(dueGroup);

    // --- payer segmented ---
    var payerGroup = App.el('div', 'form-group');
    payerGroup.appendChild(App.el('div', 'form-label', 'Bezahlt von'));
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
    sharedGroup.appendChild(App.el('div', 'form-label', 'Zuordnung'));
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
    var sharedHint = App.el('div', 'form-label', '');
    sharedHint.style.margin = '6px 0 0';
    sharedGroup.appendChild(sharedHint);
    function updateSharedHint() {
      sharedHint.textContent = (st.type === 'income')
        ? 'Gemeinsame Einnahmen werden in der Paar-Bilanz 50/50 geteilt.'
        : 'Nur „Gemeinsam“ zählt in die Paar-Bilanz (z. B. Auto, Nebenkosten).';
    }
    updateSharedHint();
    content.appendChild(sharedGroup);

    // --- save ---
    var saveBtn = App.el('button', 'btn btn-primary', 'Speichern');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', function () {
      var name = nameInput.value.trim();
      if (!name) {
        App.toast('Bitte einen Namen eingeben');
        return;
      }
      var cents = App.parseEUR(amountInput.value);
      if (cents === null || cents <= 0) {
        App.toast('Bitte gültigen Betrag eingeben');
        return;
      }
      var data = {
        name: name,
        type: st.type,
        amountCents: cents,
        category: st.category,
        interval: st.interval,
        dueDay: parseInt(daySelect.value, 10) || 1,
        dueMonth: parseInt(monthSelect.value, 10) || 1,
        payerId: st.payerId,
        shared: st.shared
      };
      if (isEdit) {
        Store.updateRecurring(rule.id, data);
      } else {
        data.active = true;
        data.source = 'manual';
        Store.addRecurring(data);
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
          title: 'Fixkosten löschen?',
          message: 'Diese Regel wird dauerhaft entfernt. Bereits gebuchte Zahlungen bleiben erhalten.',
          confirmText: 'Löschen',
          destructive: true
        }).then(function (ok) {
          if (!ok) return;
          Store.deleteRecurring(rule.id);
          App.closeSheet();
          App.toast('Gelöscht');
        });
      });
      content.appendChild(delBtn);
    }

    App.showSheet({
      title: isEdit ? 'Fixkosten bearbeiten' : 'Neue Fixkosten',
      content: content
    });

    if (!isEdit) {
      setTimeout(function () {
        try { nameInput.focus(); } catch (e) { /* focus is best-effort */ }
      }, 300);
    }
  }

  window.Views.recurring = {
    title: 'Fixkosten',
    render: render,
    headerAction: headerAction,
    openEditor: openEditor
  };
})();
