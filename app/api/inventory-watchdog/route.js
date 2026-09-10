export const dynamic = 'force-dynamic';

const INVENTORY_URL =
  'https://raw.githubusercontent.com/mpalmer79/genesis-inventory/main/data/inventory.json';
const DISPATCH_URL =
  'https://api.github.com/repos/mpalmer79/genesis-inventory/actions/workflows/inventory-sync.yml/dispatches';
const ALLOWED_CRON_SCHEDULES = new Set([
  '15 12 * * *',
  '45 12 * * *',
  '15 13 * * *'
]);

function newYorkDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function isAuthorizedCron(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');

  if (cronSecret) {
    return authorization === `Bearer ${cronSecret}`;
  }

  // Vercel supplies the configured cron expression on scheduled invocations.
  // This fallback keeps the watchdog usable before a CRON_SECRET is configured.
  const schedule = request.headers.get('x-vercel-cron-schedule');
  return ALLOWED_CRON_SCHEDULES.has(schedule);
}

async function fetchInventoryMetadata() {
  const response = await fetch(INVENTORY_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'genesis-inventory-vercel-watchdog'
    }
  });

  if (!response.ok) {
    throw new Error(`Inventory metadata fetch failed with ${response.status}.`);
  }

  const inventory = await response.json();
  return {
    generatedAt: inventory.generatedAt || null,
    total: inventory.metrics?.total ?? null
  };
}

async function dispatchInventorySync() {
  const token = process.env.GITHUB_INVENTORY_DISPATCH_TOKEN;
  if (!token) {
    return {
      dispatched: false,
      reason: 'missing-github-dispatch-token'
    };
  }

  const response = await fetch(DISPATCH_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'genesis-inventory-vercel-watchdog',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ ref: 'main' })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub dispatch failed with ${response.status}: ${detail.slice(0, 240)}`);
  }

  return {
    dispatched: true,
    reason: 'stale-inventory'
  };
}

export async function GET(request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const metadata = await fetchInventoryMetadata();
    const today = newYorkDay();
    const inventoryDay = metadata.generatedAt ? newYorkDay(metadata.generatedAt) : null;

    if (inventoryDay === today) {
      return Response.json({
        ok: true,
        current: true,
        generatedAt: metadata.generatedAt,
        total: metadata.total,
        action: 'none'
      });
    }

    const recovery = await dispatchInventorySync();

    if (!recovery.dispatched) {
      console.error(
        `Inventory is stale for ${today}, but Vercel recovery cannot dispatch because GITHUB_INVENTORY_DISPATCH_TOKEN is not configured.`
      );
      return Response.json(
        {
          ok: false,
          current: false,
          generatedAt: metadata.generatedAt,
          total: metadata.total,
          action: 'recovery-unavailable',
          reason: recovery.reason
        },
        { status: 503 }
      );
    }

    console.warn(
      `Inventory is stale for ${today}. Vercel watchdog dispatched GitHub inventory sync.`
    );

    return Response.json(
      {
        ok: true,
        current: false,
        generatedAt: metadata.generatedAt,
        total: metadata.total,
        action: 'github-sync-dispatched'
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Inventory watchdog failed:', error);
    return Response.json(
      {
        ok: false,
        error: 'watchdog-failed',
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
