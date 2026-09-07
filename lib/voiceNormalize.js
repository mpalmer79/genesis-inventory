function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanTranscript(value) {
  return String(value ?? '')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseWords(value) {
  return String(value)
    .split(/\s+/)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
    .join(' ');
}

function catalogValues(vehicles, field) {
  return [...new Set((vehicles || []).map((vehicle) => vehicle?.[field]).filter(Boolean))]
    .sort((a, b) => String(b).length - String(a).length || String(a).localeCompare(String(b)));
}

function normalizeDriveTerms(text) {
  return text
    .replace(/\ball[ -]?wheel(?: drive)?\b/gi, 'AWD')
    .replace(/\bfront[ -]?wheel(?: drive)?\b/gi, 'FWD')
    .replace(/\brear[ -]?wheel(?: drive)?\b/gi, 'RWD')
    .replace(/\bfour[ -]?wheel(?: drive)?\b/gi, '4WD')
    .replace(/\bfour by four\b/gi, '4x4');
}

function normalizeMileageTerms(text) {
  return text
    .replace(/\b(\d+(?:\.\d+)?)\s*k\s*(?:miles?|mile|mi|m)\b/gi, (_, amount) => `${amount}k miles`)
    .replace(/\b(\d{1,3})\s*thousand\s*(?:miles?|mile|mi|m)\b/gi, (_, amount) => `${amount}k miles`);
}

function normalizeGenesisModels(text) {
  const replacements = [
    [/\b(?:g\s*v|gee\s*vee|gavi|gavvy|g v)\s*(?:eighty|80)\b/gi, 'GV80'],
    [/\b(?:g\s*v|gee\s*vee|gavi|gavvy|g v)\s*(?:seventy|70)\b/gi, 'GV70'],
    [/\b(?:g\s*v|gee\s*vee|gavi|gavvy|g v)\s*(?:sixty|60)\b/gi, 'GV60'],
    [/\b(?:gee|g)\s*(?:ninety|90)\b/gi, 'G90'],
    [/\b(?:gee|g)\s*(?:eighty|80)\b/gi, 'G80'],
    [/\b(?:gee|g)\s*(?:seventy|70)\b/gi, 'G70']
  ];

  let normalized = text;
  for (const [pattern, replacement] of replacements) normalized = normalized.replace(pattern, replacement);
  return normalized;
}

function normalizeCatalogTerms(text, vehicles) {
  let normalized = text;
  for (const make of catalogValues(vehicles, 'make')) {
    const compact = String(make).replace(/[^a-z0-9]/gi, '');
    if (compact.length < 3) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(make)}\\b`, 'i');
    if (pattern.test(normalized)) normalized = normalized.replace(pattern, make);
  }

  for (const model of catalogValues(vehicles, 'model')) {
    const pattern = new RegExp(`\\b${escapeRegExp(model).replace(/\\ /g, '\\s+')}\\b`, 'i');
    if (pattern.test(normalized)) normalized = normalized.replace(pattern, model);
  }

  return normalized;
}

export function normalizeVoiceInventoryQuery(transcript, vehicles = []) {
  const heard = cleanTranscript(transcript);
  if (!heard) return { heard: '', query: '', changed: false };

  let query = heard;
  query = normalizeGenesisModels(query);
  query = normalizeDriveTerms(query);
  query = normalizeMileageTerms(query);
  query = query
    .replace(/\bcertified pre[ -]?owned\b/gi, 'certified')
    .replace(/\bpre[ -]?owned\b/gi, 'used')
    .replace(/\bin transit\b/gi, 'in-transit');
  query = normalizeCatalogTerms(query, vehicles);
  query = query.replace(/\s+/g, ' ').trim();

  return {
    heard,
    query,
    changed: heard.toLowerCase() !== query.toLowerCase()
  };
}

export { cleanTranscript, normalizeDriveTerms, normalizeGenesisModels, normalizeMileageTerms, titleCaseWords };
