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
