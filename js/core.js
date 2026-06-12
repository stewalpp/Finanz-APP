/* ============================================================
   Unsere Finanzen — js/core.js
   window.App: formatting helpers, categories, element factory,
   bottom sheet, confirm alert, toast.
   Classic script, loaded first. No modules, no external libs.
   ============================================================ */
(function () {
  'use strict';

  var App = window.App = window.App || {};

  /* ---------------- formatting ---------------- */

  var EUR_FMT = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  var DATE_SHORT_FMT = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
  var MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function dateFromISO(iso) {
    var p = String(iso || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }

  // cents (int, may be negative) -> '1.234,56 €'
  App.fmtEUR = function (cents) {
    return EUR_FMT.format((Number(cents) || 0) / 100);
  };

  // '12,99' | '12.99' | '1.234,56' | '1234' (€ / spaces tolerated) -> int cents or null.
  // Returns null for anything non-numeric or <= 0.
  App.parseEUR = function (str) {
    if (str == null) return null;
    var s = String(str).replace(/€/g, '').replace(/\s/g, '');
    if (!s || !/^[0-9.,]+$/.test(s)) return null;

    var intPart = '';
    var fracPart = '';
    var hasComma = s.indexOf(',') !== -1;
    var hasDot = s.indexOf('.') !== -1;

    function isGrouped(groups) {
      // '1.234' / '1.234.567' style thousand grouping
      for (var i = 0; i < groups.length; i++) {
        if (i === 0) { if (groups[i].length < 1) return false; }
        else if (groups[i].length !== 3) return false;
      }
      return groups.length > 1;
    }

    if (hasComma && hasDot) {
      var decSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
      var thouSep = decSep === ',' ? '.' : ',';
      var parts = s.split(decSep);
      if (parts.length !== 2 || parts[1].length > 2) return null;
      intPart = parts[0].split(thouSep).join('');
      fracPart = parts[1];
    } else if (hasComma || hasDot) {
      var sep = hasComma ? ',' : '.';
      var groups = s.split(sep);
      if (groups.length === 2 && groups[1].length <= 2) {
        intPart = groups[0];
        fracPart = groups[1];
      } else if (isGrouped(groups)) {
        intPart = groups.join('');
      } else {
        return null;
      }
    } else {
      intPart = s;
    }

    if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
    if (intPart === '' && fracPart === '') return null;

    var cents = parseInt(intPart || '0', 10) * 100 +
      (fracPart ? parseInt((fracPart + '0').slice(0, 2), 10) : 0);
    if (!isFinite(cents) || cents <= 0) return null;
    return cents;
  };

  // 'YYYY-MM-DD' -> '11.06.2026'
  App.fmtDate = function (iso) {
    var s = String(iso || '');
    if (s.length < 10) return '';
    return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
  };

  // 'YYYY-MM-DD' -> 'Do., 11. Juni'
  App.fmtDateShort = function (iso) {
    var s = String(iso || '');
    if (s.length < 10) return '';
    return DATE_SHORT_FMT.format(dateFromISO(s));
  };

  // 'YYYY-MM' -> 'Juni 2026'
  App.fmtMonth = function (monthKey) {
    var s = String(monthKey || '');
    if (s.length < 7) return '';
    var m = parseInt(s.slice(5, 7), 10);
    if (!m || m < 1 || m > 12) return '';
    return MONTH_NAMES[m - 1] + ' ' + s.slice(0, 4);
  };

  // local 'YYYY-MM-DD'
  App.todayISO = function () {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };

  App.monthKey = function (iso) {
    return String(iso || '').slice(0, 7);
  };

  // 'YYYY-MM' + n -> 'YYYY-MM' (n may be negative)
  App.addMonths = function (monthKey, n) {
    var y = parseInt(String(monthKey).slice(0, 4), 10);
    var m0 = parseInt(String(monthKey).slice(5, 7), 10) - 1 + (Number(n) || 0);
    var carry = Math.floor(m0 / 12);
    return (y + carry) + '-' + pad2(m0 - carry * 12 + 1);
  };

  App.uid = function () {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };

  App.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  };

  // tiny element factory; className/text optional
  App.el = function (tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  // Wrap a list row with the usual iOS delete action. The row keeps its own click
  // handlers; swiping left reveals "Löschen", and a long left swipe deletes directly.
  App.swipeToDelete = function (rowEl, onDelete, opts) {
    opts = opts || {};
    var actionW = opts.width || 88;
    var cell = App.el('div', 'swipe-cell');
    var action = App.el('button', 'swipe-action', opts.label || 'Löschen');
    action.type = 'button';
    action.setAttribute('aria-label', opts.ariaLabel || 'Eintrag löschen');
    cell.appendChild(action);
    cell.appendChild(rowEl);

    var open = false;
    var startX = 0, startY = 0, curX = 0, base = 0;
    var dragging = false, decided = false, suppressClick = false;

    function setX(x) {
      curX = x;
      var reveal = Math.min(actionW, Math.max(0, -x));
      cell.style.setProperty('--swipe-reveal', reveal + 'px');
      cell.classList.toggle('revealing', reveal > 0);
      rowEl.style.transform = x ? 'translateX(' + x + 'px)' : '';
    }

    function closeCell() {
      open = false;
      cell.classList.remove('dragging');
      cell.classList.remove('open');
      cell.classList.remove('revealing');
      setX(0);
      if (App._openSwipeClose === closeCell) App._openSwipeClose = null;
    }

    function openCell() {
      open = true;
      cell.classList.remove('dragging');
      cell.classList.add('open');
      setX(-actionW);
      if (App._openSwipeClose && App._openSwipeClose !== closeCell) App._openSwipeClose();
      App._openSwipeClose = closeCell;
    }

    function doDelete() {
      if (App._openSwipeClose === closeCell) App._openSwipeClose = null;
      if (typeof onDelete === 'function') onDelete();
    }

    function end() {
      rowEl.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragging = false;
      decided = false;
    }

    function onMove(e) {
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { end(); return; }
        if (!open && dx > 0) {
          suppressClick = true;
          setTimeout(function () { suppressClick = false; }, 80);
          end();
          return;
        }
        decided = true;
        dragging = true;
        cell.classList.add('dragging');
        try { rowEl.setPointerCapture(e.pointerId); } catch (err) { /* not critical */ }
        if (App._openSwipeClose && App._openSwipeClose !== closeCell) App._openSwipeClose();
      }
      if (e.cancelable) e.preventDefault();
      var x = base + dx;
      if (x > 0) x = 0;
      if (x < -actionW) x = -actionW + (x + actionW) * 0.35;
      setX(x);
    }

    function onUp() {
      if (dragging) {
        cell.classList.remove('dragging');
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 80);
        if (curX < -actionW * 1.45) doDelete();
        else if (curX < -actionW * 0.45) openCell();
        else closeCell();
      }
      end();
    }

    rowEl.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      base = open ? -actionW : 0;
      decided = false;
      dragging = false;
      rowEl.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    rowEl.addEventListener('click', function (e) {
      if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; return; }
      if (open) { e.preventDefault(); e.stopPropagation(); closeCell(); }
    }, true);

    action.addEventListener('click', function (e) {
      e.stopPropagation();
      doDelete();
    });

    return cell;
  };

  // Card header row: title on the left, optional (i) button on the right that
  // opens an explanation sheet. makeContent (lazy) returns the sheet content.
  App.cardHead = function (title, makeContent) {
    var head = App.el('div', 'card-head');
    head.appendChild(App.el('div', 'card-title', title));
    if (typeof makeContent === 'function') {
      var btn = App.el('button', 'info-btn');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Erklärung: ' + title);
      btn.appendChild(App.el('span', 'info-glyph', 'i'));
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        App.showSheet({ title: title, content: makeContent() });
      });
      head.appendChild(btn);
    }
    return head;
  };

  // Declarative builder for explanation-sheet content. blocks:
  //   {p: text}                       paragraph
  //   {h: text}                       small section heading
  //   {row: [label, value, tone?]}    label/value line; tone 'pos'|'neg'
  //   {hr: true}                      separator line
  App.infoContent = function (blocks) {
    var box = App.el('div', 'info-content');
    (blocks || []).forEach(function (b) {
      if (!b) return;
      if (b.p) {
        box.appendChild(App.el('p', 'info-p', b.p));
      } else if (b.h) {
        box.appendChild(App.el('div', 'info-h', b.h));
      } else if (b.row) {
        var row = App.el('div', 'info-row');
        row.appendChild(App.el('span', '', b.row[0]));
        row.appendChild(App.el('span', 'info-row-value' + (b.row[2] ? ' ' + b.row[2] : ''), b.row[1]));
        box.appendChild(row);
      } else if (b.hr) {
        box.appendChild(App.el('div', 'info-hr'));
      }
    });
    return box;
  };

  App.downloadFile = function (filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };

  /* ---------------- appearance (per device, not synced) ---------------- */

  // 'system' | 'light' | 'dark' — stored in localStorage 'cf.theme';
  // index.html applies the class before first paint, this keeps it in sync.
  App.getTheme = function () {
    try {
      var t = localStorage.getItem('cf.theme');
      return t === 'dark' || t === 'light' ? t : 'system';
    } catch (e) { return 'system'; }
  };

  App.setTheme = function (theme) {
    var html = document.documentElement;
    html.classList.remove('theme-light', 'theme-dark');
    try {
      if (theme === 'light' || theme === 'dark') {
        localStorage.setItem('cf.theme', theme);
        html.classList.add('theme-' + theme);
      } else {
        localStorage.removeItem('cf.theme');
      }
    } catch (e) { /* storage unavailable — theme stays for this session only */ }
  };

  /* ---------------- categories ---------------- */

  App.CATEGORIES = {
    gehalt:       { label: 'Gehalt',                emoji: '💼',  color: '#30D158', type: 'income' },
    einnahme:     { label: 'Sonstige Einnahme',     emoji: '💶',  color: '#66D4CF', type: 'income' },
    lebensmittel: { label: 'Lebensmittel',          emoji: '🛒',  color: '#34C759', type: 'expense' },
    restaurant:   { label: 'Restaurant & Café',     emoji: '🍽️', color: '#FF9F0A', type: 'expense' },
    wohnen:       { label: 'Miete & Wohnen',        emoji: '🏠',  color: '#0A84FF', type: 'expense' },
    nebenkosten:  { label: 'Strom, Gas & Wasser',   emoji: '💡',  color: '#FFD60A', type: 'expense' },
    internet:     { label: 'Internet & Handy',      emoji: '📶',  color: '#64D2FF', type: 'expense' },
    versicherung: { label: 'Versicherungen',        emoji: '🛡️', color: '#5E5CE6', type: 'expense' },
    transport:    { label: 'Auto & Transport',      emoji: '🚗',  color: '#BF5AF2', type: 'expense' },
    abos:         { label: 'Abos & Streaming',      emoji: '📺',  color: '#FF453A', type: 'expense' },
    gesundheit:   { label: 'Gesundheit & Drogerie', emoji: '💊',  color: '#FF375F', type: 'expense' },
    kleidung:     { label: 'Kleidung',              emoji: '👕',  color: '#AC8E68', type: 'expense' },
    freizeit:     { label: 'Freizeit & Sport',      emoji: '🎾',  color: '#63E6E2', type: 'expense' },
    urlaub:       { label: 'Urlaub & Reisen',       emoji: '✈️',  color: '#40C8E0', type: 'expense' },
    geschenke:    { label: 'Geschenke',             emoji: '🎁',  color: '#FF6482', type: 'expense' },
    haushalt:     { label: 'Haushalt & Möbel',      emoji: '🛋️', color: '#98989D', type: 'expense' },
    sparen:       { label: 'Sparen & Anlegen',      emoji: '🏦',  color: '#00C7BE', type: 'expense' },
    kredite:      { label: 'Kredite',               emoji: '💳',  color: '#C76E5A', type: 'expense' },
    ausgleich:    { label: 'Ausgleich',             emoji: '🤝',  color: '#8E8E93', type: 'expense' },
    sonstiges:    { label: 'Sonstiges',             emoji: '📦',  color: '#8E8E93', type: 'expense' }
  };

  // 'expense' -> all non-income except 'ausgleich'; 'income' -> income entries plus 'sonstiges'
  App.catList = function (type) {
    var out = [];
    Object.keys(App.CATEGORIES).forEach(function (key) {
      var c = App.CATEGORIES[key];
      var include = type === 'income'
        ? (c.type === 'income' || key === 'sonstiges')
        : (c.type !== 'income' && key !== 'ausgleich');
      if (include) out.push({ key: key, label: c.label, emoji: c.emoji, color: c.color });
    });
    return out;
  };

  // unknown key falls back to the 'sonstiges' entry
  App.cat = function (key) {
    return App.CATEGORIES[key] || App.CATEGORIES.sonstiges;
  };

  App.memberName = function (id) {
    try {
      var settings = window.Store && typeof window.Store.getSettings === 'function'
        ? window.Store.getSettings()
        : null;
      if (!settings || !Array.isArray(settings.members)) return '';
      for (var i = 0; i < settings.members.length; i++) {
        var m = settings.members[i];
        if (m && m.id === id) return m.name || '';
      }
      return '';
    } catch (err) {
      return '';
    }
  };

  /* ---------------- bottom sheet ---------------- */

  var sheetState = { open: false, onClose: null, sheet: null, backdrop: null, gen: 0 };

  function teardownSheet() {
    var root = document.getElementById('sheet-root');
    if (root) root.innerHTML = '';
    document.body.style.overflow = '';
    var wasOpen = sheetState.open;
    var cb = sheetState.onClose;
    sheetState.open = false;
    sheetState.onClose = null;
    sheetState.sheet = null;
    sheetState.backdrop = null;
    if (wasOpen && cb) {
      try { cb(); } catch (err) { console.error(err); }
    }
  }

  // Drag the sheet down by its grab zone (handle + header) to dismiss.
  function enableSheetDrag(sheet, grab) {
    var startY = 0, dy = 0, active = false;
    grab.style.touchAction = 'none';

    grab.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (sheet.scrollTop > 0) return;            // near top only → otherwise let it scroll
      startY = e.clientY; dy = 0; active = true;
      sheet.style.animation = 'none';             // cancel the open animation if still running
      sheet.style.transition = 'none';
      try { grab.setPointerCapture(e.pointerId); } catch (err) { /* not critical */ }
      grab.addEventListener('pointermove', onMove);
      grab.addEventListener('pointerup', onUp);
      grab.addEventListener('pointercancel', onUp);
    });

    function onMove(e) {
      if (!active) return;
      dy = e.clientY - startY;
      if (dy < 0) dy = dy * 0.18;                 // resist upward pull
      sheet.style.transform = 'translateY(' + dy + 'px)';
      if (sheetState.backdrop) {
        sheetState.backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / 420));
      }
      if (e.cancelable) e.preventDefault();
    }

    function onUp() {
      grab.removeEventListener('pointermove', onMove);
      grab.removeEventListener('pointerup', onUp);
      grab.removeEventListener('pointercancel', onUp);
      if (!active) return;
      active = false;
      if (dy > 110) {
        App.closeSheet();                         // continues the slide-down from here
      } else {
        sheet.style.transition = 'transform 0.32s cubic-bezier(0.32,0.72,0,1)';
        sheet.style.transform = 'translateY(0)';
        if (sheetState.backdrop) {
          sheetState.backdrop.style.transition = 'opacity 0.2s ease';
          sheetState.backdrop.style.opacity = '';
        }
      }
    }
  }

  // {title, content: HTMLElement, onClose?} — replaces any open sheet, locks body scroll
  App.showSheet = function (opts) {
    opts = opts || {};
    var root = document.getElementById('sheet-root');
    if (!root) return;

    sheetState.gen++;        // invalidate any in-flight close animation
    teardownSheet();         // replace any open sheet immediately (fires its onClose)

    var backdrop = App.el('div', 'sheet-backdrop');
    var sheet = App.el('div', 'sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');

    var grab = App.el('div', 'sheet-grab');
    grab.appendChild(App.el('div', 'sheet-handle'));

    var header = App.el('div', 'sheet-header');
    var title = App.el('h2', 'sheet-title', opts.title || '');
    var close = App.el('button', 'sheet-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Schließen');
    close.addEventListener('click', function () { App.closeSheet(); });
    header.appendChild(title);
    header.appendChild(close);
    grab.appendChild(header);
    sheet.appendChild(grab);

    if (opts.content) sheet.appendChild(opts.content);

    backdrop.addEventListener('click', function () { App.closeSheet(); });

    root.appendChild(backdrop);
    root.appendChild(sheet);
    document.body.style.overflow = 'hidden';

    sheetState.open = true;
    sheetState.onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
    sheetState.sheet = sheet;
    sheetState.backdrop = backdrop;

    enableSheetDrag(sheet, grab);
  };

  // Animated close (slide down + backdrop fade), then teardown. Falls back to instant.
  App.closeSheet = function () {
    var sheet = sheetState.sheet;
    var backdrop = sheetState.backdrop;
    if (!sheetState.open || !sheet) { teardownSheet(); return; }
    var gen = ++sheetState.gen;
    sheet.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 0.6, 1)';
    sheet.style.transform = 'translateY(100%)';
    if (backdrop) {
      backdrop.style.transition = 'opacity 0.28s ease';
      backdrop.style.opacity = '0';
    }
    setTimeout(function () { if (sheetState.gen === gen) teardownSheet(); }, 300);
  };

  /* ---------------- confirm alert (iOS style) ---------------- */

  var alertCancelStack = [];

  // {title, message, confirmText='OK', destructive=false} -> Promise<boolean>
  App.confirm = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var backdrop = App.el('div', 'alert-backdrop');
      var box = App.el('div', 'alert');
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-modal', 'true');

      box.appendChild(App.el('h3', 'alert-title', opts.title || ''));
      if (opts.message) box.appendChild(App.el('p', 'alert-message', opts.message));

      var actions = App.el('div', 'alert-actions');
      var cancelBtn = App.el('button', null, 'Abbrechen');
      cancelBtn.type = 'button';
      var confirmBtn = App.el('button', opts.destructive ? 'destructive' : null, opts.confirmText || 'OK');
      confirmBtn.type = 'button';

      function settle(value) {
        var idx = alertCancelStack.indexOf(cancel);
        if (idx !== -1) alertCancelStack.splice(idx, 1);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(value);
      }
      function cancel() { settle(false); }

      cancelBtn.addEventListener('click', cancel);
      confirmBtn.addEventListener('click', function () { settle(true); });
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) cancel();
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      box.appendChild(actions);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);
      alertCancelStack.push(cancel);
    });
  };

  // Escape closes the topmost alert first, then an open sheet
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (alertCancelStack.length) {
      alertCancelStack[alertCancelStack.length - 1]();
    } else if (sheetState.open) {
      App.closeSheet();
    }
  });

  /* ---------------- toast ---------------- */

  var toastTimer = null;
  var toastNode = null;

  App.toast = function (message) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastNode && toastNode.parentNode) toastNode.parentNode.removeChild(toastNode);

    var node = App.el('div', 'toast', String(message == null ? '' : message));
    node.setAttribute('role', 'status');
    root.appendChild(node);
    toastNode = node;

    toastTimer = setTimeout(function () {
      node.style.transition = 'opacity 0.25s ease';
      node.style.opacity = '0';
      toastTimer = setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
        if (toastNode === node) toastNode = null;
        toastTimer = null;
      }, 260);
    }, 2200);
  };

})();
