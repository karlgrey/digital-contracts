# Vertragskündigung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stellplatzmietverträge nach Ablauf der Mindestlaufzeit zum Monatsende kündbar machen — beidseitig (Kunde via Deeplink, Vermieter via Admin), digital unterschrieben, als eigenständiges Nachtrag-PDF an beide Parteien versendet.

**Architecture:** Neues, isoliertes Modul `cancellation.js` hält die testbare Datumslogik, Token-Erzeugung, DB-Zugriff und den Bau des Nachtrag-PDF. `server-v2.js` bekommt nur schlanke Routes, die an das Modul delegieren. Der Kündigungs-Deeplink wird beim Bau des bestehenden Vertrags-PDF injiziert (nicht ins Markdown-Template), damit auch Altverträge mit gepinnter Template-Version ihn erhalten. Frontend: eigenständige `public/cancellation.html` + `public/cancellation.js`, die das bestehende Signatur-Pad-Muster wiederverwenden.

**Tech Stack:** Node.js + Express, better-sqlite3 (WAL), PDFKit, Resend (`email.js`), express-validator, Vanilla-JS-Frontend, `node --test` (eingebaut) für Unit-Tests.

## Global Constraints

- Sprache aller nutzersichtbaren Texte (UI, PDF, E-Mail, Vertragsklauseln): **Deutsch**.
- Token erzeugen wie bestehend: `crypto.randomBytes(32).toString('hex')`.
- Signatur-Validierung über bestehende `pricing.validateSignature(svg)` — gibt `{ valid, error }` zurück.
- Audit-Logging über bestehende `auth.logAudit(db, role, action, entityType, entityId, meta, ip, userAgent)`.
- Client-IP/User-Agent immer als String: `String(req.ip || req.connection?.remoteAddress || 'unknown')`, `String(req.get('user-agent') || 'unknown')`.
- Migrationen idempotent (Spalten nur via `ALTER TABLE ... ADD COLUMN` wenn nicht vorhanden, Muster aus `checkAndMigrateBookings`).
- `notice_period_days` der Buchung (Default 30) ist die Kündigungsfrist in Tagen.
- Nur Verträge mit Status `completed` sind kündbar; pro Buchung genau **eine** Kündigung.
- Keine neuen npm-Dependencies (PDFKit, crypto, resend sind vorhanden).

---

### Task 1: Repo-Cleanup & Doku-Fixes (vorbereitend, unabhängig)

Räumt v1-Altlasten weg und korrigiert die Doku-Ungenauigkeiten, damit das Feature auf sauberem Stand aufsetzt. Unabhängig vom Feature, aber vom Auftraggeber als Erstes gewünscht.

**Files:**
- Delete: `server.js`, `server-v1-backup.js`, `database.js`, `seed.js`, `migrate-to-v2.js`, `migrate-add-svg-signatures.js`, `public/_old_files/` (gesamtes Verzeichnis)
- Modify: `package.json` (scripts), `SETUP-GUIDE.md`, `README.md`

- [ ] **Step 1: v1-Altlasten löschen**

```bash
git rm server.js server-v1-backup.js database.js seed.js migrate-to-v2.js migrate-add-svg-signatures.js
git rm -r public/_old_files
```

- [ ] **Step 2: `package.json` scripts auf v2 umstellen**

In `package.json` den `scripts`-Block ersetzen (entfernt Verweise auf gelöschte Dateien):

```json
  "main": "server-v2.js",
  "scripts": {
    "start": "node server-v2.js",
    "dev": "nodemon server-v2.js",
    "test": "node --test"
  },
```

- [ ] **Step 3: Doku-Ungenauigkeiten in `SETUP-GUIDE.md` korrigieren**

Vier Korrekturen:
1. In der API-Tabelle die Zeile `| GET | /api/vehicle-types | Alle Fahrzeugtypen |` **entfernen** (Endpoint existiert nicht; Fahrzeugtypen kommen über `/api/pricing/:locationId`).
2. In der Projektstruktur die Zeile `├── CLAUDE-CODE-SPEC.md   # Ursprüngliche Spezifikation` **entfernen** (Datei existiert nicht).
3. In der Admin-API-Tabelle ergänzen: `| GET/POST/DELETE | /api/admin/pricing/overrides | Preis-Overrides |` und `| PUT | /api/admin/discounts/:id/toggle | Rabatt aktiv/inaktiv |`.
4. Unter „Public"-API ergänzen: `| GET | /healthz | Health-Check |` und unter Admin `| POST | /api/admin/auth/logout | Logout |`.

- [ ] **Step 4: README prüfen** — `README.md` Schnellstart sagt Port 3000; das ist korrekt (lokaler Default). Keine Änderung nötig, nur verifizieren.

- [ ] **Step 5: Server startet weiterhin**

Run: `node -e "require('./database-v2.js')" && echo OK`
Expected: Ausgabe endet mit `✓ Database v2 initialized with WAL mode` und `OK`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Remove v1 legacy files and fix doc inaccuracies"
```

---

### Task 2: Datumslogik & Token (Pure Functions, TDD)

Das testbare Herzstück: Berechnung des Wirksamkeitsdatums und Token-Erzeugung. Reine Funktionen, keine DB.

**Files:**
- Create: `cancellation.js`
- Test: `test/cancellation.test.js`

**Interfaces:**
- Produces:
  - `calculateEffectiveDate(todayISO: string, endDateISO: string, noticePeriodDays: number): string` — gibt das Wirksamkeitsdatum als `YYYY-MM-DD` zurück: erstes Monatsende, das ≥ `today + noticePeriodDays` UND ≥ `endDate` (Ende Mindestlaufzeit) ist.
  - `generateCancellationToken(): string` — 64-stelliger Hex-String.

- [ ] **Step 1: Failing test schreiben**

Create `test/cancellation.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { calculateEffectiveDate, generateCancellationToken } = require('../cancellation');

test('effective date = end of minimum-term month when notice is shorter', () => {
  // Mindestlaufzeit endet 31.07., heute 22.06., Frist 30 Tage (earliest 22.07.)
  // lowerBound = max(22.07., 31.07.) = 31.07. -> Monatsende Juli
  assert.strictEqual(calculateEffectiveDate('2026-06-22', '2026-07-31', 30), '2026-07-31');
});

test('effective date = end of month after notice when min-term already passed', () => {
  // heute 22.06., Mindestlaufzeit endete 30.06., Frist 30 Tage (earliest 22.07.) -> Monatsende Juli
  assert.strictEqual(calculateEffectiveDate('2026-06-22', '2026-06-30', 30), '2026-07-31');
});

