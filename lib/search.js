const MODEL_PATTERN = /\b(electrified\s+gv70|gv80\s+coupe|gv80|gv70|gv60|g90|g80|g70)(?:s)?\b/i;
const YEAR_PATTERN = /\b(20\d{2})\b/g;
const DISPLACEMENT_PATTERN = /\b([1-9](?:\.\d)?)\s*(?:l|liter|litre|t)?\b/i;

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.$\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCompactNumber(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().replace(/[$,\s]/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)(k)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2] ? Math.round(amount * 1000) : Math.round(amount);
}

function findRangeBound(query, qualifiers, nounPattern) {
  const patterns = [
    new RegExp(`(?:${qualifiers})\\s*\\$\\s*([\\d,.]+k?)`, 'i'),
    new RegExp(`(?:${qualifiers})\\s*([\\d,.]+k?)\\s*(?:${nounPattern})\\b`, 'i'),
    new RegExp(`(?:${nounPattern})\\s*(?:${qualifiers})\\s*\\$?([\\d,.]+k?)\\b`, 'i')
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match?.[1]) return parseCompactNumber(match[1]);
  }
  return null;
}

function extractRange(query, nouns) {
  const nounPattern = nouns.join('|');
  return {
    max: findRangeBound(query, 'under|below|less than|up to|max(?:imum)?(?: of)?', nounPattern),
    min: findRangeBound(query, 'over|above|more than|at least|min(?:imum)?(?: of)?', nounPattern)
  };
}

function catalogValues(vehicles, field) {
  return [...new Set((vehicles || []).map((vehicle) => vehicle?.[field]).filter(Boolean))]
    .sort((a, b) => String(b).length - String(a).length || String(a).localeCompare(String(b)));
}

function matchCatalogValue(normalizedQuery, values, allowPlural = false) {
  for (const value of values) {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue || normalizedValue.length < 2) continue;
    const escaped = escapeRegExp(normalizedValue).replace(/\\ /g, '\\s+');
    const suffix = allowPlural ? '(?:s)?' : '';
    if (new RegExp(`\\b${escaped}${suffix}\\b`, 'i').test(normalizedQuery)) return value;
  }
  return null;
}

function catalogScope(vehicles, condition) {
  if (!condition) return vehicles || [];
  if (condition === 'used') return (vehicles || []).filter((vehicle) => ['used', 'certified'].includes(vehicle.condition));
  return (vehicles || []).filter((vehicle) => vehicle.condition === condition);
}

function displacementText(vehicle) {
  return normalizeText(`${vehicle?.trim ?? ''} ${vehicle?.engine ?? ''}`);
}

function matchesDisplacement(vehicle, displacement) {
  if (!displacement) return true;
  const escaped = escapeRegExp(displacement);
  return new RegExp(`\\b${escaped}(?:l|t)?\\b`, 'i').test(displacementText(vehicle));
}

