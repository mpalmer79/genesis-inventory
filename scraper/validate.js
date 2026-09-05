import { vehicleKey } from './normalize.js';

const GENESIS_MODELS = new Set(['G70', 'G80', 'G90', 'GV60', 'GV70', 'Electrified GV70', 'GV80', 'GV80 Coupe']);
const CRITICAL_FIELDS = ['stockNumber', 'year', 'make', 'model', 'availability'];
const QUALITY_FIELDS = ['stockNumber', 'year', 'make', 'model', 'availability', 'exteriorColor', 'interiorColor', 'imageUrl'];

function coverageRatio(actual, expected) {
  if (!Number.isFinite(expected) || expected <= 0) return null;
  return actual / expected;
}

function completeness(vehicles, field) {
  if (!vehicles.length) return 0;
  const present = vehicles.filter((vehicle) => vehicle[field] !== null && vehicle[field] !== undefined && vehicle[field] !== '').length;
  return present / vehicles.length;
}

export function validateInventory(vehicles, previousInventory, rules, expectedInventory = null) {
  const errors = [];
  const warnings = [];
  const total = vehicles.length;
  const newVehicles = vehicles.filter((vehicle) => vehicle.condition === 'new');
  const newCount = newVehicles.length;
  const usedCount = vehicles.filter((vehicle) => vehicle.condition === 'used').length;
  const certifiedCount = vehicles.filter((vehicle) => vehicle.condition === 'certified').length;
  const preOwnedCount = usedCount + certifiedCount;
  const vinCount = vehicles.filter((vehicle) => vehicle.vin).length;
  const vinCompleteness = total ? vinCount / total : 0;

  if (total < rules.minimumTotalVehicles) {
    errors.push(`Only ${total} vehicles were collected; minimum is ${rules.minimumTotalVehicles}.`);
  }

  if (newCount < rules.minimumNewVehicles) {
    errors.push(`Only ${newCount} new vehicles were collected; minimum is ${rules.minimumNewVehicles}.`);
  }

  if (preOwnedCount < rules.minimumPreOwnedVehicles) {
    errors.push(`Only ${preOwnedCount} pre-owned vehicles were collected; minimum safety floor is ${rules.minimumPreOwnedVehicles}.`);
  }

  if (vinCompleteness < rules.minimumVinCompleteness) {
    errors.push(`VIN completeness is ${(vinCompleteness * 100).toFixed(1)}%; minimum is ${(rules.minimumVinCompleteness * 100).toFixed(1)}%.`);
  }

  const expectedTotal = Number(expectedInventory?.total);
  const expectedNew = Number(expectedInventory?.new);
  const expectedPreOwned = Number(expectedInventory?.preOwned);
  const totalDiscoveryCoverage = coverageRatio(total, expectedTotal);
  const newDiscoveryCoverage = coverageRatio(newCount, expectedNew);
  const preOwnedDiscoveryCoverage = coverageRatio(preOwnedCount, expectedPreOwned);
  const minimumDiscoveryCoverage = rules.minimumDiscoveryCoverage ?? 0.95;

  if (totalDiscoveryCoverage !== null && totalDiscoveryCoverage < minimumDiscoveryCoverage) {
    errors.push(`Parsed inventory covers only ${(totalDiscoveryCoverage * 100).toFixed(1)}% of discovered VDPs; minimum is ${(minimumDiscoveryCoverage * 100).toFixed(1)}%.`);
  }

  if (newDiscoveryCoverage !== null && newDiscoveryCoverage < minimumDiscoveryCoverage) {
    errors.push(`New inventory covers only ${(newDiscoveryCoverage * 100).toFixed(1)}% of discovered new VDPs; minimum is ${(minimumDiscoveryCoverage * 100).toFixed(1)}%.`);
  }

  if (preOwnedDiscoveryCoverage !== null && preOwnedDiscoveryCoverage < minimumDiscoveryCoverage) {
    errors.push(`Pre-owned inventory covers only ${(preOwnedDiscoveryCoverage * 100).toFixed(1)}% of discovered pre-owned VDPs; minimum is ${(minimumDiscoveryCoverage * 100).toFixed(1)}%.`);
  }

  const fieldCompleteness = Object.fromEntries(
    QUALITY_FIELDS.map((field) => [field, Number(completeness(vehicles, field).toFixed(4))])
  );
  const minimumCritical = rules.minimumCriticalFieldCompleteness ?? 0.95;
  for (const field of CRITICAL_FIELDS) {
    if (fieldCompleteness[field] < minimumCritical) {
      errors.push(`${field} completeness is ${(fieldCompleteness[field] * 100).toFixed(1)}%; minimum critical-field completeness is ${(minimumCritical * 100).toFixed(1)}%.`);
    }
  }

  const imageFloor = rules.minimumImageCompleteness ?? 0.8;
  if (fieldCompleteness.imageUrl < imageFloor) {
    warnings.push(`Vehicle image completeness is ${(fieldCompleteness.imageUrl * 100).toFixed(1)}%; target is ${(imageFloor * 100).toFixed(1)}%.`);
  }

  const invalidNewMake = newVehicles.filter((vehicle) => vehicle.make !== 'Genesis');
  if (invalidNewMake.length) {
    errors.push(`${invalidNewMake.length} new vehicle(s) were not identified as Genesis.`);
  }

  const unknownNewModels = newVehicles.filter((vehicle) => vehicle.model && !GENESIS_MODELS.has(vehicle.model));
  if (unknownNewModels.length > Math.max(2, Math.ceil(newCount * 0.02))) {
    errors.push(`${unknownNewModels.length} new vehicle(s) have unrecognized Genesis model names.`);
  } else if (unknownNewModels.length) {
    warnings.push(`${unknownNewModels.length} new vehicle(s) have unrecognized model names and should be reviewed.`);
  }

  const suspiciousElectric = newVehicles.filter((vehicle) =>
    /^(Electrified GV70|GV60)$/i.test(vehicle.model || '') &&
    (/turbo|dohc|cylinder|\bv\d\b/i.test(vehicle.engine || '') || /[6-9]-?speed|automatic|shiftronic/i.test(vehicle.transmission || ''))
  );
  if (suspiciousElectric.length) {
    warnings.push(`${suspiciousElectric.length} electric Genesis vehicle(s) still contain suspicious ICE powertrain text.`);
  }

  const seen = new Map();
  for (const vehicle of vehicles) {
    const key = vehicleKey(vehicle);
    if (!key) {
      errors.push('A vehicle is missing VIN, stock number, and source URL.');
      continue;
    }
    if (seen.has(key)) warnings.push(`Duplicate vehicle key ${key} was collected.`);
    seen.set(key, vehicle);
  }

  const previous = previousInventory?.vehicles || [];
  if (previous.length >= rules.minimumTotalVehicles) {
    const retainedRatio = total / previous.length;
    if (retainedRatio < rules.minimumRetainedRatio) {
      errors.push(`Inventory fell from ${previous.length} to ${total} vehicles (${(retainedRatio * 100).toFixed(1)}% retained), below the safety threshold.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      total,
      new: newCount,
      used: usedCount,
      certified: certifiedCount,
      preOwned: preOwnedCount,
      inStock: vehicles.filter((vehicle) => vehicle.availability === 'in-stock').length,
      inTransit: vehicles.filter((vehicle) => vehicle.availability === 'in-transit').length,
      vinCompleteness: Number(vinCompleteness.toFixed(4)),
      fieldCompleteness,
      discoveryCoverage: {
        total: totalDiscoveryCoverage === null ? null : Number(totalDiscoveryCoverage.toFixed(4)),
        new: newDiscoveryCoverage === null ? null : Number(newDiscoveryCoverage.toFixed(4)),
        preOwned: preOwnedDiscoveryCoverage === null ? null : Number(preOwnedDiscoveryCoverage.toFixed(4))
      }
    }
  };
}
