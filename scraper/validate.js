import { vehicleKey } from './normalize.js';

function coverageRatio(actual, expected) {
  if (!Number.isFinite(expected) || expected <= 0) return null;
  return actual / expected;
}

export function validateInventory(vehicles, previousInventory, rules, expectedInventory = null) {
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
    errors.push(
      `Parsed inventory covers only ${(totalDiscoveryCoverage * 100).toFixed(1)}% of discovered VDPs; minimum is ${(minimumDiscoveryCoverage * 100).toFixed(1)}%.`
    );
  }

  if (newDiscoveryCoverage !== null && newDiscoveryCoverage < minimumDiscoveryCoverage) {
    errors.push(
      `New inventory covers only ${(newDiscoveryCoverage * 100).toFixed(1)}% of discovered new VDPs; minimum is ${(minimumDiscoveryCoverage * 100).toFixed(1)}%.`
    );
  }

  if (preOwnedDiscoveryCoverage !== null && preOwnedDiscoveryCoverage < minimumDiscoveryCoverage) {
    errors.push(
      `Pre-owned inventory covers only ${(preOwnedDiscoveryCoverage * 100).toFixed(1)}% of discovered pre-owned VDPs; minimum is ${(minimumDiscoveryCoverage * 100).toFixed(1)}%.`
    );
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
      vinCompleteness: Number(vinCompleteness.toFixed(4)),
      discoveryCoverage: {
        total: totalDiscoveryCoverage === null ? null : Number(totalDiscoveryCoverage.toFixed(4)),
        new: newDiscoveryCoverage === null ? null : Number(newDiscoveryCoverage.toFixed(4)),
        preOwned: preOwnedDiscoveryCoverage === null ? null : Number(preOwnedDiscoveryCoverage.toFixed(4))
      }
    }
  };
}
