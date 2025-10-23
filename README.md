# Stellplatz-Vermietung System

Ein vollständig digitales und automatisiertes System zur Verwaltung von temporären Stellplatz-Vermietungen (Wohnmobile, Wohnwagen, Boote) mit automatischer Vertragserstellung.

## Features

✅ **Digitales Buchungsformular** - Kunden können online buchen mit digitaler Unterschrift
✅ **Automatische Preisberechnung** - Basierend auf Fahrzeuggröße, Standort und Kategorie
✅ **Digitale Unterschriften** - Canvas-basierte Signatur für Kunde und Vermieter
✅ **Admin-Panel** - Vollständige Verwaltung mit Tab-Navigation
✅ **PDF-Vertragserstellung** - Automatische Generierung professioneller Mietverträge
✅ **SQLite Datenbank** - Einfach, zuverlässig, keine externe DB nötig
✅ **Responsive Design** - Funktioniert auf Desktop, Tablet und Smartphone
✅ **Firmen-Management** - Vollständiges CRUD für Firmendaten mit Rechnungsinformationen
✅ **Standort-Management** - Verwaltung mehrerer Stellplätze mit Firmenzuordnung
✅ **Persistente Admin-Session** - Login bleibt über localStorage erhalten
✅ **Integrierte Navigation** - Direktlinks zwischen Admin-Panel und Formularen

## Installation

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. Datenbank einrichten
```bash
npm run init-db  # Erstellt leere Datenbank
npm run seed     # Fügt Beispieldaten ein
```

**ODER beides auf einmal:**
```bash
npm run reset-db
```

### 3. Server starten
```bash
npm start
```

Der Server läuft dann auf `http://localhost:3000`

## Verwendung

### Zugriff auf die Anwendung

- **Homepage:** `http://localhost:3000/`
- **Buchungsformular:** `http://localhost:3000/booking.html`
- **Admin Panel:** `http://localhost:3000/admin.html`

### Admin-Zugang

**Standard Admin Token:** `admin123`

Um das Token zu ändern, setzen Sie die Environment-Variable:
```bash
export ADMIN_TOKEN="your_secure_token"
npm start
```

### Admin-Panel Funktionen

Das Admin-Panel bietet eine **persistente Login-Session** (bleibt auch nach Browser-Neustart erhalten) und hat **3 Hauptbereiche**:

#### 1. **Dashboard Tab**
   - Übersicht aller Buchungen mit Status
   - Statistiken und Kennzahlen
   - Vermieter-Unterschrift direkt im Panel setzen
   - PDF-Verträge generieren und herunterladen
   - Buchungsdetails anzeigen

#### 2. **Firmen Tab**
   - **CRUD-Operationen**: Anlegen, Bearbeiten, Löschen
   - **Detaillierte Felder**:
     - Firmenname
     - Straße und Hausnummer (getrennt)
     - PLZ und Ort (getrennt)
     - Steuernummer
     - Umsatzsteuer-ID
     - Kontoinformationen (IBAN, BIC)
   - **Verwendung**: Firmendaten werden automatisch in PDF-Verträge übernommen

#### 3. **Standorte Tab**
   - **CRUD-Operationen**: Anlegen, Bearbeiten, Löschen
   - **Felder**:
     - Name des Standorts
     - Vollständige Adresse
     - Gebäude-/Bereichsangabe
     - Firmenzuordnung (Dropdown)
   - **Verwendung**: Standorte erscheinen im Buchungsformular

#### Navigation
- **Grüner Button**: Direkt zum Buchungsformular (neuer Tab)
- **Blauer Button**: Zur Homepage (neuer Tab)
- **Roter Button**: Abmelden (löscht Session)

## Datenstruktur

### Companies (Firmen)
Die Firmendaten werden in Verträgen als Vermieter-Information verwendet.

**Pflichtfelder:**
- `name` - Firmenname (muss eindeutig sein)
- `street` - Straße
- `house_number` - Hausnummer
- `postal_code` - Postleitzahl
- `city` - Ort

