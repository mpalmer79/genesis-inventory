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

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function isVehicleDetailUrl(href) {
  try {
    const url = new URL(href, CONFIG.baseUrl);
    if (url.hostname !== new URL(CONFIG.baseUrl).hostname) return false;
    return /^\/(new|used)\/[^?#]+\.htm$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function dismissOverlays(page) {
  const patterns = [/accept/i, /agree/i, /close/i, /continue/i, /no thanks/i];
  for (const pattern of patterns) {
    const button = page.getByRole('button', { name: pattern }).first();
    try {
      if (await button.isVisible({ timeout: 400 })) await button.click({ timeout: 800 });
    } catch {
      // Optional overlays vary by session and are safe to ignore.
    }
  }
}

async function collectVehicleLinks(page, source) {
  console.log(`Discovering ${source.name} inventory from ${source.url}`);
  await page.goto(source.url, {
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.navigationTimeoutMs
  });
  await dismissOverlays(page);

  const links = new Set();
  let stableRounds = 0;
  let previousCount = 0;

  for (let round = 0; round < CONFIG.maxListingScrolls; round += 1) {
    const hrefs = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
    for (const href of hrefs) {
      if (isVehicleDetailUrl(href)) links.add(new URL(href, CONFIG.baseUrl).toString());
    }

    if (links.size === previousCount) stableRounds += 1;
    else stableRounds = 0;
    previousCount = links.size;

    if (stableRounds >= CONFIG.stableScrollRounds) break;

    const moreButton = page.getByRole('button', { name: /load more|show more|view more/i }).first();
    try {
      if (await moreButton.isVisible({ timeout: 250 })) {
        await moreButton.click({ timeout: 1200 });
      }
    } catch {
      // Most Dealer.com inventory pages load through scrolling instead.
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  }

  console.log(`Found ${links.size} ${source.name} vehicle detail links.`);
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

async function collectVehicle(page, target, index, total) {
  console.log(`[${index + 1}/${total}] ${target.url}`);
  await page.goto(target.url, {
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.navigationTimeoutMs
  });
  await dismissOverlays(page);
  await page.waitForTimeout(350);

  const heading = await page.locator('h1').first().textContent().catch(() => null);
  const bodyText = await page.locator('body').innerText();
  const jsonLd = await parseJsonLd(page);
  const images = await page.locator('img[src]').evaluateAll((elements) =>
    elements
      .map((element) => element.currentSrc || element.src)
      .filter(Boolean)
  );

  return normalizeVehicle({
    ...target,
    heading,
    bodyText,
    jsonLd,
    images
  });
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

  for (const vehicle of currentVehicles) {
    const key = vehicleKey(vehicle);
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
    if (currentVehicles.some((current) => vehicleKey(current) === key)) continue;
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
    if (['font', 'media'].includes(type)) await route.abort();
    else await route.continue();
  });

  const discoveryPage = await context.newPage();
  const targets = [];

  try {
    for (const source of CONFIG.listingPages) {
      targets.push(...await collectVehicleLinks(discoveryPage, source));
      await sleep(CONFIG.requestDelayMs);
    }

    const uniqueTargets = [...new Map(targets.map((target) => [target.url, target])).values()];
    console.log(`Collected ${uniqueTargets.length} unique VDP links across all sources.`);

    const page = await context.newPage();
    const vehicles = [];

    for (let index = 0; index < uniqueTargets.length; index += 1) {
      try {
        const vehicle = await collectVehicle(page, uniqueTargets[index], index, uniqueTargets.length);
        vehicles.push(vehicle);
      } catch (error) {
        console.warn(`Failed to collect ${uniqueTargets[index].url}: ${error.message}`);
      }
      await sleep(CONFIG.requestDelayMs);
    }

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
