import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 3100;
const baseUrl = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  env: { ...process.env, NODE_ENV: 'production' }
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Next.js production server did not become ready.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForSelectValue(page, label, expected) {
  await page.waitForFunction(
    ({ labelText, expectedValue }) => {
      const select = [...document.querySelectorAll('select')].find((element) =>
        element.getAttribute('aria-label') === labelText
      );
      return select?.value === expectedValue;
    },
    { labelText: label, expectedValue: expected },
    { timeout: 3000 }
  );
}

let browser;
try {
  await waitForServer();

  const healthResponse = await fetch(`${baseUrl}/api/inventory-health`);
  assert(healthResponse.ok, 'Inventory health endpoint is unavailable.');
  const health = await healthResponse.json();
  assert(Boolean(health.generatedAt), 'Inventory health endpoint is missing generatedAt.');
  assert(Number(health.total) > 0, 'Inventory health endpoint returned an empty inventory.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'image') await route.abort();
    else await route.continue();
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  assert((await page.locator('h1').first().textContent())?.includes('Genesis of Manchester'), 'Hero title is missing.');
  assert(await page.getByRole('combobox', { name: 'Stock Type', exact: true }).inputValue() === 'all', 'Default Stock Type must be All.');
  assert(await page.locator('.vehicle-card').count() > 0, 'Default all-stock inventory cards are missing.');
  assert(await page.getByRole('button', { name: 'Copy VIN / Stock' }).count() > 0, 'Vehicle copy action is missing.');

  const firstStockText = await page.locator('.vehicle-stock').first().textContent();
  const exactStock = firstStockText?.match(/Stock\s+([^\s·]+)/)?.[1];
  assert(exactStock, 'Could not derive a live stock number for exact lookup testing.');

  const search = page.getByLabel('Ask inventory');

  await search.fill(exactStock);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.vehicle-card').length === 1, undefined, { timeout: 3000 });
  const stockLookupText = await page.locator('.vehicle-card').first().textContent();
  assert(stockLookupText?.includes(exactStock), `Exact stock-number lookup did not return ${exactStock}.`);

  const apiSearchResponse = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(exactStock)}`);
  assert(apiSearchResponse.ok, 'Search API is unavailable.');
  const apiSearch = await apiSearchResponse.json();
  assert(apiSearch.totalMatches >= 1, 'Search API did not return the live stock number.');
  assert(apiSearch.generatedAt === health.generatedAt, 'Search API and health endpoint are serving different inventory snapshots.');

  await search.fill('Show me new Genesis vehicles');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await waitForSelectValue(page, 'Stock Type', 'new');
  assert(await page.locator('[data-model-group]').count() > 0, 'New inventory model groups are missing.');

  const firstGroupYears = await page.locator('[data-model-group]').first().locator('[data-model-year]').evaluateAll((cards) => cards.map((card) => Number(card.getAttribute('data-model-year'))).filter(Number.isFinite));
  assert(firstGroupYears.every((year, index) => index === 0 || firstGroupYears[index - 1] >= year), 'Model years are not sorted newest first.');

  const usedCatalogResponse = await fetch(`${baseUrl}/api/search?q=used&limit=100`);
  assert(usedCatalogResponse.ok, 'Could not load pre-owned inventory for make search testing.');
  const usedCatalog = await usedCatalogResponse.json();
  const unqualifiedMake = usedCatalog.vehicles.find((vehicle) => vehicle.make)?.make;
  assert(unqualifiedMake, 'Could not derive a live make for unqualified make search testing.');

  await search.fill(unqualifiedMake);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await waitForSelectValue(page, 'Stock Type', 'all');
  await waitForSelectValue(page, 'Make', unqualifiedMake);
  assert(await page.locator('.vehicle-card').count() > 0, 'Unqualified make search should return live inventory.');

  await search.fill('Used AWD SUVs under 30k miles');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await waitForSelectValue(page, 'Stock Type', 'used');
  assert(await page.getByRole('combobox', { name: 'Make', exact: true }).count() === 1, 'Pre-Owned Make filter is missing.');

  await search.fill('Used Genesis vehicles');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await waitForSelectValue(page, 'Make', 'Genesis');

  await search.fill('Show me certified Genesis vehicles');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await waitForSelectValue(page, 'Stock Type', 'certified');

  console.log('E2E smoke checks passed.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
