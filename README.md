# Stellplatz-Vermietung — Digitales Buchungssystem

Volldigitales Buchungs- und Vertragssystem für Stellplatzvermietung (Wohnmobile, Wohnwagen, Boote). Kunden buchen online, unterschreiben digital, Verträge werden automatisch als PDF generiert und per E-Mail versendet.

## Features

- **Online-Buchungsformular** mit Standortauswahl, Fahrzeuggröße, Zeitraum und digitaler Unterschrift
- **Automatische Preisberechnung** aus einem Grundpreis (Längenzuschlag + Kategoriefaktor)
- **PDF-Vertragsgenerierung** mit beiden Unterschriften (SVG)
- **E-Mail-Versand** via Resend (Buchungsbestätigung, Admin-Benachrichtigung, Vertrag als PDF)
- **Admin-Panel** mit Dashboard, Firmen-, Standort- und Preisverwaltung
- **JWT-Authentifizierung** mit Audit-Logging
- **Rabattcodes & Sperrzeiten** pro Standort
- **Einladungslinks** für Standort-spezifische Buchungen
- **AGB & Datenschutzerklärung** (DSGVO-konform)
- **Editierbares Vertragstemplate** mit Handlebars-ähnlicher Syntax

## Schnellstart

```bash
npm install
node server-v2.js
```

Das System läuft auf `http://localhost:3000`. Die SQLite-Datenbank wird beim ersten Start automatisch erstellt.

## URLs

| URL | Beschreibung |
|-----|-------------|
| `/booking` | Buchungsformular |
| `/booking?location=1` | Buchung mit vorausgewähltem Standort |
| `/booking?invite=TOKEN` | Buchung mit Einladungslink |
| `/admin` | Admin-Panel (Login erforderlich) |
| `/agb` | Allgemeine Geschäftsbedingungen |
| `/datenschutz` | Datenschutzerklärung |

## Tech Stack

- **Backend:** Node.js + Express
- **Datenbank:** SQLite (better-sqlite3, WAL-Modus)
- **PDF:** PDFKit
- **E-Mail:** Resend
- **Auth:** JWT (jsonwebtoken)
- **Validierung:** express-validator
- **Frontend:** Vanilla JS + HTML5 + CSS3

## Dokumentation

Detaillierte Dokumentation zu Setup, Deployment, API-Endpoints, Preisformel und Vertragstemplate: **[SETUP-GUIDE.md](SETUP-GUIDE.md)**

## Lizenz

Proprietary — All rights reserved
