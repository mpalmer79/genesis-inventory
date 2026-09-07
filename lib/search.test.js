import test from 'node:test';
import assert from 'node:assert/strict';
import inventory from '../data/inventory.json' with { type: 'json' };
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
    engine: '2.5L DOHC',
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
    engine: '3.5L Twin Turbo',
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
    engine: '2.5L DOHC',
    exteriorColor: 'Makalu Gray',
    interiorColor: 'Black',
    bodyStyle: 'SUV/5 seats',
    drivetrain: 'AWD',
    mileage: 28500,
    price: 38900,
    msrp: null
  },
  {
    vin: 'HYUNDAI4444444444',
    stockNumber: 'H4001',
    condition: 'used',
    availability: 'in-stock',
    year: 2024,
    make: 'Hyundai',
    model: 'Tucson',
    trim: 'SEL AWD',
    engine: '2.5L I4',
    exteriorColor: 'Blue',
    interiorColor: 'Black',
    bodyStyle: 'SUV',
    drivetrain: 'All-Wheel Drive',
    mileage: 18000,
    price: 27900,
    msrp: null
  },
  {
    vin: 'CHEVY555555555555',
    stockNumber: 'C5001',
    condition: 'used',
    availability: 'in-stock',
    year: 2024,
    make: 'Chevrolet',
    model: 'Equinox',
    trim: 'LT',
    engine: '1.5L Turbo',
    exteriorColor: 'White',
    interiorColor: 'Jet Black',
    bodyStyle: 'SUV',
    drivetrain: 'AWD',
    mileage: 12000,
    price: 26900,
    msrp: null
  }
];

test('parses a constrained new GV80 search', () => {
  const parsed = parseInventoryQuery('Show me new black GV80s in stock under $80k', vehicles);
  assert.equal(parsed.filters.condition, 'new');
  assert.equal(parsed.filters.make, 'Genesis');
  assert.equal(parsed.filters.model, 'GV80');
  assert.equal(parsed.filters.availability, 'in-stock');
  assert.equal(parsed.filters.maxPrice, 80000);
  assert.deepEqual(parsed.filters.colors, ['black']);
});

test('treats an unqualified color as exterior color only', () => {
  const result = searchInventory(vehicles, 'black GV80');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].stockNumber, 'GM1001');
});

test('searches interior color only when interior intent is explicit', () => {
  const parsed = parseInventoryQuery('black interior GV80', vehicles);
  assert.equal(parsed.filters.colors, undefined);
  assert.deepEqual(parsed.filters.interiorColors, ['black']);

  const result = searchInventory(vehicles, 'black interior GV80');
  assert.equal(result.results.length, 2);
  assert.deepEqual(result.results.map((vehicle) => vehicle.stockNumber).sort(), ['GM1001', 'GM1002']);
});

test('parses bare engine displacement as a filter', () => {
  const parsed = parseInventoryQuery('GV80 2.5', vehicles);
  assert.equal(parsed.filters.model, 'GV80');
  assert.equal(parsed.filters.displacement, '2.5');
  assert.ok(parsed.labels.includes('2.5L'));
});

test('treats 2.5, 2.5L, 2.5 liter and 2.5T as equivalent displacement searches', () => {
  for (const query of ['GV80 2.5', 'GV80 2.5L', 'GV80 2.5 liter', 'GV80 2.5T']) {
    const result = searchInventory(vehicles, query);
    assert.equal(result.results.length, 1, query);
    assert.equal(result.results[0].stockNumber, 'GM1001', query);
  }
});

test('isolates a different Genesis displacement', () => {
  for (const query of ['GV80 3.5', 'GV80 3.5L', 'GV80 3.5T']) {
    const result = searchInventory(vehicles, query);
    assert.equal(result.results.length, 1, query);
    assert.equal(result.results[0].stockNumber, 'GM1002', query);
  }
});

