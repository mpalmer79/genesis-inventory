import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE_URL = 'https://www.genesisofmanchester.com/used-inventory/shared-inventory.htm';
const OUTPUT_PATH = 'debug/shared-used-diagnostic.json';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'en-US',
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
});

const page = await context.newPage();
const network = [];

page.on('request', (request) => {
  if (!['xhr', 'fetch'].includes(request.resourceType())) return;
  const url = request.url();
  network.push({
    method: request.method(),
    type: request.resourceType(),
    url,
    postData: request.postData()?.slice(0, 4000) ?? null
  });
});

async function settle() {
  await page.waitForTimeout(1500);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }
}

async function snapshot(label) {
  return page.evaluate((snapshotLabel) => {
    const allAnchors = [...document.querySelectorAll('a[href]')];
    const vehicleLinks = allAnchors
      .map((anchor) => anchor.href)
      .filter((href) => /\/(used|certified)\//i.test(href));
    const pagination = allAnchors
      .map((anchor) => ({
        text: (anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        href: anchor.href,
        ariaLabel: anchor.getAttribute('aria-label'),
        rel: anchor.getAttribute('rel'),
        className: typeof anchor.className === 'string' ? anchor.className.slice(0, 160) : ''
      }))
      .filter(({ text, href, ariaLabel, rel, className }) =>
        /start=|next|previous|pagination/i.test(`${text} ${href} ${ariaLabel || ''} ${rel || ''} ${className}`)
      );

    const bodyText = document.body.innerText || '';
    return {
      label: snapshotLabel,
      currentUrl: location.href,
      title: document.title,
      vehicleLinkCount: new Set(vehicleLinks).size,
      sampleVehicleLinks: [...new Set(vehicleLinks)].slice(0, 8),
      pagination: pagination.slice(0, 40),
      bodySignals: {
        hasNoMatches: /don't have any vehicles that match|no vehicles/i.test(bodyText),
        textLength: bodyText.length
      }
    };
  }, label);
}

async function clickStart(start) {
  const selector = `a[href*="start=${start}"]`;
  const locator = page.locator(selector).first();
  const count = await page.locator(selector).count();
  if (!count) return { clicked: false, reason: `No anchor matched ${selector}` };

  const beforeUrl = page.url();
  await locator.scrollIntoViewIfNeeded();
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null),
    locator.click({ timeout: 10000 })
  ]);
  await settle();
  return { clicked: true, beforeUrl, afterUrl: page.url(), matchedAnchors: count };
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle();

  const snapshots = [await snapshot('page-1')];
  const transitions = [];

  transitions.push({ start: 24, ...(await clickStart(24)) });
  snapshots.push(await snapshot('page-2-after-click'));

  transitions.push({ start: 48, ...(await clickStart(48)) });
  snapshots.push(await snapshot('page-3-after-click'));

  const relevantNetwork = network.filter(({ url, postData }) =>
    /inventory|vehicle|search|widget|api|start=|graphql/i.test(`${url} ${postData || ''}`)
  );

  const result = {
    generatedAt: new Date().toISOString(),
    snapshots,
    transitions,
    network: relevantNetwork.slice(-160)
  };

  await mkdir('debug', { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log('Shared inventory diagnostic complete.');
  for (const item of snapshots) {
    console.log(`${item.label}: ${item.vehicleLinkCount} vehicle links at ${item.currentUrl}`);
  }
  for (const transition of transitions) {
    console.log(`start=${transition.start}: clicked=${transition.clicked}, after=${transition.afterUrl || transition.reason}`);
  }
  console.log(`Relevant XHR/fetch requests captured: ${relevantNetwork.length}`);
} finally {
  await browser.close();
}
