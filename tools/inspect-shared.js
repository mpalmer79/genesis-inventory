import { chromium } from 'playwright';

const TARGETS = [
  'https://www.genesisofmanchester.com/used-inventory/shared-inventory.htm?start=24',
  'https://www.genesisofmanchester.com/used-inventory/shared-inventory.htm?start=48'
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });

for (const target of TARGETS) {
  const page = await context.newPage();
  const network = [];

  page.on('request', (request) => {
    if (!['xhr', 'fetch'].includes(request.resourceType())) return;
    const url = request.url();
    if (!/inventory|vehicle|widget|dealer|search|api/i.test(url)) return;
    network.push({
      method: request.method(),
      type: request.resourceType(),
      url,
      postData: request.postData()?.slice(0, 3000) ?? null
    });
  });

  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);

  const data = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll('a[href]')]
      .map((anchor) => ({
        text: (anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
        href: anchor.href
      }));

    const interestingLinks = hrefs.filter(({ text, href }) =>
      /\/used\/|\/certified\/|20\d{2}|vehicle|inventory|vin|stock/i.test(`${text} ${href}`)
    );

    const bodyLines = (document.body.innerText || '')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const interestingText = bodyLines.filter((line) =>
      /\b20\d{2}\b|\bVIN\b|\bStock\b|\bMileage\b|\bOdometer\b|\$[\d,]+/.test(line)
    );

    const vehicleLikeElements = [...document.querySelectorAll('[data-vin], [data-stock-number], [data-vehicle-id], [class*="vehicle" i], [class*="inventory" i]')]
      .slice(0, 80)
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className.slice(0, 220) : '',
        dataVin: element.getAttribute('data-vin'),
        dataStock: element.getAttribute('data-stock-number'),
        dataVehicleId: element.getAttribute('data-vehicle-id'),
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 280)
      }));

    return {
      currentUrl: location.href,
      title: document.title,
      anchorCount: hrefs.length,
      interestingLinks: interestingLinks.slice(0, 160),
      interestingText: interestingText.slice(0, 160),
      vehicleLikeElements
    };
  });

  console.log(`\n===== ${target} =====`);
  console.log(JSON.stringify(data, null, 2));
  console.log('NETWORK');
  console.log(JSON.stringify(network.slice(0, 120), null, 2));
  await page.close();
}

await browser.close();
