# Versionsverlauf

Alle nennenswerten Änderungen an „Unsere Finanzen". Neueste zuerst.
(Die `CACHE`-Version in `sw.js` wird bei Asset-Änderungen erhöht — sie ist der technische
Versionsmarker für installierte PWAs.)

## 2026-06-12 (dreizehnter Wurf)

- **Dashboard und Buchungen klarer beschriftet.** Das Dashboard zeigt beim Kreisdiagramm wieder
  eindeutig „Gemeinsame Ausgaben nach Kategorie"; der Buchungen-Tab nennt die Summe jetzt
  „Alle Ausgaben im [Monat]".
- **Swipe-Löschen zurückgebracht.** Buchungen und sichtbare Einträge in „Persönlich" können per
  Swipe nach rechts gelöscht werden. Private Monatsbuchungen in „Persönlich" zeigen jetzt alle
  privaten Buchungen der Person im Monat, damit manuelle Einträge nicht ausgefiltert werden.
  SW-Cache `v27`.

## 2026-06-11 (zwölfter Wurf)

- **Buchungen als reine Monatsliste.** Der Tab zeigt jetzt immer alle echten Buchungen des
  Monats, egal ob gemeinsam oder privat. Die frühere Umschaltung „Gemeinsamer Topf / Alle
  Buchungen", offene Fixkosten-Regeln, Buchen-Buttons, Swipe-Löschen und Bearbeiten per
  Antippen sind aus diesem Tab entfernt. Der Plus-Button ist im Buchungen-Tab ausgeblendet.
  SW-Cache `v26`.

## 2026-06-11 (elfter Wurf)

- **Dashboard auf drei Bereiche reduziert.** Die Übersicht zeigt nur noch „Zusammen frei
  verfügbar", „Monat nach Person" und ein einzelnes Kreisdiagramm „Ausgaben nach Kategorie".
  Vorschläge, anstehende Kosten, letzte Buchungen und die separaten gemeinsamen/personenbezogenen
  Diagramme wurden aus dem Dashboard entfernt.
  SW-Cache `v25`.

## 2026-06-11 (zehnter Wurf)

- **Analyse-Tab entfernt.** Die App-Navigation besteht vorerst aus Übersicht,
  Persönlich, Buchungen und Mehr; die Analyse-View wird nicht mehr geladen oder gecached.
  SW-Cache `v24`.

## 2026-06-11 (neunter Wurf)

- **Persönlich trennt gemeinsame Kosten klarer.** Gemeinsame Fixkosten sind jetzt in
  „Gemeinsame monatliche Fixkosten" und „Gemeinsame Jahres-/Quartalskosten" getrennt.
  Der Button für gemeinsame Jahreskosten öffnet den Regel-Editor direkt mit jährlichem
  Intervall.
  SW-Cache `v23`.

## 2026-06-11 (achter Wurf)

- **Übersicht wieder ruhiger.** Die Karte „Zusammen frei verfügbar" zeigt nur noch
  geplante Einnahmen, gemeinsame Fixkosten und die Gesamtsumme der zusätzlich fälligen
  Monatskosten. Die Detailposten der zusätzlich fälligen Kosten sind in einem standardmäßig
  zugeklappten Bereich.
- **Dashboard ohne gemeinsamen Topf.** Die Topf-Karte wurde aus der Übersicht entfernt.
  SW-Cache `v22`.

## 2026-06-11 (siebter Wurf)

- **Fixkosten transparenter getrennt.** Gemeinsame monatliche Fixkosten zählen jetzt nur noch
  aus Regeln mit Zuordnung „Gemeinsam"; private laufende Kosten werden separat ausgewiesen
  und trotzdem vom frei verfügbaren Budget abgezogen. Übersicht und Persönlich zeigen eigene
  Zeilen/Sektionen für gemeinsame Fixkosten, private laufende Kosten, zusätzlich fällige
  Quartals-/Jahresposten und gebuchte variable Ausgaben.
- **Willkommensbanner entfernt, Analyse vereinfacht.** Die Übersicht startet direkt in der
  eigentlichen Finanzansicht; das Einrichtungssheet ist neutral benannt. Die Analyse zeigt
  nur noch einen Verlauf „Gespart oder verloren" pro Monat.
  SW-Cache `v21`.

## 2026-06-11 (sechster Wurf)

