import { chromium } from 'playwright';
import { CONFIG } from './config.js';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

for (const source of CONFIG.listingPages) {
  const page = await context.newPage();
  const requests = new Set();

  page.on('request', (request) => {
    const url = request.url();
    if (/getInventory|inventory-data|apis\/widget/i.test(url)) {
      const signature = `${request.method()} ${url}`;
      if (!requests.has(signature)) {
        requests.add(signature);
        console.log(`[${source.name}] INVENTORY REQUEST ${signature}`);
        const postData = request.postData();
        if (postData) console.log(`[${source.name}] POST DATA ${postData.slice(0, 2000)}`);
      }
    }
  });

  await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeoutMs });
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);

  const controls = await page.locator('a, button').evaluateAll((elements) =>
    elements
      .map((element) => ({
        tag: element.tagName,
        text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
        href: element.href || null,
        ariaLabel: element.getAttribute('aria-label'),
        rel: element.getAttribute('rel'),
        disabled: element.disabled || element.getAttribute('aria-disabled')
      }))
      .filter((item) =>
        /next|previous|page|load more|show more|view more/i.test(`${item.text} ${item.ariaLabel} ${item.rel}`)
      )
      .slice(0, 100)
  );

  console.log(`[${source.name}] PAGINATION CONTROLS ${JSON.stringify(controls, null, 2)}`);
  await page.close();
}

await browser.close();
