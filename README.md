# 💶 Unsere Finanzen

Eine Finanz-App für Paare als installierbare Web-App (PWA) im Apple-Design.

**➡️ Komplette Installations- und Einrichtungsanleitung: [ANLEITUNG.md](ANLEITUNG.md)**

## Features

- 📊 Monatsübersicht mit Einnahmen, Ausgaben und Kategorien-Diagramm
- ➕ Schnelle manuelle Erfassung von Ausgaben & Einnahmen (pro Person, optional „gemeinsam")
- 🤝 Paar-Bilanz: wer schuldet wem wie viel, mit Ausgleichs-Funktion
- 🔁 Fixkosten mit Fälligkeits-Erinnerung und Ein-Tipp-Buchung
- 🔍 Automatische Erkennung wiederkehrender Kosten (Abos, Verträge …)
- 💡 Analyse mit 6-Monats-Trend, Sparquote und automatischen Spartipps
- 📅 Kalender-Export (.ics) der Fixkosten für iPhone-Erinnerungen
- ☁️ Echtzeit-Synchronisation zwischen zwei Geräten (eigenes, kostenloses Firebase-Projekt)
- 📴 Funktioniert offline, Daten bleiben auf euren Geräten
- 🌙 Hell- und Dunkelmodus (System / manuell umschaltbar)
- 💳 Wischen-zum-Löschen bei Buchungen, „frei verfügbar"-Budget pro Monat & Person

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt und ohne Abhängigkeiten
(einzige Ausnahme: Firebase-SDK per CDN, nur wenn Synchronisation aktiviert wird).

## Weiterentwickeln

**➡️ [AGENTS.md](AGENTS.md) ist der Einstiegspunkt für Entwickler und KI-Tools (Codex, Claude …).**
Sie erklärt Architektur, Regeln, lokale Entwicklung und Stolperfallen.

- [AGENTS.md](AGENTS.md) — Entwickler- & KI-Agenten-Leitfaden (zuerst lesen)
- [SPEC.md](SPEC.md) — vollständige, verbindliche technische Spezifikation
- [CHANGELOG.md](CHANGELOG.md) — Versionsverlauf
- [ANLEITUNG.md](ANLEITUNG.md) — Endnutzer-Anleitung (Installation & Firebase-Sync)

Lokal starten: `python -m http.server 8741` im Projektordner, dann `http://localhost:8741/`.
