# SPEC — „Unsere Finanzen" (Couple Finance PWA)

This document is the **binding contract** for all implementation agents. Every global symbol,
data shape, CSS class, and DOM id used across files is defined here. Do not invent different
names. Do not deviate. If something is underspecified, implement the simplest version that
honors the contract.

## 1. Product overview

A German-language finance tracker for a couple (2 people) as an installable PWA, styled to feel
like a native Apple iOS app. Features:

- Quick entry of expenses/income (manual), per person, with "shared" flag
- Dashboard with month navigation, income/expense/saved, category donut, upcoming fixed costs, couple balance ("wer schuldet wem")
- Fixed/recurring costs (rules) with due-day, monthly/quarterly/yearly, one-tap booking when due
- Automatic detection of recurring costs from past transactions (suggestions)
- Insights: 6-month trend chart, savings rate, category changes, rule-based savings tips ("Spartipps")
- Calendar export (.ics) of fixed costs so iPhone Calendar reminds the couple
- Optional cloud sync between two phones via the user's own free Firebase project (offline-first); without it the app runs fully local
- JSON export/import backup, demo data, full wipe
- Light + dark mode (follows system)

## 2. Files and script order

```
APP/
  index.html
  manifest.json
  sw.js
  css/style.css
  js/core.js          (window.App: helpers, categories, sheet/toast/confirm)
  js/charts.js        (window.Charts)
  js/analysis.js      (window.Analysis)
  js/store.js         (window.Store)
  js/views/dashboard.js
  js/views/transactions.js
  js/views/recurring.js
  js/views/insights.js
  js/views/settings.js
  js/app.js           (boot, tabs, FAB, onboarding, SW registration; extends window.App)
  icons/              (created later by the orchestrator — do NOT create icon files; just reference them)
```

**Classic scripts only.** No ES modules, no `import`/`export` statements, no build step, no external
libraries. Exception: `js/store.js` may use **dynamic `import()`** of the Firebase CDN (see §7).
Each file attaches its API to `window`. **All asset references are RELATIVE paths** (`css/style.css`,
`./sw.js`) — never a leading `/` (the app may be hosted in a subdirectory).

`index.html` must contain EXACTLY this body skeleton (head per §12; tab icons are inline 24×24
SVGs, `stroke="currentColor"` line style, plus a `<span>` label):

```html
<body>
<header class="app-header">
  <div class="header-inner">
    <h1 id="page-title" class="large-title">Übersicht</h1>
    <div id="header-actions"></div>
  </div>
</header>
<main id="view-root"></main>
<button id="fab" class="fab" aria-label="Neue Buchung"><!-- inline SVG plus icon --></button>
<nav class="tab-bar" id="tab-bar">
  <button class="tab-item active" data-tab="dashboard"><svg…/><span>Übersicht</span></button>
  <button class="tab-item" data-tab="transactions"><svg…/><span>Buchungen</span></button>
  <button class="tab-item" data-tab="recurring"><svg…/><span>Fixkosten</span></button>
  <button class="tab-item" data-tab="insights"><svg…/><span>Analyse</span></button>
  <button class="tab-item" data-tab="settings"><svg…/><span>Mehr</span></button>
</nav>
<div id="sheet-root"></div>
<div id="toast-root"></div>
<script src="js/core.js"></script>
<script src="js/charts.js"></script>
<script src="js/analysis.js"></script>
<script src="js/store.js"></script>
<script src="js/views/dashboard.js"></script>
<script src="js/views/transactions.js"></script>
<script src="js/views/recurring.js"></script>
<script src="js/views/insights.js"></script>
<script src="js/views/settings.js"></script>
<script src="js/app.js"></script>
</body>
```

**View files must not touch other globals at top level** — only inside functions (which run after
boot). `js/core.js` is loaded first and may define everything eagerly.

## 3. Conventions

- **Money = integer cents** everywhere in data and APIs (`amountCents`). Only format at display time.
- **Dates** = ISO strings `'YYYY-MM-DD'`; month keys = `'YYYY-MM'`.
- **All UI strings in German** (du-Form). Code identifiers/comments in English.
- **XSS**: any user-entered string rendered via `textContent` or `App.escapeHtml()`. Never raw interpolation into innerHTML.
- Member ids are exactly `'p1'` and `'p2'`.
- No console noise; `console.warn`/`error` only for real failures.

## 4. Data model

