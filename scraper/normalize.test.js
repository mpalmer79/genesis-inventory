import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVehicle } from './normalize.js';

test('normalizes a Genesis VDP with labeled vehicle fields', () => {
  const vehicle = normalizeVehicle({
    condition: 'new',
    source: 'new',
    url: 'https://www.genesisofmanchester.com/new/Genesis/2026-Genesis-GV80-example.htm',
    heading: 'New 2026 GV80 2.5T',
    bodyText: `
      New 2026 GV80 2.5T
      Exterior Color
      Vik Black
      Interior Color
      Obsidian Black
      Body/Seating
      SUV/5 seats
      Transmission
      8 speed automatic
      Drivetrain
      AWD
      Engine
      2.5L DOHC
      VIN
      KMUHFESB8TU355697
      Stock Number
      GM260787
      MSRP
      $68,450
    `,
    jsonLd: [],
    images: ['https://example.com/gv80.jpg']
  });

  assert.equal(vehicle.vin, 'KMUHFESB8TU355697');
  assert.equal(vehicle.stockNumber, 'GM260787');
  assert.equal(vehicle.year, 2026);
  assert.equal(vehicle.make, 'Genesis');
  assert.equal(vehicle.model, 'GV80');
  assert.equal(vehicle.trim, '2.5T');
  assert.equal(vehicle.exteriorColor, 'Vik Black');
  assert.equal(vehicle.interiorColor, 'Obsidian Black');
  assert.equal(vehicle.drivetrain, 'AWD');
  assert.equal(vehicle.transmission, '8 speed automatic');
  assert.equal(vehicle.engine, '2.5L DOHC');
  assert.equal(vehicle.msrp, 68450);
  assert.equal(vehicle.condition, 'new');
});