test('effective date rolls into next year correctly', () => {
  // heute 05.01.2026, min-term lange vorbei, Frist 30 (earliest 04.02.) -> Monatsende Februar
  assert.strictEqual(calculateEffectiveDate('2026-01-05', '2025-12-31', 30), '2026-02-28');
});

test('token is 64 hex chars and unique', () => {
  const a = generateCancellationToken();
  const b = generateCancellationToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notStrictEqual(a, b);
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `node --test test/cancellation.test.js`
Expected: FAIL — `Cannot find module '../cancellation'`.

- [ ] **Step 3: Minimale Implementierung**

Create `cancellation.js`:

```javascript
const crypto = require('crypto');

/**
 * Berechnet das Wirksamkeitsdatum einer Kündigung:
 * erstes Monatsende, das >= (heute + Frist) UND >= Ende der Mindestlaufzeit ist.
 * Alle Daten als ISO-String 'YYYY-MM-DD'. UTC-basiert (zeitzonenstabil).
 */
function calculateEffectiveDate(todayISO, endDateISO, noticePeriodDays) {
  const earliest = new Date(todayISO + 'T00:00:00Z');
  earliest.setUTCDate(earliest.getUTCDate() + noticePeriodDays);

  const minTermEnd = new Date(endDateISO + 'T00:00:00Z');
  const lowerBound = earliest.getTime() > minTermEnd.getTime() ? earliest : minTermEnd;

  // Letzter Tag des Monats von lowerBound (Tag 0 des Folgemonats)
  const monthEnd = new Date(Date.UTC(lowerBound.getUTCFullYear(), lowerBound.getUTCMonth() + 1, 0));
  return monthEnd.toISOString().slice(0, 10);
}

function generateCancellationToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { calculateEffectiveDate, generateCancellationToken };
```

- [ ] **Step 4: Test ist grün**

Run: `node --test test/cancellation.test.js`
Expected: PASS — 4/4 Tests.

- [ ] **Step 5: Commit**

```bash
git add cancellation.js test/cancellation.test.js
git commit -m "Add cancellation date calculation and token generation"
```

---

### Task 3: Datenbank-Schema (Tabelle, Spalte, Backfill)

**Files:**
- Modify: `database-v2.js`

**Interfaces:**
- Produces: Tabelle `contract_cancellations`; Spalte `bookings.cancellation_token`; alle bestehenden Buchungen haben ein Token.

- [ ] **Step 1: `cancellation_token` zur bookings-Migrationsliste hinzufügen**

In `database-v2.js`, im Array `newColumns` (in `checkAndMigrateBookings`, ~Zeile 233) ergänzen:

```javascript
      'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP',
      'cancellation_token TEXT'
```

- [ ] **Step 2: Tabelle `contract_cancellations` anlegen**

In `database-v2.js` im großen `exec()`-Schema-Block (nach der `audit_log`-Tabelle) ergänzen:

```sql
  CREATE TABLE IF NOT EXISTS contract_cancellations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    initiated_by TEXT NOT NULL CHECK(initiated_by IN ('customer', 'owner')),
    reason TEXT,
    notice_date DATE NOT NULL,
    effective_date DATE NOT NULL,
    signature_svg TEXT,
    signature_image TEXT,
    signature_date DATETIME,
    signer_ip TEXT,
    signer_user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );
```

- [ ] **Step 3: Backfill-Funktion für bestehende Buchungen**

In `database-v2.js`, neue Funktion vor dem „Run migrations"-Block. `crypto` wird oben im File importiert (`const crypto = require('crypto');` ergänzen falls nicht vorhanden):

```javascript
const backfillCancellationTokens = () => {
  try {
    const rows = db.prepare('SELECT id FROM bookings WHERE cancellation_token IS NULL').all();
    const update = db.prepare('UPDATE bookings SET cancellation_token = ? WHERE id = ?');
    for (const row of rows) {
      update.run(crypto.randomBytes(32).toString('hex'), row.id);
    }
    if (rows.length > 0) console.log(`✓ Backfilled cancellation_token for ${rows.length} bookings`);
  } catch (error) {
    console.error('Backfill cancellation_token error:', error);
  }
};
```

Im „Run migrations"-Block aufrufen (nach `checkAndMigrateBookings();`):

```javascript
backfillCancellationTokens();
```

- [ ] **Step 4: Verifizieren — Schema & Backfill**

Run:
```bash
node -e "const db=require('./database-v2'); const c=db.prepare('PRAGMA table_info(bookings)').all().some(x=>x.name==='cancellation_token'); const t=db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='contract_cancellations'\").get(); const n=db.prepare('SELECT COUNT(*) c FROM bookings WHERE cancellation_token IS NULL').get().c; console.log('col:',c,'table:',!!t,'null_tokens:',n);"
```
Expected: `col: true table: true null_tokens: 0`

- [ ] **Step 5: Commit**

```bash
git add database-v2.js
git commit -m "Add contract_cancellations table and cancellation_token column"
```

---

### Task 4: Token bei Buchungserstellung setzen

**Files:**
- Modify: `server-v2.js:514-545` (Booking-INSERT in `POST /api/bookings`)

**Interfaces:**
- Consumes: `generateCancellationToken()` aus `cancellation.js`.
- Produces: Neue Buchungen erhalten direkt ein `cancellation_token`.

- [ ] **Step 1: Modul importieren**

Oben in `server-v2.js` bei den Requires ergänzen:

```javascript
const cancellation = require('./cancellation');
```

- [ ] **Step 2: INSERT um `cancellation_token` erweitern**

In `POST /api/bookings` den INSERT (~Zeile 514) anpassen — Spalte und Platzhalter ergänzen und den Token-Wert mitgeben. Spaltenliste: `... status, idempotency_key, cancellation_token` und ein zusätzliches `?`. Beim `stmt.run(...)` als letzten Wert ergänzen:

```javascript
      cancellation.generateCancellationToken()
```

(Der bisherige letzte gebundene Wert ist `idempotencyKey ? String(idempotencyKey) : null` — danach das Token anhängen, und im VALUES-String das zugehörige `?` ergänzen.)

- [ ] **Step 3: Verifizieren — neue Buchung hat Token**

Server starten (`node server-v2.js` im Hintergrund), dann eine Test-Buchung anlegen oder per SQL prüfen, dass der INSERT keine Spaltenfehler wirft:
Run: `node -e "require('./database-v2'); console.log('schema ok')"` und manueller Smoke-Test über das Buchungsformular (eine Buchung absenden → in DB `SELECT cancellation_token FROM bookings ORDER BY id DESC LIMIT 1` ist gesetzt).
Expected: Token (64 Hex-Zeichen) vorhanden, kein SQL-Fehler im Server-Log.

- [ ] **Step 4: Commit**

```bash
git add server-v2.js
git commit -m "Generate cancellation_token on booking creation"
```

---

### Task 5: DB-Helper & Nachtrag-PDF in cancellation.js

> **Designentscheidung (vom Auftraggeber, ersetzt Plan-Default):** Der SVG-Signatur-Renderer wird NICHT in cancellation.js dupliziert, sondern in ein neues, gemeinsames Modul `pdf-utils.js` extrahiert, das sowohl `server-v2.js` als auch `cancellation.js` importieren. Keine Logik-Duplikation, kein Zirkelbezug.

**Files:**
- Create: `pdf-utils.js`
- Modify: `server-v2.js` (lokales `renderSVGSignature` durch Import ersetzen)
- Modify: `cancellation.js`
- Test: `test/cancellation.test.js`

**Interfaces:**
- Consumes: `db` (better-sqlite3-Instanz), `pdfkit`.
- Produces:
  - `getBookingByToken(db, token): object|undefined` — Buchung inkl. `location_name`, `company_name`, `company_email`.
  - `verifyIdentity(booking, identifier): boolean` — true, wenn `identifier` (getrimmt, case-insensitiv) gleich `last_name` ODER `email` der Buchung ist.
  - `hasCancellation(db, bookingId): boolean`
  - `createCancellation(db, { bookingId, initiatedBy, reason, effectiveDate, signatureSvg, signatureImage, signerIp, signerUserAgent }): { effectiveDate }` — schreibt `contract_cancellations`-Zeile (`notice_date` = heute) und setzt `bookings.status = 'terminated'`, in einer Transaktion.
  - `generateCancellationPDFBuffer(db, bookingId): Promise<{ pdfBuffer: Buffer, booking, cancellation }>`

- [ ] **Step 1: Failing test für `verifyIdentity` schreiben**

In `test/cancellation.test.js` ergänzen:

```javascript
const { verifyIdentity } = require('../cancellation');

test('verifyIdentity matches last name case-insensitively', () => {
  const booking = { last_name: 'Müller', email: 'a@b.de' };
  assert.strictEqual(verifyIdentity(booking, '  müller '), true);
  assert.strictEqual(verifyIdentity(booking, 'A@B.DE'), true);
  assert.strictEqual(verifyIdentity(booking, 'Meier'), false);
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `node --test test/cancellation.test.js`
Expected: FAIL — `verifyIdentity is not a function`.

- [ ] **Step 3: Helper implementieren**

In `cancellation.js` ergänzen (vor `module.exports`). `pdfkit` oben importieren: `const PDFDocument = require('pdfkit');`

```javascript
function getBookingByToken(db, token) {
  return db.prepare(`
    SELECT b.*, l.name AS location_name, l.address AS location_address,
           c.name AS company_name, c.email AS company_email
    FROM bookings b
    JOIN locations l ON b.location_id = l.id
    LEFT JOIN companies c ON l.company_id = c.id
    WHERE b.cancellation_token = ?
  `).get(token);
}

function verifyIdentity(booking, identifier) {
  if (!identifier) return false;
  const v = String(identifier).trim().toLowerCase();
  return v === String(booking.last_name || '').trim().toLowerCase()
      || v === String(booking.email || '').trim().toLowerCase();
}

function hasCancellation(db, bookingId) {
  return !!db.prepare('SELECT 1 FROM contract_cancellations WHERE booking_id = ?').get(bookingId);
}

function createCancellation(db, opts) {
  const today = new Date().toISOString().slice(0, 10);
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO contract_cancellations
        (booking_id, initiated_by, reason, notice_date, effective_date,
         signature_svg, signature_image, signature_date, signer_ip, signer_user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `).run(
      opts.bookingId, opts.initiatedBy, opts.reason || null, today, opts.effectiveDate,
      opts.signatureSvg || null, opts.signatureImage || null,
      opts.signerIp || 'unknown', opts.signerUserAgent || 'unknown'
    );
    db.prepare("UPDATE bookings SET status = 'terminated' WHERE id = ?").run(opts.bookingId);
  });
  tx();
  return { effectiveDate: opts.effectiveDate };
}
```

- [ ] **Step 4: `verifyIdentity`-Test grün**

Run: `node --test test/cancellation.test.js`
Expected: PASS — alle Tests.

- [ ] **Step 4b: Gemeinsames `pdf-utils.js` extrahieren**

Den bestehenden `renderSVGSignature`-Renderer aus `server-v2.js` (~Zeile 220-243) in ein neues Modul `pdf-utils.js` verschieben, damit beide Module ihn nutzen. Create `pdf-utils.js` mit dem **wörtlich aus `server-v2.js` übernommenen** Funktionskörper (nicht neu schreiben — verschieben):

```javascript
// pdf-utils.js — gemeinsame PDFKit-Hilfsfunktionen
const renderSVGSignature = (doc, svgString, x, y) => {
  // ... exakt der bestehende Funktionskörper aus server-v2.js ...
};

module.exports = { renderSVGSignature };
```

In `server-v2.js`: die lokale Funktionsdefinition `renderSVGSignature` entfernen und stattdessen oben importieren: `const { renderSVGSignature } = require('./pdf-utils');`. `renderSignatures` (das `renderSVGSignature` aufruft) bleibt unverändert und nutzt den Import.

Verifizieren, dass das Vertrags-PDF weiterhin baut:
Run: `node -e "require('./server-v2.js')" ` ist nicht sinnvoll (startet Server) — stattdessen: nach Server-Start ein bestehendes Vertrags-PDF abrufen und prüfen, dass es Bytes liefert (analog Task 9 Step 4). Kein Funktionsverlust.

- [ ] **Step 5: Nachtrag-PDF-Funktion implementieren**

In `cancellation.js` ergänzen. `renderSVGSignature` aus dem gemeinsamen Modul importieren (oben im File): `const { renderSVGSignature } = require('./pdf-utils');` — KEINE lokale Kopie.

```javascript
function fmtDE(iso) {
  return new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''))
    .toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function generateCancellationPDFBuffer(db, bookingId) {
  return new Promise((resolve, reject) => {
    const booking = db.prepare(`
      SELECT b.*, l.name AS location_name, l.address AS location_address,
             c.name AS company_name, c.email AS company_email
      FROM bookings b
      JOIN locations l ON b.location_id = l.id
      LEFT JOIN companies c ON l.company_id = c.id
      WHERE b.id = ?
    `).get(bookingId);
    if (!booking) return reject(new Error('Booking not found'));

    const cancellation = db.prepare(
      'SELECT * FROM contract_cancellations WHERE booking_id = ? ORDER BY id DESC LIMIT 1'
    ).get(bookingId);
    if (!cancellation) return reject(new Error('Cancellation not found'));

    const doc = new PDFDocument({ bufferPages: true, margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve({ pdfBuffer: Buffer.concat(chunks), booking, cancellation }));
    doc.on('error', reject);

    const partyLabel = cancellation.initiated_by === 'owner'
      ? `${booking.company_name} (Vermieter)`
      : `${booking.first_name} ${booking.last_name} (Mieter)`;

    doc.fontSize(18).font('Helvetica-Bold')
      .text(`Nachtrag / Kündigung zum Stellplatzmietvertrag Nr. ${booking.id}`, { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Standort: ${booking.location_name}, ${booking.location_address}`);
    doc.text(`Mieter: ${booking.first_name} ${booking.last_name}`);
    doc.text(`Vermieter: ${booking.company_name}`);
    doc.moveDown(1);
    doc.text(`Hiermit wird der oben genannte Stellplatzmietvertrag durch ${partyLabel} ordentlich gekündigt.`);
    doc.moveDown(0.5);
    doc.text(`Datum der Kündigungserklärung: ${fmtDE(cancellation.notice_date)}`);
    doc.font('Helvetica-Bold').text(`Vertragsende (wirksam zum): ${fmtDE(cancellation.effective_date)}`);
    doc.font('Helvetica');
    if (cancellation.reason) {
      doc.moveDown(0.5).text(`Kündigungsgrund: ${cancellation.reason}`);
    }
    doc.moveDown(2);

    doc.fontSize(11).text('Unterschrift:');
    const signY = doc.y;
    if (cancellation.signature_svg) renderSVGSignature(doc, cancellation.signature_svg, 70, signY);
    doc.y = signY + 40;
    doc.moveTo(70, doc.y).lineTo(270, doc.y).stroke();
    doc.text(`(${partyLabel}, ${fmtDE(cancellation.notice_date)})`, 70, doc.y + 3);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#666')
      .text(`Cancellation for Contract ID: ${booking.id} | Generated: ${new Date().toISOString()}`, { align: 'center' });

    doc.end();
  });
}
```

`module.exports` erweitern:

```javascript
module.exports = {
  calculateEffectiveDate, generateCancellationToken,
  getBookingByToken, verifyIdentity, hasCancellation,
  createCancellation, generateCancellationPDFBuffer
};
```

- [ ] **Step 6: Smoke-Test PDF-Erzeugung**

Run:
```bash
node -e "
const db=require('./database-v2');
const c=require('./cancellation');
const b=db.prepare('SELECT id FROM bookings LIMIT 1').get();
if(!b){console.log('no booking to test, skip');process.exit(0);}
c.createCancellation(db,{bookingId:b.id,initiatedBy:'customer',reason:'Test',effectiveDate:'2026-12-31',signatureSvg:'<svg><path d=\"M 1 1 L 2 2\"/></svg>',signatureImage:null,signerIp:'127.0.0.1',signerUserAgent:'test'});
c.generateCancellationPDFBuffer(db,b.id).then(r=>{console.log('PDF bytes:',r.pdfBuffer.length); db.prepare('DELETE FROM contract_cancellations WHERE booking_id=?').run(b.id); db.prepare(\"UPDATE bookings SET status='completed' WHERE id=?\").run(b.id);});
"
```
Expected: `PDF bytes: <Zahl > 1000>` (Testdaten werden wieder entfernt).

- [ ] **Step 7: Commit**

```bash
git add cancellation.js test/cancellation.test.js
git commit -m "Add cancellation DB helpers and addendum PDF generation"
```

---

### Task 6: E-Mail-Versand für Kündigung

**Files:**
- Modify: `email.js`

**Interfaces:**
- Produces: `sendCancellationConfirmation(booking, cancellation, pdfBuffer, companyEmail): Promise<void>` — sendet an Kunde + Vermieter mit Nachtrag-PDF im Anhang.

- [ ] **Step 1: Funktion implementieren**

In `email.js` vor `module.exports` ergänzen:

```javascript
/**
 * Send signed cancellation (Nachtrag) to customer and company
 */
const sendCancellationConfirmation = async (booking, cancellation, pdfBuffer, companyEmail) => {
  const recipients = [booking.email];
  if (companyEmail) recipients.push(companyEmail);

  const fmt = (iso) => new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });

  try {
    await getResend().emails.send({
      from: FROM_ADDRESS(),
      to: recipients,
      subject: `Kündigung bestätigt #${booking.id} – Stellplatz ${booking.location_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #d9534f;">Kündigung bestätigt</h2>
          <p>Hallo ${booking.first_name} ${booking.last_name},</p>
          <p>die Kündigung des Stellplatzmietvertrags #${booking.id} wurde erfasst und unterschrieben.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Standort</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.location_name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Vertragsende (wirksam zum)</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${fmt(cancellation.effective_date)}</td></tr>
          </table>
          <p>Den unterschriebenen Nachtrag finden Sie als PDF im Anhang.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Diese E-Mail wurde automatisch generiert.</p>
        </div>
      `,
      attachments: [{ filename: `Kuendigung_${booking.id}.pdf`, content: pdfBuffer }]
    });
    console.log(`✉ Cancellation PDF sent to ${recipients.join(', ')}`);
  } catch (error) {
    console.error('Error sending cancellation email:', error);
  }
};
```

`module.exports` erweitern um `sendCancellationConfirmation`.

- [ ] **Step 2: Verifizieren — Modul lädt ohne Syntaxfehler**

Run: `node -e "const m=require('./email'); console.log(typeof m.sendCancellationConfirmation)"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add email.js
git commit -m "Add cancellation confirmation email with addendum PDF"
```

---

### Task 7: Validatoren ergänzen

**Files:**
- Modify: `validation.js`

**Interfaces:**
- Produces: `validators.cancellationToken` (Param), `validators.verifyCancellation` (Body), `validators.submitCancellation` (Body), `validators.ownerCancel` (Body).

- [ ] **Step 1: Validatoren hinzufügen**

In `validation.js` im `validators`-Objekt ergänzen:

```javascript
  cancellationToken: [
    param('token').isString().isLength({ min: 32, max: 128 }).withMessage('Valid token required'),
    handleValidationErrors
  ],

  verifyCancellation: [
    param('token').isString().isLength({ min: 32, max: 128 }),
    body('identifier').trim().isLength({ min: 1, max: 200 }).withMessage('Name oder E-Mail erforderlich'),
    handleValidationErrors
  ],

  submitCancellation: [
    param('token').isString().isLength({ min: 32, max: 128 }),
    body('identifier').trim().isLength({ min: 1, max: 200 }).withMessage('Name oder E-Mail erforderlich'),
    body('reason').optional({ nullable: true }).trim().isLength({ max: 1000 }),
    body('signatureImage').isString().withMessage('Signature image required'),
    body('signatureSVG').isString().withMessage('Signature SVG required'),
    handleValidationErrors
  ],

  ownerCancel: [
    param('bookingId').isInt({ min: 1 }),
    body('reason').optional({ nullable: true }).trim().isLength({ max: 1000 }),
    body('signatureImage').isString().withMessage('Signature image required'),
    body('signatureSVG').isString().withMessage('Signature SVG required'),
    handleValidationErrors
  ],
```

- [ ] **Step 2: Verifizieren**

Run: `node -e "const v=require('./validation'); ['cancellationToken','verifyCancellation','submitCancellation','ownerCancel'].forEach(k=>console.log(k, Array.isArray(v[k])))"`
Expected: alle vier `true`.

- [ ] **Step 3: Commit**

```bash
git add validation.js
git commit -m "Add validators for cancellation endpoints"
```

---

### Task 8: Backend-Routes (Kunde + Vermieter)

**Files:**
- Modify: `server-v2.js`

**Interfaces:**
- Consumes: `cancellation.*`, `mailer.sendCancellationConfirmation`, `validators.*`, `pricing.validateSignature`, `auth.*`.
- Produces:
  - `GET /kuendigung` → liefert `public/cancellation.html`.
  - `POST /api/cancellation/:token/verify` → `{ success, customerName, locationName, effectiveDate, alreadyCancelled }`.
  - `POST /api/cancellation/:token/submit` → `{ success, effectiveDate }`.
  - `POST /api/admin/bookings/:bookingId/cancel` (auth) → `{ success, effectiveDate }`.

- [ ] **Step 1: Statische Seite + Filter-Status ergänzen**

In `server-v2.js` bei den Seiten-Routes (neben `/agb`, ~Zeile 84) ergänzen:

```javascript
app.get('/kuendigung', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cancellation.html')));
```

In `validation.js` `bookingFilters` den Status-Enum um `'terminated'` erweitern:
`query('status').optional().isIn(['pending_customer_signature', 'pending_owner_signature', 'completed', 'terminated']),`

- [ ] **Step 2: Verify-Route (Kunde)**

In `server-v2.js` vor dem AUDIT-LOG-Abschnitt ergänzen:

```javascript
// ==================== CANCELLATION ====================

app.post('/api/cancellation/:token/verify', validators.verifyCancellation, (req, res) => {
  try {
    const booking = cancellation.getBookingByToken(db, req.params.token);
    if (!booking) return res.status(404).json({ success: false, error: 'Ungültiger Link' });
    if (!cancellation.verifyIdentity(booking, req.body.identifier)) {
      return res.status(403).json({ success: false, error: 'Name oder E-Mail stimmt nicht überein' });
    }
    if (booking.status === 'terminated' || cancellation.hasCancellation(db, booking.id)) {
      return res.json({ success: true, alreadyCancelled: true });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Vertrag ist noch nicht abgeschlossen und kann nicht gekündigt werden.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const effectiveDate = cancellation.calculateEffectiveDate(today, booking.end_date, booking.notice_period_days || 30);
    res.json({
      success: true,
      alreadyCancelled: false,
      customerName: `${booking.first_name} ${booking.last_name}`,
      locationName: booking.location_name,
      effectiveDate
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 3: Submit-Route (Kunde)**

```javascript
app.post('/api/cancellation/:token/submit', validators.submitCancellation, (req, res) => {
  try {
    const booking = cancellation.getBookingByToken(db, req.params.token);
    if (!booking) return res.status(404).json({ success: false, error: 'Ungültiger Link' });
    if (!cancellation.verifyIdentity(booking, req.body.identifier)) {
      return res.status(403).json({ success: false, error: 'Name oder E-Mail stimmt nicht überein' });
    }
    if (booking.status === 'terminated' || cancellation.hasCancellation(db, booking.id)) {
      return res.status(409).json({ success: false, error: 'Dieser Vertrag wurde bereits gekündigt.' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Vertrag ist noch nicht abgeschlossen.' });
    }
    const sig = pricing.validateSignature(req.body.signatureSVG);
    if (!sig.valid) return res.status(400).json({ success: false, error: sig.error });

    const today = new Date().toISOString().slice(0, 10);
    const effectiveDate = cancellation.calculateEffectiveDate(today, booking.end_date, booking.notice_period_days || 30);
    const clientIp = String(req.ip || req.connection?.remoteAddress || 'unknown');
    const userAgent = String(req.get('user-agent') || 'unknown');

    cancellation.createCancellation(db, {
      bookingId: booking.id, initiatedBy: 'customer', reason: req.body.reason,
      effectiveDate, signatureSvg: req.body.signatureSVG, signatureImage: req.body.signatureImage,
      signerIp: clientIp, signerUserAgent: userAgent
    });
    auth.logAudit(db, 'customer', 'contract_cancelled', 'booking', booking.id, { effectiveDate }, clientIp, userAgent);

    res.json({ success: true, effectiveDate });

    cancellation.generateCancellationPDFBuffer(db, booking.id)
      .then(({ pdfBuffer, booking: b, cancellation: c }) => mailer.sendCancellationConfirmation(b, c, pdfBuffer, b.company_email))
      .catch(err => console.error('Error sending cancellation email:', err));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 4: Admin-Cancel-Route (Vermieter)**

```javascript
app.post('/api/admin/bookings/:bookingId/cancel', auth.requireAuth, validators.ownerCancel, (req, res) => {
  try {
    const booking = cancellation.getBookingByToken
      ? db.prepare(`
          SELECT b.*, l.name AS location_name, c.name AS company_name, c.email AS company_email
          FROM bookings b JOIN locations l ON b.location_id = l.id
          LEFT JOIN companies c ON l.company_id = c.id WHERE b.id = ?
        `).get(req.params.bookingId)
      : null;
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.status === 'terminated' || cancellation.hasCancellation(db, booking.id)) {
      return res.status(409).json({ success: false, error: 'Bereits gekündigt.' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Nur abgeschlossene Verträge sind kündbar.' });
    }
    const sig = pricing.validateSignature(req.body.signatureSVG);
    if (!sig.valid) return res.status(400).json({ success: false, error: sig.error });

    const today = new Date().toISOString().slice(0, 10);
    const effectiveDate = cancellation.calculateEffectiveDate(today, booking.end_date, booking.notice_period_days || 30);
    const clientIp = String(req.ip || req.connection?.remoteAddress || 'unknown');
    const userAgent = String(req.get('user-agent') || 'unknown');

    cancellation.createCancellation(db, {
      bookingId: booking.id, initiatedBy: 'owner', reason: req.body.reason,
      effectiveDate, signatureSvg: req.body.signatureSVG, signatureImage: req.body.signatureImage,
      signerIp: clientIp, signerUserAgent: userAgent
    });
    auth.logAudit(db, req.user.role, 'contract_cancelled', 'booking', booking.id, { effectiveDate, by: 'owner' }, clientIp, userAgent);

    res.json({ success: true, effectiveDate });

    cancellation.generateCancellationPDFBuffer(db, booking.id)
      .then(({ pdfBuffer, booking: b, cancellation: c }) => mailer.sendCancellationConfirmation(b, c, pdfBuffer, b.company_email))
      .catch(err => console.error('Error sending cancellation email:', err));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 5: Verifizieren — Server startet & Routes registriert**

Server starten (`node server-v2.js`), dann:
Run: `curl -s -X POST http://localhost:3000/api/cancellation/invalidtoken123456789012345678901234/verify -H 'Content-Type: application/json' -d '{"identifier":"x"}'`
Expected: HTTP-Antwort JSON `{"success":false,"error":"Ungültiger Link"}` (404) — Route existiert und reagiert.

- [ ] **Step 6: Commit**

```bash
git add server-v2.js validation.js
git commit -m "Add cancellation routes (customer deeplink + owner admin)"
```

---

### Task 9: Kündigungs-Hinweis im Vertrags-PDF

Injiziert den Deeplink ins bestehende Vertrags-PDF, damit auch Altverträge ihn enthalten (Template-unabhängig).

**Files:**
- Modify: `server-v2.js` (`generateContractPDFBuffer`, ~Zeile 393-411; `getBookingForContract` ~328)

**Interfaces:**
- Consumes: `booking.cancellation_token` (über `getBookingForContract`).

- [ ] **Step 1: `cancellation_token` in Vertrags-Query laden**

In `getBookingForContract` (~Zeile 328) ist `b.*` bereits selektiert — `cancellation_token` ist damit enthalten. Keine Query-Änderung nötig; verifizieren, dass `b.*` verwendet wird (ja).

- [ ] **Step 2: Hinweis-Renderer ergänzen**

In `server-v2.js` vor `generateContractPDFBuffer` eine Funktion ergänzen:

```javascript
const renderCancellationNotice = (doc, booking) => {
  const baseUrl = process.env.BASE_URL || 'https://str.remoterepublic.com';
  const url = `${baseUrl}/kuendigung?token=${booking.cancellation_token}`;
  doc.moveDown(1.5);
  doc.fontSize(10).font('Helvetica-Oblique').fillColor('#444');
  doc.text(`Hinweis zur Kündigung: Diesen Vertrag können Sie online kündigen unter:`);
  doc.fillColor('#1a0dab').text(url, { link: url, underline: true });
  doc.fillColor('#000');
};
```

- [ ] **Step 3: Aufruf in `generateContractPDFBuffer` einbauen**

Zwischen `renderMarkdownToPDF(doc, renderedBody);` und `renderSignatures(doc, booking);` ergänzen:

```javascript
    renderCancellationNotice(doc, booking);
```

- [ ] **Step 4: Verifizieren — PDF enthält Deeplink**

Server starten, eine bestehende Buchungs-ID nehmen (`SELECT id FROM bookings LIMIT 1`), dann:
Run: `curl -s http://localhost:3000/api/contract/<ID> -o /tmp/c.pdf && node -e "const fs=require('fs');const s=fs.readFileSync('/tmp/c.pdf').toString('latin1');console.log(s.includes('/kuendigung?token=')?'LINK OK':'LINK MISSING')"`
Expected: `LINK OK`

- [ ] **Step 5: Commit**

```bash
git add server-v2.js
git commit -m "Inject cancellation deeplink into contract PDF"
```

---

### Task 10: Frontend — Kündigungsseite (Deeplink)

**Files:**
- Create: `public/cancellation.html`, `public/cancellation.js`

**Interfaces:**
- Consumes: `POST /api/cancellation/:token/verify`, `POST /api/cancellation/:token/submit`.

- [ ] **Step 1: HTML-Seite anlegen**

Create `public/cancellation.html` — minimalistisch, im Stil der bestehenden Seiten (Vanilla, eingebettetes CSS). Drei Bereiche: (a) Verifizierungs-Eingabe (Nachname/E-Mail), (b) Bestätigungs-/Unterschriftsmaske mit Canvas + berechnetem Vertragsende + optionalem Grund, (c) Erfolgsmeldung. Signatur-Canvas-Markup analog `booking-v2.html` (Element-IDs: `signatureCanvas`, `clearSignature`). Lädt am Ende `cancellation.js`.

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vertrag kündigen</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 40px auto; padding: 0 16px; color: #1d1d1f; }
    h1 { font-size: 24px; } label { display: block; margin: 12px 0 4px; font-weight: 600; }
    input, textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; }
    button { margin-top: 16px; padding: 12px 20px; border: 0; border-radius: 8px; background: #1d1d1f; color: #fff; font-weight: 600; cursor: pointer; }
    button.secondary { background: #e5e5e7; color: #1d1d1f; }
    #signatureCanvas { border: 1px solid #ccc; border-radius: 8px; width: 100%; height: 200px; touch-action: none; }
    .hidden { display: none; } .error { color: #d9534f; margin-top: 8px; } .box { background: #f5f5f7; padding: 16px; border-radius: 8px; margin: 16px 0; }
  </style>
</head>
<body>
  <h1>Stellplatzmietvertrag kündigen</h1>

  <section id="verifyStep">
    <p>Bitte bestätigen Sie Ihre Identität, um die Kündigung fortzusetzen.</p>
    <label for="identifier">Nachname oder E-Mail-Adresse</label>
    <input type="text" id="identifier" autocomplete="off">
    <div id="verifyError" class="error hidden"></div>
    <button id="verifyBtn">Weiter</button>
  </section>

  <section id="cancelStep" class="hidden">
    <div class="box">
      <p>Vertrag: <strong id="locationName"></strong></p>
      <p>Wirksam zum (Vertragsende): <strong id="effectiveDate"></strong></p>
    </div>
    <label for="reason">Kündigungsgrund (optional)</label>
    <textarea id="reason" rows="3"></textarea>
    <label>Unterschrift</label>
    <canvas id="signatureCanvas"></canvas>
    <button id="clearSignature" class="secondary" type="button">Löschen</button>
    <div id="submitError" class="error hidden"></div>
    <button id="submitBtn">Kündigung verbindlich absenden</button>
  </section>

  <section id="doneStep" class="hidden">
    <h2>Kündigung erfasst</h2>
    <p>Ihre Kündigung wurde gespeichert. Der Vertrag endet zum <strong id="doneDate"></strong>. Sie erhalten den unterschriebenen Nachtrag per E-Mail.</p>
  </section>

  <section id="alreadyStep" class="hidden">
    <h2>Bereits gekündigt</h2>
    <p>Dieser Vertrag wurde bereits gekündigt.</p>
  </section>

  <script src="/cancellation.js"></script>
</body>
</html>
```

- [ ] **Step 2: JS anlegen — Token, Verify, Signatur-Pad, Submit**

Create `public/cancellation.js`. Das Signatur-Pad (Canvas → SVG + PNG) ist 1:1 das Muster aus `public/booking-v2.js` (Funktionen `getSignatureSVG`, Maus-/Touch-Handler). Übernehme dieses Muster:

```javascript
const token = new URLSearchParams(location.search).get('token');
let canvas, ctx, isDrawing = false;
const sig = { paths: [], current: [] };

function showError(id, msg) { const e = document.getElementById(id); e.textContent = msg; e.classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function show(id) { document.getElementById(id).classList.remove('hidden'); }

async function verify() {
  hide('verifyError');
  const identifier = document.getElementById('identifier').value.trim();
  if (!identifier) return showError('verifyError', 'Bitte Nachname oder E-Mail eingeben.');
  const res = await fetch(`/api/cancellation/${token}/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier })
  });
  const data = await res.json();
  if (!data.success) return showError('verifyError', data.error || 'Fehler.');
  if (data.alreadyCancelled) { hide('verifyStep'); return show('alreadyStep'); }
  document.getElementById('locationName').textContent = data.locationName;
  document.getElementById('effectiveDate').textContent = formatDE(data.effectiveDate);
  hide('verifyStep'); show('cancelStep'); initCanvas();
}

function formatDE(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function initCanvas() {
  canvas = document.getElementById('signatureCanvas');
  ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = 200;
  ctx.strokeStyle = '#1d1d1f'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); isDrawing = true; sig.current = []; const p = pos(e); sig.current.push({ x: p.x, y: p.y, type: 'M' }); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!isDrawing) return; e.preventDefault(); const p = pos(e); sig.current.push({ x: p.x, y: p.y, type: 'L' }); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { if (!isDrawing) return; isDrawing = false; if (sig.current.length) sig.paths.push([...sig.current]); sig.current = []; };
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end); canvas.addEventListener('mouseout', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });
}

function getSignatureSVG() {
  const paths = sig.paths.map(path => {
    const d = path.map(p => `${p.type} ${p.x} ${p.y}`).join(' ');
    return `<path d="${d}" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">${paths}</svg>`;
}

async function submit() {
  hide('submitError');
  if (sig.paths.length === 0) return showError('submitError', 'Bitte unterschreiben Sie.');
  const res = await fetch(`/api/cancellation/${token}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: document.getElementById('identifier').value.trim(),
      reason: document.getElementById('reason').value.trim() || null,
      signatureImage: canvas.toDataURL('image/png'),
      signatureSVG: getSignatureSVG()
    })
  });
  const data = await res.json();
  if (!data.success) return showError('submitError', data.error || 'Fehler beim Absenden.');
  document.getElementById('doneDate').textContent = formatDE(data.effectiveDate);
  hide('cancelStep'); show('doneStep');
}

document.addEventListener('DOMContentLoaded', () => {
  if (!token) return showError('verifyError', 'Ungültiger Link (Token fehlt).');
  document.getElementById('verifyBtn').addEventListener('click', verify);
  document.getElementById('submitBtn').addEventListener('click', submit);
  document.getElementById('clearSignature').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height); sig.paths = []; sig.current = [];
  });
});
```

- [ ] **Step 3: End-to-End-Verifikation (Browser)**

Server starten. In der DB ein `cancellation_token` einer `completed`-Buchung holen (`SELECT id, cancellation_token, last_name FROM bookings WHERE status='completed' LIMIT 1`; falls keine: eine Buchung anlegen + via Admin gegenzeichnen, oder Status manuell auf `completed` setzen). `http://localhost:3000/kuendigung?token=<TOKEN>` öffnen, mit Nachnamen verifizieren, unterschreiben, absenden.
Expected: Erfolgsmeldung mit Datum; in DB `SELECT status FROM bookings WHERE id=<ID>` → `terminated`; `SELECT * FROM contract_cancellations WHERE booking_id=<ID>` vorhanden.

- [ ] **Step 4: Commit**

```bash
git add public/cancellation.html public/cancellation.js
git commit -m "Add customer cancellation page (deeplink flow)"
```

---

### Task 11: Frontend — Admin „Kündigen"-Aktion (Vermieter)

**Files:**
- Modify: `public/admin.html`

**Interfaces:**
- Consumes: `POST /api/admin/bookings/:bookingId/cancel`.

- [ ] **Step 1: „Kündigen"-Button + Signatur-Modal**

In `public/admin.html` in der Buchungs-Detailansicht/-Liste einen Button „Vertrag kündigen" ergänzen, der nur bei Status `completed` sichtbar ist. Wiederverwendung des im Admin bereits vorhandenen Signatur-Modal-Musters (Owner-Signatur beim Gegenzeichnen). Der Button öffnet ein Modal mit optionalem Grund-Textfeld + Signatur-Canvas; beim Absenden:

```javascript
async function cancelContract(bookingId) {
  const reason = document.getElementById('cancelReason').value.trim() || null;
  const signatureSVG = getCancelSignatureSVG();   // analog zur bestehenden Owner-Signatur
  const signatureImage = cancelCanvas.toDataURL('image/png');
  const res = await fetch(`/api/admin/bookings/${bookingId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
    body: JSON.stringify({ reason, signatureImage, signatureSVG })
  });
  const data = await res.json();
  if (!data.success) { alert(data.error || 'Fehler'); return; }
  alert(`Vertrag gekündigt zum ${data.effectiveDate}.`);
  loadBookings();   // bestehende Reload-Funktion
}
```

> Hinweis für den Implementierer: Auth-Token-Zugriff (`getToken()`), Signatur-Canvas-Setup und Modal-Öffnen exakt an die vorhandene Owner-Signatur-Implementierung in `admin.html` anlehnen (gleiche Funktionsnamen/Muster suchen und spiegeln). Status-Badges um `terminated` (z.B. „Gekündigt") erweitern.

- [ ] **Step 2: Verifikation (Browser)**

Admin-Login, eine `completed`-Buchung öffnen, „Vertrag kündigen", unterschreiben, absenden.
Expected: Erfolgsmeldung mit Datum; Buchung zeigt Status „Gekündigt"; Nachtrag-E-Mail wird versendet (Server-Log: `✉ Cancellation PDF sent to ...`).

- [ ] **Step 3: Commit**

```bash
git add public/admin.html
git commit -m "Add owner cancellation action in admin panel"
```

---

### Task 12: Buchungsformular-Wording „Mietende" → „Mindestlaufzeit bis"

**Files:**
- Modify: `public/booking-v2.html` (Label ~Zeile 456), `public/booking-v2.js` (Vertragsvorschau ~Zeile 455)

- [ ] **Step 1: Label ändern**

In `public/booking-v2.html` das Label `<label for="endDate">Mietende</label>` ersetzen durch:

```html
<label for="endDate">Mindestlaufzeit bis</label>
<small style="color:#666;">Nach Ablauf läuft der Vertrag unbefristet weiter und ist zum Monatsende kündbar.</small>
```

- [ ] **Step 2: Vertragsvorschau-Text anpassen**

In `public/booking-v2.js` (~Zeile 455) den Vorschau-Text von „Mietende" auf „Mindestlaufzeit bis" anpassen:

```javascript
        <p>(1) Mietbeginn: ${new Date(state.startDate).toLocaleDateString('de-DE')}, Mindestlaufzeit bis: ${new Date(state.endDate).toLocaleDateString('de-DE')}</p>
```

- [ ] **Step 3: Verifikation (Browser)**

Buchungsformular öffnen → Label „Mindestlaufzeit bis" + Hinweistext sichtbar; Vertragsvorschau zeigt angepassten Text.

- [ ] **Step 4: Commit**

```bash
git add public/booking-v2.html public/booking-v2.js
git commit -m "Relabel Mietende to Mindestlaufzeit in booking form"
```

---

### Task 13: §2-Vertragsklausel & Doku finalisieren

**Files:**
- Modify: `database-v2.js` (Default-Template §2 — Wording an `notice_period_days` angleichen), `SETUP-GUIDE.md`

- [ ] **Step 1: §2 im Default-Template prüfen/angleichen**

Das Default-Template in `database-v2.js` (~Zeile 305-312) enthält §2 bereits mit Kündigungsklausel, formuliert als „Frist von einem Monat zum Monatsende". Das passt grundsätzlich zu `notice_period_days=30`. **Entscheidung des Auftraggebers einholen**, ob der Wortlaut „ein Monat" oder „30 Tage" lauten soll, und ggf. angleichen. Default belassen, falls „ein Monat" gewünscht ist.

- [ ] **Step 2: Doku — Hinweis zum Production-Template-Update**

In `SETUP-GUIDE.md` unter „Template in Production-DB aktualisieren" ergänzen: dass die §2-Kündigungsklausel in **bestehenden** Production-DBs manuell ins aktive Template übernommen werden muss (das Default greift nur bei neuer DB). Der Kündigungs-Deeplink selbst wird automatisch beim PDF-Bau injiziert und braucht **keine** Template-Änderung.

- [ ] **Step 3: Doku — neue Endpoints & Status dokumentieren**

In `SETUP-GUIDE.md` API-Übersicht ergänzen:
- Public: `POST /api/cancellation/:token/verify`, `POST /api/cancellation/:token/submit`, Seite `/kuendigung`.
- Admin: `POST /api/admin/bookings/:bookingId/cancel`.
- Status-Werte um `terminated` ergänzen.

- [ ] **Step 4: Commit**

```bash
git add database-v2.js SETUP-GUIDE.md
git commit -m "Document cancellation feature and align contract clause"
```

---

### Task 14: Gesamttest & Branch abschließen

- [ ] **Step 1: Unit-Tests grün**

Run: `npm test`
Expected: alle Tests in `test/` PASS.

- [ ] **Step 2: Voller manueller Durchlauf**

1. Neue Buchung anlegen → Admin gegenzeichnen → Status `completed`.
2. Vertrags-PDF herunterladen → Kündigungs-Deeplink enthalten.
3. Deeplink öffnen → verifizieren → kündigen → Erfolg, Status `terminated`, E-Mail (Log).
4. Zweite `completed`-Buchung → im Admin „Vertrag kündigen" → Erfolg.
5. Erneuter Deeplink-Aufruf einer gekündigten Buchung → „Bereits gekündigt".

- [ ] **Step 3: finishing-a-development-branch**

Implementierung abgeschlossen — `superpowers:finishing-a-development-branch` nutzen, um Merge/PR-Optionen zu wählen.

---

## Self-Review

**Spec-Coverage:**
- Geltungsregeln (Mindestlaufzeit→unbefristet, Monatsende, beidseitig, completed-only, eine Kündigung) → Tasks 2,5,8.
- Vertragsänderungen (Formular-Wording, §2, PDF-Hinweisbox) → Tasks 12,13,9.
- Datenmodell (Tabelle, cancellation_token, terminated, notice_period_days) → Tasks 3,4,8.
- Flows (Kunde Deeplink mit Verify, Vermieter Admin) → Tasks 8,10,11.
- Wirksamkeitsdatum-Berechnung → Task 2.
- Nachtrag-PDF + E-Mail → Tasks 5,6,8.
- Code-Struktur (cancellation.js, schlanke Routes, eigenes Frontend) → Tasks 2,5,8,10.
- YAGNI (kein Cron, keine Rücknahme, keine Sonderkündigung) → eingehalten.
- Cleanup/Doku-Fixes (aus Teil 1) → Task 1.

**Offene Punkte (an Auftraggeber):** finale §2-Formulierung (Task 13 Step 1); exakter Text der PDF-Hinweisbox (Task 9 — vorgeschlagener Default vorhanden).
