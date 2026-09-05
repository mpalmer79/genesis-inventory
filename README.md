# Genesis Inventory

Private sales-tool inventory collector for Genesis of Manchester.

## What it does

The repository uses Playwright to read the dealership's public inventory pages and collect vehicle detail pages. It runs nightly through GitHub Actions and writes normalized inventory data into `data/`.

Sources:

- New Genesis inventory: `https://www.genesisofmanchester.com/new-inventory/index.htm`
- Shared pre-owned inventory: `https://www.genesisofmanchester.com/used-inventory/shared-inventory.htm`

Generated files:

- `data/inventory.json` - current normalized inventory
- `data/inventory.csv` - current inventory in spreadsheet-friendly format
- `data/changes.json` - vehicles added, removed, and price changes since the previous successful run
- `data/history.json` - first-seen, last-seen, and removal history by vehicle

## Safety behavior

The scraper validates each run before replacing current data. It fails without writing new inventory files when the result is implausibly small, VIN coverage is too low, or the vehicle count collapses versus the previous successful run.

VIN is the preferred vehicle identifier, followed by stock number and then the vehicle detail URL.

## Schedule

`.github/workflows/inventory-sync.yml` runs once per night and can also be started manually from GitHub Actions.

## Data model

Each active vehicle can include:

- VIN
- stock number
- condition and CPO status
- year, make, model, and trim
- exterior and interior color
- body style
- drivetrain
- transmission
- engine
- mileage
- MSRP and price
- source page and VDP URL
- image URL
- first seen, last seen, and days observed

The collector intentionally uses only publicly accessible dealership pages. It does not attempt authentication, CAPTCHA bypass, or access to dealer-only systems.
