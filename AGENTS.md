# AGENTS.md — Entwickler- & KI-Agenten-Leitfaden

> Diese Datei ist der **Einstiegspunkt** für jede Person und jedes KI-Tool (Codex, Claude, Copilot …),
> die an dieser App weiterarbeitet. Lies sie zuerst vollständig. Die **verbindliche Detail-Spezifikation**
> aller Datenformen, Klassen und APIs steht in [`SPEC.md`](SPEC.md). Diese Datei hier gibt den
> schnellen Überblick + die wichtigsten Regeln und Stolperfallen.

## 1. Was ist das?

**„Unsere Finanzen"** — eine Finanz-App für ein Paar (zwei Personen) als installierbare **PWA**
(Progressive Web App) im Apple-/iOS-Design. Manuelle Erfassung von Ausgaben/Einnahmen, Fixkosten
mit Erkennung, „frei verfügbar"-Budget, Analyse/Spartipps, Paar-Bilanz, Kalender-Export und
optionale Echtzeit-Synchronisation zwischen zwei Geräten über Firebase.

- **Live:** https://stewalpp.github.io/Finanz-APP/ (GitHub Pages, Branch `main`, Ordner `/root`)
- **Sprache der App:** durchgängig Deutsch (du-Form). Code-Bezeichner & Kommentare: Englisch.

## 2. Tech-Stack & HARTE Regeln (nicht verletzen)

- **Reines HTML/CSS/Vanilla-JS. KEIN Build-Schritt, KEIN npm, KEINE Frameworks.**
- **Klassische `<script>`-Dateien, KEINE ES-Module** (`import`/`export` sind verboten).
  Jede Datei kapselt sich in eine IIFE `(function(){ ... })()` und hängt ihre API an `window`.
  - **Einzige Ausnahme:** `js/store.js` nutzt dynamisches `import()` des Firebase-CDN — nur dort.
- **Keine externen Libraries/CDNs** außer dem Firebase-SDK (nur in `store.js`, nur bei aktiver Sync).
- **Geld immer als Ganzzahl in Cent** (`amountCents`). Formatierung erst bei der Anzeige (`App.fmtEUR`).
- **Datum** = ISO-String `'YYYY-MM-DD'`; Monatsschlüssel = `'YYYY-MM'`. Lokale Zeit, keine UTC-Verschiebung.
- **Alle Pfade relativ** (`css/style.css`, `./sw.js`) — nie führender `/` (läuft in einem Unterordner).
- **XSS-sicher:** Nutzereingaben nur via `textContent` oder `App.escapeHtml()` rendern, nie roh in `innerHTML`.
- **Personen-IDs sind exakt `'p1'` und `'p2'`.**

## 3. Lokal entwickeln & testen

Ein **statischer Webserver ist nötig** (wegen Service-Worker & `file://`-Beschränkungen) — Doppelklick
auf `index.html` reicht NICHT.

```bash
# aus dem Projektordner:
python -m http.server 8741
# dann im Browser: http://localhost:8741/
```

(`.claude/launch.json` ist für das Preview-Tool von Claude Code vorkonfiguriert, aber nicht eingecheckt.)

**Beim Testen Service-Worker-Cache beachten:** Nach Code-Änderungen im Browser hart neu laden bzw.
in den DevTools unter *Application → Service Workers* „Unregister" + Caches leeren — sonst wird die
alte Version aus dem Cache angezeigt. Siehe auch Regel zur `CACHE`-Version in §8.

## 4. Dateistruktur

```
index.html            App-Shell: <head>-Metas, Body-Gerüst (Header, Tab-Bar, FAB, Sheet/Toast-Roots),
                      Skript-Tags in fester Reihenfolge, Inline-Theme-Skript (vor erstem Paint).
manifest.json         PWA-Manifest (Name, Icons, standalone, theme_color).
sw.js                 Service Worker: Precache der App-Shell + stale-while-revalidate. CACHE-Version!
css/style.css         Komplettes iOS-Design-System (Light/Dark via prefers-color-scheme + manueller
                      Override html.theme-light/-dark). Alle UI-Klassen sind hier definiert.
icons/                App-Icons (192/512/apple-touch). Per Skript erzeugt, nicht editieren.

js/core.js            window.App: Formatierung, Kategorien, Element-Factory, Bottom-Sheet, Confirm,
                      Toast, Theme-Helfer. Wird ZUERST geladen, definiert alles sofort.
js/charts.js          window.Charts: abhängigkeitsfreie SVG-Diagramme (donut, bars).
js/analysis.js        window.Analysis: reine Rechen-Funktionen (kein DOM, kein Store).
js/store.js           window.Store: zentrale Datenhaltung. Dual-Modus lokal (localStorage) / Cloud
                      (Firestore). Offline-first. Feuert onChange bei jeder Änderung.
js/views/dashboard.js     Views.dashboard   — „Übersicht"
js/views/transactions.js  Views.transactions — „Buchungen": NUR gemeinsame (shared) Buchungen,
                      Live-Summe oben, Swipe-to-Delete (+ openEditor)
js/views/recurring.js     Views.recurring   — Regel-Editor openEditor(rule, {type,payerId}) +
                      Erkennungs-Logik. KEIN eigener Tab mehr (zusammengeführt); openEditor wird
                      von Persönlich + Dashboard genutzt.
js/views/personal.js      Views.personal    — „Persönlich" (pro Person, mit Steffen/Lisa-Umschalter);
                      hier werden wiederkehrende Ein-/Ausgaben angelegt/verwaltet
js/views/insights.js      Views.insights    — „Analyse"
js/views/settings.js      Views.settings    — „Mehr"/Einstellungen
js/app.js             Boot-Datei (ZULETZT geladen): App.switchTab/rerender, Tab-Bar/FAB-Verdrahtung,
                      Onboarding, Service-Worker-Registrierung.

SPEC.md               Verbindliche Detail-Spezifikation (Datenformen, alle Klassen/APIs, UI-Texte).
README.md             Kurzbeschreibung + Feature-Liste.
ANLEITUNG.md          Endnutzer-Anleitung: Hosting, iPhone-Installation, Firebase-Sync einrichten.
CHANGELOG.md          Versionsverlauf der Funktionsänderungen.
```

