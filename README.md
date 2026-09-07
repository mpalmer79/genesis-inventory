<p align="center">
  <img src="public/images/genesis-showroom-hero.webp" alt="Genesis of Manchester showroom" width="100%" />
</p>

<h1 align="center">Genesis Inventory Intelligence</h1>

<p align="center">
  A production-focused inventory intelligence and sales search platform for Genesis of Manchester.
</p>

<p align="center">
  <a href="https://genesis-manchester.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20App-Genesis%20Inventory-111111?style=for-the-badge&logo=vercel&logoColor=white" alt="Live application" />
  </a>
  <a href="https://github.com/mpalmer79/genesis-inventory">
    <img src="https://img.shields.io/badge/GitHub-genesis--inventory-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub repository" />
  </a>
  <a href="https://www.linkedin.com/in/mpalmer1234/">
    <img src="https://img.shields.io/badge/LinkedIn-Michael%20Palmer-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="Michael Palmer on LinkedIn" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.3.4-000000?logo=next.js&logoColor=white" alt="Next.js 16.3.4" />
  <img src="https://img.shields.io/badge/React-19.2.8-61DAFB?logo=react&logoColor=111111" alt="React 19.2.8" />
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white" alt="Node.js 22.x" />
  <img src="https://img.shields.io/badge/Playwright-Tested-2EAD33?logo=playwright&logoColor=white" alt="Playwright tested" />
</p>

## Overview

Genesis Inventory Intelligence is a private-purpose dealership sales tool that turns public Genesis of Manchester and shared pre-owned inventory into a fast, searchable working inventory for salespeople.

The project combines two independent layers:

1. **Validated inventory collection** using Playwright to discover public vehicle detail pages, normalize vehicle data, enforce quality gates, and preserve the last known-good dataset when a scrape is incomplete.
2. **Inventory search application** using Next.js with natural-language search, voice search, inventory-aware voice normalization, conventional filters, model grouping, live inventory health, and direct vehicle-detail access.

