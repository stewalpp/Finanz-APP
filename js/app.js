/* ============================================================
   Unsere Finanzen — js/app.js
   Boot file, loaded last. Extends window.App with tab switching
   and re-rendering; wires tab bar, FAB, onboarding sheet and
   service-worker registration.
   Classic script. No modules, no external libs.
   ============================================================ */
(function () {
  'use strict';

  var App = window.App = window.App || {};

  /* ---------------- tab switching ---------------- */

  App.currentTab = 'dashboard';

  // Updates tab-bar active state, #page-title, #header-actions and
  // renders Views[tabKey] into #view-root. FAB is hidden on 'settings'.
  App.switchTab = function (tabKey) {
    var view = window.Views && window.Views[tabKey];
    if (!view || typeof view.render !== 'function') {
      console.warn('Unbekannter Tab:', tabKey);
      return;
    }
    App.currentTab = tabKey;

    // tab bar active state
    var tabBar = document.getElementById('tab-bar');
    if (tabBar) {
      var items = tabBar.querySelectorAll('.tab-item');
      Array.prototype.forEach.call(items, function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
      });
    }

    // page title
    var title = document.getElementById('page-title');
    if (title) title.textContent = view.title || '';

    // optional header action (icon button etc.)
    var actions = document.getElementById('header-actions');
    if (actions) {
      actions.innerHTML = '';
      if (typeof view.headerAction === 'function') {
        try {
          var node = view.headerAction();
          if (node) actions.appendChild(node);
        } catch (e) {
          console.error('headerAction fehlgeschlagen:', e);
        }
      }
    }

    // FAB only makes sense where bookings are created
    var fab = document.getElementById('fab');
    if (fab) fab.classList.toggle('hidden', tabKey === 'settings');

    // render the view
    var root = document.getElementById('view-root');
    if (root) view.render(root);

    window.scrollTo(0, 0);
  };

  // Re-render the current tab in place (called on every Store change).
  App.rerender = function () {
    var view = window.Views && window.Views[App.currentTab];
    if (!view || typeof view.render !== 'function') return;
    var root = document.getElementById('view-root');
    if (root) view.render(root);
  };

  /* ---------------- onboarding ---------------- */

  function showOnboarding() {
    var content = App.el('div', '');

    var hello = App.el('p', '', '👋');
    hello.style.fontSize = '40px';
    hello.style.textAlign = 'center';
    hello.style.margin = '4px 0 10px';
    hello.setAttribute('aria-hidden', 'true');
    content.appendChild(hello);

    var intro = App.el('p', '',
      'Richte kurz eure Namen ein. Danach könnt ihr gemeinsame und private Kosten sauber trennen.');
    intro.style.color = 'var(--text-2)';
    intro.style.marginBottom = '16px';
    content.appendChild(intro);

    var g1 = App.el('div', 'form-group');
    g1.appendChild(App.el('div', 'form-label', 'Dein Name'));
    var input1 = document.createElement('input');
    input1.type = 'text';
    input1.className = 'input';
    input1.placeholder = 'Vorname';
    input1.autocomplete = 'off';
    input1.setAttribute('autocapitalize', 'words');
    g1.appendChild(input1);
    content.appendChild(g1);

    var g2 = App.el('div', 'form-group');
    g2.appendChild(App.el('div', 'form-label', 'Name deiner Partnerin / deines Partners'));
    var input2 = document.createElement('input');
    input2.type = 'text';
    input2.className = 'input';
    input2.placeholder = 'Vorname';
    input2.autocomplete = 'off';
    input2.setAttribute('autocapitalize', 'words');
    g2.appendChild(input2);
    content.appendChild(g2);

    var startBtn = App.el('button', 'btn btn-primary', 'Los geht’s!');
    startBtn.type = 'button';
    startBtn.style.marginTop = '6px';
    startBtn.addEventListener('click', function () {
      // Empty names keep the defaults ('Partner 1' / 'Partner 2') —
      // Store.updateSettings ignores empty member names.
      Store.updateSettings({
        onboarded: true,
        members: [
          { id: 'p1', name: input1.value.trim() },
          { id: 'p2', name: input2.value.trim() }
        ]
      });
      App.closeSheet();
      App.toast('Namen gespeichert ✓');
    });
    content.appendChild(startBtn);

    App.showSheet({ title: 'Einrichtung', content: content });
  }

  /* ---------------- wiring ---------------- */

  function wireTabBar() {
    var tabBar = document.getElementById('tab-bar');
    if (!tabBar) return;
    tabBar.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.tab-item') : null;
      if (!btn || !tabBar.contains(btn)) return;
      var key = btn.getAttribute('data-tab');
      if (key) App.switchTab(key);
    });
  }

  function wireFab() {
    var fab = document.getElementById('fab');
    if (!fab) return;
    fab.addEventListener('click', function () {
      if (window.Views && Views.transactions && typeof Views.transactions.openEditor === 'function') {
        Views.transactions.openEditor(null);
      }
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var proto = window.location.protocol;
    if (proto !== 'http:' && proto !== 'https:') return;
    navigator.serviceWorker.register('./sw.js').catch(function (e) {
      console.warn('Service-Worker-Registrierung fehlgeschlagen:', e);
    });
  }

  /* ---------------- boot ---------------- */

  function start() {
    wireTabBar();
    wireFab();
    Store.onChange(App.rerender);
    if (!Store.getSettings().onboarded) showOnboarding();
    App.switchTab('dashboard');
    registerServiceWorker();
  }

  function boot() {
    Promise.resolve()
      .then(function () { return Store.init(); })
      .catch(function (e) {
        // Store.init handles cloud errors itself; this is a last-resort guard
        // so the UI always comes up with whatever local data is readable.
        console.error('Store.init fehlgeschlagen:', e);
      })
      .then(start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
