/* js/views/transactions.js — Buchungen view (list + filters + editor sheet) */
(function () {
  'use strict';

  window.Views = window.Views || {};

  // ---- module-level state (persists across re-renders) ----
  var state = {
    month: null,       // 'YYYY-MM' — lazily initialized to current month
    search: '',
    person: 'all',     // 'all' | 'p1' | 'p2'
    category: 'all'    // 'all' | category key
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

  // ---------------------------------------------------------------- render

  function render(root) {
    ensureMonth();
    root.innerHTML = '';
    var view = App.el('div', 'view');

    var listWrap = App.el('div', '');

    view.appendChild(buildMonthNav(root));
    view.appendChild(buildSearchbar(listWrap));
    view.appendChild(buildChipRow(root));
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

  function buildChipRow(root) {
    var row = App.el('div', 'chip-row');
    var members = getMembers();

    var personChips = [{ id: 'all', name: 'Alle' }];
    members.forEach(function (m) {
      personChips.push({ id: m.id, name: m.name });
    });

    personChips.forEach(function (p) {
      var chip = App.el('button', 'chip', p.name);
      chip.type = 'button';
      if (state.person === p.id) chip.classList.add('active');
      chip.addEventListener('click', function () {
        state.person = p.id;
        render(root);
      });
      row.appendChild(chip);
    });

    var catChip = App.el('button', 'chip');
    catChip.type = 'button';
    if (state.category !== 'all') {
      var c = App.cat(state.category);
      catChip.textContent = c.emoji + ' ' + c.label + ' ▾';
      catChip.classList.add('active');
    } else {
      catChip.textContent = 'Kategorie ▾';
    }
    catChip.addEventListener('click', function () {
      openCategoryFilterSheet(root);
    });
    row.appendChild(catChip);

    return row;
  }

  function openCategoryFilterSheet(root) {
    var content = App.el('div', '');
    var group = App.el('div', 'list-group');

    function addRow(key, emoji, label, color) {
      var row = App.el('div', 'list-row');
      row.setAttribute('role', 'button');
      var icon = App.el('div', 'cat-icon', emoji);
      icon.style.background = color + '2E';
      var main = App.el('div', 'row-main');
      main.appendChild(App.el('div', 'row-title', label));
      row.appendChild(icon);
      row.appendChild(main);
      if (state.category === key) {
        var check = App.el('div', 'row-trailing', '✓');
        check.style.color = 'var(--tint)';
        check.style.fontWeight = '600';
        row.appendChild(check);
      }
      row.addEventListener('click', function () {
        state.category = key;
        App.closeSheet();
        render(root);
      });
      group.appendChild(row);
    }

    addRow('all', '📂', 'Alle Kategorien', '#8E8E93');
    Object.keys(App.CATEGORIES).forEach(function (key) {
      if (key === 'ausgleich') return;
      var c = App.CATEGORIES[key];
      addRow(key, c.emoji, c.label, c.color);
    });

    content.appendChild(group);
    App.showSheet({ title: 'Kategorie wählen', content: content });
  }

  // ------------------------------------------------------------------ list

  function getFiltered() {
    var q = state.search.trim().toLowerCase();
    return Store.getTransactions().filter(function (tx) {
      if (App.monthKey(tx.date) !== state.month) return false;
      if (state.person !== 'all' && tx.payerId !== state.person) return false;
      if (state.category !== 'all' && tx.category !== state.category) return false;
      if (q) {
        var cat = App.cat(tx.category);
        var hay = ((tx.note || '') + ' ' + cat.label + ' ' + App.memberName(tx.payerId)).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderList(wrap) {
    wrap.innerHTML = '';
    var txs = getFiltered();

    if (!txs.length) {
      var hasFilter = state.search.trim() !== '' || state.person !== 'all' || state.category !== 'all';
      var empty = App.el('div', 'empty-state');
      var em = App.el('span', '', '🧾');
      em.style.fontSize = '40px';
      em.style.display = 'block';
      empty.appendChild(em);
      empty.appendChild(App.el('p', '', hasFilter
        ? 'Keine Treffer. Passe Suche oder Filter an.'
        : 'Noch keine Buchungen in diesem Monat. Tippe auf +, um die erste anzulegen.'));
      wrap.appendChild(empty);
      return;
    }

    // group by date (transactions arrive sorted date DESC)
    var groups = [];
    var current = null;
    txs.forEach(function (tx) {
      if (!current || current.date !== tx.date) {
        current = { date: tx.date, items: [] };
        groups.push(current);
      }
      current.items.push(tx);
    });

    groups.forEach(function (g) {
      wrap.appendChild(App.el('div', 'section-title', App.fmtDateShort(g.date)));
      var listGroup = App.el('div', 'list-group');
      g.items.forEach(function (tx) {
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

    // month summary footer
    var expenseSum = txs.reduce(function (sum, tx) {
      return (tx.type === 'expense' && tx.category !== 'ausgleich') ? sum + tx.amountCents : sum;
    }, 0);
    var label = (txs.length === 1 ? '1 Buchung' : txs.length + ' Buchungen') +
      ' · Σ Ausgaben ' + App.fmtEUR(expenseSum);
    var footer = App.el('p', 'row-sub', label);
    footer.style.textAlign = 'center';
    footer.style.padding = '14px 0 4px';
    wrap.appendChild(footer);
  }

  function buildTxRow(tx) {
    var cat = App.cat(tx.category);
    var row = App.el('div', 'list-row');
    row.setAttribute('role', 'button');

    var icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

    var main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', tx.note || cat.label));
    var sub = cat.label + ' · ' + (App.memberName(tx.payerId) || '–');
    if (tx.shared) sub += ' · geteilt';
    main.appendChild(App.el('div', 'row-sub', sub));

    var trailing = App.el('div', 'row-trailing');
    if (tx.type === 'income') {
      trailing.appendChild(App.el('span', 'amount-pos', '+' + App.fmtEUR(tx.amountCents)));
    } else {
      trailing.appendChild(App.el('span', 'amount-neg', '−' + App.fmtEUR(tx.amountCents)));
    }

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(trailing);
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
      setX(-ACTION_W);
      openSwipe = closeCell;
    }
    function closeCell() {
      open = false;
      cell.classList.remove('dragging');
      setX(0);
      if (openSwipe === closeCell) openSwipe = null;
    }
    function doDelete() {
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

  function openEditor(tx) {
    var isEdit = !!tx;
    var members = getMembers();
    var st = {
      type: isEdit ? tx.type : 'expense',
      category: isEdit ? tx.category : 'lebensmittel',
      payerId: isEdit ? tx.payerId : 'p1'
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
        sharedGroup.style.display = (st.type === 'income') ? 'none' : '';
        if (!isEdit) sharedInput.checked = st.type !== 'income';
      });
      typeSegEls[d.key] = seg;
      segType.appendChild(seg);
    });
    typeGroup.appendChild(segType);
    content.appendChild(typeGroup);

    // --- amount ---
    var amountGroup = App.el('div', 'form-group');
    var amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.className = 'amount-input';
    amountInput.inputMode = 'decimal';
    amountInput.placeholder = '0,00';
    amountInput.autocomplete = 'off';
    amountInput.setAttribute('aria-label', 'Betrag in Euro');
    if (isEdit) amountInput.value = centsToInput(tx.amountCents);
    else amountInput.setAttribute('autofocus', '');
    amountGroup.appendChild(amountInput);
    content.appendChild(amountGroup);

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

    // --- shared switch (hidden for income) ---
    var sharedGroup = App.el('div', 'form-group');
    var sharedRow = App.el('div', 'form-row');
    sharedRow.style.alignItems = 'center';
    sharedRow.style.justifyContent = 'space-between';
    sharedRow.appendChild(App.el('div', '', 'Gemeinsame Ausgabe'));
    var switchLabel = App.el('label', 'switch');
    var sharedInput = document.createElement('input');
    sharedInput.type = 'checkbox';
    sharedInput.checked = isEdit ? !!tx.shared : true;
    switchLabel.appendChild(sharedInput);
    switchLabel.appendChild(App.el('span', 'switch-track'));
    sharedRow.appendChild(switchLabel);
    sharedGroup.appendChild(sharedRow);
    sharedGroup.style.display = (st.type === 'income') ? 'none' : '';
    content.appendChild(sharedGroup);

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
        shared: !!sharedInput.checked
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

    if (!isEdit) {
      setTimeout(function () {
        try { amountInput.focus(); } catch (e) { /* focus is best-effort */ }
      }, 300);
    }
  }

  window.Views.transactions = {
    title: 'Buchungen',
    render: render,
    openEditor: openEditor
  };
})();