The production application is available at **[genesis-manchester.vercel.app](https://genesis-manchester.vercel.app/)**.

## Key capabilities

- Natural-language inventory search designed around dealership phrasing
- Voice search with automotive and Genesis-specific transcript normalization
- Inventory-aware correction for model names and common speech-recognition errors
- VIN and stock-number lookup
- New, pre-owned, and certified inventory filtering
- In-stock and in-transit filtering
- Model year, body style, drivetrain, EV, color, price, and mileage constraints
- Engine-displacement searches such as `GV70 2.5`, `GV70 2.5L`, and `GV70 2.5T`
- Exterior-color intent separated from interior-color intent
- AWD/FWD/RWD/4WD normalization across multiple source formats
- New inventory grouped by model with newest model years first
- Direct links to the source vehicle detail page
- Copy VIN / stock actions for fast salesperson workflows
- Inventory-health status based on the last successful validated refresh
- Fail-closed data collection so bad scrapes never replace production inventory

## Search examples

The parser is intentionally built around the way a salesperson is likely to ask for inventory:

```text
Show me new black GV80s in stock under $80k
Find in-transit GV70 AWD models
Used AWD SUVs under 30k miles
Show me certified Genesis vehicles
GV70 2.5L
Lexus
black interior GV80
```

An unqualified natural-language search searches across all stock types. Explicit terms such as `new`, `used`, or `certified` set the corresponding stock-type filter.

### Voice intelligence

Supported browsers use the Web Speech API for transcription. Before a voice transcript reaches the search engine, the application normalizes dealership-specific language and common recognition errors.

Examples include:

```text
gavi eighty             -> GV80
gee vee seventy         -> GV70
all wheel drive         -> AWD
rear wheel drive        -> RWD
30 thousand miles       -> 30k miles
certified pre owned     -> certified
```

The application can display both what it **heard** and what it is **searching**, making voice interpretation visible instead of silently changing the request.

## Inventory sources

| Inventory | Public source |
| --- | --- |
| New Genesis | `https://www.genesisofmanchester.com/new-inventory/index.htm` |
| Shared pre-owned | `https://www.autofairhyundai.com/used-inventory/index.htm` |
| Genesis Certified | `https://www.genesisofmanchester.com/certified-inventory/index.htm` |

The collector reads the AutoFair Hyundai source directly for the shared pre-owned pool because the Genesis shared-inventory proxy does not consistently expose the complete paginated inventory.

## Data pipeline

```text
Public inventory pages
        |
        v
VDP discovery and pagination
        |
        v
Concurrent Playwright collection
        |
        v
Normalization and deduplication
        |
        v
Validation quality gates
        |
        +---- failure ----> keep previous validated dataset
        |
      success
        |
        v
inventory.json / inventory.csv / changes.json / history.json
        |
        v
Git commit -> Vercel deployment -> production search app
```

### Generated data

| File | Purpose |
| --- | --- |
| `data/inventory.json` | Current normalized inventory consumed by the application |
| `data/inventory.csv` | Spreadsheet-friendly representation of current inventory |
| `data/changes.json` | Vehicles added, removed, and price changes since the previous successful run |
| `data/history.json` | Observation history used for scraper continuity |

`history.json` records observation history only. It is not presented as dealer-reported days in stock.

## Validation and data quality

The scraper **fails closed**. A bad or incomplete collection never replaces the last successful production dataset.

Validation protects against:

- unexpected total, new, or pre-owned inventory drops
- incomplete discovered-VDP coverage
- missing VINs
- weak critical-field completeness
- invalid stock numbers, years, makes, or models
- incorrect Genesis model normalization
- suspicious availability gaps
- malformed location data
- invalid or generic vehicle images
- obviously incorrect ICE powertrain fields on electric Genesis models

VIN is the preferred vehicle identifier, followed by stock number and then source VDP URL.

For active shared-used and certified listing sources, listing membership can serve as an in-stock fallback when the individual VDP omits an explicit availability value. New Genesis vehicles do not receive that fallback because new inventory can legitimately include in-transit units.

## Application behavior

The Next.js application reads `data/inventory.json` at build time.

The default view opens to **New** inventory, grouped by model and sorted with the newest model year first. Natural-language searches synchronize relevant visible filters so the parser and dropdown state do not contradict one another.

For new inventory, MSRP is the primary price when available. If Dealer.com exposes a different website price, it is shown separately rather than being silently treated as MSRP.

The interface also includes a customer-facing reminder:

> Always verify before proceeding forward with your customer

## Automation and deployment

GitHub Actions handles collection, validation, and application verification.

| Workflow | Responsibility |
| --- | --- |
| `.github/workflows/inventory-sync.yml` | Scheduled inventory collection and validated data commits |
| `.github/workflows/scraper-ci.yml` | Scraper syntax and unit tests |
| `.github/workflows/app-ci.yml` | Search tests, production Next.js build, and Playwright smoke testing |

Vercel is connected to `main`, so successful commits automatically deploy to production.

### Inventory health

The UI communicates freshness based on the most recent successful inventory timestamp:

- **Inventory current:** up to 26 hours old
- **Inventory refresh delayed:** more than 26 and up to 36 hours old
- **Inventory may be stale:** more than 36 hours old

If a collection fails validation, the previous validated inventory remains live rather than publishing an unreliable replacement.

See [`OPERATIONS.md`](OPERATIONS.md) for the operational runbook.

## Local development

### Requirements

- Node.js 22.x
- npm
- Playwright Chromium for scraper and end-to-end workflows

### Install

```text
npm ci
```

### Run the application

```text
npm run dev
```

### Build for production

```text
npm run build
npm start
```

### Verification

```text
npm run check
npm test
npm run test:e2e
```

### Inventory collection

```text
npm run scrape
```

## Project structure

```text
app/                         Next.js application shell and global presentation
components/                  Inventory explorer UI and interaction logic
lib/search.js                Natural-language inventory parser and matcher
lib/voiceNormalize.js        Voice transcript normalization
scraper/                     Discovery, collection, normalization, and validation
data/                        Current and historical generated inventory artifacts
e2e/                         Production-style browser smoke tests
.github/workflows/           CI and scheduled inventory automation
public/images/               Application imagery and hero assets
OPERATIONS.md                Operational runbook
```

## Access boundary

The collector reads only publicly accessible dealership pages. It does not attempt authentication, CAPTCHA bypass, session impersonation, or access to dealer-only systems.

The application is configured with `noindex` / `nofollow` metadata. It should still be treated as reachable by anyone who knows the production URL unless deployment-level authentication is enabled.

## Technology

- **Frontend:** Next.js 16, React 19
- **Inventory collection:** Playwright
- **Runtime:** Node.js 22
- **Testing:** Node test runner and Playwright end-to-end checks
- **Automation:** GitHub Actions
- **Deployment:** Vercel
- **Data model:** JSON and CSV generated artifacts committed after successful validation

## Author

**Michael Palmer**  
Automotive retail technology, software engineering, AI-assisted workflows, and dealership systems.

<p>
  <a href="https://www.linkedin.com/in/mpalmer1234/">
    <img src="https://img.shields.io/badge/Connect%20on%20LinkedIn-Michael%20Palmer-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="Connect with Michael Palmer on LinkedIn" />
  </a>
  <a href="https://github.com/mpalmer79">
    <img src="https://img.shields.io/badge/GitHub-mpalmer79-181717?style=for-the-badge&logo=github&logoColor=white" alt="Michael Palmer on GitHub" />
  </a>
</p>

---

<p align="center">
  <strong>Genesis Inventory Intelligence</strong><br />
  Built by Michael Palmer for faster, more accurate dealership inventory discovery.
</p>

<p align="center">
  <a href="https://www.linkedin.com/in/mpalmer1234/">
    <img src="https://img.shields.io/badge/LinkedIn-Michael%20Palmer-0A66C2?style=flat-square&logo=linkedin&logoColor=white" alt="Michael Palmer LinkedIn" />
  </a>
</p>
