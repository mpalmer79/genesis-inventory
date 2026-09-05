'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { effectiveVehiclePrice, parseInventoryQuery, searchInventory } from '../lib/search.js';
import styles from './InventoryExplorer.module.css';

const INITIAL_VISIBLE = 24;

function formatCurrency(value) {
  if (value == null || value === '') return 'Call for price';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Call for price';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(number);
}

function formatMileage(value) {
  if (value == null || value === '') return null;
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

function inventoryHealth(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return { tone: 'unknown', label: 'Sync status unknown' };
  const ageHours = Math.max(0, (Date.now() - timestamp) / 3600000);
  if (ageHours <= 26) return { tone: 'current', label: 'Inventory current' };
  if (ageHours <= 36) return { tone: 'delayed', label: 'Inventory refresh delayed' };
  return { tone: 'stale', label: 'Inventory may be stale' };
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
    .map(([modelName, modelVehicles]) => ({ modelName, vehicles: modelVehicles }));
}

function InventoryCard({ vehicle }) {
  const primaryPrice = effectiveVehiclePrice(vehicle);
  const mileage = formatMileage(vehicle.mileage);
  const websitePrice = vehicle.condition === 'new' && vehicle.price != null && vehicle.msrp != null && Number(vehicle.price) !== Number(vehicle.msrp)
    ? vehicle.price
    : null;
  const primaryPriceLabel = vehicle.condition === 'new' && vehicle.msrp != null ? 'MSRP' : vehicle.condition === 'new' ? 'Website Price' : 'Price';
  const copyValue = [
    vehicle.stockNumber ? `Stock ${vehicle.stockNumber}` : null,
    vehicle.vin ? `VIN ${vehicle.vin}` : null
  ].filter(Boolean).join('\n') || vehicle.sourceUrl;

  return (
    <article className="vehicle-card" data-model-year={vehicle.year || ''}>
      <div className="vehicle-media">
        {vehicle.imageUrl ? (
          <img
            src={vehicle.imageUrl}
            alt={vehicleTitle(vehicle)}
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        ) : null}
        <div className="vehicle-badges">
          <span className={`badge badge-${vehicle.condition}`}>{conditionLabel(vehicle)}</span>
          <span className={`badge badge-${vehicle.availability || 'unknown'}`}>{availabilityLabel(vehicle.availability)}</span>
        </div>
      </div>

      <div className="vehicle-content">
        <div className="vehicle-heading-row">
          <div>
            <p className="vehicle-model">{vehicleTitle(vehicle)}</p>
            <p className="vehicle-stock">Stock {vehicle.stockNumber || 'N/A'} · VIN {vehicle.vin || 'N/A'}</p>
          </div>
          <div className="vehicle-price">
            <span>{primaryPriceLabel}</span>
            <strong>{formatCurrency(primaryPrice)}</strong>
            {websitePrice ? <small>Website {formatCurrency(websitePrice)}</small> : null}
          </div>
        </div>

        <dl className="vehicle-facts">
          {vehicle.exteriorColor ? <><dt>Exterior</dt><dd>{vehicle.exteriorColor}</dd></> : null}
          {vehicle.interiorColor ? <><dt>Interior</dt><dd>{vehicle.interiorColor}</dd></> : null}
          {vehicle.drivetrain ? <><dt>Drive</dt><dd>{vehicle.drivetrain}</dd></> : null}
          {mileage ? <><dt>Mileage</dt><dd>{mileage}</dd></> : null}
          {vehicle.location ? <><dt>Location</dt><dd>{vehicle.location}</dd></> : null}
        </dl>

        <div className="vehicle-actions">
          <a href={vehicle.sourceUrl} target="_blank" rel="noreferrer" className="primary-link">Open Vehicle</a>
          <button type="button" className="copy-button" onClick={() => navigator.clipboard?.writeText(copyValue)}>Copy VIN / Stock</button>
        </div>
      </div>
    </article>
  );
}

export default function InventoryExplorer({ inventory }) {
  const vehicles = Array.isArray(inventory?.vehicles) ? inventory.vehicles : [];
  const metrics = inventory?.metrics || {};
  const resultsRef = useRef(null);
  const recognitionRef = useRef(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState('new');
  const [availability, setAvailability] = useState('all');
  const [make, setMake] = useState('all');
  const [model, setModel] = useState('all');
  const [sort, setSort] = useState('model-year');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(SpeechRecognition));
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const conditionScopedVehicles = useMemo(() => vehicles.filter((vehicle) => {
    if (condition === 'new') return vehicle.condition === 'new';
    if (condition === 'used') return ['used', 'certified'].includes(vehicle.condition);
    if (condition === 'certified') return vehicle.condition === 'certified';
    return true;
  }), [vehicles, condition]);

  const makes = useMemo(() => [...new Set(conditionScopedVehicles.map((vehicle) => vehicle.make).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [conditionScopedVehicles]);

  const models = useMemo(() => {
    const scoped = make === 'all' ? conditionScopedVehicles : conditionScopedVehicles.filter((vehicle) => vehicle.make === make);
    return [...new Set(scoped.map((vehicle) => vehicle.model).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [conditionScopedVehicles, make]);

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
      if (make !== 'all' && vehicle.make !== make) return false;
      if (model !== 'all' && vehicle.model !== model) return false;
      return true;
    });

    if (sort === 'model-year') list.sort(compareModelYear);
    else if (sort === 'price-low') list.sort((a, b) => (effectiveVehiclePrice(a) ?? Number.MAX_SAFE_INTEGER) - (effectiveVehiclePrice(b) ?? Number.MAX_SAFE_INTEGER));
    else if (sort === 'price-high') list.sort((a, b) => (effectiveVehiclePrice(b) ?? 0) - (effectiveVehiclePrice(a) ?? 0));
    else if (sort === 'mileage-low') list.sort((a, b) => (Number(a.mileage) || 0) - (Number(b.mileage) || 0));
    return list;
  }, [searchState.results, condition, availability, make, model, sort]);

  const groupedNewVehicles = useMemo(() => condition === 'new' ? groupByModel(filteredVehicles) : [], [condition, filteredVehicles]);
  const visibleVehicles = condition === 'new' ? filteredVehicles : filteredVehicles.slice(0, visibleCount);
  const preOwned = Number(metrics.preOwned ?? ((metrics.used || 0) + (metrics.certified || 0)));
  const health = inventoryHealth(inventory?.generatedAt);

  function resetView(nextValue, setter) {
    setter(nextValue);
    setVisibleCount(INITIAL_VISIBLE);
  }

  function handleConditionChange(nextCondition) {
    setCondition(nextCondition);
    setMake('all');
    setModel('all');
    setVisibleCount(INITIAL_VISIBLE);
  }

  function handleMakeChange(nextMake) {
    setMake(nextMake);
    setModel('all');
    setVisibleCount(INITIAL_VISIBLE);
  }

  function scrollToResults() {
    window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function submitSearch(nextQuery = queryInput) {
    const normalized = String(nextQuery || '').trim();
    if (!normalized) return;

    const parsed = parseInventoryQuery(normalized, vehicles);
    if (parsed.filters.condition) {
      setCondition(parsed.filters.condition);
      if (!parsed.filters.make) setMake('all');
      if (!parsed.filters.model) setModel('all');
    }
    if (parsed.filters.availability) setAvailability(parsed.filters.availability);
    if (parsed.filters.make) setMake(parsed.filters.make);
    if (parsed.filters.model) setModel(parsed.filters.model);

    setQueryInput(normalized);
    setQuery(normalized);
    setVisibleCount(INITIAL_VISIBLE);
    scrollToResults();
  }

  function clearSearch() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false);
    setVoiceMessage('');
    setQueryInput('');
    setQuery('');
    setVisibleCount(INITIAL_VISIBLE);
  }

  function toggleVoiceSearch() {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage('Voice search is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    let latestTranscript = '';
    let shouldSubmit = true;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { setVoiceMessage(''); setIsListening(true); };
    recognition.onresult = (event) => {
      latestTranscript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
      if (latestTranscript) setQueryInput(latestTranscript);
    };
    recognition.onerror = (event) => {
      shouldSubmit = false;
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setVoiceMessage('Microphone access was blocked. Allow microphone permission and try again.');
      else if (event.error === 'no-speech') setVoiceMessage('I did not hear anything. Tap the microphone and try again.');
      else setVoiceMessage('Voice search could not start. Please try again.');
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (shouldSubmit && latestTranscript) submitSearch(latestTranscript);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceMessage('Voice search could not start. Please try again.');
    }
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
          <p className="eyebrow">Inventory Intelligence</p>
          <h1>Genesis of Manchester</h1>
          <p className="hero-subtitle">Search the live inventory the way a salesperson thinks. Model, color, price range, mileage, stock number, VIN, availability and more.</p>
        </div>
        <div className="sync-card">
          <span>Last inventory sync</span>
          <strong>{formatTimestamp(inventory?.generatedAt)}</strong>
          <small>{vehicles.length.toLocaleString()} active records</small>
          <div className={`sync-health sync-health-${health.tone}`}>{health.label}</div>
        </div>
      </section>

      <section className="search-panel">
        <label htmlFor="inventory-search" className="search-label">Ask inventory</label>
        <form className="search-row" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
          <div className={styles.searchInputWrap}>
            <input id="inventory-search" type="search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Example: black GV80 AWD in stock under $80k" autoComplete="off" enterKeyHint="search" />
            <button type="button" className={`${styles.voiceButton} ${isListening ? styles.listening : ''}`} onClick={toggleVoiceSearch} disabled={!voiceSupported} aria-label={isListening ? 'Stop voice search' : 'Search inventory by voice'} aria-pressed={isListening} title={voiceSupported ? (isListening ? 'Stop listening' : 'Search by voice') : 'Voice search is not supported in this browser'}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V5a3.5 3.5 0 1 0-7 0v7a3.5 3.5 0 0 0 3.5 3.5Zm-1.8-10.5a1.8 1.8 0 1 1 3.6 0v7a1.8 1.8 0 1 1-3.6 0V5Zm7.8 6.2a.85.85 0 0 0-1.7 0v.8a4.3 4.3 0 0 1-8.6 0v-.8a.85.85 0 0 0-1.7 0v.8a6 6 0 0 0 5.15 5.94V20H8.7a.85.85 0 0 0 0 1.7h6.6a.85.85 0 1 0 0-1.7h-2.45v-2.06A6 6 0 0 0 18 12v-.8Z" /></svg>
            </button>
          </div>
          <button type="submit" className="search-button" disabled={!queryInput.trim()}>Search</button>
          {queryInput || query ? <button type="button" className="clear-button" onClick={clearSearch}>Clear</button> : null}
        </form>

        {isListening ? <div className={styles.voiceStatus} role="status" aria-live="polite"><span className={styles.listeningDot} /> Listening... speak your inventory request</div> : voiceMessage ? <div className={styles.voiceError} role="status" aria-live="polite">{voiceMessage}</div> : null}

        <div className="suggestion-row">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => submitSearch(suggestion)}>{suggestion}</button>)}</div>
        {query ? <div className="search-feedback" role="status" aria-live="polite"><strong>{filteredVehicles.length.toLocaleString()} matching vehicle{filteredVehicles.length === 1 ? '' : 's'}</strong><span>with the interpreted request and visible filters</span></div> : null}
        {searchState.parsed.labels?.length ? <div className="interpretation-row"><span>Interpreted as</span>{searchState.parsed.labels.map((label) => <strong key={label}>{label}</strong>)}</div> : null}
      </section>

      <section className="filter-bar" aria-label="Inventory filters">
        <label><span>Stock Type</span><select aria-label="Stock Type" value={condition} onChange={(event) => handleConditionChange(event.target.value)}><option value="all">All</option><option value="new">New</option><option value="used">Pre-Owned</option><option value="certified">Certified</option></select></label>
        <label><span>Availability</span><select aria-label="Availability" value={availability} onChange={(event) => resetView(event.target.value, setAvailability)}><option value="all">All</option><option value="in-stock">In Stock</option><option value="in-transit">In Transit</option></select></label>
        {condition !== 'new' ? <label><span>Make</span><select aria-label="Make" value={make} onChange={(event) => handleMakeChange(event.target.value)}><option value="all">All Makes</option>{makes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
        <label><span>Model</span><select aria-label="Model" value={model} onChange={(event) => resetView(event.target.value, setModel)}><option value="all">All Models</option>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Sort</span><select aria-label="Sort" value={sort} onChange={(event) => resetView(event.target.value, setSort)}><option value="model-year">Model / Year: Newest First</option><option value="price-low">Price: Low to High</option><option value="price-high">Price: High to Low</option><option value="mileage-low">Mileage: Low to High</option></select></label>
      </section>

      <section className="metric-grid" aria-label="Inventory summary">
        <div className="metric-card"><span>Total</span><strong>{Number(metrics.total ?? vehicles.length).toLocaleString()}</strong></div>
        <div className="metric-card"><span>New</span><strong>{Number(metrics.new ?? 0).toLocaleString()}</strong></div>
        <div className="metric-card"><span>Pre-Owned</span><strong>{preOwned.toLocaleString()}</strong></div>
        <div className="metric-card"><span>In Stock</span><strong>{Number(metrics.inStock ?? 0).toLocaleString()}</strong></div>
        <div className="metric-card"><span>In Transit</span><strong>{Number(metrics.inTransit ?? 0).toLocaleString()}</strong></div>
      </section>

      <section className="results-header" ref={resultsRef}><div><p className="eyebrow">Results</p><h2>{filteredVehicles.length.toLocaleString()} matching vehicle{filteredVehicles.length === 1 ? '' : 's'}</h2></div><p>Showing {visibleVehicles.length.toLocaleString()} of {filteredVehicles.length.toLocaleString()}</p></section>

      {visibleVehicles.length ? condition === 'new' ? (
        <section className={styles.modelGroups} aria-label="New inventory grouped by model">
          {groupedNewVehicles.map((group) => <section className={styles.modelGroup} key={group.modelName} data-model-group={group.modelName}><header className={styles.modelGroupHeader}><div><p className={styles.kicker}>New Inventory</p><h3>{group.modelName}</h3></div><span className={styles.count}>{group.vehicles.length.toLocaleString()} vehicle{group.vehicles.length === 1 ? '' : 's'}</span></header><div className="inventory-grid">{group.vehicles.map((vehicle) => <InventoryCard key={vehicle.vin || vehicle.stockNumber || vehicle.sourceUrl} vehicle={vehicle} />)}</div></section>)}
        </section>
      ) : <section className="inventory-grid">{visibleVehicles.map((vehicle) => <InventoryCard key={vehicle.vin || vehicle.stockNumber || vehicle.sourceUrl} vehicle={vehicle} />)}</section> : <section className="empty-state"><h2>No exact matches</h2><p>Remove one constraint or clear the natural-language search to broaden the inventory.</p></section>}

      {condition !== 'new' && visibleCount < filteredVehicles.length ? <div className="load-more-wrap"><button type="button" className="load-more" onClick={() => setVisibleCount((count) => count + INITIAL_VISIBLE)}>Show 24 More</button></div> : null}
    </main>
  );
}