**Optional:**
- `tax_number` - Steuernummer (z.B. "12/345/67890")
- `vat_id` - Umsatzsteuer-ID (z.B. "DE123456789")
- `bank_account` - Kontoinformationen (IBAN, BIC, mehrzeilig möglich)

### Locations (Standorte)
Standorte repräsentieren physische Stellplätze und werden im Buchungsformular angezeigt.

**Felder:**
- `name` - Name des Standorts (z.B. "Brandenburg Stellplatz A")
- `address` - Vollständige Adresse
- `building_specification` - Gebäude/Bereich (z.B. "Außenbereich Nord", "Halle 1")
- `company_id` - Zugeordnete Firma (Foreign Key)

**Relation:** Jeder Standort gehört zu einer Firma (ON DELETE SET NULL)

### Vehicle Types (Fahrzeugtypen)
8 vordefinierte Größenkategorien für Fahrzeuge:

| max_length | label        |
|-----------|--------------|
| 5.0 m     | bis 5m       |
| 6.0 m     | bis 6m       |
| 6.5 m     | bis 6,5m     |
| 7.0 m     | bis 7m       |
| 7.5 m     | bis 7,5m     |
| 8.0 m     | bis 8m       |
| 8.5 m     | bis 8,5m     |

### Pricing (Preise)
Preise werden automatisch für alle Kombinationen generiert:
- **3 Standorte** × **8 Fahrzeugtypen** × **3 Kategorien** = **72 Preiseinträge**

**Kategorien:**
- `outside` - Außenstellplatz (50% des Basispreises)
- `covered` - Überdachter Stellplatz (75% des Basispreises)
- `indoor` - Hallenstellplatz (100% des Basispreises)

**Beispiel:** Fahrzeug bis 7m in Brandenburg:
- Außen: 62,50 €/Monat
- Überdacht: 93,75 €/Monat
- Halle: 125,00 €/Monat

### Bookings (Buchungen)
Vollständige Mietverträge mit digitalem Workflow.

**Kundendaten:**
- Vorname, Nachname
- Adresse
- E-Mail

**Mietdetails:**
- Standort (location_id)
- Fahrzeugtyp (vehicle_type_id)
- Kategorie (outside/covered/indoor)
- Startdatum, Enddatum
- Monatspreis
- Kaution

**Status-Workflow:**
1. `pending_customer_signature` - Kunde hat gebucht, noch nicht unterschrieben
2. `pending_owner_signature` - Kunde hat unterschrieben, Vermieter muss noch
3. `completed` - Beide Unterschriften vorhanden

**Unterschriften:**
- `customer_signature_image` - Base64-kodiertes PNG
- `customer_signature_date` - Zeitstempel
- `owner_signature_image` - Base64-kodiertes PNG (via Admin-Panel)
- `owner_signature_date` - Zeitstempel

## API Endpoints

### Public APIs
- `GET /api/locations` - Alle Standorte
- `GET /api/pricing/:locationId` - Preise für Standort
- `POST /api/bookings` - Neue Buchung erstellen
- `GET /api/contract/:bookingId` - PDF-Vertrag herunterladen

### Admin APIs (mit Bearer Token)
- `GET /api/admin/dashboard` - Dashboard-Daten
- `GET /api/admin/bookings` - Alle Buchungen
- `POST /api/admin/bookings/:id/sign-owner` - Vermieter-Unterschrift

#### Companies CRUD
- `GET /api/admin/companies` - Alle Firmen
- `GET /api/admin/companies/:id` - Einzelne Firma
- `POST /api/admin/companies` - Neue Firma
- `PUT /api/admin/companies/:id` - Firma aktualisieren
- `DELETE /api/admin/companies/:id` - Firma löschen

