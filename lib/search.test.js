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
    exteriorColor: 'Blue',
    interiorColor: 'Black',
    bodyStyle: 'SUV',
    drivetrain: 'AWD',
    mileage: 18000,
    price: 27900,
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

test('does not treat mileage as a price ceiling', () => {
  const parsed = parseInventoryQuery('used AWD SUVs under 30k miles', vehicles);
  assert.equal(parsed.filters.condition, 'used');
  assert.equal(parsed.filters.drivetrain, 'AWD');
  assert.equal(parsed.filters.bodyStyle, 'suv');
  assert.equal(parsed.filters.maxMileage, 30000);
  assert.equal(parsed.filters.maxPrice, undefined);
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
