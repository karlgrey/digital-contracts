# Setup & Deployment Guide

## Lokale Entwicklung

```bash
# Dependencies installieren
npm install

# Server starten (Port 3000)
node server-v2.js

# Oder mit Auto-Reload
npx nodemon server-v2.js
```

**URLs:**
- Buchungsformular: http://localhost:3000/booking
- Admin-Panel: http://localhost:3000/admin
- Deeplink-Beispiel: http://localhost:3000/booking?location=1

## Projektstruktur

```
rent-it-digital/
├── server-v2.js          # Express Backend (alle API-Routes)
├── database-v2.js        # SQLite Schema, Migrationen, Default-Template
├── pricing.js            # Preisformel, Template-Engine, Rabatte, Kaution
├── validation.js         # Express-Validator Middleware
├── auth.js               # JWT Auth + Audit-Logging
├── config.js             # Fahrzeugtypen-Konfiguration
├── stellplatz.db         # SQLite Datenbank (wird automatisch erstellt)
├── public/
│   ├── admin.html        # Admin-Dashboard (Tabs: Dashboard, Firmen, Standorte, Preise)
│   ├── booking-v2.html   # Buchungsformular
│   ├── booking-v2.js     # Buchungsformular JS
│   └── index.html        # Landing Page
├── temp/                 # Temporäre PDF-Dateien
├── CLAUDE-CODE-SPEC.md   # Ursprüngliche Spezifikation
└── SETUP-GUIDE.md        # Diese Datei
```

## Preisformel

Alle Preise werden aus **einem einzigen Grundpreis** berechnet (editierbar im Admin unter "Preise"):

```
Preis = (Grundpreis + Längenzuschlag) × Kategoriefaktor
```

| Parameter | Wert |
|---|---|
| Grundpreis | 100€ netto (für Halle, bis 5m) |
| Längenzuschlag | ab >5m: +10€ pro 0,5m Schritt |
| Halle | ×1,00 |
| Überdacht | ×0,75 |
| Außenstellplatz | ×0,50 |

Der Grundpreis wird in der `settings`-Tabelle gespeichert und über `Admin → Preise` geändert.

## Datenbank

SQLite-Datei `stellplatz.db` wird beim ersten Start automatisch erstellt mit:
- Alle Tabellen (companies, locations, vehicle_types, bookings, etc.)
- Default Contract Template
- Default Grundpreis (100€)
- Migrationen für neue Spalten (access_code, email, etc.)

**Backup:**
```bash
cp stellplatz.db stellplatz_backup_$(date +%Y%m%d).db
```

## Production Server

### Zugangsdaten

| | |
|---|---|
| **Host** | labs.remoterepublic.com |
| **User** | deploy |
| **App-Pfad** | /opt/str |
| **PM2-Prozess** | str |
| **Git Remote** | github.com:karlgrey/digital-contracts.git |

### Deployment

```bash
# 1-Liner: Pull + Restart
ssh deploy@labs.remoterepublic.com 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd /opt/str && git pull origin main && pm2 restart str'
```

### Einzelschritte (bei Problemen)

```bash
# Verbinden
ssh deploy@labs.remoterepublic.com

# NVM laden (nötig für node/pm2)
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# In App-Verzeichnis
cd /opt/str

# Code aktualisieren
git pull origin main

# Bei neuen Dependencies
npm install

# Neustart
pm2 restart str

# Status prüfen
pm2 list
pm2 logs str --lines 20 --nostream
```

### PM2-Befehle

```bash
pm2 list                    # Alle Prozesse anzeigen
pm2 logs str --lines 50     # Live-Logs
pm2 restart str             # Neustart
pm2 stop str                # Stoppen
pm2 describe str            # Details (Pfad, PID, Uptime, etc.)
```

### Datenbank-Backup (Server)

```bash
ssh deploy@labs.remoterepublic.com 'cp /opt/str/stellplatz.db /opt/str/stellplatz_backup_$(date +%Y%m%d).db'
```

## API-Übersicht

### Public
| Methode | Endpoint | Beschreibung |
|---|---|---|
| GET | /api/locations | Alle Standorte |
| GET | /api/pricing/:locationId | Preise für Standort |
| GET | /api/availability | Verfügbarkeit prüfen |
| POST | /api/bookings | Neue Buchung erstellen |
| GET | /api/contract-preview/:id | Vertragsvorschau (HTML) |
| GET | /api/contract/:id | Vertrag als PDF |
| GET | /api/invite/:token | Invite-Token einlösen |

### Admin (Bearer Token Auth)
| Methode | Endpoint | Beschreibung |
|---|---|---|
| POST | /api/admin/auth/login | Login |
| GET | /api/admin/dashboard | Dashboard-Stats |
| GET | /api/admin/bookings | Buchungen (mit Filtern) |
| GET | /api/admin/bookings/export.csv | CSV-Export |
| POST | /api/admin/bookings/:id/sign-owner | Vermieter-Unterschrift |
| GET/POST/PUT/DELETE | /api/admin/companies/* | Firmen CRUD |
| GET/POST/PUT/DELETE | /api/admin/locations/* | Standorte CRUD |
| GET/PUT | /api/admin/pricing/config | Grundpreis lesen/ändern |
| GET/POST/DELETE | /api/admin/discounts/* | Rabatte CRUD |
| GET/POST/DELETE | /api/admin/blackouts/* | Sperrzeiten CRUD |
| GET/POST | /api/admin/templates/* | Vertragsvorlagen |
| POST | /api/admin/invite-tokens | Einladungslink erstellen |
| GET | /api/admin/audit-log | Audit-Log |
