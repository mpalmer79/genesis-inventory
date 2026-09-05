const MODEL_PATTERN = /\b(electrified\s+gv70|gv80\s+coupe|gv80|gv70|gv60|g90|g80|g70)(?:s)?\b/i;
const YEAR_PATTERN = /\b(20\d{2})\b/g;

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.$\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export function effectiveVehiclePrice(vehicle) {
  const value = vehicle?.condition === 'new'
    ? vehicle?.msrp ?? vehicle?.price
    : vehicle?.price ?? vehicle?.msrp;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseInventoryQuery(query) {
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

  const model = normalized.match(MODEL_PATTERN)?.[1];
  if (model) {
    filters.model = model.replace(/\s+/g, ' ').toUpperCase().replace('ELECTRIFIED GV70', 'Electrified GV70').replace('GV80 COUPE', 'GV80 Coupe');
    labels.push(filters.model);
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

  const colorWords = ['black', 'white', 'gray', 'grey', 'silver', 'blue', 'red', 'green', 'brown', 'beige', 'gold', 'orange', 'purple'];
  const colors = colorWords.filter((color) => new RegExp(`\\b${color}\\b`).test(normalized));
  if (colors.length) {
    filters.colors = colors.map((color) => color === 'grey' ? 'gray' : color);
    labels.push(colors.join('/'));
  }

  const stopWords = new Set([
    'show', 'me', 'find', 'all', 'any', 'with', 'that', 'are', 'is', 'a', 'an', 'the', 'and', 'or', 'for', 'of',
    'under', 'below', 'less', 'than', 'up', 'to', 'over', 'above', 'more', 'at', 'least', 'new', 'used', 'pre', 'owned',
    'certified', 'cpo', 'in', 'stock', 'transit', 'available', 'now', 'price', 'dollar', 'dollars', 'miles', 'mile', 'mi'
  ]);

  const tokens = normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token) && !/^\$?[\d,.]+k?$/.test(token));

  return { filters, tokens, labels };
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

  const effectivePrice = effectiveVehiclePrice(vehicle);
  if (filters.minPrice != null && (effectivePrice == null || effectivePrice < filters.minPrice)) return false;
  if (filters.maxPrice != null && (effectivePrice == null || effectivePrice > filters.maxPrice)) return false;

  const mileage = Number(vehicle.mileage);
  if (filters.maxMileage != null && (!Number.isFinite(mileage) || mileage > filters.maxMileage)) return false;

  if (filters.colors?.length) {
    const colors = normalizeText(`${vehicle.exteriorColor ?? ''} ${vehicle.interiorColor ?? ''}`).replace(/grey/g, 'gray');
    if (!filters.colors.every((color) => colors.includes(color))) return false;
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
  const parsed = parseInventoryQuery(query);
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
