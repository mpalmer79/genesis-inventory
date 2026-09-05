import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInventory } from './validate.js';

const rules = {
  minimumTotalVehicles: 100,
  minimumNewVehicles: 50,
  minimumPreOwnedVehicles: 50,
  minimumDiscoveryCoverage: 0.95,
  minimumVinCompleteness: 0.85,
  minimumRetainedRatio: 0.45
};

function vehicles(condition, count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    vin: `VIN-${condition}-${String(index + offset).padStart(6, '0')}`,
    stockNumber: `${condition.toUpperCase()}-${index + offset}`,
    condition,
    availability: condition === 'new' && index % 3 === 0 ? 'in-transit' : 'in-stock',
    sourceUrl: `https://example.com/${condition}/${index + offset}`
  }));
}

test('accepts a nearly complete crawl when deduplication reduces discovered VDP count', () => {
  const inventory = [
    ...vehicles('new', 194),
    ...vehicles('used', 92, 1000),
    ...vehicles('certified', 6, 2000)
  ];

  const result = validateInventory(
    inventory,
    null,
    rules,
    { total: 293, new: 194, preOwned: 99 }
  );

  assert.equal(result.valid, true);
  assert.equal(result.metrics.total, 292);
  assert.equal(result.metrics.preOwned, 98);
  assert.equal(result.metrics.vinCompleteness, 1);
  assert.equal(result.metrics.discoveryCoverage.total, 0.9966);
  assert.equal(result.metrics.discoveryCoverage.new, 1);
  assert.equal(result.metrics.discoveryCoverage.preOwned, 0.9899);
});

test('rejects a crawl that misses too much of the discovered pre-owned inventory', () => {
  const inventory = [
    ...vehicles('new', 194),
    ...vehicles('used', 90, 1000)
  ];

  const result = validateInventory(
    inventory,
    null,
    rules,
    { total: 293, new: 194, preOwned: 99 }
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('Pre-owned inventory covers only')));
  assert.equal(result.metrics.discoveryCoverage.total, 0.9693);
  assert.equal(result.metrics.discoveryCoverage.preOwned, 0.9091);
});
