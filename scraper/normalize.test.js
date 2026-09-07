import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVehicle } from './normalize.js';

test('normalizes a new Genesis VDP with labeled vehicle fields', () => {
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
      Certified Pre-Owned Inventory
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
  assert.equal(vehicle.certified, false);
});

test('uses the certified inventory source as authoritative CPO classification', () => {
  const vehicle = normalizeVehicle({
    condition: 'certified',
    source: 'certified',
    url: 'https://www.genesisofmanchester.com/used/Genesis/2024-Genesis-GV70-example.htm',
    heading: 'Used 2024 Genesis GV70 2.5T Advanced',
    bodyText: `
      Used 2024 Genesis GV70 2.5T Advanced
      VIN
      KMUMADTB0RU123456
      Stock Number
      GMU1234
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.condition, 'certified');
  assert.equal(vehicle.certified, true);
});

test('prefers the VDP vehicle gallery photo over the generic Genesis branding image', () => {
  const genericBrandImage = 'https://pictures.dealer.com/g/genesisgroup/0965/501c0321c6a3530ad91e53dc61e0385bx.jpg';
  const primaryVehicleImage = 'https://pictures.dealer.com/generic-genesis-OEM_VIN_STOCK_PHOTOS/0bf3db31e847b3c0a6db3d8c320043bc.jpg?impolicy=resize&w=1024';

  const vehicle = normalizeVehicle({
    condition: 'new',
    source: 'new',
    url: 'https://www.genesisofmanchester.com/new/Genesis/2026-Genesis-G70-example.htm',
    heading: 'New 2026 G70 3.3T Sport Prestige AWD',
    bodyText: `
      New 2026 G70 3.3T Sport Prestige AWD
      VIN
      KMTG54SE5TU176220
      Stock Number
      GM260768
    `,
    jsonLd: [],
    images: [genericBrandImage, primaryVehicleImage]
  });

  assert.equal(vehicle.imageUrl, primaryVehicleImage);
});

test('prefers structured VDP image metadata when available', () => {
  const structuredImage = 'https://pictures.dealer.com/a/autofairhyundai/vehicle-photo.jpg?impolicy=resize&w=1024';

  const vehicle = normalizeVehicle({
    condition: 'used',
    source: 'shared-used',
    url: 'https://www.autofairhyundai.com/used/Hyundai/2024-Hyundai-Tucson-example.htm',
    heading: 'Used 2024 Hyundai Tucson SEL',
    bodyText: `
      Used 2024 Hyundai Tucson SEL
      VIN
      5NMJB3DE0RH123456
      Stock Number
      HU12345
    `,
    jsonLd: [{ '@type': 'Vehicle', image: structuredImage }],
    images: ['https://pictures.dealer.com/logo.jpg']
  });

  assert.equal(vehicle.imageUrl, structuredImage);
});

test('removes obviously incorrect ICE powertrain fields from electric Genesis models', () => {
  const vehicle = normalizeVehicle({
    condition: 'new',
    source: 'new',
    url: 'https://www.genesisofmanchester.com/new/Genesis/2027-Genesis-Electrified-GV70-example.htm',
    heading: 'New 2027 Genesis Electrified GV70 Standard',
    bodyText: `
      Transmission
      8-Speed Automatic with SHIFTRONIC
      Engine
      PDI Turbocharged DOHC
      VIN
      KMUMCET11VU013301
      Stock Number
      013301
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.model, 'Electrified GV70');
  assert.equal(vehicle.engine, null);
  assert.equal(vehicle.transmission, null);
});

test('rejects generic action text as a stocking location', () => {
  const vehicle = normalizeVehicle({
    condition: 'used',
    source: 'shared-used',
    url: 'https://www.autofairhyundai.com/used/Hyundai/2024-Hyundai-Tucson-example.htm',
    heading: 'Used 2024 Hyundai Tucson SEL',
    bodyText: `
      Location
      Details
      VIN
      5NMJB3DE0RH123456
      Stock Number
      HU12345
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.location, null);
});

test('normalizes separator-heavy shared-used Genesis titles', () => {
  const vehicle = normalizeVehicle({
    condition: 'used',
    source: 'shared-used',
    url: 'https://www.autofairhyundai.com/used/Genesis/2023-Genesis-GV70-example.htm',
    heading: 'Used | 2023 | GenesisGV70 2.5T',
    bodyText: `
      Exterior Color
      Brunswick Green
      Interior Color
      Green
      Location
      Sales: (603) 420-7772
      VIN
      KMUMADTB5PU109511
      Stock Number
      GM20157T
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.year, 2023);
  assert.equal(vehicle.make, 'Genesis');
  assert.equal(vehicle.model, 'GV70');
  assert.equal(vehicle.trim, '2.5T');
  assert.equal(vehicle.location, null);
});

test('rejects phone-number text as a stocking location', () => {
  const vehicle = normalizeVehicle({
    condition: 'used',
    source: 'shared-used',
    url: 'https://www.autofairhyundai.com/used/Hyundai/2024-Hyundai-Tucson-example.htm',
    heading: 'Used 2024 Hyundai Tucson SEL',
    bodyText: `
      Location
      (603) 555-1212
      VIN
      5NMJB3DE0RH123456
      Stock Number
      HU12345
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.location, null);
});

test('uses the VDP URL to split concatenated used make and model names', () => {
  const vehicle = normalizeVehicle({
    condition: 'used',
    source: 'shared-used',
    url: 'https://www.autofairhyundai.com/used/Chevrolet/2013-Chevrolet-Spark-35029f91ac18460621052e7cff0b6816.htm',
    heading: 'Used | 2013 | ChevroletSpark 1LT Auto',
    bodyText: `
      VIN
      KL8CD6S93DC505933
      Stock Number
      HY19163W
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.make, 'Chevrolet');
  assert.equal(vehicle.model, 'Spark');
  assert.equal(vehicle.trim, '1LT Auto');
});

test('uses the VDP URL to preserve multi-word used models', () => {
  const vehicle = normalizeVehicle({
    condition: 'used',
    source: 'shared-used',
    url: 'https://www.autofairhyundai.com/used/Hyundai/2024-Hyundai-Santa-Fe-1234567890abcdef1234567890abcdef.htm',
    heading: 'Used | 2024 | HyundaiSanta Fe SEL AWD',
    bodyText: `
      VIN
      5NMP3DGL0RH123456
      Stock Number
      HY20000T
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.make, 'Hyundai');
  assert.equal(vehicle.model, 'Santa Fe');
  assert.equal(vehicle.trim, 'SEL AWD');
});

test('treats an active shared-used listing VDP as in stock when the VDP omits availability text', () => {
  const vehicle = normalizeVehicle({
    condition: 'used',
    source: 'shared-used',
    url: 'https://www.autofairhyundai.com/used/Hyundai/2024-Hyundai-Tucson-1234567890abcdef1234567890abcdef.htm',
    heading: 'Used 2024 Hyundai Tucson SEL AWD',
    bodyText: `
      Used 2024 Hyundai Tucson SEL AWD
      VIN
      5NMJB3DE0RH123456
      Stock Number
      HY20001T
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.availability, 'in-stock');
});

test('does not invent availability for a new vehicle when the VDP provides no availability signal', () => {
  const vehicle = normalizeVehicle({
    condition: 'new',
    source: 'new',
    url: 'https://www.genesisofmanchester.com/new/Genesis/2026-Genesis-GV80-1234567890abcdef1234567890abcdef.htm',
    heading: 'New 2026 Genesis GV80 2.5T',
    bodyText: `
      New 2026 Genesis GV80 2.5T
      VIN
      KMUHFESB8TU355697
      Stock Number
      GM260787
    `,
    jsonLd: [],
    images: []
  });

  assert.equal(vehicle.availability, null);
});
