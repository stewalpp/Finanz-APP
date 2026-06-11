# 📱 Unsere Finanzen — Anleitung

Eine Finanz-App für euch zwei: Ausgaben & Einnahmen erfassen, Fixkosten im Blick behalten,
automatische Erkennung wiederkehrender Kosten, Spartipps, Paar-Bilanz („wer schuldet wem")
und Synchronisation zwischen euren beiden iPhones.

---

## 1. Die App online stellen (einmalig, ~2 Minuten)

Der Code liegt bereits in deinem GitHub-Repository. Damit ihr die App auf dem iPhone
installieren könnt, muss sie unter einer Internet-Adresse erreichbar sein. GitHub macht
das kostenlos („GitHub Pages"):

1. Öffne https://github.com/stewalpp/Finanz-APP
2. Klicke oben auf **Settings** (Zahnrad)
3. Links im Menü auf **Pages**
4. Bei „Build and deployment" → „Source": **Deploy from a branch** wählen
5. Bei „Branch": **main** auswählen, Ordner **/ (root)**, dann **Save**
6. Nach 1–2 Minuten ist die App erreichbar unter:

   **https://stewalpp.github.io/Finanz-APP/**

> ⚠️ Dafür muss das Repository **öffentlich** (public) sein. Das ist unbedenklich:
> Öffentlich ist nur der Programmcode der App — **eure Finanzdaten landen niemals im
> Repository.** Sie liegen ausschließlich auf euren Handys (und optional in eurem eigenen
> Firebase-Projekt, siehe Schritt 3).

---

## 2. Auf dem iPhone installieren (ihr beide)

1. Öffne **Safari** auf dem iPhone (muss Safari sein, nicht Chrome!)
2. Gehe zu **https://stewalpp.github.io/Finanz-APP/**
3. Tippe unten auf das **Teilen-Symbol** (Viereck mit Pfeil nach oben)
4. Wähle **„Zum Home-Bildschirm"**
5. Tippe auf **„Hinzufügen"**

Fertig! Die App liegt jetzt mit eigenem Icon auf dem Home-Bildschirm, startet im
Vollbild wie eine normale App und funktioniert auch **offline**.

Beim ersten Start fragt die App nach euren Namen — danach könnt ihr sofort loslegen.
Ohne Synchronisation läuft die App komplett lokal auf jedem Gerät.

---

## 3. Synchronisation zwischen euren iPhones einrichten (einmalig, ~10 Minuten)

Damit Einträge automatisch zwischen euren Handys abgeglichen werden, braucht die App
einen Cloud-Speicher. Ihr nutzt dafür euer **eigenes, kostenloses Firebase-Projekt**
(Google). Kostenlos-Kontingent: weit mehr als ihr zu zweit jemals braucht.

### 3a. Firebase-Projekt anlegen (macht nur einer von euch, am besten am PC)

1. Gehe zu **https://console.firebase.google.com** und melde dich mit einem Google-Konto an
2. **„Projekt erstellen"** → Name z. B. `unsere-finanzen` → Google Analytics **deaktivieren** → erstellen
3. **Anonyme Anmeldung aktivieren:**
   - Links im Menü: **Authentication** → **Jetzt starten**
   - Reiter **Sign-in method** → **Anonym** → Schalter **aktivieren** → Speichern
4. **Datenbank anlegen:**
   - Links im Menü: **Firestore Database** → **Datenbank erstellen**
   - Standort: **europe-west3 (Frankfurt)** → im **Produktionsmodus** starten
   - Reiter **Regeln** öffnen und den Inhalt komplett ersetzen durch:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

   - **Veröffentlichen** klicken
5. **App-Konfiguration holen:**
   - Zahnrad oben links → **Projekteinstellungen**
   - Unten bei „Meine Apps" auf das **`</>`-Symbol** (Web-App) klicken
   - Name z. B. `finanz-app` → **App registrieren** (Hosting NICHT ankreuzen)
   - Es erscheint ein Code-Block mit `const firebaseConfig = { apiKey: "...", ... }`
   - **Den Block in den geschweiften Klammern kopieren** (oder einfach alles — die App
     fischt sich die Werte selbst heraus)

### 3b. In der App verbinden

**Auf deinem iPhone:**
1. App öffnen → Tab **Mehr** → **Synchronisation einrichten…**
2. **„Neuen Haushalt erstellen"** wählen
3. Die kopierte Firebase-Konfiguration in das Textfeld einfügen
4. Den angezeigten **Haushalts-Code notieren** (z. B. `K7M2PQ4X`)
5. „Vorhandene Daten hochladen" eingeschaltet lassen → **Verbinden**

**Auf dem iPhone deiner Freundin:**
1. Gleiche Schritte, aber **„Beitreten"** wählen
2. Dieselbe Firebase-Konfiguration einfügen (z. B. per Nachricht schicken)
3. Den **Haushalts-Code eingeben** → **Verbinden**

Ab jetzt synchronisiert alles automatisch — in Echtzeit, und offline Erfasstes wird
nachgereicht, sobald wieder Internet da ist.

> 🔒 **Sicherheit:** Haushalts-Code und Firebase-Konfiguration nur untereinander teilen.
> Wer beides hat, könnte eure Daten lesen. Für eine private Paar-App ist dieses
> Schutzniveau angemessen.

---

## 4. Erinnerungen an fällige Kosten

iPhone-Web-Apps können keine Push-Benachrichtigungen ohne eigenen Server senden.
Dafür gibt es den **Kalender-Export**:

1. Tab **Fixkosten** → oben rechts das **Kalender-Symbol** antippen
2. Die Datei `fixkosten.ics` öffnen → iOS bietet an, die Termine in den **Kalender** zu übernehmen
3. Der iPhone-Kalender erinnert euch dann automatisch an Miete, Strom, Abos & Co. —
   inklusive Wiederholung (monatlich/vierteljährlich/jährlich)

Zusätzlich zeigt die **Übersicht** jeden Monat an, was fällig, bezahlt oder überfällig ist —
mit „Buchen"-Knopf zum Eintragen per Fingertipp.

---

## 5. Tipps zur Bedienung

- **➕ (blauer Knopf):** Neue Buchung von überall — Betrag, Kategorie, fertig.
- **Gemeinsame Ausgabe:** Schalter beim Eintragen. Die App rechnet daraus die
  **Paar-Bilanz** („Lisa schuldet Steffen …") mit „Ausgleichen"-Knopf.
- **Fixkosten-Erkennung:** Die App erkennt wiederkehrende Zahlungen (z. B. Netflix)
  automatisch und schlägt sie im Tab **Fixkosten** vor — „Übernehmen" oder „Ignorieren".
- **Analyse:** 6-Monats-Trend, Sparquote, Kategorien-Vergleich zum Vormonat und
  automatische **Spartipps**.
- **Demo-Daten** (Mehr → Demo-Daten laden) zum Ausprobieren; danach über
  „Alle Daten löschen" wieder entfernen.
- **Backup:** Mehr → „Backup exportieren (JSON)" sichert alles in eine Datei.

---

## 6. Updates einspielen

Wenn der Code im Repository aktualisiert wird (git push), verteilt GitHub Pages die
neue Version automatisch. Auf dem iPhone: App schließen und neu öffnen — beim zweiten
Öffnen ist die neue Version aktiv (die App aktualisiert sich im Hintergrund).

---

## 7. Ehrliche Grenzen

- **Kein automatischer Bankimport** (wie bei Finanzguru): Dafür wären lizenzierte
  Banking-Schnittstellen nötig. Einträge erfolgen manuell — die Eingabemaske ist
  dafür auf Geschwindigkeit optimiert.
- **Keine Push-Benachrichtigungen:** Ersatz ist der Kalender-Export (Schritt 4).
- **Synchronisation erfordert die einmalige Firebase-Einrichtung** (Schritt 3).
  Ohne sie läuft jedes Handy für sich.
