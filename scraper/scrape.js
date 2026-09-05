import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CONFIG } from './config.js';
import { csvEscape, normalizeVehicle, vehicleKey } from './normalize.js';
import { validateInventory } from './validate.js';

const ROOT = resolve(process.cwd());
const DATA_DIR = resolve(ROOT, 'data');
const INVENTORY_PATH = resolve(DATA_DIR, 'inventory.json');
const CSV_PATH = resolve(DATA_DIR, 'inventory.csv');
const CHANGES_PATH = resolve(DATA_DIR, 'changes.json');
const HISTORY_PATH = resolve(DATA_DIR, 'history.json');
const BASE_HOSTNAME = new URL(CONFIG.baseUrl).hostname;
const VDP_PATH_PATTERN = /^\/(new|used|certified)\/[^/]+\/20\d{2}-[^/]+-[a-f0-9]{32}\.htm$/i;

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function canonicalVehicleDetailUrl(href, source) {
  try {
    const url = new URL(href, CONFIG.baseUrl);
    const pathMatch = url.pathname.match(VDP_PATH_PATTERN);
    if (!pathMatch) return null;

    const pathCondition = pathMatch[1].toLowerCase();
    const isSharedUsed = source.name === 'shared-used';

    if (isSharedUsed) {
      if (url.protocol !== 'https:' || pathCondition !== 'used') return null;
    } else {
      if (url.hostname !== BASE_HOSTNAME) return null;
      if (source.condition === 'new' && pathCondition !== 'new') return null;
      if (source.condition === 'certified' && !['certified', 'used'].includes(pathCondition)) return null;
    }

    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function listingUrl(sourceUrl, start) {
  const url = new URL(sourceUrl);
  if (start > 0) url.searchParams.set('start', String(start));
  else url.searchParams.delete('start');
  return url.toString();
}

async function navigate(page, url) {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.navigationTimeoutMs
  });
  await page.waitForTimeout(250);
}

async function settleListingPage(page, source) {
  if (source.name !== 'shared-used') return;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidateCount = await page.locator('a[href*="/used/"]').count();
    if (candidateCount >= 12) return;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }
}

async function discoverPagination(page) {
  const starts = await page.locator('a[href*="start="]').evaluateAll((anchors) =>
    anchors
      .map((anchor) => {
        try {
          return Number(new URL(anchor.href).searchParams.get('start'));
        } catch {
          return NaN;
        }
      })
      .filter((value) => Number.isInteger(value) && value > 0)
  );

  if (!starts.length) return [0];

  const pageSize = Math.min(...starts);
  const maxStart = Math.max(...starts);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return [0];

  const pages = [];
  for (let start = 0; start <= maxStart; start += pageSize) pages.push(start);
  return pages;
}

async function extractVehicleLinks(page, source) {
  const hrefs = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
  const links = new Set();
  for (const href of hrefs) {
    const canonical = canonicalVehicleDetailUrl(href, source);
    if (canonical) links.add(canonical);
  }
  return links;
}

function linkSignature(links) {
  return [...links].sort().slice(0, 8).join('|');
}

async function waitForListingChange(page, source, previousSignature) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(250);
    await settleListingPage(page, source);
    const currentLinks = await extractVehicleLinks(page, source);
    if (currentLinks.size > 0 && linkSignature(currentLinks) !== previousSignature) return true;
  }
  return false;
}

async function clickListingControl(page, locator, source, previousSignature) {
  if ((await locator.count()) === 0) return false;

  try {
    const control = locator.first();
    await control.scrollIntoViewIfNeeded();
    await control.click({ timeout: 10000 });
    return await waitForListingChange(page, source, previousSignature);
  } catch {
    return false;
  }
}

