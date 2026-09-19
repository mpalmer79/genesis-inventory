import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInventoryQuery, searchInventory } from './search.js';

const expectedVehicle = {
  vin: '5NMMADTB0TH068127',
  stockNumber: 'GM260818S',
  condition: 'new',
  certified: false,
  availability: 'in-stock',
  year: 2026,
  make: 'Genesis',
  model: 'GV70',
  trim: '2.5T AWD',
  exteriorColor: 'Mauna Red',
  interiorColor: 'Vanilla Beige/Black',
  drivetrain: 'AWD',
  mileage: null,
  msrp: 51810,
  price: 52609
};

const otherVehicle = {
  vin: 'KMUHCESC0TU123456',
  stockNumber: 'GM260999',
  condition: 'new',
  certified: false,
  availability: 'in-transit',
  year: 2026,
  make: 'Genesis',
  model: 'GV80',
  trim: '3.5T Prestige',
  exteriorColor: 'Uyuni White',
  interiorColor: 'Obsidian Black',
  drivetrain: 'AWD',
  mileage: null,
  msrp: 78950,
  price: 79749
};

const vehicles = [expectedVehicle, otherVehicle];
const STOCK_NUMBER = expectedVehicle.stockNumber;

test('stock-number regression fixture is valid', () => {
  assert.ok(expectedVehicle.stockNumber);
  assert.ok(expectedVehicle.vin);
});

test('exact stock number returns only the matching vehicle', () => {
  const result = searchInventory(vehicles, STOCK_NUMBER);

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].stockNumber, STOCK_NUMBER);
  assert.equal(result.parsed.filters.stockNumber, STOCK_NUMBER);
});

test('stock-number lookup is case-insensitive and accepts stock wording', () => {
  for (const query of ['gm260818s', 'stock GM260818S', 'stock # GM260818S']) {
    const result = searchInventory(vehicles, query);
    assert.equal(result.results.length, 1, query);
    assert.equal(result.results[0].stockNumber, STOCK_NUMBER, query);
  }
});

test('exact VIN returns only the matching vehicle', () => {
  const result = searchInventory(vehicles, `VIN ${expectedVehicle.vin}`);

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].vin, expectedVehicle.vin);
  assert.equal(result.parsed.filters.vin, expectedVehicle.vin);
});

test('identifier parsing carries the matched vehicle filters into the UI', () => {
  const parsed = parseInventoryQuery(STOCK_NUMBER, vehicles);

  assert.equal(parsed.filters.condition, expectedVehicle.condition);
  assert.equal(parsed.filters.availability, expectedVehicle.availability);
  assert.equal(parsed.filters.make, expectedVehicle.make);
  assert.equal(parsed.filters.model, expectedVehicle.model);
});