- **Erklär-Overlays radikal gekürzt.** Jedes (i)-Sheet zeigt jetzt: die Zahlen-Zeilen
  (woraus sich der Wert zusammensetzt) plus maximal ein bis zwei kurze Sätze — statt
  langer Absätze. (alle Views)
  SW-Cache `v20`.

## 2026-06-11 (fünfter Wurf)

- **Sparen ist jetzt app-weit vom Konsum getrennt.** Alles in Kategorie „Sparen & Anlegen"
  zählt als Vermögensaufbau, nicht als Ausgabe: eigene Kachel **„Gespart"** auf der Übersicht
  (2×2-Raster), eigene Zeile „Sparraten" in „Zusammen frei verfügbar", eigene Zeile „Gespart"
  und Sektion „Sparen & Anlegen" im Tab „Persönlich". Ausgaben-Kachel, Kategorie-Diagramme,
  Top-Ausgaben, Gemeinsam vs. privat und Kategorien-Vergleich zeigen nur noch Konsum.
  **Sparquote** = (Sparraten + Übriges) ÷ Einnahmen; **Sparverlauf** zählt Sparraten als
  gespart; Trend-Chart mit dritter Serie „Gespart" (türkis). Am „Frei verfügbar"-Ergebnis
  ändert sich nichts — die Posten sind nur sauber aufgeteilt. (`analysis.js`, alle Views)
- **Fixkostenquote & Fixkosten-Tipp rechnen gegen geplante Einnahmen** (Regeln + gebuchte
  Einnahmen) statt nur gegen bereits gebuchte — Anfang des Monats war die Quote sonst stark
  überzeichnet. (`analysis.js`)
- **Topf-Erklärung: „Hälfte der Differenz" berücksichtigt gemeinsame Einnahmen** (gleiche
  Formel wie die Paar-Bilanz). (`transactions.js`)
