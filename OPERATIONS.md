# Genesis Inventory Operations Runbook

## Production

- Application: `https://genesis-manchester.vercel.app`
- Repository: `mpalmer79/genesis-inventory`
- Production branch: `main`
- Hosting: Vercel
- Inventory collection: GitHub Actions + Playwright

## Nightly inventory flow

1. GitHub Actions starts `Nightly Inventory Sync` at 07:30 UTC.
2. The collector discovers New Genesis, AutoFair shared used, and Genesis Certified VDPs.
3. VDPs are normalized and deduplicated, preferring VIN as the stable key.
4. Validation checks crawl coverage, inventory floors, VIN/critical-field completeness, and change safety.
5. If validation fails, no generated inventory file is replaced.
6. If validation succeeds and data changed, GitHub Actions commits the generated files to `main`.
7. Vercel detects the `main` commit and creates a new production deployment.

## Inventory sources

- New: `https://www.genesisofmanchester.com/new-inventory/index.htm`
- Shared Pre-Owned: `https://www.autofairhyundai.com/used-inventory/index.htm`
- Genesis CPO: `https://www.genesisofmanchester.com/certified-inventory/index.htm`

The AutoFair Hyundai source is intentional. The Genesis shared-used proxy was observed to advertise deep pagination while failing to expose the complete later-page DOM.

## Data files

- `data/inventory.json`: production source of truth for the app
- `data/inventory.csv`: convenience export
- `data/changes.json`: one-run additions, removals, and price changes
- `data/history.json`: scraper observation history, not dealer days-in-stock

## Validation behavior

A scrape must satisfy the rules in `scraper/config.js`. The collector should fail rather than publish an implausible dataset.

Important metrics include:

- total/new/pre-owned counts
- discovery coverage
- VIN completeness
- critical field completeness
- in-stock/in-transit counts
- field completeness for colors and images

Do not lower validation thresholds simply to make a broken crawl pass. Diagnose discovery or parsing first.

## Data semantics

- `firstSeen`, `lastSeen`, and `daysObserved` describe when this scraper observed a VIN. They are not dealership days-in-stock.
- New vehicle primary price is MSRP when available.
- `price` is Dealer.com website pricing and may have different semantics. The UI labels a differing value as Website Price.
- In Transit is based on public VDP availability signals.
- Shared used inventory may represent the broader AutoFair pool rather than only physical Genesis-rooftop units.

## Stale inventory behavior

The app remains available when a scrape fails because the previous successful dataset remains committed.

UI health states:

- up to 26 hours: Inventory current
- 26 to 36 hours: Inventory refresh delayed
- over 36 hours: Inventory may be stale

## Manual recovery

If the nightly job fails:

1. Open GitHub Actions and select `Nightly Inventory Sync`.
2. Inspect the failed step before rerunning.
3. If parser/unit tests failed, fix code first.
4. If discovery coverage failed, inspect Dealer.com pagination/VDP behavior.
5. If a field-quality threshold failed, inspect representative VDPs and normalization logic.
6. Use `Run workflow` only after the cause is understood or confirmed transient.

## Deployment troubleshooting

Vercel deploys from GitHub `main` automatically.

If inventory committed successfully but production did not update:

1. Check the Vercel deployment attached to the latest GitHub commit.
2. Confirm the production branch is still `main`.
3. Confirm the project domain is `genesis-manchester.vercel.app`.
4. Inspect the Vercel build log for Next.js build errors.

Do not create a separate manual deployment pipeline unless the native Git integration is unavailable.

## Search troubleshooting

Natural-language search is deterministic and local. It does not require an external LLM.

The UI synchronizes explicit query intent into Stock Type, Availability, and known Genesis Model filters. If a query returns unexpectedly few results, check the visible filters before changing parser logic.

## Known limitations

- Dealer.com markup can change without notice.
- Voice recognition support varies by browser and device.
- Search model vocabulary is currently strongest for Genesis models; broad multi-make pre-owned language should be expanded separately.
- Public website fields can occasionally be ambiguous; field-level quality metrics are intentionally tracked.
- The application is not authenticated. `noindex` reduces discovery but is not access control.
