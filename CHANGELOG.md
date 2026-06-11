# Versionsverlauf

Alle nennenswerten Änderungen an „Unsere Finanzen". Neueste zuerst.
(Die `CACHE`-Version in `sw.js` wird bei Asset-Änderungen erhöht — sie ist der technische
Versionsmarker für installierte PWAs.)

## 2026-06-11

- **Buchungen: Wischen nach links zum Löschen** (iOS-Stil). Zeile nach links ziehen enthüllt einen
  roten „Löschen"-Button; kräftiger Wisch löscht direkt. Nur eine Zeile gleichzeitig offen,
  vertikales Scrollen unberührt, normaler Tipp öffnet weiterhin den Editor. (`transactions.js`,
  `style.css`; SW-Cache `v5`)
- **„Frei verfügbar diesen Monat"** — neue Funktion. `Analysis.availableBudget()`: geplante
  Einnahmen − Fixkosten − bereits ausgegeben, mit Aufteilung pro Person (gemeinsame Posten 50/50).
  Fixkosten werden nie doppelt gezählt. Eigene Karte auf der Übersicht + dieselbe Summe in der
  Fixkosten-Summenkarte. (`analysis.js`, `dashboard.js`, `recurring.js`; SW-Cache `v4`)
- **Fixkosten-Editor: Kategorie-Auswahl füllt das Namensfeld vor.** Beim Antippen einer Kategorie
  wird ihr Name übernommen, solange noch kein eigener Text eingegeben wurde. (`recurring.js`; `v3`)
- **Manueller Hell-/Dunkelmodus.** Neuer Abschnitt *Mehr → Darstellung* (System/Hell/Dunkel);
  `App.getTheme/setTheme`, gespeichert in `cf.theme`, greift ohne Aufblitzen vor dem ersten Paint.
  Außerdem: Onboarding-Text positiv umformuliert (gemeinsame Finanzen & Vermögensaufbau statt
  Schulden). (`core.js`, `app.js`, `settings.js`, `style.css`, `index.html`; `v2`)
- **v1.0 — Erstveröffentlichung.** Vollständige PWA: Buchungen, Fixkosten mit automatischer
  Erkennung, Analyse mit Spartipps, Paar-Bilanz, Kalender-Export, optionale Firebase-Synchronisation,
  Backup/Import, Demo-Daten, iOS-Design, Light/Dark, Offline-Betrieb. (`v1`)
