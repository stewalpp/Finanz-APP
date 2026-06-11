/* js/views/transactions.js — Buchungen view (list + filters + editor sheet) */
(function () {
  'use strict';

  window.Views = window.Views || {};

  // ---- module-level state (persists across re-renders) ----
  // Buchungen zeigt ausschließlich GEMEINSAME (shared) Buchungen. Private Buchungen
  // leben im Tab „Persönlich". Daher keine Personen-/Kategorie-Filter mehr.
  var state = {
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

    view.appendChild(buildMonthNav(root));
    view.appendChild(buildSearchbar(listWrap));
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

  // ------------------------------------------------------------------ list

  // Only SHARED transactions (the joint ledger). 'ausgleich' has shared:false → excluded.
  function getFiltered() {
    var q = state.search.trim().toLowerCase();
    return Store.getTransactions().filter(function (tx) {
      if (tx.shared !== true) return false;
      if (App.monthKey(tx.date) !== state.month) return false;
      if (q) {
        var cat = App.cat(tx.category);
        var hay = ((tx.note || '') + ' ' + cat.label + ' ' + App.memberName(tx.payerId)).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // Live total card — always visible, recomputed on every render/search/data change.
  function buildTotalCard(txs) {
    var expenseSum = txs.reduce(function (sum, tx) {
      return tx.type === 'expense' ? sum + tx.amountCents : sum;
    }, 0);
    var incomeSum = txs.reduce(function (sum, tx) {
      return tx.type === 'income' ? sum + tx.amountCents : sum;
    }, 0);

    var card = App.el('div', 'card hero-card');
    card.appendChild(App.el('div', 'card-title', 'Gemeinsame Ausgaben · ' + App.fmtMonth(state.month)));
    var big = App.el('div', 'hero-amount', App.fmtEUR(expenseSum));
    card.appendChild(big);
    var n = txs.length;
    var subText = (n === 1 ? '1 gemeinsame Buchung' : n + ' gemeinsame Buchungen');
    if (incomeSum > 0) subText += ' · Einnahmen ' + App.fmtEUR(incomeSum);
    var sub = App.el('div', 'hero-sub', subText);
    card.appendChild(sub);
    return card;
  }

  function renderList(wrap) {
    wrap.innerHTML = '';
    var txs = getFiltered();

    // live total always on top
    wrap.appendChild(buildTotalCard(txs));

    if (!txs.length) {
      var hasSearch = state.search.trim() !== '';
      var empty = App.el('div', 'empty-state');
      var em = App.el('span', '', '🧾');
      em.style.fontSize = '40px';
      em.style.display = 'block';
      empty.appendChild(em);
      empty.appendChild(App.el('p', '', hasSearch
        ? 'Keine Treffer für deine Suche.'
        : 'Noch keine gemeinsamen Buchungen in diesem Monat. Tippe auf + und wähle „Gemeinsam“.'));
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
  }

  function buildTxRow(tx) {
    var cat = App.cat(tx.category);
    var row = App.el('div', 'list-row');
    row.setAttribute('role', 'button');
    // coloured left edge in the payer's colour → who booked it is scannable at a glance
    row.style.boxShadow = 'inset 4px 0 0 0 ' + memberColor(tx.payerId);

    var icon = App.el('div', 'cat-icon', cat.emoji);
    icon.style.background = cat.color + '2E';

    var main = App.el('div', 'row-main');
    main.appendChild(App.el('div', 'row-title', tx.note || cat.label));
    main.appendChild(App.el('div', 'row-sub', cat.label + ' · ' + (App.memberName(tx.payerId) || '–')));

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
      payerId: isEdit ? tx.payerId : 'p1',
      shared: isEdit ? !!tx.shared : false   // default: privat (zählt nicht in die Paar-Bilanz)
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
