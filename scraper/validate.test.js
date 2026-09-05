import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInventory } from './validate.js';

const rules = {
  minimumTotalVehicles: 100,
  minimumNewVehicles: 50,
  minimumPreOwnedVehicles: 50,
  minimumDiscoveryCoverage: 0.95,
  minimumVinCompleteness: 0.85,
  minimumRetainedRatio: 0.45,
  minimumCriticalFieldCompleteness: 0.95,
  minimumImageCompleteness: 0.8
};

function vehicles(condition, count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    vin: `VIN-${condition}-${String(index + offset).padStart(6, '0')}`,
    stockNumber: `${condition.toUpperCase()}-${index + offset}`,
    condition,
    availability: condition === 'new' && index % 3 === 0 ? 'in-transit' : 'in-stock',
    year: condition === 'new' ? 2027 : 2024,
    make: condition === 'new' ? 'Genesis' : 'Hyundai',
    model: condition === 'new' ? 'GV70' : 'Tucson',
    exteriorColor: 'Black',
    interiorColor: 'Black',
    imageUrl: `https://pictures.dealer.com/vehicle-${condition}-${index}.jpg`,
    sourceUrl: `https://example.com/${condition}/${index + offset}`
  }));
}

test('accepts a nearly complete crawl when deduplication reduces discovered VDP count', () => {
  const inventory = [
    ...vehicles('new', 194),
    ...vehicles('used', 92, 1000),
    ...vehicles('certified', 6, 2000)
  ];

  const result = validateInventory(inventory, null, rules, { total: 293, new: 194, preOwned: 99 });

  assert.equal(result.valid, true);
  assert.equal(result.metrics.total, 292);
  assert.equal(result.metrics.preOwned, 98);
  assert.equal(result.metrics.vinCompleteness, 1);
  assert.equal(result.metrics.fieldCompleteness.stockNumber, 1);
  assert.equal(result.metrics.discoveryCoverage.total, 0.9966);
  assert.equal(result.metrics.discoveryCoverage.new, 1);
  assert.equal(result.metrics.discoveryCoverage.preOwned, 0.9899);
});

test('rejects a crawl that misses too much of the discovered pre-owned inventory', () => {
  const inventory = [
    ...vehicles('new', 194),
    ...vehicles('used', 90, 1000)
  ];

  const result = validateInventory(inventory, null, rules, { total: 293, new: 194, preOwned: 99 });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('Pre-owned inventory covers only')));
  assert.equal(result.metrics.discoveryCoverage.total, 0.9693);
  assert.equal(result.metrics.discoveryCoverage.preOwned, 0.9091);
});

test('rejects a crawl with poor critical field completeness', () => {
  const inventory = [
    ...vehicles('new', 100),
    ...vehicles('used', 60, 1000)
  ];
  for (let index = 0; index < 20; index += 1) inventory[index].stockNumber = null;

  const result = validateInventory(inventory, null, rules, { total: 160, new: 100, preOwned: 60 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('stockNumber completeness')));
});

test('rejects punctuation-only makes and concatenated Genesis model names', () => {
  const inventory = [
    ...vehicles('new', 100),
    ...vehicles('used', 60, 1000)
  ];
  inventory[120].make = '|';
  inventory[120].model = 'GenesisGV70';

  const result = validateInventory(inventory, null, rules, { total: 160, new: 100, preOwned: 60 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('semantically invalid make/model values')));
});

test('rejects phone-number or department text in location fields', () => {
  const inventory = [
    ...vehicles('new', 100),
    ...vehicles('used', 60, 1000)
  ];
  inventory[120].location = 'Sales: (603) 420-7772';

  const result = validateInventory(inventory, null, rules, { total: 160, new: 100, preOwned: 60 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('location field')));
});

test('rejects make and model values that disagree with a canonical VDP URL', () => {
  const inventory = [
    ...vehicles('new', 100),
    ...vehicles('used', 60, 1000)
  ];
  inventory[120].sourceUrl = 'https://www.autofairhyundai.com/used/Chevrolet/2013-Chevrolet-Spark-35029f91ac18460621052e7cff0b6816.htm';
  inventory[120].year = 2013;
  inventory[120].make = 'ChevroletSpark';
  inventory[120].model = '1LT';

  const result = validateInventory(inventory, null, rules, { total: 160, new: 100, preOwned: 60 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('disagree with make/model identity encoded in their VDP URLs')));
});
