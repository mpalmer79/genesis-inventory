import { loadInventory } from '../../../lib/inventorySource.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function newYorkDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

export async function GET() {
  const { inventory, source, error } = await loadInventory();
  const generatedAt = inventory?.generatedAt ?? null;
  const inventoryDay = generatedAt ? newYorkDay(generatedAt) : null;
  const today = newYorkDay();

  return Response.json(
    {
      ok: Boolean(generatedAt),
      current: inventoryDay === today,
      source,
      generatedAt,
      total: inventory?.metrics?.total ?? null,
      servedAt: new Date().toISOString(),
      fallbackReason: source === 'bundled-fallback' ? error : null
    },
    {
      status: generatedAt ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Inventory-Source': source
      }
    }
  );
}
