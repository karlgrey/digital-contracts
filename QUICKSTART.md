# 🚀 Quick Start

## Lokal testen (vor Upload auf Server)

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. Server starten
```bash
npm start
```

### 3. Im Browser öffnen
- Buchungsformular: http://localhost:3000/booking.html
- Admin-Panel: http://localhost:3000/admin.html
  - Token: `admin123`

---

## 📋 Wichtig: Vor dem Upload auf deinen Server

### 1. Locations + Preise einrichten

Die Preisstruktur ist in `config.js` bereits korrekt konfiguriert:
- **Basis-Preise**: 100€ bis 160€ (je nach Fahrzeuggröße)
- **Kategorien**: 
  - Außen: 50% des Basispreises
  - Überdacht: 75% des Basispreises
  - Halle: 100% des Basispreises

### 2. Deine 3 Locations eintragen

Nach dem ersten Start die Locations in der Datenbank eintragen:

```bash
sqlite3 stellplatz.db

# Im SQLite-Prompt:
INSERT INTO locations (name, company, city) VALUES ('Location 1', 'Firma A GmbH', 'Brandenburg');
INSERT INTO locations (name, company, city) VALUES ('Location 2', 'Firma A GmbH', 'Brandenburg');
INSERT INTO locations (name, company, city) VALUES ('Location 3', 'Firma B GmbH', 'Brandenburg');

SELECT * FROM locations;
.quit
```

### 3. Admin-Token ändern
Bearbeite `.env` und setze einen sicheren Token:
```
ADMIN_TOKEN=dein_sehr_sicheres_token_123456
```

---

## 🔗 Links für Kunden (Kleinanzeigen)

Nach dem Deployment schickst du deinen Kunden diese Links:

**Für Location 1:**
```
https://deine-domain.de/booking.html?location=1
```

**Für Location 2:**
```
https://deine-domain.de/booking.html?location=2
```

**Für Location 3:**
```
https://deine-domain.de/booking.html?location=3
```

Der `?location=X` Parameter setzt die Location bereits vor.

---

## 📱 Workflow für dich

1. **Kunde klickt auf Link** mit vorausgewählter Location
2. **Kunde füllt Formular** (Name, Adresse, Email, Mietdauer, Fahzeuggröße)
3. **Kunde unterschreibt** digital mit dem Signatur-Canvas
4. **System speichert** alles mit der digitalen Unterschrift
5. **Du gehst ins Admin-Panel** (http://deine-domain.de/admin.html)
6. **Du schaust die Buchung** an (PDF-Download möglich)
7. **Du unterschreibst** digital im Admin-Panel
8. **Vertrag ist fertig** und kann an beide Parteien versendet werden

---

## 📄 Vertrag-PDF

Der Vertrag wird automatisch generiert mit:
- Standort + Firma
- Kundendaten
- Fahrzeugtyp + Kategorie
- Mietdauer
- Monatliche Miete + Gesamtpreis (mit MwSt)
- Kaution
- Standart-Bedingungen (nur Abstellen, kein Strom, etc.)
- Unterschrift-Felder

---

## 🔧 Troubleshooting

**Problem: Port 3000 ist bereits belegt**
```bash
npm start -- --port 3001
```

**Problem: Datenbank-Fehler**
```bash
rm stellplatz.db
npm run init-db
```

**Problem: Admin-Panel lädt nicht**
- Prüfe den Token in der `.env`
- Browser F12 → Console nach Fehlern schauen

---

## 🎯 Nächste Schritte

1. Lokal testen ✓
2. Server-Setup (SETUP-GUIDE.md lesen)
3. Auf deinen Live-Server deployen
4. Deine 3 Locations in der Datenbank eintragen
5. Admin-Token ändern
6. Links zu deinen Kunden schicken

Viel Erfolg! 🚀