async function advanceSharedListingPage(page, source, start, previousSignature) {
  const exact = page.locator(`a[href*="start=${start}"]`);
  if (await clickListingControl(page, exact, source, previousSignature)) {
    console.log(`shared-used: advanced through start=${start} pagination anchor.`);
    return true;
  }

  const semanticNext = page.locator(
    'a[rel="next"], a[aria-label*="next" i], a[title*="next" i]'
  );
  if (await clickListingControl(page, semanticNext, source, previousSignature)) {
    console.log(`shared-used: advanced through semantic next-page control for start=${start}.`);
    return true;
  }

  const textNext = page.getByRole('link', { name: /next/i });
  if (await clickListingControl(page, textNext, source, previousSignature)) {
    console.log(`shared-used: advanced through text next-page control for start=${start}.`);
    return true;
  }

  console.warn(`shared-used: stateful pagination failed for start=${start}; trying direct URL fallback.`);
  await navigate(page, listingUrl(source.url, start));
  await settleListingPage(page, source);
  const directLinks = await extractVehicleLinks(page, source);
  return directLinks.size > 0 && linkSignature(directLinks) !== previousSignature;
}

async function collectVehicleLinks(page, source) {
  console.log(`Discovering ${source.name} inventory from ${source.url}`);
  await navigate(page, source.url);
  await settleListingPage(page, source);

  const starts = await discoverPagination(page);
  console.log(`${source.name}: ${starts.length} listing page${starts.length === 1 ? '' : 's'} detected.`);

  const links = new Set();
  const hostCounts = new Map();
  let consecutiveNoProgress = 0;

  for (let pageIndex = 0; pageIndex < starts.length; pageIndex += 1) {
    if (pageIndex > 0) {
      const previousPageLinks = await extractVehicleLinks(page, source);
      const previousSignature = linkSignature(previousPageLinks);
      const start = starts[pageIndex];

      if (source.name === 'shared-used') {
        const advanced = await advanceSharedListingPage(page, source, start, previousSignature);
        if (!advanced) {
          console.warn(`shared-used: unable to advance to listing page ${pageIndex + 1}; stopping pagination.`);
          break;
        }
      } else {
        await navigate(page, listingUrl(source.url, start));
        await settleListingPage(page, source);
      }
      await sleep(CONFIG.requestDelayMs);
    }

    const pageLinks = await extractVehicleLinks(page, source);
    const beforeCount = links.size;
    for (const link of pageLinks) {
      links.add(link);
      const hostname = new URL(link).hostname;
      hostCounts.set(hostname, (hostCounts.get(hostname) || 0) + 1);
    }

    const added = links.size - beforeCount;
    consecutiveNoProgress = added === 0 ? consecutiveNoProgress + 1 : 0;
    console.log(`${source.name}: page ${pageIndex + 1}/${starts.length}, ${pageLinks.size} VDPs, ${added} new, ${links.size} unique.`);

    if (source.name === 'shared-used' && consecutiveNoProgress >= 2) {
      console.warn('shared-used: two consecutive pages added no new VDPs; stopping to prevent a pagination loop.');
      break;
    }
  }

  if (source.name === 'shared-used') {
    const hosts = [...hostCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([hostname, count]) => `${hostname}=${count}`)
      .join(', ');
    console.log(`shared-used VDP hosts: ${hosts || 'none'}`);
  }

  console.log(`Found ${links.size} canonical ${source.name} vehicle detail links.`);
  return [...links].map((url) => ({ url, source: source.name, condition: source.condition }));
}

async function parseJsonLd(page) {
  return page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => {
    const parsed = [];
    for (const script of scripts) {
      try {
        parsed.push(JSON.parse(script.textContent || 'null'));
      } catch {
        // Invalid JSON-LD should not block factual DOM extraction.
      }
    }
    return parsed;
  });
}

