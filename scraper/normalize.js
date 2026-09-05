const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
const MONEY_PATTERN = /\$\s?([0-9]{2,3}(?:,[0-9]{3})*(?:\.\d{2})?)/;
const VDP_FILENAME_PATTERN = /^(20\d{2})-(.+)-([a-f0-9]{32})\.htm$/i;

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

function compactIdentity(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

function findJsonLdImages(objects) {
  const images = [];
  const stack = [...objects];

  while (stack.length) {
    const current = stack.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = key.toLowerCase();
      if (['image', 'contenturl', 'thumbnailurl'].includes(normalizedKey)) {
        if (typeof value === 'string') images.push(value);
        else if (Array.isArray(value)) {
          for (const entry of value) {
            if (typeof entry === 'string') images.push(entry);
            else if (entry && typeof entry === 'object') stack.push(entry);
          }
        } else if (value && typeof value === 'object') {
          stack.push(value);
        }
        continue;
      }

      if (value && typeof value === 'object') stack.push(value);
    }
  }

  return images;
}

function absoluteImageUrl(value, baseUrl) {
  const candidate = clean(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function scoreImageUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const search = url.search.toLowerCase();
    let score = 0;

    if (hostname === 'pictures.dealer.com' || hostname.endsWith('.pictures.dealer.com')) score += 40;
    if (/oem[_-]vin[_-]stock[_-]photos/.test(path)) score += 140;
    if (/(^|[/_-])(inventory|vehicle|stock|vin)([/_.-]|$)/.test(path)) score += 35;
    if (/impolicy=resize/.test(search)) score += 20;

    const width = Number(url.searchParams.get('w'));
    if (Number.isFinite(width) && width >= 600) score += 25;

    if (/(logo|favicon|sprite|icon|badge|kbb|brandmark|wordmark)/.test(path)) score -= 250;
    if (/genesisgroup\/0965\/501c0321c6a3530ad91e53dc61e0385b/.test(path)) score -= 400;

    return score;
  } catch {
    return -1000;
  }
}

function selectVehicleImage(raw) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (value, structured = false) => {
    const url = absoluteImageUrl(value, raw.url);
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({
      url,
      score: scoreImageUrl(url) + (structured ? 30 : 0)
    });
  };

  for (const image of findJsonLdImages(raw.jsonLd || [])) addCandidate(image, true);
  for (const image of raw.images || []) addCandidate(image, false);

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score <= 0) return null;
  return best.url;
}

function stripTitleSeparators(value) {
  const text = clean(value);
  if (!text) return '';
  return text
    .replace(/^[|•·:/\-\s]+/, '')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatUrlMake(value) {
  const make = clean(value) || '';
  const known = new Map([
    ['Land-Rover', 'Land Rover'],
    ['Alfa-Romeo', 'Alfa Romeo'],
    ['Mercedes-Benz', 'Mercedes-Benz']
  ]);
  return known.get(make) || make;
}

function parseUrlVehicleIdentity(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
    if (segments.length < 3 || !/^(new|used)$/i.test(segments[0])) return null;

    const makeSegment = segments[1];
    const filename = segments.at(-1);
    const match = filename.match(VDP_FILENAME_PATTERN);
    if (!match) return null;

    const year = Number(match[1]);
    const identitySlug = match[2];
    const slugParts = identitySlug.split('-').filter(Boolean);
    const makeTarget = compactIdentity(makeSegment);
    let consumed = '';
    let modelStart = -1;

    for (let index = 0; index < slugParts.length; index += 1) {
      consumed += compactIdentity(slugParts[index]);
      if (consumed === makeTarget) {
        modelStart = index + 1;
        break;
      }
      if (!makeTarget.startsWith(consumed)) break;
    }

    if (modelStart < 0 || modelStart >= slugParts.length) return null;
    const modelSlug = slugParts.slice(modelStart).join('-');
    if (!modelSlug) return null;

    return {
      year,
      make: formatUrlMake(makeSegment),
      modelSlug
    };
  } catch {
    return null;
  }
}

function stripLeadingIdentity(value, identity) {
  const text = stripTitleSeparators(value);
  const target = compactIdentity(identity);
  if (!text || !target) return text;

  let consumed = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[a-z0-9]/i.test(char)) consumed += char.toLowerCase();
    if (!target.startsWith(consumed)) return text;
    if (consumed === target) return stripTitleSeparators(text.slice(index + 1));
  }

  return text;
}

