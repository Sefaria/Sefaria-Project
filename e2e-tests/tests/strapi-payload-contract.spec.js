/**
 * Playwright Tests: Strapi payload contract
 *
 * THE ANTI-DRIFT GUARD FOR THE SYNTHETIC PAYLOAD FACTORY.
 *
 * The standard objection to hand-built fixtures is drift: the factory keeps passing while the real
 * API moves on, and every spec built on it silently tests a shape that no longer exists. This
 * inverts that. The fourteen committed .har files are real captured Strapi responses, so they can
 * serve as the oracle — asserting the factory's field set EQUALS theirs catches drift in both
 * directions:
 *
 *   - a field added to the GraphQL query in static/js/context.js but not to the factory, so
 *     synthetic rows lack something the app now reads;
 *   - a field the factory invents that Strapi never returns, so a spec asserts on fiction.
 *
 * That gives the recordings a second job. Their first is proving Sefaria behaves correctly against
 * a payload Strapi really produced; their second is being the schema the factory is held to. It is
 * also why at least one recording per content type must stay committed — see the coverage guard at
 * the bottom, which fails if a content type is never exercised and the contract goes vacuous.
 *
 * NO SERVER NEEDED. This spec reads files from disk and never navigates, unlike every other spec
 * in this suite.
 *
 * THE RECORDINGS ARE FROZEN (decision 2026-08-31): no spec replays them and they are never
 * re-recorded. When the GraphQL query gains a field, declare it in FIELDS_ADDED_SINCE_RECORDING
 * (in the factory) alongside its FIELD_DEFAULTS entry; the recorded-rows check below subtracts
 * those declared additions, and a companion test fails if a declared addition ever appears in a
 * recording — so the exemption list can't quietly grow stale or paper over a real mismatch.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  SUPPORTED_LOCALES,
  ALIAS_FOR,
  FIELDS_ADDED_SINCE_RECORDING,
  fieldNames,
  banner,
  modal,
  sidebarAd,
  strapiPayload,
} from '../support/strapi-payload-factory.js';

/**
 * The field set a RECORDING is expected to carry: the factory's current set minus the fields
 * declared as added after the recordings were captured. The recordings are frozen (never
 * re-recorded — see FIELDS_ADDED_SINCE_RECORDING in the factory), so this, not `fieldNames`
 * itself, is the oracle comparison for recorded rows. The factory's own output is still held
 * to the FULL current set below.
 */
const recordedFieldNames = (contentType) =>
  fieldNames(contentType).filter((field) => !FIELDS_ADDED_SINCE_RECORDING.includes(field));

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

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

/**
 * Every recorded Strapi response body, tagged with the file it came from.
 *
 * Read eagerly at module scope so the file list becomes the test list — a newly committed .har is
 * checked automatically, with no test to remember to add.
 */
function readRecordedPayloads() {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.har'))
    .flatMap((name) => {
      const har = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
      return har.log.entries
        .filter((entry) => entry.response?.content?.text)
        .map((entry) => ({ fixture: name, body: JSON.parse(entry.response.content.text) }));
    });
}

const recordings = readRecordedPayloads();

/**
 * Every recorded row, flattened and labelled with where it came from.
 *
 * Flattening once up front keeps each assertion below a single expression over a list, and gives
 * every failure a precise label (`strapi-banner-published.har → en_banners[0]`) without threading
 * loop variables through the test body.
 */
const rowsOf = ({ fixture, body }) =>
  Object.entries(body.data || {}).flatMap(([alias, rows]) =>
    (rows || []).map((row, index) => ({
      row,
      alias,
      contentType: ALIAS_TO_CONTENT_TYPE[alias],
      where: `${fixture} → ${alias}[${index}]`,
    })),
  );

const recordedRows = recordings.flatMap(rowsOf);

/**
 * Content types actually present across the recordings, so a vacuous contract can be detected.
 *
 * Derived at collection time rather than accumulated while the tests run: the latter would make
 * the coverage guard depend on execution order, and would also report a spurious gap whenever an
 * unrelated per-fixture test failed before populating it.
 */
const contentTypesSeen = new Set(recordedRows.map(({ contentType }) => contentType));

