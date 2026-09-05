# Genesis Inventory Intelligence

Private sales-tool inventory platform for Genesis of Manchester.

Production: `https://genesis-manchester.vercel.app`

The project has two independent layers:

1. A validated Playwright inventory collector that reads public dealership inventory pages and maintains normalized current/change data.
2. A Next.js sales interface with natural-language and voice inventory search, conventional filters, availability visibility, sorting, and direct VDP access.

## Inventory sources

- New Genesis inventory: `https://www.genesisofmanchester.com/new-inventory/index.htm`
- Shared pre-owned inventory: `https://www.autofairhyundai.com/used-inventory/index.htm`
- Genesis Certified inventory: `https://www.genesisofmanchester.com/certified-inventory/index.htm`

The collector intentionally reads the AutoFair Hyundai source directly for the shared used pool because the Genesis shared-inventory proxy does not expose the complete paginated inventory reliably.

## Generated data

- `data/inventory.json` - current normalized inventory used by the application
- `data/inventory.csv` - spreadsheet-friendly current inventory
- `data/changes.json` - vehicles added, removed, and price changes since the previous successful run
- `data/history.json` - observation history retained for scraper continuity; it is not presented as dealer days-in-stock

## Validation and data quality

The scraper fails closed. A bad collection never replaces the last successful production dataset.

Validation covers:

- minimum total, new, and pre-owned safety floors
- discovered-VDP coverage
- VIN completeness
- critical field completeness for stock number, year, make, model, and availability
- catastrophic inventory drops relative to the previous successful run
- new-Genesis make/model sanity
- image completeness warnings
- suspicious electric powertrain text warnings

VIN is the preferred vehicle identifier, followed by stock number and then VDP URL.

## Application

The Next.js application reads `data/inventory.json` at build time.

Default view:

- Stock Type: New
- grouped by Model
- Model Year descending within each model group

Search capabilities include:

- VIN and stock-number lookup
- natural-language model search
- new, pre-owned, and certified condition constraints
- in-stock and in-transit filtering
- model year
- drivetrain
- SUV and sedan body type
- EV intent
- price ceilings and floors
- mileage ceilings
- common color terms
- voice input in supported browsers

Natural-language condition, availability, and Genesis model intent synchronize the visible UI filters so the parser and dropdowns do not conflict.

For New inventory, price filtering and the primary card price use MSRP. A differing Dealer.com price is shown separately as Website Price rather than being silently treated as MSRP.

## Automation

`.github/workflows/inventory-sync.yml` performs the nightly inventory collection and commits only validated data changes.

`.github/workflows/scraper-ci.yml` runs fast scraper syntax and unit tests.

`.github/workflows/app-ci.yml` runs search tests, a production Next.js build, and a Playwright production smoke test.

Vercel is connected to `main`, so successful commits automatically deploy to the production domain.

## Operational behavior

If a nightly scrape fails, the previous validated inventory remains live. The UI shows inventory health based on the last successful sync timestamp:

- current through 26 hours
- refresh delayed from 26 to 36 hours
- potentially stale after 36 hours

See `OPERATIONS.md` for runbook details.

## Access boundary

The collector uses only publicly accessible dealership pages. It does not attempt authentication, CAPTCHA bypass, session impersonation, or access to dealer-only systems.

The web app is marked `noindex`/`nofollow` and sends basic browser security headers. It is still reachable by anyone who knows the production URL unless deployment authentication is added later.
