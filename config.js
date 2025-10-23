// Fahrzeugtypen mit ihrer maximalen Länge
const VEHICLE_TYPES = [
  { max_length: 5.0, label: 'bis 5,00 m' },
  { max_length: 5.5, label: 'bis 5,50 m' },
  { max_length: 6.0, label: 'bis 6,00 m' },
  { max_length: 6.5, label: 'bis 6,50 m' },
  { max_length: 7.0, label: 'bis 7,00 m' },
  { max_length: 7.5, label: 'bis 7,50 m' },
  { max_length: 8.0, label: 'bis 8,00 m' },
  { max_length: 8.5, label: 'bis 8,50 m' }
];

// Basispreise pro Monat (in Euro, ohne MwSt)
const BASE_PRICES = {
  5.0: 100,
  5.5: 110,
  6.0: 115,
  6.5: 120,
  7.0: 130,
  7.5: 140,
  8.0: 150,
  8.5: 160
};

// Preiskategorien als Prozentsatz des Basispreises
const CATEGORY_MULTIPLIERS = {
  outside: 0.50,    // 50% des Basispreises
  covered: 0.75,    // 75% des Basispreises
  indoor: 1.0       // 100% des Basispreises
};

const CATEGORY_LABELS = {
  outside: 'Außenstellplatz',
  covered: 'Überdacht',
  indoor: 'In der Halle'
};

// Mwst (wird später in der Berechnung addiert)
const VATIN = 0.19;

module.exports = {
  VEHICLE_TYPES,
  BASE_PRICES,
  CATEGORY_MULTIPLIERS,
  CATEGORY_LABELS,
  VATIN
};
