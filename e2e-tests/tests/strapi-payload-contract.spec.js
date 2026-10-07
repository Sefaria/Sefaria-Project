/**
 * Playwright Tests: Strapi payload factory — self-consistency
 *
 * THE FACTORY IS THE SCHEMA. FIELD_DEFAULTS in strapi-payload-factory.js declares every field
 * the GraphQL query in static/js/context.js asks for; when the query gains a field, the factory
 * gains it in the same change (assertKnownFields makes forgetting loud: any spec that sets the
 * new field throws until it exists in FIELD_DEFAULTS). This spec guards the remaining hole —
 * a BUILDER quietly dropping or inventing keys relative to that declaration (say,
 * withIdentifiers returning a trimmed object), so payloads served to the browser silently
 * stop matching what the factory claims to emit.
 *
 * Earlier this file also compared field sets against the fourteen committed .har recordings.
 * That coupling was removed (2026-09-08): the recordings are INERT REFERENCE now — checked once
 * at migration time, kept for humans to read, depended on by nothing. Comparing against them
 * forever would have meant a growing exceptions list (one entry per post-recording query field)
 * to keep old snapshots happy. The current schema's source of truth is the factory itself,
 * updated deliberately alongside the query.
 *
 * NO SERVER NEEDED — pure functions in, key sets out.
 */

import { test, expect } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  ALIAS_FOR,
  fieldNames,
  banner,
  modal,
  sidebarAd,
  strapiPayload,
} from '../support/strapi-payload-factory.js';

const CONTENT_TYPES = Object.keys(ALIAS_FOR);

/** Every `<locale>_<alias>` key the client's aliased GraphQL query produces. */
const EXPECTED_ALIASES = CONTENT_TYPES.flatMap((contentType) =>
  SUPPORTED_LOCALES.map((locale) => `${locale}_${ALIAS_FOR[contentType]}`),
);

const ALIAS_TO_CONTENT_TYPE = Object.fromEntries(
  CONTENT_TYPES.flatMap((contentType) =>
    SUPPORTED_LOCALES.map((locale) => [`${locale}_${ALIAS_FOR[contentType]}`, contentType]),
  ),
);

/** Every row of a payload, flattened and labelled so a failure names its exact origin. */
const rowsOf = (body) =>
  Object.entries(body.data || {}).flatMap(([alias, rows]) =>
    (rows || []).map((row, index) => ({
      row,
      contentType: ALIAS_TO_CONTENT_TYPE[alias],
      where: `${alias}[${index}]`,
    })),
  );

test.describe('Strapi payload factory — the builders match their own declaration', () => {
  const payload = strapiPayload({
    banners: [banner({ locales: { en: {}, he: {} } })],
    modals: [modal({ locales: { en: {}, he: {} } })],
    sidebarAds: [sidebarAd({ locales: { en: {}, he: {} } })],
  });

  test('a payload carries exactly the aliases the client query asks for', () => {
    expect(Object.keys(payload)).toEqual(['data']);
    expect(Object.keys(payload.data).sort()).toEqual([...EXPECTED_ALIASES].sort());
  });

  test('every emitted row carries exactly the fields FIELD_DEFAULTS declares', () => {
    // The declaration is the schema; a builder dropping or inventing a key here means specs
    // would exercise payloads that differ from what the factory documents itself as emitting.
    const emittedRows = rowsOf(payload);
    expect(emittedRows.length).toBeGreaterThan(0);
    emittedRows.forEach(({ row, contentType, where }) =>
      expect(Object.keys(row).sort(), `${where} (${contentType})`).toEqual(
        [...fieldNames(contentType)].sort(),
      ),
    );
  });

  test('every content type is exercised above', () => {
    // Guards the guard: if a builder were removed from the payload under test, the field-set
    // check would quietly stop examining that content type while still reporting green.
    const contentTypesSeen = new Set(rowsOf(payload).map(({ contentType }) => contentType));
    expect([...contentTypesSeen].sort()).toEqual([...CONTENT_TYPES].sort());
  });
});
