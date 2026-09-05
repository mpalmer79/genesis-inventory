import inventory from '../../../data/inventory.json';
import { searchInventory } from '../../../lib/search.js';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

function parseLimit(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function GET(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const limit = parseLimit(url.searchParams.get('limit'));

  const vehicles = Array.isArray(inventory?.vehicles) ? inventory.vehicles : [];
  const search = query
    ? searchInventory(vehicles, query)
    : { parsed: { filters: {}, tokens: [], labels: [] }, results: vehicles };

  return Response.json({
    query,
    parsed: search.parsed,
    totalMatches: search.results.length,
    limit,
    generatedAt: inventory?.generatedAt ?? null,
    vehicles: search.results.slice(0, limit)
  });
}
