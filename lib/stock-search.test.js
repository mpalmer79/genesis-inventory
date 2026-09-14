import test from 'node:test';
import assert from 'node:assert/strict';
import inventory from '../data/inventory.json' with { type: 'json' };
import { parseInventoryQuery, searchInventory } from './search.js';

const STOCK_NUMBER = 'GM260818S';
const expectedVehicle = inventory.vehicles.find((vehicle) => vehicle.stockNumber === STOCK_NUMBER);

test('production inventory contains the stock-number regression fixture', () => {
  assert.ok(expectedVehicle, `${STOCK_NUMBER} must exist in the committed inventory fixture`);
  assert.equal(expectedVehicle.vin, '5NMMADTB0TH068127');
});

test('exact stock number returns only the matching vehicle', () => {
  const result = searchInventory(inventory.vehicles, STOCK_NUMBER);

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].stockNumber, STOCK_NUMBER);
  assert.equal(result.parsed.filters.stockNumber, STOCK_NUMBER);
});

test('stock-number lookup is case-insensitive and accepts stock wording', () => {
  for (const query of ['gm260818s', 'stock GM260818S', 'stock # GM260818S']) {
    const result = searchInventory(inventory.vehicles, query);
    assert.equal(result.results.length, 1, query);
    assert.equal(result.results[0].stockNumber, STOCK_NUMBER, query);
  }
});

test('exact VIN returns only the matching vehicle', () => {
  assert.ok(expectedVehicle?.vin);
  const result = searchInventory(inventory.vehicles, `VIN ${expectedVehicle.vin}`);

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].vin, expectedVehicle.vin);
  assert.equal(result.parsed.filters.vin, expectedVehicle.vin);
});

test('identifier parsing carries the matched vehicle filters into the UI', () => {
  const parsed = parseInventoryQuery(STOCK_NUMBER, inventory.vehicles);

  assert.equal(parsed.filters.condition, expectedVehicle.condition);
  assert.equal(parsed.filters.availability, expectedVehicle.availability);
  assert.equal(parsed.filters.make, expectedVehicle.make);
  assert.equal(parsed.filters.model, expectedVehicle.model);
});
