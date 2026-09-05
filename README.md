# Genesis Inventory Intelligence

Private sales-tool inventory platform for Genesis of Manchester.

The project has two independent layers:

1. A validated Playwright inventory collector that reads public dealership inventory pages and maintains normalized current/history data.
2. A Next.js sales interface with natural-language inventory search, conventional filters, availability visibility, sorting, and direct VDP access.

## Inventory sources

- New Genesis inventory: `https://www.genesisofmanchester.com/new-inventory/index.htm`
- Shared AutoFair pre-owned inventory: `https://www.genesisofmanchester.com/used-inventory/shared-inventory.htm`
- Genesis Certified inventory: `https://www.genesisofmanchester.com/certified-inventory/index.htm`

The shared pre-owned collector accepts Dealer.com vehicle-detail links hosted by the stocking AutoFair store, while new and certified discovery remains restricted to Genesis of Manchester.

## Generated data

- `data/inventory.json` - current normalized inventory used by the application
- `data/inventory.csv` - current inventory in spreadsheet-friendly format
- `data/changes.json` - vehicles added, removed, and price changes since the previous successful run
- `data/history.json` - first-seen, last-seen, removal history, and last-known vehicle state

## Inventory validation

The scraper validates each run before replacing current data. It fails without writing new inventory files when the result is implausibly small, VIN coverage is too low, new or pre-owned counts fall below safety thresholds, or inventory collapses relative to the previous successful run.

VIN is the preferred vehicle identifier, followed by stock number and then the vehicle-detail URL.

## Application

The Next.js application reads `data/inventory.json` at build time.

Current search capabilities include:

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
- relevance, price, mileage, and tracked-age sorting

Example searches:

- `Show me new black GV80s in stock under $80k`
- `Find in-transit GV70 AWD models`
- `Used AWD SUVs under 30k miles`
- `Show me certified Genesis vehicles`

The search engine is deterministic and local in this phase. It does not require an API key and does not send inventory or customer data to an external model. An LLM reasoning layer can be added later on top of the validated search API without replacing the underlying factual filter engine.

## Automation

`.github/workflows/inventory-sync.yml` performs the nightly inventory collection and commits validated data changes.

`.github/workflows/app-ci.yml` runs search/parser tests and a production Next.js build when application code or inventory data changes.

A successful nightly inventory commit can therefore trigger an application rebuild when the repository is connected to a deployment platform such as Vercel.

## Data model

Each active vehicle can include:

- VIN
- stock number
- condition and CPO status
- availability
- year, make, model, and trim
- exterior and interior color
- body style
- drivetrain
- transmission
- engine
- mileage
- MSRP and price
- stocking location
- source page and VDP URL
- image URL
- first seen, last seen, and days observed

## Access boundary

The collector intentionally uses only publicly accessible dealership pages. It does not attempt authentication, CAPTCHA bypass, session impersonation, or access to dealer-only systems.