async function collectVehicle(page, target) {
  await page.goto(target.url, {
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.navigationTimeoutMs
  });
  await page.waitForTimeout(150);

  const heading = await page.locator('h1').first().textContent().catch(() => null);
  const bodyText = await page.locator('body').innerText();
  const jsonLd = await parseJsonLd(page);
  const images = await page.locator('img[src]').evaluateAll((elements) =>
    elements
      .map((element) => element.currentSrc || element.src)
      .filter((src) => src && /^https?:\/\//i.test(src))
  );

  return normalizeVehicle({
    ...target,
    heading,
    bodyText,
    jsonLd,
    images
  });
}

async function collectVehiclesConcurrently(context, targets) {
  const results = new Array(targets.length);
  let nextIndex = 0;
  const workerCount = Math.min(CONFIG.detailConcurrency, targets.length);

  async function worker(workerNumber) {
    const page = await context.newPage();
    try {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= targets.length) break;

        const target = targets[index];
        if (index === 0 || (index + 1) % 25 === 0 || index === targets.length - 1) {
          console.log(`VDP progress: ${index + 1}/${targets.length} (worker ${workerNumber}).`);
        }

        try {
          results[index] = await collectVehicle(page, target);
        } catch (error) {
          console.warn(`Failed to collect ${target.url}: ${error.message}`);
        }

        await sleep(CONFIG.requestDelayMs);
      }
    } finally {
      await page.close();
    }
  }

  await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));
  return results.filter(Boolean);
}

function dedupeVehicles(vehicles) {
  const unique = new Map();
  for (const vehicle of vehicles) {
    const key = vehicleKey(vehicle);
    if (!key) continue;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, vehicle);
      continue;
    }

    if (vehicle.condition === 'certified' && existing.condition !== 'new') {
      unique.set(key, vehicle);
      continue;
    }

    const existingScore = Object.values(existing).filter((value) => value !== null && value !== '').length;
    const incomingScore = Object.values(vehicle).filter((value) => value !== null && value !== '').length;
    if (incomingScore > existingScore) unique.set(key, vehicle);
  }
  return [...unique.values()];
}

function addObservationMetadata(vehicles, previousInventory, history, timestamp) {
  const previousByKey = new Map((previousInventory?.vehicles || []).map((vehicle) => [vehicleKey(vehicle), vehicle]));
  const historical = history?.vehicles || {};

  return vehicles.map((vehicle) => {
    const key = vehicleKey(vehicle);
    const previous = previousByKey.get(key);
    const historicalEntry = historical[key];
    const firstSeen = previous?.firstSeen || historicalEntry?.firstSeen || timestamp;
    const daysObserved = Math.max(1, Math.floor((Date.parse(timestamp) - Date.parse(firstSeen)) / 86400000) + 1);

    return {
      ...vehicle,
      firstSeen,
      lastSeen: timestamp,
      daysObserved
    };
  });
}

function buildChanges(currentVehicles, previousInventory, timestamp) {
  const previous = previousInventory?.vehicles || [];
  const previousByKey = new Map(previous.map((vehicle) => [vehicleKey(vehicle), vehicle]));
  const currentByKey = new Map(currentVehicles.map((vehicle) => [vehicleKey(vehicle), vehicle]));

  const added = currentVehicles.filter((vehicle) => !previousByKey.has(vehicleKey(vehicle)));
  const removed = previous.filter((vehicle) => !currentByKey.has(vehicleKey(vehicle)));
  const priceChanged = [];

  for (const vehicle of currentVehicles) {
    const oldVehicle = previousByKey.get(vehicleKey(vehicle));
    if (!oldVehicle) continue;
    const oldPrice = oldVehicle.price ?? oldVehicle.msrp;
    const newPrice = vehicle.price ?? vehicle.msrp;
    if (oldPrice != null && newPrice != null && oldPrice !== newPrice) {
      priceChanged.push({
        key: vehicleKey(vehicle),
        vin: vehicle.vin,
        stockNumber: vehicle.stockNumber,
        oldPrice,
        newPrice,
        sourceUrl: vehicle.sourceUrl
      });
    }
  }

  return {
    generatedAt: timestamp,
    added,
    removed,
    priceChanged
  };
}

function buildHistory(currentVehicles, previousInventory, existingHistory, timestamp) {
  const history = {
    schemaVersion: 1,
    updatedAt: timestamp,
    vehicles: { ...(existingHistory?.vehicles || {}) }
  };
  const currentKeys = new Set();

  for (const vehicle of currentVehicles) {
    const key = vehicleKey(vehicle);
    currentKeys.add(key);
    const prior = history.vehicles[key];
    history.vehicles[key] = {
      firstSeen: prior?.firstSeen || vehicle.firstSeen,
      lastSeen: timestamp,
      removedAt: null,
      lastKnown: vehicle
    };
  }

  for (const vehicle of previousInventory?.vehicles || []) {
    const key = vehicleKey(vehicle);
    if (currentKeys.has(key)) continue;
    const prior = history.vehicles[key];
    history.vehicles[key] = {
      firstSeen: prior?.firstSeen || vehicle.firstSeen || vehicle.lastSeen || timestamp,
      lastSeen: prior?.lastSeen || vehicle.lastSeen || timestamp,
      removedAt: prior?.removedAt || timestamp,
      lastKnown: prior?.lastKnown || vehicle
    };
  }

  return history;
}