```js
// Transaction
{
  id: string,                 // App.uid()
  type: 'expense' | 'income',
  amountCents: int > 0,
  category: string,           // key from App.CATEGORIES
  note: string,               // may be ''
  date: 'YYYY-MM-DD',
  payerId: 'p1' | 'p2',
  shared: boolean,            // shared couple expense (split 50/50 conceptually)
  recurringId: string | null, // links to RecurringRule.id when booked from a rule
  createdAt: ISOstring, updatedAt: ISOstring
}

// RecurringRule (fixed/recurring cost or income)
{
  id: string,
  name: string,               // e.g. 'Miete', 'Netflix'
  type: 'expense' | 'income',
  amountCents: int > 0,
  category: string,
  interval: 'monthly' | 'quarterly' | 'yearly',
  dueDay: int 1..28,
  dueMonth: int 1..12,        // only meaningful for 'yearly'; default 1
  anchorMonth: 'YYYY-MM',     // first due month; used for quarterly cycle; default current month
  payerId: 'p1' | 'p2',
  shared: boolean,
  active: boolean,
  source: 'manual' | 'detected',
  createdAt, updatedAt
}

// Settings
{
  onboarded: boolean,
  members: [
    { id: 'p1', name: 'Partner 1', color: '#0A84FF' },
    { id: 'p2', name: 'Partner 2', color: '#FF375F' }
  ]
}
```

Special category `'ausgleich'` (settlement transfer between partners): excluded from all
income/expense statistics, charts, and tips; only used by `Analysis.coupleBalance` and shown in the
transactions list with a 🤝 icon.

## 5. localStorage keys

```
'cf.transactions'  JSON array
'cf.rules'         JSON array
'cf.settings'      JSON object
'cf.dismissed'     JSON array of suggestion keys
'cf.cloud'         JSON { config: <string, raw JSON text>, code: <string>, projectId: <string> } or absent
```

## 6. `window.App` — core helpers (js/core.js) + boot (js/app.js)

Defined in **core.js**:

```js
App.fmtEUR(cents)            // -> '1.234,56 €' (Intl 'de-DE', currency EUR). Negative allowed.
App.parseEUR(str)            // -> int cents or null. Handles '12,99', '12.99', '1.234,56', '1234'. Strips €/spaces.
App.fmtDate(iso)             // -> '11.06.2026'
App.fmtDateShort(iso)        // -> 'Do., 11. Juni' (weekday short + day + month name)
App.fmtMonth(monthKey)       // -> 'Juni 2026'
App.todayISO()               // -> 'YYYY-MM-DD' local time
App.monthKey(iso)            // -> iso.slice(0,7)
App.addMonths(monthKey, n)   // -> 'YYYY-MM'
App.uid()                    // crypto.randomUUID() with fallback
App.escapeHtml(s)
App.el(tag, className, text) // tiny element factory, returns HTMLElement; className/text optional
App.downloadFile(filename, content, mime)  // Blob + temporary <a download> click
App.CATEGORIES               // see below
App.catList(type)            // -> array of {key,label,emoji,color} ; type 'expense' => all with type!=='income' and key!=='ausgleich'; type 'income' => type==='income' entries plus 'sonstiges'
App.cat(key)                 // -> {label, emoji, color, type} ; unknown key falls back to 'sonstiges' entry
App.memberName(id)           // from Store.getSettings(); '' if missing
App.showSheet({title, content, onClose})   // content: HTMLElement. Builds bottom sheet in #sheet-root with backdrop, drag-handle, title row + close (✕) button. Replaces any open sheet. Body scroll locked while open.
App.closeSheet()
App.confirm({title, message, confirmText='OK', destructive=false})  // -> Promise<boolean>; styled iOS-like alert (centered card), Abbrechen + confirm button
App.toast(message)           // pill toast above tab bar, auto-hides after ~2.2s
```

`App.CATEGORIES` — plain object, **exactly these keys in this order** (label / emoji / color / type):

```
gehalt:        Gehalt                 💼  #30D158  income
einnahme:      Sonstige Einnahme      💶  #66D4CF  income
lebensmittel:  Lebensmittel           🛒  #34C759  expense
restaurant:    Restaurant & Café      🍽️  #FF9F0A  expense
wohnen:        Miete & Wohnen         🏠  #0A84FF  expense
nebenkosten:   Strom, Gas & Wasser    💡  #FFD60A  expense
internet:      Internet & Handy       📶  #64D2FF  expense
versicherung:  Versicherungen         🛡️  #5E5CE6  expense
transport:     Auto & Transport       🚗  #BF5AF2  expense
abos:          Abos & Streaming       📺  #FF453A  expense
gesundheit:    Gesundheit & Drogerie  💊  #FF375F  expense
kleidung:      Kleidung               👕  #AC8E68  expense
freizeit:      Freizeit & Sport       🎾  #63E6E2  expense
urlaub:        Urlaub & Reisen        ✈️  #40C8E0  expense
geschenke:     Geschenke              🎁  #FF6482  expense
haushalt:      Haushalt & Möbel       🛋️  #98989D  expense
sparen:        Sparen & Anlegen       🏦  #00C7BE  expense
kredite:       Kredite                💳  #C76E5A  expense
ausgleich:     Ausgleich              🤝  #8E8E93  expense   (special, hidden from pickers)
sonstiges:     Sonstiges              📦  #8E8E93  expense
```

Defined in **app.js** (boot file, loaded last):

