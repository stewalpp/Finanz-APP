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

  var sheetState = { open: false, onClose: null };

  // {title, content: HTMLElement, onClose?} — replaces any open sheet, locks body scroll
  App.showSheet = function (opts) {
    opts = opts || {};
    var root = document.getElementById('sheet-root');
    if (!root) return;

    App.closeSheet(); // replace any open sheet (fires its onClose)

    var backdrop = App.el('div', 'sheet-backdrop');
    var sheet = App.el('div', 'sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');

    sheet.appendChild(App.el('div', 'sheet-handle'));

    var header = App.el('div', 'sheet-header');
    var title = App.el('h2', 'sheet-title', opts.title || '');
    var close = App.el('button', 'sheet-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Schließen');
    close.addEventListener('click', function () { App.closeSheet(); });
    header.appendChild(title);
    header.appendChild(close);
    sheet.appendChild(header);

    if (opts.content) sheet.appendChild(opts.content);

    backdrop.addEventListener('click', function () { App.closeSheet(); });

    root.appendChild(backdrop);
    root.appendChild(sheet);
    document.body.style.overflow = 'hidden';

    sheetState.open = true;
    sheetState.onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
  };

  App.closeSheet = function () {
    var root = document.getElementById('sheet-root');
    if (root) root.innerHTML = '';
    document.body.style.overflow = '';
    var wasOpen = sheetState.open;
    var cb = sheetState.onClose;
    sheetState.open = false;
    sheetState.onClose = null;
    if (wasOpen && cb) {
      try { cb(); } catch (err) { console.error(err); }
    }
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
