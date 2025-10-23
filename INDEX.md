# 📑 Projektstruktur & Datei-Übersicht

```
stellplatz-system/
├── server.js              ← Express Backend (Hauptdatei)
├── database.js            ← SQLite Datenbank Setup
├── config.js              ← Fahrzeugtypen & Preisstruktur
├── package.json           ← NPM Dependencies
├── .env.example           ← Umgebungsvariablen Vorlage
├── public/
│   ├── booking.html       ← Kundenformular (Buchung + Unterschrift)
│   └── admin.html         ← Admin-Panel (Verwaltung + Unterschrift)
├── README.md              ← Ausführliche Dokumentation
├── QUICKSTART.md          ← Schnelleinstieg
├── SETUP-GUIDE.md         ← Server-Deployment Anleitung
└── stellplatz.db          ← SQLite Datenbank (wird automatisch erstellt)
```

---

## 📄 Dateien im Detail

### Backend-Dateien

**server.js** (Herzstück)
- Express Web-Server
- REST API für Buchungen
- PDF-Generierung
- Admin-Funktionen
- ~350 Zeilen, kommentiert

**database.js**
- SQLite Initialisierung
- Tabellen: locations, vehicle_types, pricing, bookings
- Indexes für Performance

**config.js**
- Fahrzeugtypen (5m bis 8,5m)
- Basis-Preise pro Typ
- Kategorie-Multiplier (außen, überdacht, halle)
- MwSt. Definition

**package.json**
- Dependencies: express, body-parser, pdfkit, better-sqlite3
- Scripts: start, dev, init-db

### Frontend-Dateien

**public/booking.html** (~550 Zeilen)
- Responsive Buchungsformular
- Location, Fahrzeugtyp, Kategorie Auswahl
- Live Preisberechnung
- Signatur-Canvas für digitale Unterschrift
- Mobile-freundlich
- Error-Handling
- Moderne CSS mit Gradient

**public/admin.html** (~400 Zeilen)
- Authentifizierung mit Token
- Dashboard mit Stats
- Buchungstabelle
- PDF-Download pro Vertrag
- Modal für Vermieter-Unterschrift
- Auto-Refresh (30s)

### Dokumentation

**README.md**
- Feature-Übersicht
- Installation
- Konfiguration
- API-Dokumentation
- Datenbankschema
- Deployment-Tipps

**QUICKSTART.md**
- Schnelle lokale Einrichtung
- Locations eintragen
- Workflow erklären
- Fehlerbehandlung
- Nächste Schritte

**SETUP-GUIDE.md**
- Schritt-für-Schritt Server-Setup
- Node.js Installation
- PM2 als Service
- Nginx/Apache Reverse Proxy
- SSL/HTTPS mit Let's Encrypt
- Backup-Strategie
- Häufige Probleme

---

## 🎯 Wie alles zusammenarbeitet

```
1. Kunde erhält Link: https://domain.de/booking.html?location=1

2. booking.html lädt
   ├─ Locations aus /api/locations
   ├─ Preise aus /api/pricing/1
   └─ Zeigt Formular

3. Kunde füllt aus & unterschreibt

4. booking.html sendet POST zu /api/bookings
   server.js speichert in SQLite
   
5. Du gehst zu admin.html

6. admin.html lädt
   ├─ Stats aus /api/admin/dashboard
   └─ Bookings aus /api/admin/bookings

7. Du unterschreibst über Modal
   POST zu /api/admin/bookings/:id/sign-owner

8. server.js aktualisiert Status → "completed"

9. Beide können PDF herunterladen via /api/contract/:id
   (pdfkit generiert PDF aus Booking-Daten)
```

---

## 🔐 Sicherheit

- **Admin Token**: In .env, wird geprüft bei jedem Admin-Request
- **CORS**: Werden später bei Bedarf hinzugefügt
- **Input Validation**: Basic auf Client + Server
- **SQLite Foreign Keys**: Aktiviert zum Schutz der Datenintegrität

---

## 🚀 Schritt-für-Schritt Start

1. **Lokal**: `npm install` + `npm start`
2. **Testen**: booking.html + admin.html im Browser
3. **Locations eintragen**: `sqlite3 stellplatz.db` + INSERTs
4. **Token ändern**: `.env` anpassen
5. **Deployen**: SETUP-GUIDE.md befolgen
6. **Links verteilen**: `booking.html?location=1|2|3`

---

## 📊 Datenbankstruktur

```sql
locations
  ├─ id (Primary Key)
  ├─ name (UNIQUE)
  ├─ company (Firma A oder B)
  └─ city

vehicle_types
  ├─ id (Primary Key)
  ├─ max_length (5.0 - 8.5m, UNIQUE)
  └─ label (bis X,XX m)

pricing
  ├─ id (Primary Key)
  ├─ location_id (Foreign Key)
  ├─ vehicle_type_id (Foreign Key)
  ├─ category (outside|covered|indoor)
  └─ price_per_month

bookings
  ├─ id (Primary Key)
  ├─ location_id (Foreign Key)
  ├─ vehicle_type_id (Foreign Key)
  ├─ category
  ├─ first_name, last_name, address, email
  ├─ start_date, end_date
  ├─ monthly_price, caution
  ├─ status (pending_customer_signature|pending_owner_signature|completed)
  ├─ customer_signature_image (base64 PNG)
  ├─ owner_signature_image (base64 PNG)
  ├─ customer_signature_date, owner_signature_date
  └─ created_at (TIMESTAMP)
```

---

## 🔄 API-Endpoints Übersicht

```
PUBLIC:
  GET  /api/locations
  GET  /api/pricing/:locationId
  POST /api/bookings
  GET  /api/contract/:bookingId

ADMIN (mit Token):
  GET  /api/admin/dashboard
  GET  /api/admin/bookings
  POST /api/admin/bookings/:bookingId/sign-owner
```

---

## 💡 Tipps

- **Preise ändern?** → config.js anpassen, Server neustarten
- **Neue Location?** → sqlite3 CLI oder direkt in DB eintragen
- **Fehler debuggen?** → Browser DevTools (F12) Console anschauen
- **PDFs speichern?** → Temp-Ordner wird automatisch erstellt
- **Backup?** → stellplatz.db regelmäßig kopieren

