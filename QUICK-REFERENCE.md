# ⚡ Quick Reference für Claude Code

## Die 5 wichtigsten Prompts

### 1️⃣ Projekt starten
```bash
claude-code "Lese die komplette Datei CLAUDE-CODE-SPEC.md.

Implementiere ein Node.js + Express Buchungssystem für Stellplätze mit:
- server.js (REST API)
- database.js (SQLite)
- config.js (Preise)
- booking.html (Kundenformular)
- admin.html (Admin-Dashboard)
- package.json

Folge EXAKT der Spezifikation in CLAUDE-CODE-SPEC.md"
```

### 2️⃣ Fehler beheben
```bash
claude-code "Der Server startet nicht mit Error: [ERROR HERE]

Schau dir server.js Zeile [X-Y] an und behebe das Problem."
```

### 3️⃣ Feature hinzufügen
```bash
claude-code "Füge in admin.html einen Status-Filter hinzu nach SPEC.md Abschnitt 'Admin Endpoints'"
```

### 4️⃣ Code optimieren
```bash
claude-code "Überprüfe booking.html auf Performance und Sicherheitslücken. Optimiere."
```

### 5️⃣ Deployment vorbereiten
```bash
claude-code "Erstelle ein DEPLOYMENT.md mit exakten Befehlen für:
- Node.js Installation
- npm install
- PM2 Setup
- Nginx Konfiguration
- SSL/HTTPS"
```

---

## Schnelles Setup (Copy-Paste)

```bash
# 1. Projekt-Ordner
mkdir stellplatz && cd stellplatz

# 2. Claude Code starten
claude-code

# 3. Größeren Prompt einfügen (siehe "Die 5 wichtigsten Prompts" → 1️⃣)

# 4. Warten bis fertig

# 5. Testen
npm install
npm run init-db
npm start

# 6. Browser: http://localhost:3000/booking.html
```

---

## API-Endpoints Quick Check

| Endpoint | Methode | Beschreibung |
|----------|---------|-------------|
| `/api/locations` | GET | Alle Standorte |
| `/api/pricing/:locationId` | GET | Preise für Location |
| `/api/bookings` | POST | Neue Buchung |
| `/api/contract/:bookingId` | GET | PDF herunterladen |
| `/api/admin/dashboard` | GET | Stats (mit Token) |
| `/api/admin/bookings/:id/sign-owner` | POST | Unterschreiben (mit Token) |

---

## Datenbank-Struktur Quick Look

```
locations: id, name, company, city
vehicle_types: id, max_length (5.0-8.5), label
pricing: id, location_id, vehicle_type_id, category, price_per_month
bookings: id, location_id, vehicle_type_id, category, 
          first_name, last_name, address, email,
          start_date, end_date, monthly_price, caution,
          status, customer_signature_image, owner_signature_image
```

---

## Preisberechnung Formel

```
Endpreis = Basis-Preis × Kategorie-Multiplier × 1.19 (MwSt)

Beispiel: Wohnmobil bis 5m, Außen (50%), mit MwSt
= 100 € × 0.50 × 1.19 = 59,50 € (mit MwSt)
```

---

## Status-Flows

```
Neu → pending_customer_signature
         ↓ (Kunde unterschreibt)
      pending_owner_signature
         ↓ (Du unterschreibst)
      completed ✓
      
      (oder cancelled)
```

---

## Nützliche Befehle

```bash
# Server starten
npm start

# Datenbank zurücksetzen
rm stellplatz.db && npm run init-db

# Logs anschauen (wenn mit PM2)
pm2 logs stellplatz

# Server stoppen
pm2 stop stellplatz

# Token ändern
nano .env  # oder Editor öffnen

# SQLite Browser
sqlite3 stellplatz.db
> SELECT * FROM bookings;
> .quit
```

---

## Häufige Claude Code Fehler & Fixes

| Problem | Lösung |
|---------|--------|
| "Module not found" | `npm install` ausführen |
| "Port already in use" | `npm start -- --port 3001` oder Process killen |
| "ENOENT: no such file" | Überprüfe Pfade in Imports |
| "SQLite corrupt" | `rm stellplatz.db` + neu starten |
| "Signature not saving" | Canvas-to-Base64 Konvertierung debuggen |

---

## Datei-Übersicht

```
📦 stellplatz-booking/
├── 📄 server.js (Hauptdatei)
├── 📄 database.js (Datenbank)
├── 📄 config.js (Preise)
├── 📄 package.json
├── 📄 .env (GEHEIM!)
├── 📁 public/
│   ├── booking.html (Kunde)
│   └── admin.html (Du)
└── 📄 stellplatz.db (Datenbank-Datei)
```

---

## Environment-Variablen

```bash
# .env Datei
PORT=3000
ADMIN_TOKEN=your_super_secret_token_here
NODE_ENV=production
```

---

## Test-Checklist

- [ ] npm start läuft
- [ ] booking.html lädt auf Port 3000
- [ ] Formular ausgefüllt → POST /api/bookings funktioniert
- [ ] admin.html lädt mit Token
- [ ] PDF Download funktioniert
- [ ] Signatur-Canvas zeichnet sich
- [ ] Unterschrift speichert

---

## Deployment Quick Checklist

```bash
# Auf dem Server:
ssh user@server.de

# Im Server Terminal:
cd /var/www/stellplatz
npm install
npm run init-db
pm2 start server.js --name "stellplatz"
pm2 startup
pm2 save

# Überprüfen:
pm2 logs stellplatz
curl http://localhost:3000/api/locations

# Client-Link verteilen:
https://domain.de/booking.html?location=1
https://domain.de/admin.html (Token eingeben)
```

---

## 🔗 Location-Locked Booking Links

### Workflow: Links mit vorausgewähltem Standort

1. **Im Admin-Panel:**
   - Gehe zu "Standorte verwalten"
   - Klicke auf "🔗 Link kopieren" beim gewünschten Standort
   - Link wird in Zwischenablage kopiert

2. **Link Format:**
   ```
   https://domain.de/booking.html?location=1
   ```

3. **Was passiert:**
   - Kunde öffnet Link
   - Standort-Dropdown ist vorausgewählt und gesperrt
   - Kunde sieht: "✓ Standort wurde für Sie vorausgewählt"
   - Kunde kann nur noch restliche Daten eingeben

4. **Vorteile:**
   - Keine Verwechslungsgefahr bei Standorten
   - Vereinfachter Buchungsprozess für Kunden
   - Tracking welcher Standort über welchen Link gebucht wird

---

## Locations Eintragen (nach Deploy)

```bash
# SSH auf Server
ssh user@server.de

# SQLite öffnen
cd /var/www/stellplatz
sqlite3 stellplatz.db

# Im SQLite Prompt:
INSERT INTO locations (name, company, city) VALUES 
('Potsdam', 'Firma A GmbH', 'Potsdam'),
('Brandenburg', 'Firma A GmbH', 'Brandenburg'),
('Frankfurt/Oder', 'Firma B GmbH', 'Frankfurt/Oder');

SELECT * FROM locations;
.quit
```

---

## Support-Kanäle

- **Claude Code Docs:** https://docs.claude.com/en/docs/claude-code
- **Express Docs:** https://expressjs.com/
- **SQLite:** https://www.sqlite.org/
- **pdfkit:** http://pdfkit.org/

---

**Pro-Tip:** Speichere diese Datei als Bookmark! 🚀