function toCsv(vehicles) {
  const columns = [
    'vin',
    'stockNumber',
    'condition',
    'certified',
    'availability',
    'year',
    'make',
    'model',
    'trim',
    'exteriorColor',
    'interiorColor',
    'bodyStyle',
    'drivetrain',
    'transmission',
    'engine',
    'mileage',
    'msrp',
    'price',
    'location',
    'firstSeen',
    'lastSeen',
    'daysObserved',
    'source',
    'sourceUrl',
    'imageUrl'
  ];

  const rows = [columns.join(',')];
  for (const vehicle of vehicles) {
    rows.push(columns.map((column) => csvEscape(vehicle[column])).join(','));
  }
  return `${rows.join('\n')}\n`;
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

async function main() {
  const timestamp = new Date().toISOString();
  const previousInventory = await readJson(INVENTORY_PATH, null);
  const existingHistory = await readJson(HISTORY_PATH, null);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  await context.route('**/*', async (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) await route.abort();
    else await route.continue();
  });

  const discoveryPage = await context.newPage();

  try {
    const targets = [];
    for (const source of CONFIG.listingPages) {
      targets.push(...await collectVehicleLinks(discoveryPage, source));
      await sleep(CONFIG.requestDelayMs);
    }
    await discoveryPage.close();

    const uniqueTargets = [...new Map(targets.map((target) => [target.url, target])).values()];
    console.log(`Collected ${uniqueTargets.length} unique canonical VDP links across all sources.`);

    const vehicles = await collectVehiclesConcurrently(context, uniqueTargets);
    console.log(`Parsed ${vehicles.length}/${uniqueTargets.length} VDPs.`);

    const deduped = dedupeVehicles(vehicles);
    const observed = addObservationMetadata(deduped, previousInventory, existingHistory, timestamp);
    const validation = validateInventory(observed, previousInventory, CONFIG.validation);

    console.log('Validation metrics:', validation.metrics);
    for (const warning of validation.warnings) console.warn(`WARNING: ${warning}`);

    if (!validation.valid) {
      for (const error of validation.errors) console.error(`ERROR: ${error}`);
      throw new Error('Inventory validation failed. Existing data files were left unchanged.');
    }

    const inventory = {
      schemaVersion: 1,
      dealership: 'Genesis of Manchester',
      dealershipUrl: CONFIG.baseUrl,
      generatedAt: timestamp,
      metrics: validation.metrics,
      vehicles: observed.sort((a, b) => {
        const conditionOrder = { new: 0, certified: 1, used: 2 };
        return (conditionOrder[a.condition] ?? 9) - (conditionOrder[b.condition] ?? 9) ||
          (a.make || '').localeCompare(b.make || '') ||
          (a.model || '').localeCompare(b.model || '') ||
          (a.stockNumber || '').localeCompare(b.stockNumber || '');
      })
    };

    const changes = buildChanges(inventory.vehicles, previousInventory, timestamp);
    const history = buildHistory(inventory.vehicles, previousInventory, existingHistory, timestamp);

    await atomicWrite(INVENTORY_PATH, `${JSON.stringify(inventory, null, 2)}\n`);
    await atomicWrite(CSV_PATH, toCsv(inventory.vehicles));
    await atomicWrite(CHANGES_PATH, `${JSON.stringify(changes, null, 2)}\n`);
    await atomicWrite(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`);

    console.log(`Inventory sync complete: ${inventory.vehicles.length} active vehicles.`);
    console.log(`Changes: +${changes.added.length} added, -${changes.removed.length} removed, ${changes.priceChanged.length} price changes.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});