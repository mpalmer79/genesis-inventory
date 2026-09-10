import test from 'node:test';
import assert from 'node:assert/strict';
import inventory from '../data/inventory.json' with { type: 'json' };
import { chooseVoiceInventoryQuery, normalizeVoiceInventoryQuery } from './voiceNormalize.js';

test('normalizes Genesis model speech and drivetrain language', () => {
  const result = normalizeVoiceInventoryQuery('looking for a black gavi eighty all wheel drive', inventory.vehicles);
  assert.equal(result.query, 'looking for a black GV80 AWD');
  assert.equal(result.changed, true);
});

test('normalizes spaced model speech', () => {
  assert.equal(normalizeVoiceInventoryQuery('show me a g v seventy', inventory.vehicles).query, 'show me a GV70');
  assert.equal(normalizeVoiceInventoryQuery('show me a gee seventy', inventory.vehicles).query, 'show me a G70');
});

test('normalizes drivetrain synonyms', () => {
  assert.equal(normalizeVoiceInventoryQuery('used rear wheel drive sedans', inventory.vehicles).query, 'used RWD sedans');
  assert.equal(normalizeVoiceInventoryQuery('front wheel drive SUVs', inventory.vehicles).query, 'FWD SUVs');
  assert.equal(normalizeVoiceInventoryQuery('four wheel drive SUVs', inventory.vehicles).query, '4WD SUVs');
});

test('normalizes mileage shorthand from speech', () => {
  assert.equal(normalizeVoiceInventoryQuery('used AWD SUVs under 30 thousand miles', inventory.vehicles).query, 'used AWD SUVs under 30k miles');
  assert.equal(normalizeVoiceInventoryQuery('used AWD SUVs under 30 k m', inventory.vehicles).query, 'used AWD SUVs under 30k miles');
});

test('normalizes certified and pre-owned phrasing', () => {
  assert.equal(normalizeVoiceInventoryQuery('certified pre owned Genesis', inventory.vehicles).query, 'certified Genesis');
  assert.equal(normalizeVoiceInventoryQuery('pre owned Lexus', inventory.vehicles).query, 'used Lexus');
});

test('treats standalone voice use as used inventory', () => {
  const result = normalizeVoiceInventoryQuery('use GV70 red prestige', inventory.vehicles);
  assert.equal(result.query, 'used GV70 red prestige');
  assert.equal(result.changed, true);
});

test('does not alter words that merely contain use', () => {
  assert.equal(normalizeVoiceInventoryQuery('show me a house', inventory.vehicles).query, 'show me a house');
});

test('prefers a speech alternative that resolves to live inventory terminology', () => {
  const result = chooseVoiceInventoryQuery([
    'looking for a black gavi all wheel drive',
    'looking for a black gavi eighty all wheel drive',
    'looking for a black gabby eighty all wheel drive'
  ], inventory.vehicles);
  assert.equal(result.query, 'looking for a black GV80 AWD');
  assert.equal(result.heard, 'looking for a black gavi eighty all wheel drive');
});
