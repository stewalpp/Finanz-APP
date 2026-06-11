# Versionsverlauf

Alle nennenswerten Änderungen an „Unsere Finanzen". Neueste zuerst.
(Die `CACHE`-Version in `sw.js` wird bei Asset-Änderungen erhöht — sie ist der technische
Versionsmarker für installierte PWAs.)

## 2026-06-11

- **Buchungen = nur gemeinsame Buchungen.** Der Tab zeigt jetzt ausschließlich als „gemeinsam"
  markierte Buchungen — mit Personen-Farbpunkt + Name (wer gebucht hat) und einer stets sichtbaren
  **Live-Summe** (Hero-Karte) oben. Personen- und Kategorie-Filter entfallen; private Buchungen leben
  im Tab „Persönlich". (`transactions.js`)
- **Design-Refresh (edlerer Apple-Look):** größere Kartenradien, getönte Hero-Karte, tabellarische
  Ziffern, geschmeidigerer View-Übergang (Rise+Fade), taktiles Button-Feedback, feinere Typografie.
  (`style.css`; SW-Cache `v8`)
- **Paar-Bilanz zuverlässiger: klare Privat/Gemeinsam-Auswahl.** In Buchungs- und Fixkosten-Editor
  ersetzt ein deutliches Segmented „Privat / Gemeinsam" den alten Schalter — jetzt auch für
  **Einnahmen**. Standard ist **Privat**, damit private Buchungen die Bilanz nicht mehr versehentlich
  verfälschen (vorher war „gemeinsam" voreingestellt). `coupleBalance` berücksichtigt zusätzlich
  **gemeinsame Einnahmen** (50/50). Automatisch erkannte Fixkosten werden als „privat" angelegt.
  (`transactions.js`, `recurring.js`, `analysis.js`; SW-Cache `v7`)
- **Neuer Tab „Persönlich"** mit Steffen/Lisa-Umschalter: zeigt pro Person Gehalt & Einnahmen,
  eigene Fixkosten und private (nicht-gemeinsame) Ausgaben des Monats + „bleibt dir"-Überblick.
  Zeilen sind antippbar (öffnen den jeweiligen Editor). Tab-Leiste jetzt 6 Tabs.
  Neue reine Funktion `Analysis.personalSummary()`. (`personal.js`, `analysis.js`, `index.html`,
  `sw.js`; SW-Cache `v6`)
- **Neue Kategorie „Kredite"** (💳, Ausgabe). (`core.js`)
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
