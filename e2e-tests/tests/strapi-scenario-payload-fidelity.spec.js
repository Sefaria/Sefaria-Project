/**
 * Playwright Tests: Strapi scenario payload fidelity
 *
 * PROOF THAT THE SYNTHETIC SCENARIO REPLICAS EQUAL THEIR RECORDINGS.
 *
 * The suite's specs route Strapi through SCENARIO_PAYLOADS (built in code) instead of replaying
 * the committed .har files, because routeFromHAR matches on the GraphQL POST body and any query
 * change invalidated all fourteen recordings at once. That swap is only safe if the synthetic
 * body a spec serves is genuinely the body Strapi served when the scenario was recorded — this
 * spec pins exactly that, one deep-equality per scenario.
 *
 * Together with strapi-payload-contract.spec.js this closes the loop:
 *   - the contract spec proves the FACTORY's field set matches what Strapi returns;
 *   - this spec proves each SCENARIO built with that factory matches its specific recording.
 *
 * Post-recording query fields (FIELDS_ADDED_SINCE_RECORDING) are already stripped from the
 * replicas by scenarioPayload(), so a legitimate query addition does not fail here; a wrong
 * date, a dropped document, or a reordered row does.
 *
 * NO SERVER NEEDED — reads files from disk and never navigates, like the contract spec.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { SCENARIO_PAYLOADS } from './strapi.scenario-payloads.js';
import { SCENARIOS } from './strapi.fixtures.js';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

/** The one Strapi response body inside a recording. */
const recordedBody = (harName) => {
  const har = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${harName}.har`), 'utf8'));
  const entries = har.log.entries.filter((entry) => entry.response?.content?.text);
  // Every strapi-*.har holds exactly one /api/strapi/ exchange; a second one would mean the
  // recording captured something this comparison silently ignores.
  expect(entries.length, `${harName}.har should contain exactly one recorded response`).toBe(1);
  return JSON.parse(entries[0].response.content.text);
};

test.describe('Strapi scenario payloads — each replica equals its recording', () => {
  test('every recorded scenario has a synthetic replica, and none is left over', () => {
    // The two files must cover the same scenario set, or a spec could route a scenario whose
    // fidelity is never checked (missing replica) / a replica could outlive its recording.
    const recordedScenarioNames = Object.entries(SCENARIOS)
      .filter(([, scenario]) => scenario.har)
      .map(([name]) => name)
      .sort();
    expect(Object.keys(SCENARIO_PAYLOADS).sort()).toEqual(recordedScenarioNames);
  });

  Object.entries(SCENARIO_PAYLOADS).forEach(([name, payload]) =>
    test(`${name} matches ${SCENARIOS[name]?.har}.har`, () => {
      expect(payload).toEqual(recordedBody(SCENARIOS[name].har));
    }),
  );
});