export function effectiveVehiclePrice(vehicle) {
  const value = vehicle?.condition === 'new'
    ? vehicle?.msrp ?? vehicle?.price
    : vehicle?.price ?? vehicle?.msrp;
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseInventoryQuery(query, vehicles = []) {
  const normalized = normalizeText(query);
  const filters = {};
  const labels = [];

  if (!normalized) return { filters, tokens: [], labels };

  if (/\b(cpo|certified|certified pre owned|certified pre-owned)\b/.test(normalized)) {
    filters.condition = 'certified';
    labels.push('Certified');
  } else if (/\b(used|pre owned|pre-owned)\b/.test(normalized)) {
    filters.condition = 'used';
    labels.push('Pre-Owned');
  } else if (/\bnew\b/.test(normalized)) {
    filters.condition = 'new';
    labels.push('New');
  }

  const scopedVehicles = catalogScope(vehicles, filters.condition);

  if (/\bin transit\b/.test(normalized)) {
    filters.availability = 'in-transit';
    labels.push('In Transit');
  } else if (/\bin stock\b|\bavailable now\b/.test(normalized)) {
    filters.availability = 'in-stock';
    labels.push('In Stock');
  }

  const drivetrain = normalized.match(/\b(awd|fwd|rwd|4wd|4x4)\b/i)?.[1]?.toUpperCase();
  if (drivetrain) {
    filters.drivetrain = drivetrain === '4X4' ? '4WD' : drivetrain;
    labels.push(filters.drivetrain);
  }

  const make = matchCatalogValue(normalized, catalogValues(scopedVehicles, 'make'));
  if (make) {
    filters.make = make;
    labels.push(make);
  }

  const staticModel = normalized.match(MODEL_PATTERN)?.[1];
  const modelPool = make
    ? scopedVehicles.filter((vehicle) => normalizeText(vehicle.make) === normalizeText(make))
    : scopedVehicles;
  const dynamicModel = matchCatalogValue(normalized, catalogValues(modelPool, 'model'), true);
  const model = staticModel
    ? staticModel.replace(/\s+/g, ' ').toUpperCase().replace('ELECTRIFIED GV70', 'Electrified GV70').replace('GV80 COUPE', 'GV80 Coupe')
    : dynamicModel;

  if (model) {
    filters.model = model;
    labels.push(model);

    if (!filters.make && scopedVehicles.length) {
      const matchingMakes = catalogValues(
        scopedVehicles.filter((vehicle) => normalizeText(vehicle.model) === normalizeText(model)),
        'make'
      );
      if (matchingMakes.length === 1) {
        filters.make = matchingMakes[0];
        labels.unshift(matchingMakes[0]);
      }
    }
  }

  const years = [...normalized.matchAll(YEAR_PATTERN)].map((match) => Number(match[1]));
  if (years.length) {
    filters.years = [...new Set(years)];
    labels.push(filters.years.join('/'));
  }

  if (/\bsuvs?\b|\bcrossovers?\b/.test(normalized)) {
    filters.bodyStyle = 'suv';
    labels.push('SUV');
  } else if (/\bsedans?\b/.test(normalized)) {
    filters.bodyStyle = 'sedan';
    labels.push('Sedan');
  }

  if (/\b(ev|electric|electrified)\b/.test(normalized)) {
    filters.electric = true;
    labels.push('EV');
  }

  const mileageMatch = normalized.match(/(?:under|below|less than|up to|max(?:imum)?(?: of)?)\s*([\d,.]+k?)\s*(?:miles?|mi)\b/i);
  if (mileageMatch) {
    filters.maxMileage = parseCompactNumber(mileageMatch[1]);
    labels.push(`≤ ${filters.maxMileage.toLocaleString()} mi`);
  }

  const priceRange = extractRange(normalized, ['dollars?', 'price']);
  if (priceRange.min != null) {
    filters.minPrice = priceRange.min;
    labels.push(`$${priceRange.min.toLocaleString()}+`);
  }
  if (priceRange.max != null) {
    filters.maxPrice = priceRange.max;
    labels.push(`≤ $${priceRange.max.toLocaleString()}`);
  }

  const displacementMatch = normalized.match(DISPLACEMENT_PATTERN);
  if (displacementMatch?.[1] && /\./.test(displacementMatch[1])) {
    filters.displacement = displacementMatch[1];
    labels.push(`${filters.displacement}L`);
  }

  const colorWords = ['black', 'white', 'gray', 'grey', 'silver', 'blue', 'red', 'green', 'brown', 'beige', 'gold', 'orange', 'purple'];
  const colors = colorWords.filter((color) => new RegExp(`\\b${color}\\b`).test(normalized));
  if (colors.length) {
    const normalizedColors = colors.map((color) => color === 'grey' ? 'gray' : color);
    if (/\b(?:interior|inside|cabin)\b/.test(normalized)) {
      filters.interiorColors = normalizedColors;
      labels.push(`${colors.join('/')} interior`);
    } else {
      filters.colors = normalizedColors;
      labels.push(colors.join('/'));
    }
  }

  const stopWords = new Set([
    'show', 'me', 'find', 'all', 'any', 'with', 'that', 'are', 'is', 'a', 'an', 'the', 'and', 'or', 'for', 'of',
    'under', 'below', 'less', 'than', 'up', 'to', 'over', 'above', 'more', 'at', 'least', 'new', 'used', 'pre', 'owned',
    'certified', 'cpo', 'in', 'stock', 'transit', 'available', 'now', 'price', 'dollar', 'dollars', 'miles', 'mile', 'mi',
    'vehicle', 'vehicles', 'interior', 'inside', 'cabin', 'exterior', 'outside', 'liter', 'liters', 'litre', 'litres'
  ]);

  const tokens = normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token) && !/^\$?[\d,.]+k?$/.test(token) && !/^[1-9](?:\.\d)?(?:l|t)$/.test(token));

  return { filters, tokens, labels: [...new Set(labels)] };
}

