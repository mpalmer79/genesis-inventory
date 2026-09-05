const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
const MONEY_PATTERN = /\$\s?([0-9]{2,3}(?:,[0-9]{3})*(?:\.\d{2})?)/;

function clean(value) {
  if (value == null) return null;
  const text = String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

function toNumber(value) {
  if (value == null) return null;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function extractByLabel(bodyText, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`${escaped}\\s*[:#]?\\s*([^\\n\\r]+)`, 'i'),
      new RegExp(`${escaped}\\s*[\\n\\r]+\\s*([^\\n\\r]+)`, 'i')
    ];
    for (const pattern of patterns) {
      const match = bodyText.match(pattern);
      if (match?.[1]) return clean(match[1]);
    }
  }
  return null;
}

function findJsonLdValue(objects, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const stack = [...objects];
  while (stack.length) {
    const current = stack.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase()) && ['string', 'number'].includes(typeof value)) {
        const result = clean(value);
        if (result) return result;
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

function parseTitle(rawTitle, structuredName) {
  const text = clean(rawTitle) || clean(structuredName) || '';
  const normalized = text
    .replace(/^new\s+/i, '')
    .replace(/^used\s+/i, '')
    .replace(/^certified\s+(?:pre-owned\s+)?/i, '')
    .trim();

  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  let remainder = yearMatch ? normalized.slice(yearMatch.index + yearMatch[0].length).trim() : normalized;

  let make = null;
  if (/^genesis\b/i.test(remainder)) {
    make = 'Genesis';
    remainder = remainder.replace(/^genesis\b/i, '').trim();
  }

  const genesisModelMatch = remainder.match(/\b(Electrified\s+GV70|GV80\s+Coupe|GV80|GV70|GV60|G90|G80|G70)\b/i);
  let model = null;
  let trim = null;

  if (genesisModelMatch) {
    make = make || 'Genesis';
    model = clean(genesisModelMatch[1])?.replace(/\s+/g, ' ');
    trim = clean(remainder.slice(genesisModelMatch.index + genesisModelMatch[0].length));
  } else {
    const parts = remainder.split(/\s+/).filter(Boolean);
    if (!make && parts.length) make = parts.shift() || null;
    model = parts.shift() || null;
    trim = clean(parts.join(' '));
  }

  return { year, make, model, trim };
}

function parsePrice(bodyText, jsonLd, labels) {
  const structured = findJsonLdValue(jsonLd, labels);
  const fromStructured = toNumber(structured);
  if (fromStructured != null) return fromStructured;

  for (const label of labels) {
    const value = extractByLabel(bodyText, [label]);
    const number = toNumber(value);
    if (number != null) return number;
  }

  return null;
}

function parseAvailability(bodyText, jsonLd) {
  const structured = clean(findJsonLdValue(jsonLd, ['availability']))?.toLowerCase() || '';
  if (/instock|in_stock/.test(structured)) return 'in-stock';
  if (/preorder|pre-order|intransit|in_transit/.test(structured)) return 'in-transit';
  if (/outofstock|out_of_stock/.test(structured)) return 'unavailable';

  const upperVehicleSection = bodyText.slice(0, 12000);
  if (/\bin transit\b/i.test(upperVehicleSection)) return 'in-transit';
  if (/\bin stock\b/i.test(upperVehicleSection)) return 'in-stock';
  return null;
}

export function normalizeVehicle(raw) {
  const bodyText = raw.bodyText || '';
  const jsonLd = raw.jsonLd || [];
  const heading = clean(raw.heading) || '';
  const structuredName = findJsonLdValue(jsonLd, ['name']);
  const title = parseTitle(heading, structuredName);

  const vin = clean(
    findJsonLdValue(jsonLd, ['vehicleIdentificationNumber', 'vin']) ||
      extractByLabel(bodyText, ['VIN']) ||
      bodyText.match(VIN_PATTERN)?.[0]
  )?.toUpperCase() || null;

  const stockNumber = clean(
    findJsonLdValue(jsonLd, ['sku', 'stockNumber']) ||
      extractByLabel(bodyText, ['Stock Number', 'Stock #', 'Stock'])
  )?.toUpperCase() || null;

  const mileageValue =
    findJsonLdValue(jsonLd, ['mileageFromOdometer', 'mileage']) ||
    extractByLabel(bodyText, ['Mileage', 'Odometer']);

  const msrp = parsePrice(bodyText, jsonLd, ['msrp', 'MSRP']);
  const price = parsePrice(bodyText, jsonLd, ['price', 'salePrice', 'internetPrice', 'Dealer Price', 'Sale Price', 'Price']);

  const isCertified = raw.condition === 'certified' || /^certified\b/i.test(heading);
  const condition = raw.condition === 'new' ? 'new' : isCertified ? 'certified' : 'used';
  const imageUrl = clean(raw.images?.find((src) => /^https?:\/\//i.test(src)) || null);

  return {
    vin,
    stockNumber,
    condition,
    certified: condition === 'certified',
    availability: parseAvailability(bodyText, jsonLd),
    year: title.year,
    make: title.make,
    model: title.model,
    trim: title.trim,
    exteriorColor: clean(extractByLabel(bodyText, ['Exterior Color'])),
    interiorColor: clean(extractByLabel(bodyText, ['Interior Color'])),
    bodyStyle: clean(extractByLabel(bodyText, ['Body/Seating', 'Body Style'])),
    drivetrain: clean(extractByLabel(bodyText, ['Drivetrain', 'Drive Line', 'Drive Type'])),
    transmission: clean(extractByLabel(bodyText, ['Transmission'])),
    engine: clean(extractByLabel(bodyText, ['Engine'])),
    mileage: toNumber(mileageValue),
    msrp,
    price,
    location: clean(extractByLabel(bodyText, ['Location'])),
    rawTitle: heading || structuredName,
    source: raw.source,
    sourceUrl: raw.url,
    imageUrl
  };
}

export function vehicleKey(vehicle) {
  return vehicle.vin || vehicle.stockNumber || vehicle.sourceUrl;
}

export function csvEscape(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export { clean, toNumber, MONEY_PATTERN };