```js
App.switchTab(tabKey)        // updates tab bar active state, sets #page-title from Views[tab].title,
                             // calls Views[tab].render(viewRoot), fills #header-actions from Views[tab].headerAction?() (optional: returns HTMLElement or null)
App.currentTab               // string
App.rerender()               // re-render current tab (called on Store.onChange)
```

Boot sequence in app.js: `Store.init()` → register tab clicks → FAB click = `Views.transactions.openEditor(null)` → `Store.onChange(App.rerender)` → if `!Store.getSettings().onboarded` show onboarding sheet (welcome text + two name inputs „Dein Name“/„Name deiner Partnerin / deines Partners“ + start button; saves members names, sets onboarded=true) → `App.switchTab('dashboard')` → register `./sw.js` (guarded: only if `'serviceWorker' in navigator` and protocol is http/https). FAB hidden on settings tab (toggle class).

## 7. `window.Store` (js/store.js)

Offline-first dual-mode store. Mode `'local'`: localStorage only. Mode `'cloud'`: Firebase Firestore
(user's own project) with offline persistence; localStorage keeps a mirror for instant boot.

```js
Store.init()                       // -> Promise<void>. Loads local data; if 'cf.cloud' exists, connects cloud silently (errors → toast warn + stay on mirror data).
Store.getMode()                    // 'local' | 'cloud'
Store.cloudInfo()                  // { connected:boolean, code:string|null, projectId:string|null }
Store.onChange(fn)                 // subscribe; fn() called after ANY data mutation or remote snapshot
Store.getTransactions()            // -> Transaction[] copy, sorted date DESC then createdAt DESC
Store.addTransaction(data)         // fills id/createdAt/updatedAt; -> tx
Store.updateTransaction(id, patch) // sets updatedAt
Store.deleteTransaction(id)
Store.getRecurring()               // -> RecurringRule[] copy, active first, then by name
Store.addRecurring(data) / Store.updateRecurring(id, patch) / Store.deleteRecurring(id)
Store.getSettings() / Store.updateSettings(patch)        // shallow merge
Store.getDismissed() / Store.dismissSuggestion(key)
Store.generateCode()               // 8 chars from 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
Store.setupCloud({configText, code, create, uploadLocal}) // -> Promise<void>, throws Error with German message on failure.
Store.disconnectCloud()            // removes 'cf.cloud', keeps current data as local copy, mode -> 'local'
Store.exportJSON()                 // -> string {version:1, exportedAt, transactions, rules, settings}
Store.importJSON(str)              // validates, REPLACES data (after caller confirmed); throws German Error on bad input
Store.wipeAll()                    // -> Promise. Clears local; in cloud mode also deletes all household docs.
```

Cloud implementation:
- Firebase JS SDK **10.12.5** via dynamic import from `https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`. Imported only when connecting.
- `configText` is the JSON the user copies from the Firebase console; accept it leniently: try `JSON.parse`; if that fails, try to extract with a regex the `{...}` object and quote bare keys (the console snippet is a JS object literal, e.g. `apiKey: "..."`). Validate presence of `apiKey`, `projectId`, `appId`; else throw `'Konfiguration unvollständig – bitte den kompletten firebaseConfig-Block einfügen.'`
- `signInAnonymously` (user must enable Anonymous auth; on `auth/operation-not-allowed` or `auth/configuration-not-found` throw `'Anonyme Anmeldung ist in Firebase nicht aktiviert (Authentication → Sign-in method → Anonym).'`).
- Firestore: `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`; on failure fall back to default `getFirestore(app)`.
- Layout: `households/{CODE}` doc `{ createdAt }`; `households/{CODE}/meta/settings` doc = Settings; subcollections `households/{CODE}/tx/{id}` and `households/{CODE}/rules/{id}`.
- `create:true`: code = given (generated by caller); write household doc + settings; if `uploadLocal` upload all local tx/rules (writeBatch, chunked ≤450 ops).
- `create:false` (join): check household doc exists (`getDoc`); if missing throw `'Kein Haushalt mit diesem Code gefunden.'`; if `uploadLocal` upload local data into it.
- After connect: `onSnapshot` on tx, rules, meta/settings → replace in-memory arrays → mirror to localStorage → fire onChange. Mutations in cloud mode: optimistic in-memory update + fire onChange + `setDoc`/`deleteDoc` (Firestore queues offline). All docs written with full object content (no undefined fields — Firestore rejects `undefined`; use null).
- Save `'cf.cloud'` only after first successful connect.

## 8. `window.Analysis` (js/analysis.js) — pure functions, no DOM, no Store access

```js
Analysis.monthlySummary(txs, monthKey)
// -> { incomeCents, expenseCents, savedCents,            // saved = income - expense
//      byCategory: [{category, cents, count}],           // expenses only, excl 'ausgleich', sorted cents desc
//      byPayer: { p1:{incomeCents,expenseCents}, p2:{...} } }   // excl 'ausgleich'

Analysis.trend(txs, nMonths, endMonthKey)
// -> [{ month:'YYYY-MM', incomeCents, expenseCents }] oldest→newest, exactly nMonths entries, excl 'ausgleich'

Analysis.coupleBalance(txs)
// shared expenses (shared===true, type 'expense'): paidShared per payer.
// shared income  (shared===true, type 'income'): receivedShared per payer (held jointly).
// net = ((paidShared.p1 - paidShared.p2) - (recvShared.p1 - recvShared.p2)) / 2 + settle   // net>0: p2 owes p1
// for each tx with category==='ausgleich': payer 'p2' → settle -= amount; payer 'p1' → settle += amount
// Private entries (shared!==true) never affect the balance.
// -> { paidSharedCents:{p1,p2}, receivedSharedCents:{p1,p2}, owesCents: Math.abs(Math.round(net)),
//      debtorId: net>0?'p2':net<0?'p1':null }

Analysis.fixedMonthlyCents(rules)
// active MONTHLY expense rules only, rounded -> int
// Quarterly and yearly rules are NOT smoothed into the monthly figure — they count as
// individual items in their due month (availableBudget.nonMonthlyItems /
// personalSummary.nonMonthlyItems).

Analysis.upcomingForMonth(rules, txs, monthKey, todayISO)
// active rules due in monthKey (monthly: always; quarterly: months since anchorMonth % 3 === 0;
// yearly: month number === dueMonth). dueDateISO = monthKey + dueDay (zero-padded).
// matched tx: same month AND (tx.recurringId === rule.id OR (tx.type===rule.type AND tx.category===rule.category AND |tx.amountCents - rule.amountCents| <= rule.amountCents*0.1))
// status: 'paid' if matched; 'overdue' if dueDateISO < todayISO; else 'due'
// -> [{rule, dueDateISO, status, matchedTxId}] sorted by dueDateISO

Analysis.availableBudget(txs, rules, monthKey)
// Forward-looking disposable budget ("frei verfügbar") for a month.
// plannedIncome = active monthly income rules + quarterly/yearly income rules due this month
//                 (full amount) + non-rule income txs of the month
// fixed         = active monthly expense rules (= fixedMonthlyCents)
// nonMonthlyDue = quarterly + yearly expense rules due this month at full amount; each also
//                 listed in nonMonthlyItems so the UI shows them as individual line items
//                 (never smoothed over the other months)
// variableSpent = expense txs of the month NOT linked to a rule (excl 'ausgleich'); txs matched
//                 to a rule (recurringId OR upcomingForMonth fuzzy match) are excluded so a fixed
//                 cost is never double-counted.
// available     = plannedIncome − fixed − nonMonthlyDue − variableSpent
// -> { total: {plannedIncomeCents, fixedCents, nonMonthlyDueCents, variableSpentCents, availableCents},
//      byPerson: { p1:{...same...}, p2:{...same...} },    // shared rules/txs split 50/50, else to payer
//      nonMonthlyItems: [{id, name, amountCents, category, interval, payerId, shared}] }

Analysis.personalSummary(txs, rules, personId, monthKey)
// Per-person view, recurring-centric. Shared rules and shared txs count HALF for EACH
// partner (regardless of payer); own non-shared items count fully; the partner's
// non-shared items not at all. Quarterly and yearly rules are not smoothed — they count
// (at the person's share) in their due month only.
// incomeCents  = monthly income rules (own full, shared ½) + quarterly/yearly income rules due
//                this month + one-off income txs (own full, shared ½)
// fixedCents   = monthly expense rules (own non-private full, shared ½)
// nonMonthlyDueCents = quarterly/yearly expense rules due this month (own full incl.
//                  privateExpense, shared ½); individually listed in
//                  nonMonthlyItems [{id, name, shareCents, interval, shared}]
// privateExpenseCents = own monthly privateExpense rules + own non-shared one-off expense txs
// sharedVariableCents = ½ of shared one-off (non-rule) expense txs of the month
// One-off txs already covered by a counted rule are skipped (no double count); 'ausgleich' excluded.
// -> { incomeCents, fixedCents, nonMonthlyDueCents, nonMonthlyItems, privateExpenseCents,
//      sharedVariableCents, leftoverCents }   // leftover = income − fixed − nonMonthlyDue − private − sharedVariable

Analysis.detectRecurring(txs, rules, dismissedKeys)
// candidates: expense txs without recurringId. Group by normalized note (lowercase, trim, collapse
// spaces; skip txs with empty note) where amounts within ±10% of the group median.
// Within a group: sort dates, compute day-gaps. Median gap 25–35 → monthly (≥2 occurrences);
// 80–100 → quarterly (≥2); 330–400 → yearly (≥2). dueDay = median day-of-month clamped 1..28.
// key = normalizedNote + '|' + interval. Exclude if key in dismissedKeys, or an existing rule has
// similar name (normalized equal) or same category with amount within ±10%.
// -> [{key, name (original note, Title case ok), amountCents (median), category (most frequent),
//      interval, dueDay, count, lastDate}] sorted count desc, max 5

Analysis.tips(txs, rules)
// rule-based German savings tips, max 6, priority order. Each: {emoji, title, text, tone:'good'|'info'|'warn'}.
// Implement these checks (skip when not enough data; amounts formatted via App.fmtEUR is allowed here —
// exception to "no App access": Analysis MAY call App.fmtEUR/App.cat for text building):
// 1. Abo-Check: active monthly expense rules in categories abos+internet → yearly sum: 'Deine Abos kosten dich X im Jahr' (warn if > 600€/Jahr, else info)
// 2. Savings rate current month if income>0: <10% warn, >25% good
// 3. Category jump: current vs previous month, same category, increase ≥30% AND ≥30€ → warn (max 1, biggest)
// 4. Small purchases: current month expenses < 5€ count ≥ 12 → info with their sum
// 5. Restaurant vs Lebensmittel current month: restaurant > 60% of lebensmittel and > 100€ → info
// 6. Fixed-cost share: fixedMonthlyCents / current-month income > 50% → warn
// 7. Positive fallback when nothing triggered and data exists: 'Alles im grünen Bereich' good

Analysis.icsForRules(rules, members)
// VCALENDAR string (CRLF line endings) with one VEVENT per ACTIVE rule:
// DTSTART next due date (today or later), all-day (VALUE=DATE);
// RRULE monthly: FREQ=MONTHLY;BYMONTHDAY=dueDay — quarterly: FREQ=MONTHLY;INTERVAL=3 — yearly: FREQ=YEARLY
// SUMMARY: '💶 <name> – <amount>' ; DESCRIPTION mentions payer name and category; UID rule.id@unsere-finanzen
// VALARM DISPLAY, TRIGGER:-PT15H (= 9:00 the day before for all-day events is fine; keep simple: -PT15H)
```

## 9. `window.Charts` (js/charts.js) — dependency-free SVG, no Store/App access

```js
Charts.donut(containerEl, items, opts)
// items: [{label, value, color}] (value = cents ok; zero/empty handled → renders nothing and returns false)
// opts: {size=200, stroke=26, centerTitle='', centerSub=''}
// Renders centered SVG donut (stroke-dasharray arcs, 2° gap between segments, subtle CSS draw-in
// animation). centerTitle bold (e.g. total), centerSub small (e.g. 'Ausgaben'). Clears container first. Returns true.

Charts.bars(containerEl, data, opts)
// data: [{label, series:[{value, color}]}]  (2 bars per group: income green, expense red — generic impl)
// opts: {height=180, formatValue: fn(value)->string}
// Responsive width (viewBox), y-axis auto-scale to max with 3 horizontal gridlines + small value
// captions, x labels under groups, rounded bar tops. Clears container first. Handles all-zero data.
```

## 10. `window.Views` — view contract

`window.Views = window.Views || {};` then `Views.<key> = { title, render(containerEl), headerAction?() }`.
Keys: `dashboard` (title 'Übersicht'), `transactions` ('Buchungen'), `recurring` ('Fixkosten'),
`insights` ('Analyse'), `settings` ('Einstellungen'). `render` rebuilds the container content from
current Store data (clear container first). Module-level state (e.g. selected month) persists across
re-renders. Get data only via `Store.*`, compute via `Analysis.*`.

**dashboard.js** — state: selected monthKey (default current). Content top→bottom:
1. `.month-nav` (‹ chevron buttons › around `App.fmtMonth`, can't go beyond current month forward)
2. `.stat-grid` 3 `.stat` cards: Einnahmen (green), Ausgaben (red), Übrig (saved; green if ≥0 else red)
3. Couple balance card: if owesCents>0 '«Name» schuldet «Name» X' + `.btn-secondary` 'Ausgleichen' → confirm → adds ausgleich transaction (payer=debtor, amount=owesCents, shared=false, note='Ausgleich', date today); else 'Ihr seid quitt ✓'
4. Card 'Anstehende Fixkosten' (only if rules exist): up to 5 `Analysis.upcomingForMonth` rows — name, due date, amount, status badge (Bezahlt ✓ green / Fällig orange / Überfällig red) and for unpaid a small 'Buchen' button → creates transaction from rule (recurringId set, date = dueDate) + toast. Footer link-row 'Alle Fixkosten →' switches tab.
5. Card 'Gemeinsame Ausgaben nach Kategorie': `Charts.donut` over shared (shared===true) expense txs of the month (centerTitle = their total) + legend rows (`.legend-row`: color dot, label, amount, percent). Empty → `.empty-state`.
5b. Card 'Ausgaben pro Person': `.segmented` person switcher (module-level state), donut over the selected person's non-shared expense txs at full amount PLUS every shared expense tx at half amount; note 'Private Ausgaben plus die Hälfte der gemeinsamen Ausgaben.' Empty → `.empty-state`.
6. Card 'Letzte Buchungen': 5 most recent of the month (transaction rows like transactions view), link-row 'Alle anzeigen →'.
First-use (no transactions at all): friendly `.empty-state` with CTA buttons 'Erste Buchung' (opens editor) and hint to demo data in settings.

**transactions.js** — state: monthKey, search string, filter person ('all'|'p1'|'p2'), filter category ('all'|key).
Top: `.month-nav`; `.searchbar` input (placeholder 'Suchen…'); horizontal `.chip-row` with person chips (Alle/«names») and category dropdown chip (opens sheet with category list to pick / 'Alle Kategorien').
List: transactions of month matching filters, grouped by date (`.section-title` = `App.fmtDateShort`), each `.list-row`: `.cat-icon` (emoji on tinted circle of category color), title (note or category label), sub (category label · member name · '· geteilt' if shared), trailing amount (`.amount-neg` '−12,99 €' / `.amount-pos` '+…'). Row click → `openEditor(tx)`.
Month summary footer line: 'X Buchungen · Σ Ausgaben Y'.
Export to this contract: `Views.transactions.openEditor(txOrNull)` — bottom sheet form:
- `.segmented` Ausgabe/Einnahme (switching re-renders category grid)
- amount: large `.amount-input` (type=text, inputmode=decimal, placeholder '0,00', autofocus on new)
- `.cat-grid` of `.cat-chip`s from `App.catList(type)` (emoji + label, `.active` selected; default: lebensmittel / gehalt)
- date input (type=date, default today), payer `.segmented` (member names), 'Gemeinsame Ausgabe' `.switch` (default ON, hidden for income — income default shared=false)
- note `.input` (placeholder 'Notiz (z. B. Rewe, Netflix …)')
- primary full-width save 'Speichern'; when editing additionally `.btn-destructive` 'Löschen' (confirm).
Validate via `App.parseEUR` (invalid → toast 'Bitte gültigen Betrag eingeben'). Save → Store call → closeSheet → toast 'Gespeichert ✓'.

**recurring.js** — Content:
1. Summary card: 'Fixkosten gesamt' `Analysis.fixedMonthlyCents` formatted '/Monat' + per year subline.
2. Suggestions (if any from `Analysis.detectRecurring`): `.suggestion-card`s '🔍 Erkannt: «name» — X monatlich (n×)' with buttons 'Übernehmen' (creates rule source:'detected', then `Store.dismissSuggestion(key)`) and 'Ignorieren' (dismiss only).
3. List of rules (active first): `.list-row` with cat icon, name, sub ('monatlich am 1.' / 'vierteljährlich' / 'jährlich im Juni' + '· Name'), trailing amount + small `.switch` for active. Row click → `openEditor(rule)`.
4. `.btn-secondary` full width 'Neue Fixkosten anlegen' → `openEditor(null)`.
`headerAction()` returns calendar icon-btn → ics export: `App.downloadFile('fixkosten.ics', Analysis.icsForRules(...), 'text/calendar')` + toast 'Kalenderdatei erstellt'.
Export: `Views.recurring.openEditor(ruleOrNull)` — sheet form: name, amount, type segmented, category grid, interval `.segmented` (monatlich/vierteljährlich/jährlich), dueDay select 1..28 ('am 1.' …), for yearly a month select, payer segmented, shared switch, save/delete like transactions editor.

**insights.js** — Content (not month-navigable; uses current month + history):
1. Card 'Einnahmen & Ausgaben' — `Charts.bars` with `Analysis.trend(txs, 6, currentMonth)` (two series per group: income green `var via #30D158`, expense red) + legend.
2. Card 'Sparquote' current month: big percent + progress bar (`.progress`), sub 'Du hast X von Y übrig'. If no income: hint text.
3. Card 'Spartipps' — `.tip-card` per `Analysis.tips` (emoji, bold title, text; left border color by tone: good=green, info=blue, warn=orange).
4. Card 'Kategorien im Vergleich' (current vs previous month): rows with category, current amount, delta arrow (▲ red +X% / ▼ green −X% / – neu) sorted by current desc, max 8.
Empty data → `.empty-state` 'Noch nicht genug Daten…'.

**settings.js** — grouped sections (`.section-title` + `.list-group`):
1. 'Personen': two rows, each name (click → small sheet with input to rename; updates settings).
2. 'Synchronisation': status row ('Lokal – nur auf diesem Gerät' or '✓ Verbunden · Code XXXX · projekt'); row 'Synchronisation einrichten…' / 'Trennen…' (confirm). Setup sheet contains: short German explainer (3 steps, see below), `.segmented` 'Neuen Haushalt erstellen' / 'Beitreten', textarea `.input` for firebaseConfig, code input (create-mode: pre-filled `Store.generateCode()`, readonly; join-mode: empty, uppercase), `.switch` 'Vorhandene Daten hochladen' (default ON), primary 'Verbinden' with `.spinner` while pending; on success toast '✓ Synchronisation aktiv' + closeSheet; on error red `.form-error` text with the thrown message. Explainer text: '1. Kostenloses Projekt auf console.firebase.google.com anlegen · 2. Anonyme Anmeldung + Firestore aktivieren · 3. Web-App-Konfiguration hier einfügen — Details in der ANLEITUNG.'
3. 'Daten': rows 'Backup exportieren (JSON)' (`App.downloadFile('finanzen-backup.json', Store.exportJSON(), 'application/json')`), 'Backup importieren' (hidden file input; confirm 'Ersetzt alle aktuellen Daten!'; `Store.importJSON`), 'Kalender-Export Fixkosten (.ics)', 'Demo-Daten laden' (confirm; generates ~4 months of plausible German sample data: Gehälter 2×/month, Miete, Strom, Internet, Netflix+Spotify rules AND matching past transactions, groceries 2–3×/week varying 8–90 €, restaurants, transport, a few one-offs; implemented locally in this file; after insert toast).
4. 'Gefahrenzone': `.danger` row 'Alle Daten löschen' (confirm destructive, text mentions cloud household if connected → `Store.wipeAll()`).
5. About footer: 'Unsere Finanzen · Version 1.0 · Eure Daten gehören euch.'

## 11. CSS design system (css/style.css)

Apple-like. System font stack `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif`.
CSS variables on `:root` (light) and `@media (prefers-color-scheme: dark)` override:

```
--bg            #F2F2F7 / #000000        (grouped background)
--bg-card       #FFFFFF / #1C1C1E
--bg-input      #767680/[.12] light → rgba(118,118,128,.12) / rgba(118,118,128,.24)
--text          #000000 / #FFFFFF
--text-2        #3C3C43 60% / #EBEBF5 60%
--text-3        #3C3C43 30% / #EBEBF5 30%
--sep           rgba(60,60,67,.18) / rgba(84,84,88,.5)
--tint          #007AFF / #0A84FF
--green #34C759/#30D158  --red #FF3B30/#FF453A  --orange #FF9500/#FF9F0A  --yellow #FFCC00/#FFD60A
--purple #AF52DE/#BF5AF2  --pink #FF2D55/#FF375F  --teal #30B0C7/#40C8E0  --indigo #5856D6/#5E5CE6  --gray #8E8E93
```

Layout: `body` max-width 640px centered, `--bg`, `padding-bottom: calc(84px + env(safe-area-inset-bottom))`.
`.app-header`: sticky top, translucent `backdrop-filter: blur(20px)` bg with transparency, safe-area-top padding;
`.large-title` 34px/700. `#header-actions` right-aligned; `.icon-btn` 34px tappable round button tint color.
`.tab-bar`: fixed bottom full-width (within max-width), translucent blur, top hairline, 5 equal `.tab-item`s
(flex column: 24px icon + 10px label), color `--text-3`, `.active` color `--tint`; safe-area-bottom padding.
`.fab`: fixed, right 20px, bottom calc(96px + safe-area), 56px circle, `--tint` bg, white plus, soft shadow,
scale .92 on :active. `.fab.hidden` display none.

Components (all used by views — must exist):
`.view` (padding 16px), `.card` (bg-card, radius 16, padding 16, margin-bottom 14, subtle shadow in light mode),
`.card-title` (13px uppercase tracking text-2, margin-bottom 10),
`.list-group` (bg-card radius 12 overflow hidden), `.list-row` (flex, min-height 52px, padding 10px 14px,
hairline separator between rows via + selector; :active bg highlight),
`.row-main` (flex column, flex 1, min-width 0), `.row-title` (16px, ellipsis), `.row-sub` (13px text-2 ellipsis),
`.row-trailing` (right side, flex column align-end),
`.cat-icon` (36px circle, emoji 18px centered; background = category color at ~18% opacity — views set
`style.background` with color + '2E' alpha hex suffix),
`.amount-pos` (green 600) `.amount-neg` (text/red? → use --text for negatives in lists, red only where specified; provide `.amount-neg{color:var(--text)}` and `.amount-neg.strong{color:var(--red)}`) — keep simple: `.amount-pos` green, `.amount-neg` default text color.
`.badge` (11px pill, padded) + `.badge-green .badge-orange .badge-red` tinted bg (color 18% alpha) + colored text.
`.btn` base (radius 12, 16px font, padding 14, text-align center, width 100%), `.btn-primary` (tint bg white),
`.btn-secondary` (tint color, tint 12% bg), `.btn-destructive` (red color, red 12% bg), `.btn-small` (inline,
auto width, padding 7px 14px, 14px font).
`.segmented` (bg-input radius 9, padding 2, flex) `.segment` (flex 1, radius 7, padding 7, 14px, center;
`.active` bg-card + shadow).
`.input` (bg-input radius 10, padding 12, 16px font [min 16px → no iOS zoom], full width, no border;
focus ring via outline tint). `textarea.input` (min-height 96px, monospace 13px for config).
`.amount-input` (32px font 700, center, transparent bg, full width).
`.form-group` (margin-bottom 14) `.form-label` (13px text-2 margin-bottom 6) `.form-row` (flex gap 10)
`.form-error` (red 14px).
`.switch`: label.switch > input[type=checkbox] hidden + `.switch-track` 51×31 pill (bg-input; checked green)
with knob 27px white circle, animated. Markup: `<label class="switch"><input type="checkbox"><span class="switch-track"></span></label>`.
`.cat-grid` (grid 3 columns gap 8) `.cat-chip` (bg-input radius 10 padding 8 center 13px; flex column,
emoji 20px; `.active` tint bg 15% + tint colored border 1.5px).
`.chip-row` (horizontal scroll flex gap 8, no scrollbar) `.chip` (pill bg-input 14px padding 7 14;
`.active` tint bg white text).
`.searchbar` wrapper with 🔍 + input (bg-input radius 10).
`.month-nav` (flex space-between align center margin-bottom 14) `.month-nav-btn` (icon-btn style)
`.month-nav-title` (17px 600).
`.stat-grid` (grid 3 cols gap 10) `.stat` (card-like, padding 12) `.stat-label` (12px text-2)
`.stat-value` (17px 700, `.pos` green `.neg` red).
`.legend-row` (flex align center gap 8 padding 6 0 14px) `.dot` (10px circle).
`.tip-card` (card with 3px left border; `.tone-good` green `.tone-info` tint `.tone-warn` orange).
`.suggestion-card` (card, dashed 1.5px tint border).
`.progress` (track bg-input radius full h 8) `.progress-fill` (tint/green radius full, width %).
`.empty-state` (center, padding 36 16, emoji 40px block, text-2).
`.section-title` (13px uppercase text-2 margin 18px 4px 8px).
`.link-row` (tint color, 15px, padding-top 10, centered or row — used as 'Alle anzeigen →').
`.danger` (red text).
Sheet: `.sheet-backdrop` (fixed inset 0, rgba(0,0,0,.4), fade-in) `.sheet` (fixed bottom, full width within
max-width, bg-card—but in dark #1C1C1E—radius 20 20 0 0, slide-up 280ms cubic-bezier(.32,.72,.3,1),
max-height 92dvh, overflow auto, padding 8 16 calc(16px + safe-area-bottom), drag `.sheet-handle`
(36×5 pill --sep centered margin 6 auto 10)) `.sheet-header` (flex space-between center margin-bottom 12)
`.sheet-title` (20px 700) `.sheet-close` (30px circle bg-input, ✕).
Alert (App.confirm): `.alert-backdrop` (center flex) `.alert` (270px, radius 14, bg-card blur, center,
padding 18, title 17/600, msg 13 text-2) `.alert-actions` (flex, top hairline, margin-top 14; two buttons
each flex 1, 17px, tint; confirm `.destructive` red, separated by hairline).
`.toast` (fixed bottom calc(100px+safe-area) centered, dark pill rgba(50,50,55,.92) white 14px,
padding 10 18, radius 100, fade/slide animation).
`.spinner` (18px circle border-top transparent, rotate animation, inline-block).
Misc: `* { -webkit-tap-highlight-color: transparent; box-sizing: border-box }`, `html { -webkit-text-size-adjust: 100% }`,
buttons/inputs inherit font, `h1..h4,p { margin: 0 }`, smooth `.view` fade-in (120ms), respects
`prefers-reduced-motion` (disable animations).

## 12. PWA bits

**index.html head**: charset; `viewport` `width=device-width, initial-scale=1, viewport-fit=cover`;
`<title>Unsere Finanzen</title>`; theme-color light `#F2F2F7` + dark `#000000` (media attr);
`apple-mobile-web-app-capable` yes; `mobile-web-app-capable` yes; `apple-mobile-web-app-status-bar-style`
`black-translucent`; `apple-mobile-web-app-title` `Finanzen`; manifest link; `apple-touch-icon` →
`icons/apple-touch-icon.png`; png favicon → `icons/icon-192.png`; stylesheet.

**manifest.json**: name 'Unsere Finanzen', short_name 'Finanzen', start_url './', scope './',
display 'standalone', background_color '#F2F2F7', theme_color '#0A84FF', lang 'de',
icons: icons/icon-192.png (192, any maskable), icons/icon-512.png (512, any maskable).

**sw.js**: `CACHE = 'unsere-finanzen-v1'`. PRECACHE = ['./', 'index.html', 'css/style.css', 'manifest.json',
all 10 js files, 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'].
install: `addAll` + `skipWaiting`. activate: delete old caches + `clients.claim`.
fetch: **GET only, return early otherwise**. Same-origin → stale-while-revalidate (respond cache-first,
refresh cache in background); navigation requests fall back to cached 'index.html' when offline.
`https://www.gstatic.com/firebasejs/` → stale-while-revalidate into same cache. Everything else
(Firestore channels etc.) → do not intercept (no respondWith).

## 13. Quality bar

- Must look genuinely iOS-native: spacing, hairlines, blur, rounded grouped lists, SF-style typography.
- Works at 390×844 (iPhone) AND acceptable on desktop (max-width 640 centered).
- No runtime errors with empty data. Every list has a German empty state.
- All interactive elements ≥ 44px touch targets.
- German number/date formatting everywhere (de-DE).
