import { vehicleKey } from './normalize.js';

export function validateInventory(vehicles, previousInventory, rules) {
  const errors = [];
  const warnings = [];
  const total = vehicles.length;
  const newCount = vehicles.filter((vehicle) => vehicle.condition === 'new').length;
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
    errors.push(`Only ${preOwnedCount} pre-owned vehicles were collected; minimum is ${rules.minimumPreOwnedVehicles}.`);
  }

  if (vinCompleteness < rules.minimumVinCompleteness) {
    errors.push(`VIN completeness is ${(vinCompleteness * 100).toFixed(1)}%; minimum is ${(rules.minimumVinCompleteness * 100).toFixed(1)}%.`);
  }

  const seen = new Map();
  for (const vehicle of vehicles) {
    const key = vehicleKey(vehicle);
    if (!key) {
      errors.push('A vehicle is missing VIN, stock number, and source URL.');
      continue;
    }
    if (seen.has(key)) {
      warnings.push(`Duplicate vehicle key ${key} was collected.`);
    }
    seen.set(key, vehicle);
  }

  const previous = previousInventory?.vehicles || [];
  if (previous.length >= rules.minimumTotalVehicles) {
    const retainedRatio = total / previous.length;
    if (retainedRatio < rules.minimumRetainedRatio) {
      errors.push(
        `Inventory fell from ${previous.length} to ${total} vehicles (${(retainedRatio * 100).toFixed(1)}% retained), below the safety threshold.`
      );
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
      vinCompleteness: Number(vinCompleteness.toFixed(4))
    }
  };
}
