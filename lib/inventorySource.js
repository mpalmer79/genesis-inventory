import bundledInventory from '../data/inventory.json';

export const REMOTE_INVENTORY_URL =
  'https://raw.githubusercontent.com/mpalmer79/genesis-inventory/main/data/inventory.json';

const FETCH_TIMEOUT_MS = 8000;

function isInventoryPayload(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.generatedAt === 'string' &&
    Number.isFinite(Date.parse(value.generatedAt)) &&
    value.metrics &&
    typeof value.metrics === 'object' &&
    Array.isArray(value.vehicles)
  );
}

export async function loadInventory() {
  try {
    const response = await fetch(REMOTE_INVENTORY_URL, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'genesis-inventory-production'
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error('Live inventory fetch failed with ' + response.status + '.');
    }

    const inventory = await response.json();
    if (!isInventoryPayload(inventory)) {
      throw new Error('Live inventory payload failed validation.');
    }

    return {
      inventory,
      source: 'github-live',
      error: null
    };
  } catch (error) {
    return {
      inventory: bundledInventory,
      source: 'bundled-fallback',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