#### Locations CRUD
- `GET /api/admin/locations` - Alle Standorte
- `GET /api/admin/locations/:id` - Einzelner Standort
- `POST /api/admin/locations` - Neuer Standort
- `PUT /api/admin/locations/:id` - Standort aktualisieren
- `DELETE /api/admin/locations/:id` - Standort löschen

## Workflow

### Kompletter Buchungsablauf

#### Phase 1: Vorbereitung (einmalig)
1. **Admin-Panel öffnen** (`http://localhost:3000/admin.html`)
2. **Firmen anlegen** im "Firmen"-Tab (mit allen Rechnungsdetails)
3. **Standorte anlegen** im "Standorte"-Tab (mit Firmenzuordnung)
4. System generiert automatisch **72 Preise** beim Seeding

#### Phase 2: Kundenbuchung
1. **Kunde** findet Ihr Angebot (z.B. auf Kleinanzeigen.de, eBay, etc.)
2. **Sie** senden dem Kunden den Link:
   - Direkt: `https://yourserver.com/booking.html`
   - Mit Standort vorausgewählt: `https://yourserver.com/booking.html?location=1`
3. **Kunde** öffnet Buchungsformular und wählt:
   - Standort (falls nicht vorausgewählt)
   - Fahrzeuggröße
   - Kategorie (Außen/Überdacht/Halle)
   - Mietdauer (Start-/Enddatum)
4. System berechnet **automatisch**:
   - Monatspreis
   - Kaution (2 Monatsmieten)
   - Gesamtkosten
5. **Kunde** gibt persönliche Daten ein
6. **Kunde** unterschreibt digital auf dem Canvas
7. **System** speichert Buchung mit Status `pending_owner_signature`

#### Phase 3: Vermieter-Bestätigung
1. **Sie** öffnen Admin-Panel → Dashboard-Tab
2. Neue Buchung erscheint mit Status **"Pending Owner Signature"**
3. **Sie** klicken auf "Unterschreiben"
4. **Sie** unterschreiben digital im Modal
5. **System** aktualisiert Status auf `completed`
6. **Unterschreiben-Button** verschwindet, **PDF-Button** wird aktiv

#### Phase 4: Vertragsversand
1. **Sie** klicken auf "Download PDF"
2. System generiert **professionellen Mietvertrag** mit:
   - Firmendaten (aus Companies-Tabelle)
   - Standortdaten (aus Locations-Tabelle)
   - Kundendaten
   - Mietdetails
   - Beiden Unterschriften (inkl. Zeitstempel)
3. **Sie** senden PDF per E-Mail an Kunden
4. **Fertig!** Buchung ist abgeschlossen

### Wiederkehrende Workflows

**Neuer Standort hinzufügen:**
1. Admin-Panel → Standorte-Tab → "Neue Standorte"
2. Daten eingeben, Firma zuordnen → Speichern
3. System aktualisiert automatisch Preistabelle
4. Standort erscheint sofort im Buchungsformular

**Firma bearbeiten:**
1. Admin-Panel → Firmen-Tab → Firma auswählen → "Bearbeiten"
2. Änderungen vornehmen → Speichern
3. Änderungen werden in zukünftigen PDFs verwendet

## Konfiguration

### Preisstruktur anpassen

Bearbeiten Sie `config.js`:

```javascript
const BASE_PRICES = {
  5.0: 100,    // Basispreis für bis 5m
  6.0: 115,    // Basispreis für bis 6m
  // ...
};

const CATEGORY_MULTIPLIERS = {
  outside: 0.50,   // 50% des Basispreises
  covered: 0.75,   // 75% des Basispreises
  indoor: 1.0      // 100% des Basispreises
};
```

Nach Änderungen:
```bash
npm run reset-db  # Datenbank neu aufsetzen
npm start         # Server neu starten
```

## Deployment

### Auf einem Server