**Skript-Ladereihenfolge** (in `index.html`, NICHT ändern): `core → charts → analysis → store →
views/dashboard → views/transactions → views/recurring → views/insights → views/settings → app`.
View-Dateien dürfen auf andere Globals **nur innerhalb von Funktionen** zugreifen (laufen nach Boot),
nie auf Top-Level.

## 5. Globale APIs (Kurzüberblick — Details in SPEC.md §6–§10)

**`window.App`** (core.js + app.js):
`fmtEUR`, `parseEUR`, `fmtDate`, `fmtDateShort`, `fmtMonth`, `todayISO`, `monthKey`, `addMonths`,
`uid`, `escapeHtml`, `el(tag,cls,text)`, `downloadFile`, `getTheme`, `setTheme`, `CATEGORIES`,
`catList(type)`, `cat(key)`, `memberName(id)`, `showSheet({title,content,onClose})`, `closeSheet`,
`confirm({title,message,confirmText,destructive}) → Promise<bool>`, `toast(msg)`,
`switchTab(key)`, `currentTab`, `rerender()`.

**`window.Store`** (store.js) — einzige Datenquelle, alle Mutationen feuern `onChange`:
`init() → Promise`, `getMode()`, `cloudInfo()`, `onChange(fn)`, `getTransactions()`, `addTransaction`,
`updateTransaction`, `deleteTransaction`, `getRecurring`, `addRecurring`, `updateRecurring`,
`deleteRecurring`, `getSettings`, `updateSettings`, `getDismissed`, `dismissSuggestion`,
`generateCode`, `setupCloud({configText,code,create,uploadLocal}) → Promise`, `disconnectCloud`,
`exportJSON`, `importJSON`, `wipeAll`.

**`window.Analysis`** (analysis.js) — reine Funktionen:
`monthlySummary`, `trend`, `coupleBalance`, `fixedMonthlyCents`, `upcomingForMonth`,
`availableBudget`, `personalSummary`, `detectRecurring`, `tips`, `icsForRules`.

**`window.Charts`** (charts.js): `donut(el,items,opts)`, `bars(el,data,opts)`.

**`window.Views`** (jede View): `{ title, render(containerEl), headerAction?() }`.
`Views.transactions.openEditor(txOrNull)` und `Views.recurring.openEditor(ruleOrNull)` sind die
Editor-Einsprünge.

## 6. Datenmodell & Speicher

Datenformen (vollständig in SPEC.md §4): **Transaction** `{id,type,amountCents,category,note,date,
payerId,shared,recurringId,createdAt,updatedAt}` · **RecurringRule** `{id,name,type,amountCents,
category,interval,dueDay,dueMonth,anchorMonth,payerId,shared,active,source,...}` · **Settings**
`{onboarded, members:[{id,name,color}×2]}`.

Sonder-Kategorie `'ausgleich'` (Ausgleichszahlung zwischen den Partnern) ist aus allen Statistiken,
Diagrammen und Tipps **ausgenommen** — nur `Analysis.coupleBalance` nutzt sie.

**localStorage-Keys:** `cf.transactions`, `cf.rules`, `cf.settings`, `cf.dismissed`,
`cf.cloud` (Sync-Konfiguration), `cf.theme` (`'light'|'dark'`, fehlt = System).

## 7. Cloud-Synchronisation (Firebase)

- Modus `local` (nur localStorage) oder `cloud` (Firestore + localStorage-Spiegel). Offline-first.
- Firebase-SDK 10.12.5 wird **dynamisch** vom gstatic-CDN importiert, nur beim Verbinden.
- Anonyme Anmeldung; Datenlayout: `households/{CODE}` mit Unterkollektionen `tx/`, `rules/` und
  `meta/settings`. Mutationen sind optimistisch (sofort im Speicher + onChange, dann `setDoc`/`deleteDoc`).