function parseModelFromUrlRemainder(remainder, modelSlug) {
  const target = compactIdentity(modelSlug);
  const parts = stripTitleSeparators(remainder).split(/\s+/).filter(Boolean);
  let consumed = '';

  for (let index = 0; index < parts.length; index += 1) {
    consumed += compactIdentity(parts[index]);
    if (consumed === target) {
      return {
        model: clean(parts.slice(0, index + 1).join(' ')),
        trim: clean(parts.slice(index + 1).join(' '))
      };
    }
    if (!target.startsWith(consumed)) break;
  }

  return {
    model: clean(modelSlug.replace(/-/g, ' ')),
    trim: null
  };
}

function canonicalGenesisModel(value) {
  const text = clean(value) || '';
  const match = text.match(/^(Electrified\s+GV70|GV80\s+Coupe|GV80|GV70|GV60|G90|G80|G70)$/i);
  if (!match) return text || null;
  const normalized = match[1].replace(/\s+/g, ' ').toUpperCase();
  if (normalized === 'ELECTRIFIED GV70') return 'Electrified GV70';
  if (normalized === 'GV80 COUPE') return 'GV80 Coupe';
  return normalized;
}

function parseTitle(rawTitle, structuredName, rawUrl) {
  const text = clean(rawTitle) || clean(structuredName) || '';
  const normalized = stripTitleSeparators(
    text
      .replace(/^new\s+/i, '')
      .replace(/^used\s+/i, '')
      .replace(/^certified\s+(?:pre-owned\s+)?/i, '')
  );

  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const urlIdentity = parseUrlVehicleIdentity(rawUrl);
  const year = yearMatch ? Number(yearMatch[1]) : urlIdentity?.year ?? null;
  let remainder = stripTitleSeparators(
    yearMatch ? normalized.slice(yearMatch.index + yearMatch[0].length) : normalized
  );

  if (urlIdentity) {
    remainder = stripLeadingIdentity(remainder, urlIdentity.make);
    const parsedModel = parseModelFromUrlRemainder(remainder, urlIdentity.modelSlug);
    const model = urlIdentity.make === 'Genesis'
      ? canonicalGenesisModel(parsedModel.model)
      : parsedModel.model;

    return {
      year,
      make: urlIdentity.make,
      model,
      trim: parsedModel.trim
    };
  }

  let make = null;
  if (/^genesis(?:\s+|(?=electrified|g(?:v)?\d))/i.test(remainder)) {
    make = 'Genesis';
    remainder = stripTitleSeparators(remainder.replace(/^genesis\s*/i, ''));
  }

  const genesisModelMatch = remainder.match(/\b(Electrified\s+GV70|GV80\s+Coupe|GV80|GV70|GV60|G90|G80|G70)\b/i);
  let model = null;
  let trim = null;

  if (genesisModelMatch) {
    make = make || 'Genesis';
    model = canonicalGenesisModel(genesisModelMatch[1]);
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

function sanitizeLocation(value) {
  const location = clean(value);
  if (!location || location.length > 120) return null;
  if (/^(details|view details|directions|get directions|contact|contact us|schedule service|learn more)$/i.test(location)) return null;
  if (/^(sales|service|parts|phone|call|text)\b/i.test(location)) return null;
  if (/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(location)) return null;
  return location;
}

function sanitizePowertrain(title, engineValue, transmissionValue) {
  let engine = clean(engineValue);
  let transmission = clean(transmissionValue);
  const isElectric = /\b(electrified\s+gv70|gv60)\b/i.test(`${title.model || ''} ${title.trim || ''}`);

  if (isElectric) {
    if (engine && !/electric|motor|ev|permanent magnet/i.test(engine)) engine = null;
    if (transmission && /(?:[6-9]|10)[-\s]?speed|automatic|shiftronic/i.test(transmission) && !/single|reduction|electric/i.test(transmission)) {
      transmission = null;
    }
  }

  return { engine, transmission };
}

export function normalizeVehicle(raw) {
  const bodyText = raw.bodyText || '';
  const jsonLd = raw.jsonLd || [];
  const heading = clean(raw.heading) || '';
  const structuredName = findJsonLdValue(jsonLd, ['name']);
  const title = parseTitle(heading, structuredName, raw.url);

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
  const imageUrl = selectVehicleImage(raw);
  const rawEngine = extractByLabel(bodyText, ['Engine']);
  const rawTransmission = extractByLabel(bodyText, ['Transmission']);
  const powertrain = sanitizePowertrain(title, rawEngine, rawTransmission);

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
    transmission: powertrain.transmission,
    engine: powertrain.engine,
    mileage: toNumber(mileageValue),
    msrp,
    price,
    location: sanitizeLocation(extractByLabel(bodyText, ['Location'])),
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

export { clean, toNumber, MONEY_PATTERN, selectVehicleImage, sanitizeLocation, sanitizePowertrain, parseUrlVehicleIdentity };
