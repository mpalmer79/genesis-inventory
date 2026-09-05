import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveVehiclePrice, parseInventoryQuery, searchInventory } from './search.js';

const vehicles = [
  {
    vin: 'KMUAAA11111111111',
    stockNumber: 'GM1001',
    condition: 'new',
    availability: 'in-stock',
    year: 2026,
    make: 'Genesis',
    model: 'GV80',
    trim: '2.5T Advanced AWD',
    exteriorColor: 'Vik Black',
    interiorColor: 'Obsidian Black',
    bodyStyle: 'SUV/5 seats',
    drivetrain: 'AWD',
    mileage: 12,
    price: 75250,
    msrp: 74250
  },
  {
    vin: 'KMUBBB22222222222',
    stockNumber: 'GM1002',
    condition: 'new',
    availability: 'in-transit',
    year: 2026,
    make: 'Genesis',
    model: 'GV80',
    trim: '3.5T Prestige AWD',
    exteriorColor: 'Uyuni White',
    interiorColor: 'Obsidian Black',
    bodyStyle: 'SUV/5 seats',
    drivetrain: 'AWD',
    mileage: 5,
    price: 88950,
    msrp: 87950
  },
  {
    vin: 'USEDCC33333333333',
    stockNumber: 'U3001',
    condition: 'used',
    availability: 'in-stock',
    year: 2023,
    make: 'Genesis',
    model: 'GV70',
    trim: '2.5T Advanced AWD',
    exteriorColor: 'Makalu Gray',
    interiorColor: 'Black',
    bodyStyle: 'SUV/5 seats',
    drivetrain: 'AWD',
    mileage: 28500,
    price: 38900,
    msrp: null
  }
];

test('parses a constrained new GV80 search', () => {
  const parsed = parseInventoryQuery('Show me new black GV80s in stock under $80k');
  assert.equal(parsed.filters.condition, 'new');
  assert.equal(parsed.filters.model, 'GV80');
  assert.equal(parsed.filters.availability, 'in-stock');
  assert.equal(parsed.filters.maxPrice, 80000);
  assert.deepEqual(parsed.filters.colors, ['black']);
});

test('does not treat mileage as a price ceiling', () => {
  const parsed = parseInventoryQuery('used AWD SUVs under 30k miles');
  assert.equal(parsed.filters.condition, 'used');
  assert.equal(parsed.filters.drivetrain, 'AWD');
  assert.equal(parsed.filters.bodyStyle, 'suv');
  assert.equal(parsed.filters.maxMileage, 30000);
  assert.equal(parsed.filters.maxPrice, undefined);
});

test('returns only matching in-stock black GV80 under $80k', () => {
  const result = searchInventory(vehicles, 'new black GV80 in stock under $80k');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].stockNumber, 'GM1001');
});

test('uses MSRP as the effective new-vehicle price', () => {
  assert.equal(effectiveVehiclePrice(vehicles[0]), 74250);
  assert.equal(searchInventory(vehicles, 'new GV80 under $75k').results[0].stockNumber, 'GM1001');
});

test('uses advertised price as the effective used-vehicle price', () => {
  assert.equal(effectiveVehiclePrice(vehicles[2]), 38900);
});

test('finds a vehicle by exact stock number', () => {
  const result = searchInventory(vehicles, 'U3001');
  assert.equal(result.results[0].stockNumber, 'U3001');
});
