const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { renderSVGSignature } = require('./pdf-utils');

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
      .text(`Kündigung zu Vertrag Nr. ${booking.id} | Erstellt: ${new Date().toISOString()}`, { align: 'center' });

    doc.end();
  });
}

module.exports = {
  calculateEffectiveDate, generateCancellationToken,
  getBookingByToken, verifyIdentity, hasCancellation,
  createCancellation, generateCancellationPDFBuffer
};
