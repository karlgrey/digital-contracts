const { test } = require('node:test');
const assert = require('node:assert');
const { calculateEffectiveDate, generateCancellationToken, verifyIdentity } = require('../cancellation');

test('effective date = end of following month (one-month notice)', () => {
  // heute 22.06., Mindestmietzeit endet 31.07. -> Ende Folgemonat (Juli) wahrt die Frist
  assert.strictEqual(calculateEffectiveDate('2026-06-22', '2026-07-31'), '2026-07-31');
});

test('effective date = end of following month when min-term already passed', () => {
  // heute 22.06., Mindestmietzeit endete 30.06. -> ein Monat zum Monatsende = Ende Juli
  assert.strictEqual(calculateEffectiveDate('2026-06-22', '2026-06-30'), '2026-07-31');
});

test('effective date rolls into next year correctly', () => {
  // heute 05.01.2026, min-term lange vorbei -> Ende Folgemonat = Ende Februar
  assert.strictEqual(calculateEffectiveDate('2026-01-05', '2025-12-31'), '2026-02-28');
});

test('one-month notice from month end snaps to next month end, not 30 days later', () => {
  // Kündigung am 31.01. -> ein Kalendermonat zum Monatsende = 28.02. (NICHT 31.03. wie bei 30 Tagen)
  assert.strictEqual(calculateEffectiveDate('2026-01-31', '2025-12-31'), '2026-02-28');
});

test('minimum term not yet over: effective date is the month-end of the minimum term', () => {
  // heute 22.06., Mindestmietzeit bis 15.12. -> frühestes Monatsende >= 15.12. = 31.12.
  assert.strictEqual(calculateEffectiveDate('2026-06-22', '2026-12-15'), '2026-12-31');
});

test('token is 64 hex chars and unique', () => {
  const a = generateCancellationToken();
  const b = generateCancellationToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notStrictEqual(a, b);
});

test('verifyIdentity matches last name case-insensitively', () => {
  const booking = { last_name: 'Müller', email: 'a@b.de' };
  assert.strictEqual(verifyIdentity(booking, '  müller '), true);
  assert.strictEqual(verifyIdentity(booking, 'A@B.DE'), true);
  assert.strictEqual(verifyIdentity(booking, 'Meier'), false);
});
