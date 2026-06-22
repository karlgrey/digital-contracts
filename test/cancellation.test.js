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