test.describe('Strapi payload contract — the factory matches real recorded responses', () => {
  test('there are recordings to check against', () => {
    // Guards the whole file: with no .har files every per-fixture test below would pass by
    // iterating nothing, and the contract would silently stop being enforced.
    expect(recordings.length).toBeGreaterThan(0);
  });

  recordings.forEach(({ fixture, body }) =>
    test(`${fixture} returns exactly the aliases the client query asks for`, () => {
      expect(Object.keys(body)).toEqual(['data']);
      expect(Object.keys(body.data).sort()).toEqual([...EXPECTED_ALIASES].sort());
    }),
  );

  test('every recorded row carries exactly the fields the factory emits, minus declared additions', () => {
    // One test over every row of every recording rather than one per fixture: a field added to the
    // query shows up in all of them at once, and a single failure listing the offending row is
    // easier to read than fourteen identical ones. Post-recording additions are subtracted — the
    // recordings are frozen, so they can never carry a field added after they were captured.
    recordedRows.forEach(({ row, contentType, where }) =>
      expect(Object.keys(row).sort(), `${where} (${contentType})`).toEqual(
        [...recordedFieldNames(contentType)].sort(),
      ),
    );
  });

  test('no declared post-recording field actually appears in a recording', () => {
    // Keeps FIELDS_ADDED_SINCE_RECORDING honest. If a listed field shows up in a recording, the
    // recording DOES know about it and the exemption is a lie — someone either re-recorded (which
    // the frozen-recordings decision forbids) or listed a field that predates the recordings to
    // paper over a factory mismatch. Either way the list must shrink, not the contract loosen.
    recordedRows.forEach(({ row, where }) =>
      FIELDS_ADDED_SINCE_RECORDING.forEach((field) =>
        expect(field in row, `${where} unexpectedly carries post-recording field "${field}"`).toBe(false),
      ),
    );
  });

  test('nested objects match the shapes the query selects', () => {
    // Banners and modals: `countriesToTarget { countryMode countries { name code } }`.
    // Null is legitimate content — an untargeted document — and matches every viewer.
    recordedRows
      .filter(({ row }) => row.countriesToTarget)
      .forEach(({ row, where }) => {
        expect(Object.keys(row.countriesToTarget).sort(), where).toEqual(['countries', 'countryMode']);
        row.countriesToTarget.countries.forEach((country) =>
          expect(Object.keys(country).sort(), where).toEqual(['code', 'name']),
        );
      });

    // Sidebar ads: `buttonIcon { url alternativeText }`, optional.
    recordedRows
      .filter(({ row }) => row.buttonIcon)
      .forEach(({ row, where }) =>
        expect(Object.keys(row.buttonIcon).sort(), where).toEqual(['alternativeText', 'url']),
      );

    // Sidebar ads: `newsletterMailingLists { newsletterName }`, often empty.
    recordedRows
      .filter(({ row }) => 'newsletterMailingLists' in row)
      .forEach(({ row, where }) => {
        expect(Array.isArray(row.newsletterMailingLists), where).toBe(true);
        row.newsletterMailingLists.forEach((mailingList) =>
          expect(Object.keys(mailingList), where).toEqual(['newsletterName']),
        );
      });
  });

  test('the builders emit exactly the fields they are checked against', () => {
    // Closes the loop. The assertions above compare the RECORDINGS to `fieldNames`; this compares
    // the BUILDERS to it. Without this a builder could drop or add a key — `withIdentifiers`
    // returning a trimmed object, say — and every recording would still match `fieldNames` while
    // the payloads actually served to the browser did not.
    const payload = strapiPayload({
      banners: [banner({ locales: { en: {}, he: {} } })],
      modals: [modal({ locales: { en: {}, he: {} } })],
      sidebarAds: [sidebarAd({ locales: { en: {}, he: {} } })],
    });

    rowsOf({ fixture: 'factory output', body: payload }).forEach(({ row, contentType, where }) =>
      expect(Object.keys(row).sort(), `${where} (${contentType})`).toEqual(
        [...fieldNames(contentType)].sort(),
      ),
    );
  });

  test('every content type is covered by at least one recording', () => {
    // Without this the contract could go quietly vacuous: delete or empty out every recording
    // holding, say, a sidebar ad, and the field-set check above would stop examining sidebarAd
    // rows while still reporting green.
    expect([...contentTypesSeen].sort()).toEqual([...CONTENT_TYPES].sort());
  });
});
