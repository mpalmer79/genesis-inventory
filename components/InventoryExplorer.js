'use client';

import { useMemo, useState } from 'react';
import { searchInventory } from '../lib/search.js';
import styles from './InventoryExplorer.module.css';

const INITIAL_VISIBLE = 24;

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Call for price';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(number);
}

function formatMileage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${new Intl.NumberFormat('en-US').format(number)} mi`;
}

function formatTimestamp(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function vehicleTitle(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
}

function conditionLabel(vehicle) {
  if (vehicle.condition === 'certified') return 'Certified';
  if (vehicle.condition === 'used') return 'Pre-Owned';
  return 'New';
}

function availabilityLabel(value) {
  if (value === 'in-transit') return 'In Transit';
  if (value === 'in-stock') return 'In Stock';
  if (value === 'unavailable') return 'Unavailable';
  return 'Status Unknown';
}

function compareModelYear(a, b) {
  const modelCompare = (a.model || 'Other').localeCompare(b.model || 'Other');
  if (modelCompare !== 0) return modelCompare;

  const yearCompare = (Number(b.year) || 0) - (Number(a.year) || 0);
  if (yearCompare !== 0) return yearCompare;

  const trimCompare = (a.trim || '').localeCompare(b.trim || '');
  if (trimCompare !== 0) return trimCompare;

  return (a.stockNumber || '').localeCompare(b.stockNumber || '');
}

function groupByModel(vehicles) {
  const groups = new Map();

  for (const vehicle of vehicles) {
    const modelName = vehicle.model || 'Other';
    if (!groups.has(modelName)) groups.set(modelName, []);
    groups.get(modelName).push(vehicle);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([modelName, modelVehicles]) => ({
      modelName,
      vehicles: modelVehicles
    }));
}

function InventoryCard({ vehicle }) {
  const effectivePrice = vehicle.price ?? vehicle.msrp;
  const mileage = formatMileage(vehicle.mileage);

  return (
    <article className="vehicle-card">
      <div className="vehicle-media">
        {vehicle.imageUrl ? (
          <img
            src={vehicle.imageUrl}
            alt={vehicleTitle(vehicle)}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : null}
        <div className="vehicle-badges">
          <span className={`badge badge-${vehicle.condition}`}>{conditionLabel(vehicle)}</span>
          <span className={`badge badge-${vehicle.availability || 'unknown'}`}>
            {availabilityLabel(vehicle.availability)}
          </span>
        </div>
      </div>

      <div className="vehicle-content">
        <div className="vehicle-heading-row">
          <div>
            <p className="vehicle-model">{vehicleTitle(vehicle)}</p>
            <p className="vehicle-stock">Stock {vehicle.stockNumber || 'N/A'} · VIN {vehicle.vin || 'N/A'}</p>
          </div>
          <div className="vehicle-price">{formatCurrency(effectivePrice)}</div>
        </div>

        <dl className="vehicle-facts">
          {vehicle.exteriorColor ? <><dt>Exterior</dt><dd>{vehicle.exteriorColor}</dd></> : null}
          {vehicle.interiorColor ? <><dt>Interior</dt><dd>{vehicle.interiorColor}</dd></> : null}
          {vehicle.drivetrain ? <><dt>Drive</dt><dd>{vehicle.drivetrain}</dd></> : null}
          {mileage ? <><dt>Mileage</dt><dd>{mileage}</dd></> : null}
          {vehicle.location ? <><dt>Location</dt><dd>{vehicle.location}</dd></> : null}
        </dl>

        <div className="vehicle-actions">
          <a href={vehicle.sourceUrl} target="_blank" rel="noreferrer" className="primary-link">
            Open Vehicle
          </a>
          <button
            type="button"
            className="copy-button"
            onClick={() => navigator.clipboard?.writeText(vehicle.vin || vehicle.stockNumber || vehicle.sourceUrl)}
          >
            Copy VIN / Stock
          </button>
        </div>
      </div>
    </article>
  );
}

export default function InventoryExplorer({ inventory }) {
  const vehicles = Array.isArray(inventory?.vehicles) ? inventory.vehicles : [];
  const metrics = inventory?.metrics || {};
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState('new');
  const [availability, setAvailability] = useState('all');
  const [model, setModel] = useState('all');
  const [sort, setSort] = useState('model-year');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const models = useMemo(() => {
    return [...new Set(vehicles.map((vehicle) => vehicle.model).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const searchState = useMemo(() => {
    if (!query.trim()) return { parsed: { labels: [] }, results: vehicles };
    return searchInventory(vehicles, query);
  }, [vehicles, query]);

  const filteredVehicles = useMemo(() => {
    const list = searchState.results.filter((vehicle) => {
      if (condition === 'new' && vehicle.condition !== 'new') return false;
      if (condition === 'used' && !['used', 'certified'].includes(vehicle.condition)) return false;
      if (condition === 'certified' && vehicle.condition !== 'certified') return false;
      if (availability !== 'all' && vehicle.availability !== availability) return false;
      if (model !== 'all' && vehicle.model !== model) return false;
      return true;
    });

    if (sort === 'model-year') {
      list.sort(compareModelYear);
    } else if (sort === 'price-low') {
      list.sort((a, b) => (Number(a.price ?? a.msrp) || Number.MAX_SAFE_INTEGER) - (Number(b.price ?? b.msrp) || Number.MAX_SAFE_INTEGER));
    } else if (sort === 'price-high') {
      list.sort((a, b) => (Number(b.price ?? b.msrp) || 0) - (Number(a.price ?? a.msrp) || 0));
    } else if (sort === 'mileage-low') {
      list.sort((a, b) => (Number(a.mileage) || 0) - (Number(b.mileage) || 0));
    }

    return list;
  }, [searchState.results, condition, availability, model, sort]);

  const groupedNewVehicles = useMemo(() => {
    if (condition !== 'new') return [];
    return groupByModel(filteredVehicles);
  }, [condition, filteredVehicles]);

  const visibleVehicles = condition === 'new'
    ? filteredVehicles
    : filteredVehicles.slice(0, visibleCount);

  const preOwned = Number(metrics.preOwned ?? ((metrics.used || 0) + (metrics.certified || 0)));

  function resetView(nextValue, setter) {
    setter(nextValue);
    setVisibleCount(INITIAL_VISIBLE);
  }

  const suggestions = [
    'Show me new black GV80s in stock under $80k',
    'Find in-transit GV70 AWD models',
    'Used AWD SUVs under 30k miles',
    'Show me certified Genesis vehicles'
  ];

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Genesis of Manchester</p>
          <h1>Inventory Intelligence</h1>
          <p className="hero-subtitle">
            Search the live inventory the way a salesperson thinks. Model, color, payment range, mileage, stock number, VIN, availability and more.
          </p>
        </div>

        <div className="sync-card">
          <span>Last inventory sync</span>
          <strong>{formatTimestamp(inventory?.generatedAt)}</strong>
          <small>{vehicles.length.toLocaleString()} active records</small>
        </div>
      </section>

      <section className="metric-grid" aria-label="Inventory summary">
        <div className="metric-card"><span>Total</span><strong>{Number(metrics.total ?? vehicles.length).toLocaleString()}</strong></div>
        <div className="metric-card"><span>New</span><strong>{Number(metrics.new ?? 0).toLocaleString()}</strong></div>
        <div className="metric-card"><span>Pre-Owned</span><strong>{preOwned.toLocaleString()}</strong></div>
        <div className="metric-card"><span>In Stock</span><strong>{Number(metrics.inStock ?? 0).toLocaleString()}</strong></div>
        <div className="metric-card"><span>In Transit</span><strong>{Number(metrics.inTransit ?? 0).toLocaleString()}</strong></div>
      </section>

      <section className="search-panel">
        <label htmlFor="inventory-search" className="search-label">Ask inventory</label>
        <div className="search-row">
          <input
            id="inventory-search"
            type="search"
            value={query}
            onChange={(event) => resetView(event.target.value, setQuery)}
            placeholder="Example: black GV80 AWD in stock under $80k"
            autoComplete="off"
          />
          {query ? (
            <button type="button" className="clear-button" onClick={() => resetView('', setQuery)}>Clear</button>
          ) : null}
        </div>

        <div className="suggestion-row">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => resetView(suggestion, setQuery)}>
              {suggestion}
            </button>
          ))}
        </div>

        {searchState.parsed.labels?.length ? (
          <div className="interpretation-row">
            <span>Interpreted as</span>
            {searchState.parsed.labels.map((label) => <strong key={label}>{label}</strong>)}
          </div>
        ) : null}
      </section>

      <section className="filter-bar" aria-label="Inventory filters">
        <label>
          <span>Stock Type</span>
          <select value={condition} onChange={(event) => resetView(event.target.value, setCondition)}>
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="used">Pre-Owned</option>
            <option value="certified">Certified</option>
          </select>
        </label>

        <label>
          <span>Availability</span>
          <select value={availability} onChange={(event) => resetView(event.target.value, setAvailability)}>
            <option value="all">All</option>
            <option value="in-stock">In Stock</option>
            <option value="in-transit">In Transit</option>
          </select>
        </label>

        <label>
          <span>Model</span>
          <select value={model} onChange={(event) => resetView(event.target.value, setModel)}>
            <option value="all">All Models</option>
            {models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label>
          <span>Sort</span>
          <select value={sort} onChange={(event) => resetView(event.target.value, setSort)}>
            <option value="model-year">Model / Year: Newest First</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="mileage-low">Mileage: Low to High</option>
          </select>
        </label>
      </section>

      <section className="results-header">
        <div>
          <p className="eyebrow">Results</p>
          <h2>{filteredVehicles.length.toLocaleString()} matching vehicle{filteredVehicles.length === 1 ? '' : 's'}</h2>
        </div>
        <p>Showing {visibleVehicles.length.toLocaleString()} of {filteredVehicles.length.toLocaleString()}</p>
      </section>

      {visibleVehicles.length ? (
        condition === 'new' ? (
          <section className={styles.modelGroups} aria-label="New inventory grouped by model">
            {groupedNewVehicles.map((group) => (
              <section className={styles.modelGroup} key={group.modelName}>
                <header className={styles.modelGroupHeader}>
                  <div>
                    <p className={styles.kicker}>New Inventory</p>
                    <h3>{group.modelName}</h3>
                  </div>
                  <span className={styles.count}>
                    {group.vehicles.length.toLocaleString()} vehicle{group.vehicles.length === 1 ? '' : 's'}
                  </span>
                </header>
                <div className="inventory-grid">
                  {group.vehicles.map((vehicle) => (
                    <InventoryCard key={vehicle.vin || vehicle.stockNumber || vehicle.sourceUrl} vehicle={vehicle} />
                  ))}
                </div>
              </section>
            ))}
          </section>
        ) : (
          <section className="inventory-grid">
            {visibleVehicles.map((vehicle) => (
              <InventoryCard key={vehicle.vin || vehicle.stockNumber || vehicle.sourceUrl} vehicle={vehicle} />
            ))}
          </section>
        )
      ) : (
        <section className="empty-state">
          <h2>No exact matches</h2>
          <p>Remove one constraint or clear the natural-language search to broaden the inventory.</p>
        </section>
      )}

      {condition !== 'new' && visibleCount < filteredVehicles.length ? (
        <div className="load-more-wrap">
          <button type="button" className="load-more" onClick={() => setVisibleCount((count) => count + INITIAL_VISIBLE)}>
            Show 24 More
          </button>
        </div>
      ) : null}
    </main>
  );
}