```bash
# 1. Code auf Server laden
git clone <your-repo> oder scp/sftp

# 2. Dependencies installieren
npm install

# 3. Datenbank einrichten
npm run reset-db

# 4. Environment-Variable setzen (optional)
export ADMIN_TOKEN="your_secure_token"
export PORT=3000

# 5. Mit PM2 starten (empfohlen)
npm install -g pm2
pm2 start server.js --name "stellplatz"
pm2 save
pm2 startup  # Autostart konfigurieren
```

### Mit Nginx (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Datenbank zurücksetzen

```bash
npm run reset-db
```

**Was passiert:**
- Löscht `stellplatz.db` komplett
- Erstellt neue Datenbank mit Schema
- Fügt Beispieldaten ein (2 Firmen, 3 Standorte, 8 Fahrzeugtypen, 72 Preise)
- **ACHTUNG:** Alle Buchungen gehen verloren!

### Admin Login funktioniert nicht

**Symptom:** "Unauthorized" Meldung beim Login

**Lösungen:**
1. Standard-Token verwenden: `admin123`
2. Browser-localStorage löschen:
   ```javascript
   // In Browser-Konsole (F12):
   localStorage.clear()
   ```
3. Server-seitiges Token prüfen:
   ```bash
   # Token wurde gesetzt?
   echo $ADMIN_TOKEN

   # Falls leer, Standard ist "admin123"
   ```
4. Browser-Konsole (F12) auf Fehler prüfen

**Persistentes Login deaktivieren:**
- Browser-localStorage löschen
- Seite neu laden

### Preise werden nicht angezeigt

**Symptom:** Buchungsformular zeigt "Keine Preise verfügbar"

**Diagnose:**
```bash
sqlite3 stellplatz.db "SELECT COUNT(*) FROM pricing;"
```

**Sollwert:** 72 (bei 3 Standorten)

**Wenn 0:**
```bash
npm run seed
```

**Wenn Fehler:** "UNIQUE constraint failed"
```bash
npm run reset-db
```

### Standorte erscheinen nicht im Buchungsformular

**Ursachen:**
1. Keine Standorte angelegt → Admin-Panel → Standorte-Tab
2. Keine Firma zugeordnet → Standort bearbeiten, Firma auswählen
3. Keine Preise → `npm run seed`

**Prüfen:**
```bash
sqlite3 stellplatz.db "SELECT * FROM locations;"
sqlite3 stellplatz.db "SELECT COUNT(*) FROM pricing WHERE location_id = 1;"
```

### PDF-Generierung schlägt fehl

**Symptom:** Fehler beim PDF-Download

**Lösungen:**
1. `temp/` Verzeichnis erstellen:
   ```bash
   mkdir -p temp
   chmod 755 temp
   ```
2. Fehlende Firmendaten → Admin-Panel → Firmen-Tab ausfüllen
3. Server-Logs prüfen:
   ```bash
   pm2 logs stellplatz
   # oder bei direktem Start:
   # Im Terminal wo `npm start` läuft
   ```

### "Foreign Key constraint failed" Fehler

**Beim Löschen einer Firma:**
- Firma wird noch von Standorten referenziert
- **Lösung:** Erst Standorte löschen oder andere Firma zuweisen

**Beim Erstellen eines Standorts:**
- Firma-ID existiert nicht
- **Lösung:** Erst Firma anlegen, dann Standort

### Server startet nicht

**Port 3000 bereits belegt:**
```bash
# Prozess finden
lsof -ti:3000

# Prozess beenden
kill $(lsof -ti:3000)

# ODER anderen Port verwenden
PORT=3001 npm start
```

**Dependencies fehlen:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Buchung wird nicht gespeichert

**Browser-Konsole prüfen (F12):**
- Netzwerk-Tab → Anfrage an `/api/bookings` prüfen
- Fehler 400 → Validierung fehlgeschlagen (Felder ausfüllen)
- Fehler 500 → Server-Logs prüfen

**Häufige Ursachen:**
- Unterschrift fehlt → Canvas neu unterschreiben
- Enddatum vor Startdatum → Daten korrigieren
- Keine Preise für Kombination → `npm run seed`

