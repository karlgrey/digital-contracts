# 🤖 Anleitung: Mit Claude Code bauen & deployen

## Was ist Claude Code?

Claude Code ist ein Kommandozeilen-Tool, mit dem du Claude direkt von deinem Terminal aus auffordern kannst, Code für dich zu schreiben, zu debuggen und zu managen.

**Offizielle Docs:** https://docs.claude.com/en/docs/claude-code

---

## 📥 Schritt 1: Claude Code installieren

```bash
# Installiere die Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Überprüfe Installation
claude-code --version
```

Falls du Node.js noch nicht hast:
```bash
# Mac
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 🚀 Schritt 2: Dein Projekt starten

```bash
# Neues Verzeichnis für dein Projekt
mkdir stellplatz-booking && cd stellplatz-booking

# Claude Code initialisieren
claude-code init
```

Das erstellt eine `.claude-code` Konfigurationsdatei.

---

## 📋 Schritt 3: Die Spezifikation nutzen

Du hast die Datei `CLAUDE-CODE-SPEC.md` erhalten. Diese enthält die **komplette Spezifikation** für dein System.

Kopiere die Spec in dein Projektverzeichnis:
```bash
cp CLAUDE-CODE-SPEC.md ./SPEC.md
```

---

## 💬 Schritt 4: Claude Code einen Auftrag geben

Starte Claude Code im Projektverzeichnis:

```bash
claude-code
```

Dann gib Claude einen präzisen Auftrag. Hier ein Template:

### Prompt Template
```
Ich möchte ein Stellplatz-Buchungssystem bauen. Lese die komplette Spezifikation in SPEC.md und implementiere alles nach dieser Vorgabe.

Das System soll folgende Komponenten haben:
1. Backend (Node.js + Express)
2. SQLite Datenbank
3. Kundenformular (booking.html)
4. Admin-Panel (admin.html)
5. PDF-Vertragsgenerierung

Genaue Anforderungen: siehe SPEC.md

Starte mit dem Backend (server.js + database.js).
```

---

## 🔄 Schritt 5: Mit Claude Code arbeiten

### Nachdem der erste Build fertig ist:

```bash
# In einem neuen Terminal
npm install
npm run init-db
npm start
```

### Dann testen:
- Browser: http://localhost:3000/booking.html
- Admin: http://localhost:3000/admin.html (Token: admin123)

### Wenn etwas nicht funktioniert:
```bash
# In Claude Code Terminal:
claude-code "Der Server startet nicht. Fehler: [FEHLER HIER]. Behebe das in server.js"
```

---

## 🎯 Optimaler Workflow

### Phase 1: Backend Creation
```bash
claude-code
# Prompt: Lese SPEC.md und baue server.js, database.js und config.js
```

### Phase 2: Frontend Creation
```bash
claude-code
# Prompt: Erstelle booking.html nach SPEC.md mit allen Features
```

### Phase 3: Admin-Panel
```bash
claude-code
# Prompt: Erstelle admin.html mit Login, Dashboard und Unterschrift-Modal
```

### Phase 4: Testing & Fixes
```bash
npm install && npm start
# Test lokal, melde Fehler an Claude Code
```

---

## 🚢 Schritt 6: Vor dem Deployment

### 1. Sicherheit
```bash
claude-code "Ändere ADMIN_TOKEN in .env.example auf einen sicheren Wert"
```

### 2. Dokumentation
```bash
claude-code "Erstelle DEPLOYMENT.md mit Schritt-für-Schritt Anleitung für Linux + PM2"
```

### 3. Finale Checks
```bash
# Alle Dateien vorhanden?
ls -la

# Test lokal?
npm start

# Passwort geändert?
cat .env.example | grep ADMIN_TOKEN
```

---

## 🌐 Schritt 7: Deploy auf Server

### Option A: Mit Git (empfohlen)

Lokal:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <dein-repo>
git push -u origin main
```

Auf Server:
```bash
ssh user@dein-server.de
cd /var/www
git clone <dein-repo> stellplatz
cd stellplatz
npm install
npm run init-db
```

### Option B: Mit SFTP
```bash
# Alle Dateien mit FileZilla hochladen oder:
scp -r stellplatz-booking/* user@server.de:/var/www/stellplatz/

# Dann auf Server:
ssh user@server.de
cd /var/www/stellplatz
npm install && npm run init-db
```

### Mit PM2 als Service
```bash
# Auf dem Server:
npm install -g pm2
pm2 start server.js --name "stellplatz"
pm2 startup
pm2 save
```

---

## 💡 Tipps für erfolgreiche Claude Code Sessions

1. **Sei präzise:** "Baue XYZ nach SPEC.md" ist besser als "Mach mir ne Website"

2. **Referenziere die Spec:** "Nach SPEC.md, Abschnitt 'API Specification', Endpoint GET /api/locations..."

3. **Gib Kontext:** "Ich habe diesen Fehler: [ERROR]. Code sieht so aus: [CODE]"

4. **One Thing at a Time:** Lieber 5 kleine Prompts als 1 riesen Prompt

5. **Teste nach jedem Step:** `npm start` und überprüfe im Browser

6. **Dokumentiere Probleme:** Damit Claude dir besser helfen kann

---

## 🆘 SOS - Wenn was schiefgeht

### Server startet nicht
```bash
claude-code "Der Server gibt diesen Fehler: [FEHLER]. 
Die server.js sieht so aus: [CODE-SNIPPET].
Behebe das Problem."
```

### Frontend funktioniert nicht
```bash
claude-code "booking.html lädt nicht richtig. 
Fehler in Browser Console: [ERROR]. 
Überprüfe und behebe die Datei."
```

### Datenbank-Problem
```bash
claude-code "Ich bekomme SQLite Fehler: [ERROR].
Überprüfe database.js und behebe das Problem.
Lösche stellplatz.db, damit es neu erstellt wird."
```

---

## ✅ Checkliste

- [ ] Node.js installiert
- [ ] Claude Code installiert (`npm install -g @anthropic-ai/claude-code`)
- [ ] Projektverzeichnis erstellt
- [ ] CLAUDE-CODE-SPEC.md kopiert
- [ ] Claude Code Backend gebaut
- [ ] Claude Code Frontend gebaut
- [ ] Lokal getestet
- [ ] Admin-Token geändert
- [ ] Auf Server deployed
- [ ] Kunde-Links vorbereitet

---

## 🎉 Danach

Sobald alles auf dem Server läuft:

1. **Locations in DB eintragen** (via SQLite)
2. **Admin-Panel öffnen:** `https://domain.de/admin.html`
3. **Booking-Links generieren:**
   - Im Admin-Panel → "Standorte verwalten"
   - Klicke "🔗 Link kopieren" beim gewünschten Standort
   - Link wird automatisch in Zwischenablage kopiert
4. **Links zu Kunden schicken** (via E-Mail, WhatsApp, etc.)
5. **Unterschreiben & profitieren!**

### 🔗 Location-Locked Booking Links

Das System unterstützt standortspezifische Booking-Links:

**Format:** `https://domain.de/booking.html?location=1`

**Vorteile:**
- Standort ist vorausgewählt und gesperrt
- Kunde kann Standort nicht ändern
- Verhindert Verwechslungen
- Einfacherer Buchungsprozess

**Workflow:**
1. Admin kopiert Link für Standort X
2. Admin sendet Link an Kunden
3. Kunde öffnet Link → Standort ist bereits gewählt
4. Kunde füllt nur noch persönliche Daten aus
5. Kunde unterschreibt → Buchung geht direkt an Admin

---

**Happy Building! 🚀**

Fragen? Claude Code fragen!