- **Die firebaseConfig wird NICHT eingecheckt.** Sie wird vom Nutzer zur Laufzeit in
  *Mehr → Synchronisation einrichten* eingefügt und in `cf.cloud` gespeichert. Niemals ein echtes
  Projekt-Config oder Secrets ins Repo committen.
- Firestore-Sicherheitsregel (im Firebase-Projekt, nicht im Repo): `allow read, write: if
  request.auth != null;`. Der Schutz beruht auf dem geheimen Haushalts-Code.

## 8. Konventionen & STOLPERFALLEN

1. **`CACHE`-Version in `sw.js` bei JEDER Änderung an Assets erhöhen** (`unsere-finanzen-vN` → `vN+1`).
   Sonst bekommen installierte PWAs das Update nicht. Aktuell: siehe Konstante oben in `sw.js`.
2. **Reaktivität:** Nichts manuell nachziehen. Jede Ansicht rechnet bei `render()` frisch aus dem
   `Store`. Mutationen über `Store.*` feuern `onChange` → `App.rerender()` rendert die aktive View neu.
   Neue Features, die Daten anzeigen, einfach in die jeweilige `render()`-Funktion einbauen — sie
   aktualisieren sich dann automatisch überall.
3. **Im Browser verifizieren**, nicht nur Code lesen. Nach Änderungen: Server starten, hart neu laden,
   Konsole auf Fehler prüfen, Verhalten testen (auch mit leeren Daten — jede Liste hat einen Leerzustand).
4. **Deutsche Formatierung** (de-DE) für Zahlen/Datum überall über `App.*`-Helfer.
5. **Touch-Ziele ≥ 44px**, Sheets/Alerts/Toasts nur über `App.showSheet/confirm/toast` bauen.
6. **Demo-Daten** zum Testen: *Mehr → Demo-Daten laden* (erzeugt ~4 Monate plausible Beispieldaten).

## 9. Deployment

- Push auf `main` → GitHub Pages baut automatisch (~1–2 Min) → live unter der URL oben.
- `.nojekyll` verhindert Jekyll-Verarbeitung (wichtig, sonst werden manche Dateien ignoriert).
- Auf dem iPhone wird ein Update wegen des Service-Workers meist erst beim **zweiten** Öffnen aktiv
  (alte Version aus Cache beim ersten Start). `CACHE`-Bump beschleunigt den Austausch.

## 10. Funktionsstand & Erweiterungen seit SPEC.md

Über die ursprüngliche `SPEC.md` hinaus bereits umgesetzt (siehe `CHANGELOG.md`):
- **5 Tabs:** Übersicht · Persönlich · Buchungen · Analyse · Mehr (Übersicht + Persönlich sind das
  Herzstück, zuerst). Der frühere Fixkosten-Tab wurde entfernt: Regeln verwaltet man in „Persönlich",
  Erkennung + fällige Fixkosten zeigt das Dashboard, ICS-Export liegt in „Mehr".
- **Buchungen zeigt nur gemeinsame (shared) Buchungen** mit Live-Summe; privat lebt unter „Persönlich".
  Privat/Gemeinsam ist die zentrale Achse: gemeinsam → Buchungen + Paar-Bilanz, privat → Persönlich.
  Ausgaben werden rot dargestellt (Minus), Einnahmen grün.
- Tab **„Persönlich"** (`personal.js`) mit Steffen/Lisa-Umschalter: Gehalt, eigene Fixkosten,
  private Ausgaben pro Person; `Analysis.personalSummary()`. Tab-Leiste = 6 Tabs.
- Neue Kategorie **„Kredite"** (`kredite`).
- `Analysis.availableBudget()` + „Frei verfügbar diesen Monat"-Karte (Übersicht & Fixkosten), pro Person.
- Manueller Hell-/Dunkel-Umschalter (*Mehr → Darstellung*; `App.getTheme/setTheme`, `cf.theme`).
- Wischen-nach-links-zum-Löschen bei Buchungen (`makeSwipeable` in `transactions.js`).
- Fixkosten-Editor: Kategorie-Auswahl füllt das Namensfeld vor.
- Positiver Onboarding-Text (Fokus gemeinsame Finanzen/Vermögensaufbau).

## 11. Sinnvolle nächste Schritte (Ideen, nicht verbindlich)

- „Rückgängig"-Option in der Lösch-Bestätigung (Toast mit Undo).
- Swipe-to-Delete auch im Fixkosten-Tab.
- Automatischer Update-Hinweis bei neuer Version (statt „zweimal öffnen").
- Budgets pro Kategorie / Monatsziele.
- Mehr als zwei Personen (aktuell hart `p1`/`p2`).
- CSV-Export zusätzlich zum JSON-Backup.

## 12. Weiterführend
- [`SPEC.md`](SPEC.md) — vollständige, verbindliche Spezifikation
- [`README.md`](README.md) — Kurzüberblick
- [`ANLEITUNG.md`](ANLEITUNG.md) — Endnutzer-Anleitung (Installation & Firebase-Sync)
- [`CHANGELOG.md`](CHANGELOG.md) — Versionsverlauf