- **Audit-Fixes (Genauigkeit):** (1) Pro-Person-Diagramm teilt ungerade Cent-Beträge
  deterministisch (p1 abrunden, p2 aufrunden) — beide Diagramme zusammen ergeben exakt das
  Gemeinsam-Diagramm. (2) Ausgleichszahlungen sind nicht mehr editierbar (der Editor kennt
  die Kategorie „Ausgleich" nicht und hätte sie beim Typwechsel zerstört) — löschen + neu
  ausgleichen stattdessen. (3) Regel-Editor zeigt bei „vierteljährlich" den konkreten
  3-Monats-Rhythmus an. (4) Monats-Ledger weist Sparraten separat aus (große Zahl = nur
  Ausgaben). (`dashboard.js`, `transactions.js`, `recurring.js`)
- **Elterngeld & Kindergeld als monatliche Einnahme-Regeln** (Backup-JSON) — damit zeigen
  zukünftige Monate realistische geplante Einnahmen; vorhandene Buchungen werden automatisch
  zugeordnet.

## 2026-06-11 (vierter Wurf)

- **Erklär-Overlays in der ganzen App.** Alle Rechen-Karten haben jetzt einen (i)-Button, der
  ein Sheet mit der konkreten Rechnung (mit euren Live-Zahlen) öffnet und erklärt, wo die
  zugehörige Abrechnung zu finden ist: „Zusammen frei verfügbar", „Gemeinsamer Topf"
  (Dashboard & Buchungen, inkl. kompletter Abrechnung über alle Monate), beide
  Kategorie-Diagramme, „Anstehende Fixkosten", Persönlich-Überblick, Monats-Ledger sowie
  Sparverlauf, Trend, Kennzahlen, Sparquote und Gemeinsam vs. privat in der Analyse.
  Neue Helfer `App.cardHead(title, makeContent)` und `App.infoContent(blocks)` in `core.js`.
- **Stat-Kacheln antippbar.** Einnahmen / Ausgaben / Übrig auf der Übersicht öffnen beim
  Antippen ein Overlay: Einnahmen-Liste des Monats, Ausgaben-Aufschlüsselung nach Kategorie
  bzw. die Übrig-Rechnung samt Erklärung des Unterschieds zu „frei verfügbar".
  (`core.js`, `style.css`, `dashboard.js`, `personal.js`, `transactions.js`, `insights.js`)
- **Zukünftige Monate ansteuerbar.** Übersicht und Persönlich erlauben jetzt auch das
  Vorblättern in kommende Monate (wie Buchungen) — dort sieht man das geplante Budget
  inklusive der dann fälligen Quartals- und Jahreskosten (z. B. KFZ-Steuer im Juli).
  (`dashboard.js`, `personal.js`)
  SW-Cache `v19`.

## 2026-06-11 (dritter Wurf)

- **Vierteljährliche Kosten (z. B. GEZ) wie jährliche behandelt.** Keine Umlage mehr auf die
  Monate (`/3` entfällt) — der volle Betrag zählt nur im Fälligkeitsmonat und erscheint dort
  als Einzelposten („Diesen Monat zusätzlich fällig" in Übersicht & Persönlich, mit
  Intervall-Angabe). API: `yearlyDueCents`/`yearlyItems` → `nonMonthlyDueCents`/
  `nonMonthlyItems` (jetzt inkl. `interval`); `fixedMonthlyCents` = nur monatliche Regeln.
  (`analysis.js`, `dashboard.js`, `personal.js`)
- **Gemeinsamer Topf.** Der Tab „Buchungen" hat jetzt einen Umschalter „Gemeinsamer Topf /
  Alle Buchungen" (Topf = Standard): Topf-Karte mit gemeinsamen Ausgaben des Monats,
  „… hat eingezahlt"-Zeilen pro Person, laufendem Schulden-Stand inkl. Ausgleichen-Button
  und „+ Gemeinsame Ausgabe" (Editor öffnet mit Gemeinsam-Vorauswahl). Die Liste zeigt im
  Topf-Modus nur gemeinsame Buchungen, offene gemeinsame Fixkosten und Ausgleichszahlungen
  (als „Ausgleichszahlung" markiert) — so ist nachvollziehbar, wer was in den Topf gezahlt
  hat. Die Dashboard-Karte „Paar-Bilanz" heißt jetzt „Gemeinsamer Topf", zeigt die
  Einzahlungen beider im gewählten Monat als Balken und verlinkt in den Topf.
  (`transactions.js`, `dashboard.js`)
  SW-Cache `v18`.

## 2026-06-11 (zweiter Wurf)

- **Gemeinsame Ausgaben zählen jetzt für beide (50/50).** Gemeinsame Fixkosten-Regeln und
  gemeinsame Buchungen werden in allen Pro-Person-Rechnungen je zur Hälfte beiden Partnern
  angerechnet — unabhängig davon, wer zahlt (z. B. Camper-Kredit 462 € gemeinsam → je 231 €).
  Betrifft `Analysis.personalSummary` (Tab „Persönlich": Summary inkl. neuer Zeile „Gemeinsame
  Ausgaben (½)", Fixkosten-Liste zeigt nun auch die gemeinsamen Posten des Partners mit
  „Gemeinsam (zählt ½) · zahlt …"-Hinweis). `availableBudget.byPerson` arbeitete bereits 50/50.
  Die Paar-Bilanz (wer schuldet wem) bleibt unverändert. (`analysis.js`, `personal.js`)
- **Jährliche Fixkosten als Einzelposten statt Monats-Umlage.** Jährliche Regeln werden nicht
  mehr durch 12 geteilt in die monatlichen Fixkosten eingerechnet, sondern erscheinen im
  Fälligkeitsmonat als eigene Position: in der „Frei verfügbar"-Karte der Übersicht als
  einzelne Zeilen unter „Jährliche Kosten diesen Monat", im Tab „Persönlich" als Zeile
  „Jährliche Kosten (diesen Monat fällig)" mit Auflistung. `fixedMonthlyCents` = nur
  monatlich + vierteljährlich/3; `availableBudget` und `personalSummary` liefern
  `yearlyDueCents` + `yearlyItems`. (`analysis.js`, `dashboard.js`, `personal.js`)
- **Dashboard: Kategorie-Diagramm zweigeteilt.** Statt einem Donut über alle Ausgaben gibt es
  jetzt „Gemeinsame Ausgaben nach Kategorie" (nur gemeinsame Buchungen) und „Ausgaben pro
  Person" mit Personen-Umschalter (private Buchungen voll + die Hälfte jeder gemeinsamen
  Buchung). (`dashboard.js`)
  SW-Cache `v17`.

## 2026-06-11

- **Analyse stark überarbeitet.** Neu: **Sparverlauf** (kumulatives Erspartes als Flächen-/Linien-Chart,
  `Charts.line`), **Kennzahlen** (Ø Ausgaben/Monat, Ø Sparquote, Fixkostenquote, größte Ausgabe),
  **Gemeinsam vs. privat** (gestapelter Balken) und **Top-Ausgaben des Monats** — zusätzlich zu
  Einnahmen/Ausgaben-Trend, Sparquote, Spartipps und Kategorien-Vergleich. Neue Analyse-Funktionen:
  `cumulativeSavings`, `keyMetrics`, `topExpenses`, `sharedVsPrivate`. (`insights.js`, `analysis.js`, `charts.js`)
- **Einnahmen: korrekte Beschriftung.** Im Editor heißt das Personenfeld bei Einnahmen „Empfänger"
  statt „Bezahlt von" (Geld kommt rein, wird nicht gezahlt). (`transactions.js`, `recurring.js`)
  SW-Cache `v13`.
- **Fixkosten-Tab entfernt (zusammengeführt) → 5 Tabs.** Wiederkehrende Kosten verwaltet man jetzt
  pro Person im Tab „Persönlich"; die automatische Erkennung wiederkehrender Kosten wandert als Karte
  ins Dashboard; der Kalender-Export liegt weiterhin unter „Mehr". Tabs jetzt: Übersicht · Persönlich ·
  Buchungen · Analyse · Mehr. (`index.html`, `dashboard.js`)
- **Buchungen: Ausgaben rot (Minus-Logik).** Ausgabe-Kacheln haben roten linken Rand + zarte rote
  Tönung + roten Betrag; Einnahmen analog grün. Personen-Farbpunkt zeigt weiterhin, wer gebucht hat.
  Expense-Beträge sind app-weit rot. (`transactions.js`, `style.css`)
- **Neues, hochwertigeres App-Icon** (Apple-Stil: Verlauf, Highlight, dezente Paar-Scheiben,
  € mit Tiefenschatten). (`icons/*`; SW-Cache `v12`)
- **Bottom-Sheet: Runterwischen zum Schließen + animiertes Schließen.** Sheets lassen sich am
  Griff/Header nach unten wischen (Snap-back bei kurzem Zug), Backdrop-Tap und ✕ schließen jetzt
  ebenfalls mit Slide-down-Animation. (`core.js`, `style.css`)
- **Buchungs-Editor: Betragsfeld nach unten** zu den anderen Feldern verschoben (Typ → Kategorie →
  Betrag → Datum → …), als normales beschriftetes Feld. (`transactions.js`)
- **Animationen aufpoliert:** weichere Karten-/Listen-Einblendung, taktiles Press-Feedback auf
  Chips/Icons/FAB, Sheet-Federkurven. (`style.css`)
- **Übersicht + Persönlich sind jetzt die ersten beiden Tabs** (das Herzstück der App). (`index.html`)
  SW-Cache `v11`.
- **Persönlich: wiederkehrende Ein-/Ausgaben direkt anlegen.** Eigene Abschnitte „Gehalt &
  wiederkehrende Einnahmen" und „Fixkosten (wiederkehrend)" mit ↻-Markierung und „+ Hinzufügen"-Buttons,
  die den Regel-Editor passend vorbelegt öffnen (Einnahme/Ausgabe + Person). Einmal angelegt,
  erscheinen sie automatisch jeden Monat. `Analysis.personalSummary` rechnet Einnahmen jetzt aus den
  wiederkehrenden Einnahme-Regeln (Gehalt) + Einmal-Einnahmen; Buchungen einer von einer Regel
  abgedeckten Kategorie werden nicht doppelt gezählt. `Views.recurring.openEditor(rule, {type,payerId})`
  akzeptiert Vorgaben. (`personal.js`, `recurring.js`, `analysis.js`; SW-Cache `v10`)
- **Dashboard übersichtlicher + Visualisierung pro Person & gemeinsam.** Übersicht führt jetzt mit
  einer Hero-Karte „Zusammen frei verfügbar" (kombinierte Summe) und zwei farbigen Balken pro Person
  (Steffen/Gisa). Reihenfolge gestrafft (Hero → Stats → Donut → Bilanz → Fixkosten → Letzte).
- **Buchungen: farbige Personen-Markierung am linken Rand** jeder Kachel (in der Farbe des Zahlers) —
  auf einen Blick sichtbar, wer gebucht hat. (`dashboard.js`, `transactions.js`; SW-Cache `v9`)
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