test('applies displacement matching to non-Genesis used inventory', () => {
  assert.equal(searchInventory(vehicles, 'Hyundai Tucson 2.5L').results[0].stockNumber, 'H4001');
  assert.equal(searchInventory(vehicles, 'Chevrolet Equinox 1.5').results[0].stockNumber, 'C5001');
});

test('finds production GV70 2.5 inventory using salesperson shorthand', () => {
  for (const query of ['GV70 2.5', 'GV70 2.5L', 'GV70 2.5T']) {
    const result = searchInventory(inventory.vehicles, query);
    assert.ok(result.results.length > 0, `${query} should return production matches`);
    assert.ok(result.results.every((vehicle) => /gv70/i.test(vehicle.model)));
    assert.ok(result.results.every((vehicle) => /\b2\.5(?:l|t)?\b/i.test(`${vehicle.trim || ''} ${vehicle.engine || ''}`)));
  }
});

test('does not treat mileage as a price ceiling', () => {
  const parsed = parseInventoryQuery('used AWD SUVs under 30k miles', vehicles);
  assert.equal(parsed.filters.condition, 'used');
  assert.equal(parsed.filters.drivetrain, 'AWD');
  assert.equal(parsed.filters.bodyStyle, 'suv');
  assert.equal(parsed.filters.maxMileage, 30000);
  assert.equal(parsed.filters.maxPrice, undefined);
});

test('default used AWD mileage suggestion returns matching vehicles', () => {
  const result = searchInventory(vehicles, 'Used AWD SUVs under 30k miles');
  assert.ok(result.results.length > 0);
  assert.ok(result.results.some((vehicle) => vehicle.stockNumber === 'H4001'));
  assert.ok(result.results.every((vehicle) => ['used', 'certified'].includes(vehicle.condition)));
  assert.ok(result.results.every((vehicle) => Number(vehicle.mileage) <= 30000));
});

test('normalizes salesperson drivetrain and mileage shorthand', () => {
  for (const query of [
    'used AWD SUVs under 30k miles',
    'used all-wheel drive SUVs under 30k miles',
    'used AWD SUVs under 30k mi',
    'used AWD SUVs under 30k m'
  ]) {
    const result = searchInventory(vehicles, query);
    assert.ok(result.results.length > 0, query);
    assert.ok(result.results.some((vehicle) => vehicle.stockNumber === 'H4001'), query);
  }
});

test('recognizes make-only intent from the live inventory catalog', () => {
  const parsed = parseInventoryQuery('Used Genesis vehicles', vehicles);
  assert.equal(parsed.filters.condition, 'used');
  assert.equal(parsed.filters.make, 'Genesis');
  assert.equal(parsed.filters.model, undefined);
});

test('recognizes make-only intent from the committed inventory dataset', () => {
  const parsed = parseInventoryQuery('Used Genesis vehicles', inventory.vehicles);
  assert.equal(parsed.filters.condition, 'used');
  assert.equal(parsed.filters.make, 'Genesis');
  assert.ok(inventory.vehicles.some((vehicle) => ['used', 'certified'].includes(vehicle.condition) && vehicle.make === 'Genesis'));
});

test('recognizes make and model from the live inventory catalog', () => {
  const parsed = parseInventoryQuery('show me used Hyundai Tucsons', vehicles);
  assert.equal(parsed.filters.condition, 'used');
  assert.equal(parsed.filters.make, 'Hyundai');
  assert.equal(parsed.filters.model, 'Tucson');
});

test('returns only dynamic make/model matches', () => {
  const result = searchInventory(vehicles, 'used Hyundai Tucson AWD');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].stockNumber, 'H4001');
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

test('returns null for missing effective price', () => {
  assert.equal(effectiveVehiclePrice({ condition: 'used', price: null, msrp: null }), null);
});

test('uses advertised price as the effective used-vehicle price', () => {
  assert.equal(effectiveVehiclePrice(vehicles[2]), 38900);
});

test('finds a vehicle by exact stock number', () => {
  const result = searchInventory(vehicles, 'U3001');
  assert.equal(result.results[0].stockNumber, 'U3001');
});