function normalizeModel(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function vehicleSearchText(vehicle) {
  return normalizeText([
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    vehicle.exteriorColor,
    vehicle.interiorColor,
    vehicle.bodyStyle,
    vehicle.drivetrain,
    vehicle.transmission,
    vehicle.engine,
    vehicle.vin,
    vehicle.stockNumber,
    vehicle.location,
    vehicle.condition,
    vehicle.availability
  ].filter(Boolean).join(' '));
}

function matchesFilters(vehicle, filters) {
  if (filters.condition) {
    if (filters.condition === 'used') {
      if (!['used', 'certified'].includes(vehicle.condition)) return false;
    } else if (vehicle.condition !== filters.condition) return false;
  }

  if (filters.availability && vehicle.availability !== filters.availability) return false;

  if (filters.make && normalizeText(vehicle.make) !== normalizeText(filters.make)) return false;

  if (filters.drivetrain) {
    const drivetrain = normalizeText(vehicle.drivetrain);
    if (!drivetrain.includes(filters.drivetrain.toLowerCase())) return false;
  }

  if (filters.model) {
    const vehicleModel = normalizeModel(vehicle.model);
    const wantedModel = normalizeModel(filters.model);
    if (vehicleModel !== wantedModel && !vehicleModel.includes(wantedModel)) return false;
  }

  if (filters.years?.length && !filters.years.includes(Number(vehicle.year))) return false;

  if (filters.bodyStyle) {
    const bodyStyle = normalizeText(vehicle.bodyStyle);
    if (!bodyStyle.includes(filters.bodyStyle)) return false;
  }

  if (filters.electric) {
    const electricText = normalizeText([vehicle.model, vehicle.trim, vehicle.engine].join(' '));
    if (!/electric|electrified|gv60/.test(electricText)) return false;
  }

  if (!matchesDisplacement(vehicle, filters.displacement)) return false;

  const effectivePrice = effectiveVehiclePrice(vehicle);
  if (filters.minPrice != null && (effectivePrice == null || effectivePrice < filters.minPrice)) return false;
  if (filters.maxPrice != null && (effectivePrice == null || effectivePrice > filters.maxPrice)) return false;

  const mileage = Number(vehicle.mileage);
  if (filters.maxMileage != null && (!Number.isFinite(mileage) || mileage > filters.maxMileage)) return false;

  if (filters.colors?.length) {
    const exteriorColor = normalizeText(vehicle.exteriorColor ?? '').replace(/grey/g, 'gray');
    if (!filters.colors.every((color) => exteriorColor.includes(color))) return false;
  }

  if (filters.interiorColors?.length) {
    const interiorColor = normalizeText(vehicle.interiorColor ?? '').replace(/grey/g, 'gray');
    if (!filters.interiorColors.every((color) => interiorColor.includes(color))) return false;
  }

  return true;
}

function scoreVehicle(vehicle, tokens, rawQuery) {
  if (!tokens.length && !rawQuery) return 0;

  const query = normalizeText(rawQuery);
  const vin = normalizeText(vehicle.vin);
  const stock = normalizeText(vehicle.stockNumber);
  const model = normalizeText(vehicle.model);
  const title = normalizeText(`${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''} ${vehicle.trim ?? ''}`);
  const colors = normalizeText(`${vehicle.exteriorColor ?? ''} ${vehicle.interiorColor ?? ''}`);
  const allText = vehicleSearchText(vehicle);

  let score = 0;
  if (query && (vin === query || stock === query)) score += 1000;
  else if (query && (vin.includes(query) || stock.includes(query))) score += 250;

  for (const token of tokens) {
    if (model === token) score += 35;
    if (title.includes(token)) score += 16;
    if (colors.includes(token)) score += 9;
    if (allText.includes(token)) score += 4;
    else score -= 2;
  }

  if (vehicle.availability === 'in-stock') score += 1;
  return score;
}

export function searchInventory(vehicles, query) {
  const parsed = parseInventoryQuery(query, vehicles);
  const filtered = vehicles.filter((vehicle) => matchesFilters(vehicle, parsed.filters));
  const scored = filtered.map((vehicle) => ({
    vehicle,
    score: scoreVehicle(vehicle, parsed.tokens, query)
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (effectiveVehiclePrice(a.vehicle) ?? Number.MAX_SAFE_INTEGER) - (effectiveVehiclePrice(b.vehicle) ?? Number.MAX_SAFE_INTEGER);
  });

  return {
    parsed,
    results: scored.map((entry) => entry.vehicle)
  };
}

export { normalizeText, parseCompactNumber };