## Entwicklung

### Development-Server starten
```bash
# Mit Auto-Reload (nodemon erforderlich)
npm run dev

# Normale Ausführung
npm start
```

### Datenbank-Verwaltung
```bash
# Interaktive SQLite-Shell
sqlite3 stellplatz.db

# Nützliche Queries:
sqlite> .tables                              # Alle Tabellen anzeigen
sqlite> .schema companies                    # Schema anzeigen
sqlite> SELECT * FROM bookings;              # Alle Buchungen
sqlite> SELECT COUNT(*) FROM pricing;        # Preise zählen
sqlite> .mode column                         # Schönere Ausgabe
sqlite> .headers on                          # Spaltenüberschriften
sqlite> .quit                                # Beenden
```

### Logs überwachen
```bash
# Mit PM2
pm2 logs stellplatz
pm2 logs stellplatz --lines 100

# Direct
# Im Terminal wo `npm start` läuft
```

### Testing-Workflow
1. **Datenbank zurücksetzen**: `npm run reset-db`
2. **Server starten**: `npm start`
3. **Browser öffnen**: `http://localhost:3000`
4. **Admin-Login**: Token `admin123`
5. **Testbuchung erstellen**:
   - Buchungsformular öffnen
   - Standort wählen
   - Formulare ausfüllen
   - Unterschreiben
6. **Im Admin unterschreiben**
7. **PDF herunterladen**

### Code-Struktur
```
rent-it-digital/
├── server.js           # Express-Server + API-Endpunkte
├── database.js         # SQLite-Schema + Initialisierung
├── seed.js             # Beispieldaten
├── config.js           # Preis-Konfiguration
├── package.json        # Dependencies + Scripts
├── stellplatz.db       # SQLite-Datenbank (generiert)
├── public/
│   ├── index.html      # Homepage
│   ├── booking.html    # Buchungsformular
│   └── admin.html      # Admin-Panel (Tabs + CRUD)
└── temp/               # PDF-Generierung (temporär)
```

## Technologie-Stack

- **Backend**: Node.js + Express.js
- **Datenbank**: SQLite3 (better-sqlite3)
- **PDF**: PDFKit
- **Frontend**: Vanilla JavaScript + HTML5 + CSS3
- **Signatur**: HTML5 Canvas API
- **Auth**: Bearer Token (localStorage)

## Sicherheitshinweise

⚠️ **Für Produktivbetrieb beachten:**

1. **Admin-Token ändern:**
   ```bash
   export ADMIN_TOKEN="your_very_secure_random_token_here"
   ```
   Verwenden Sie einen starken, zufälligen Token (mind. 32 Zeichen)

2. **HTTPS verwenden:**
   - Nginx mit Let's Encrypt SSL-Zertifikat
   - Nie unverschlüsselt über öffentliches Internet

3. **Datenbank-Backups:**
   ```bash
   # Täglich Backup erstellen
   cp stellplatz.db backups/stellplatz_$(date +%Y%m%d).db
   ```

4. **Rate Limiting:**
   - Express-Rate-Limit für API-Endpunkte empfohlen
   - Schutz vor Brute-Force-Angriffen

5. **Eingabe-Validierung:**
   - Bereits implementiert für kritische Felder
   - XSS-Schutz durch PDFKit-Encoding

6. **Dateisystem:**
   - `temp/` Verzeichnis regelmäßig aufräumen
   - Alte PDFs automatisch löschen

## Lizenz

Proprietary - Alle Rechte vorbehalten

## Support

Bei Fragen oder Problemen:
- Troubleshooting-Sektion konsultieren
- Browser-Konsole (F12) auf Fehler prüfen
- Server-Logs überprüfen

---
**Version:** 1.0.0
**Letzte Aktualisierung:** Oktober 2025
**Node.js Version:** ≥ 18.x empfohlen
**Status:** Production Ready ✅
