// @vitest-environment node
import { ANALYTICS_EVENT_NAMES, COPY_PAGE_ACTIONS, DISCORD_PLACEMENTS, KEY_EVENT_NAMES } from './events';
import type { AnalyticsEventName } from './events';

// Pins contract C8 to PLAN §2.13. Changing an event is a contract change made by the Integrator.
describe('C8 analytics events', () => {
  it('names exactly the events of PLAN §2.13', () => {
    expect([...ANALYTICS_EVENT_NAMES]).toEqual([
      'page_view',
      'discord_cta_click',
      'try_it_run',
      'copy_page_action',
      'contact_form_start',
    ]);
    expect([...KEY_EVENT_NAMES]).toEqual(ANALYTICS_EVENT_NAMES.filter((name) => name !== 'page_view'));
  });

  it('lists the six Discord placements', () => {
    expect([...DISCORD_PLACEMENTS]).toEqual([
      'home_hero',
      'home_community',
      'sidebar_footer',
      'docs_page_end',
      'reference_request_panel',
      'contact_page',
    ]);
  });

  it('lists the eight Copy Page actions', () => {
    expect([...COPY_PAGE_ACTIONS]).toEqual([
      'copy_markdown',
      'view_markdown',
      'open_chatgpt',
      'open_claude',
      'connect_cursor',
      'connect_vscode',
      'copy_mcp_config',
      'copy_mcp_command',
    ]);
  });

  it('covers every name of the AnalyticsEvents type', () => {
    const all: Record<AnalyticsEventName, true> = {
      page_view: true,
      discord_cta_click: true,
      try_it_run: true,
      copy_page_action: true,
      contact_form_start: true,
    };
    expect(Object.keys(all).sort()).toEqual([...ANALYTICS_EVENT_NAMES].sort());
  });
});
