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
├── server-v2.js          # Express Backend (alle API-Routes, PDF-Generierung)
├── database-v2.js        # SQLite Schema, Migrationen, Default-Template
├── pricing.js            # Preisformel, Template-Engine, Rabatte, Kaution
├── validation.js         # Express-Validator Middleware
├── auth.js               # JWT Auth + Audit-Logging
├── email.js              # E-Mail-Versand via Resend (Bestätigung, Admin, Vertrag-PDF)
├── config.js             # Fahrzeugtypen-Konfiguration
├── .env                  # Umgebungsvariablen (RESEND_API_KEY, JWT_SECRET)
├── stellplatz.db         # SQLite Datenbank (wird automatisch erstellt)
├── public/
│   ├── admin.html        # Admin-Dashboard (Tabs: Dashboard, Firmen, Standorte, Preise)
│   ├── booking-v2.html   # Buchungsformular
│   ├── booking-v2.js     # Buchungsformular JS
│   └── index.html        # Landing Page
├── CLAUDE-CODE-SPEC.md   # Ursprüngliche Spezifikation
└── SETUP-GUIDE.md        # Diese Datei
```

## Umgebungsvariablen (.env)

```
RESEND_API_KEY=re_xxx          # Resend API Key für E-Mail-Versand
JWT_SECRET=xxx                 # JWT Secret (optional, wird sonst zufällig generiert)
EMAIL_FROM=Name <x@domain.com> # Absender-Adresse (optional)
PORT=3007                      # Server-Port (default: 3000)
BASE_URL=https://str...        # Basis-URL für Links in E-Mails
```

## E-Mail-Versand

E-Mails werden über [Resend](https://resend.com) versendet. Drei Trigger:

| Trigger | Empfänger | Inhalt |
|---|---|---|
| Neue Buchung | Kunde | Buchungsbestätigung mit Zusammenfassung |
| Neue Buchung | Vermieter (Firma-Email) | Benachrichtigung + Deeplink zum Admin-Panel |
| Vertrag abgeschlossen | Kunde + Vermieter | Vollständiger Vertrag als PDF-Anhang |

Die Absender-Adresse kann pro Firma im Admin-Panel unter "Firmen → E-Mail" konfiguriert werden.
Im Vertrag wird die dort hinterlegte E-Mail als Kontaktadresse verwendet.

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

**Kaution:** 1 Monatsmiete (brutto)

Der Grundpreis wird in der `settings`-Tabelle gespeichert und über `Admin → Preise` geändert.

## Vertragstemplate

Das Vertragstemplate ist in der Datenbank gespeichert (`contract_templates`-Tabelle) und verwendet eine Handlebars-ähnliche Syntax:

- `{{variable}}` — Variablen-Ersetzung
- `{{#if variable}}...{{/if}}` — Bedingte Anzeige
- `{{#unless variable}}...{{/unless}}` — Anzeige wenn Variable nicht gesetzt

Wichtige Template-Variablen:
- `access_code` — Schlüsseltresor-Code (aus Location, wenn vorhanden)
- `company_email` — E-Mail der Firma (aus Company)
- `discount_code` / `discount_amount` — nur angezeigt wenn Rabatt > 0

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

**Hinweis:** Beim Löschen von Standorten/Firmen werden alle abhängigen Datensätze (Buchungen, Invite-Tokens, Blackouts, Pricing-Rules, Rabatte) automatisch mit gelöscht (nach Bestätigung).

## Production Server

### Zugangsdaten

| | |
|---|---|
| **Host** | labs.remoterepublic.com |
| **User** | deploy |
| **App-Pfad** | /opt/str |
| **PM2-Prozess** | str |
| **Port** | 3007 |
| **URL** | https://str.remoterepublic.com |
| **Git Remote** | github.com:karlgrey/digital-contracts.git |
| **Reverse Proxy** | Caddy (auto-HTTPS) |

### Deployment

```bash
# 1-Liner: Pull + Restart
ssh deploy@labs.remoterepublic.com 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd /opt/str && git checkout -- package-lock.json && git pull origin main && npm install && pm2 restart str'
```

### Einzelschritte (bei Problemen)

```bash
# Verbinden
ssh deploy@labs.remoterepublic.com

# NVM laden (nötig für node/pm2)
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# In App-Verzeichnis
cd /opt/str

# Lock-File zurücksetzen (bei Konflikten)
git checkout -- package-lock.json

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
pm2 logs str --nostream     # Letzter Log-Output
pm2 flush str               # Logs leeren
pm2 restart str             # Neustart
pm2 stop str                # Stoppen
pm2 describe str            # Details (Pfad, PID, Uptime, etc.)
```

### Datenbank-Backup (Server)

```bash
ssh deploy@labs.remoterepublic.com 'cp /opt/str/stellplatz.db /opt/str/stellplatz_backup_$(date +%Y%m%d).db'
```

### Template in Production-DB aktualisieren

Das Default-Template in `database-v2.js` wird nur bei einer neuen DB angewendet. Um das Template in einer bestehenden DB zu aktualisieren:

```bash
ssh deploy@labs.remoterepublic.com 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd /opt/str && node -e "
const db = require(\"./database-v2\");
db.prepare(\"UPDATE contract_templates SET body_md = ? WHERE is_active = 1\").run(NEUER_TEMPLATE_TEXT);
"'
```

Oder im Admin-Panel unter Vertragsvorlagen bearbeiten.

## API-Übersicht

### Public
| Methode | Endpoint | Beschreibung |
|---|---|---|
| GET | /api/locations | Alle Standorte |
| GET | /api/vehicle-types | Alle Fahrzeugtypen |
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
| DELETE | /api/admin/bookings/:id | Buchung löschen |
| GET/POST/PUT/DELETE | /api/admin/companies/* | Firmen CRUD |
| GET/POST/PUT/DELETE | /api/admin/locations/* | Standorte CRUD |
| GET/PUT | /api/admin/pricing/config | Grundpreis lesen/ändern |
| GET/POST/DELETE | /api/admin/discounts/* | Rabatte CRUD |
| GET/POST/DELETE | /api/admin/blackouts/* | Sperrzeiten CRUD |
| GET/POST | /api/admin/templates/* | Vertragsvorlagen |
| POST | /api/admin/invite-tokens | Einladungslink erstellen |
| GET | /api/admin/audit-log | Audit-Log |

### Deeplinks
| URL | Beschreibung |
|---|---|
| /booking?location=1 | Buchungsformular mit vorausgewähltem Standort |
| /booking?invite=TOKEN | Buchungsformular mit Invite-Token |
| /admin.html | Admin-Panel (Login erforderlich) |
