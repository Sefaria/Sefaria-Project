import fs from 'fs';
import path from 'path';
import { BASE_ALLOWED_PARAMS } from '@sefaria/analytics';
import { attachAttributeAnalytics, SEFARIA_EXTRA_ALLOWED_PARAMS } from '../attributeAnalytics';

// The jsdom version Jest uses here has no IntersectionObserver (it doesn't lay anything out on a
// screen), and may lack MutationObserver. attach() creates both, so give it do-nothing stand-ins.
class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
global.IntersectionObserver = global.IntersectionObserver || NoopObserver;
global.MutationObserver = global.MutationObserver || NoopObserver;

const PAGE = `
    <div id="s2"><div>
      <div data-anl-feature_name="outer" data-anl-project="library">
        <button id="b" data-anl-event="button_clicked:click" data-anl-text="Go" data-anl-panel_number="2"><span id="label">Go</span></button>
      </div>
    </div></div>
    <div id="staticContentWrapper"><main>
      <a id="cta" data-anl-event="cta_clicked:click" data-anl-link_type="donate">Donate</a>
    </main></div>
    <div id="outside"><button id="untracked" data-anl-event="ignored:click">x</button></div>`;

const click = element => element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
// gtag is called as gtag('event', name, params); return [name, params] pairs.
const firedEvents = () => window.gtag.mock.calls.map(([, name, params]) => [name, params]);

beforeEach(() => {
    document.body.innerHTML = PAGE;
});

afterEach(() => {
    delete window.gtag;
    jest.restoreAllMocks();
});

describe('attachAttributeAnalytics', () => {
    test('does nothing when Google\'s tag is not on the page', () => {
        expect(attachAttributeAnalytics()).toBeNull();
        expect(() => click(document.getElementById('label'))).not.toThrow();
    });

    test('a click inside #s2 sends the event with params from the element and its parents', () => {
        window.gtag = jest.fn();
        attachAttributeAnalytics();
        click(document.getElementById('label'));
        expect(firedEvents()).toEqual([
            ['button_clicked', { text: 'Go', panel_number: '2', feature_name: 'outer', project: 'library' }],
        ]);
    });

    test('a click inside #staticContentWrapper is tracked too', () => {
        window.gtag = jest.fn();
        attachAttributeAnalytics();
        click(document.getElementById('cta'));
        expect(firedEvents()).toEqual([['cta_clicked', { link_type: 'donate' }]]);
    });

    test('elements outside the tracked containers are ignored', () => {
        window.gtag = jest.fn();
        attachAttributeAnalytics();
        click(document.getElementById('untracked'));
        expect(firedEvents()).toEqual([]);
    });

    test('a parameter that is not allowed is dropped, with a warning', () => {
        window.gtag = jest.fn();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        document.getElementById('b').setAttribute('data-anl-made_up_param', 'x');
        attachAttributeAnalytics();
        click(document.getElementById('b'));
        expect(firedEvents()[0][1]).not.toHaveProperty('made_up_param');
        expect(warn).toHaveBeenCalledWith('Invalid analytics key:', 'made_up_param');
    });
});

describe('allowed parameter names', () => {
    const allowed = new Set([...BASE_ALLOWED_PARAMS, ...SEFARIA_EXTRA_ALLOWED_PARAMS]);

    test('are exactly the ones the old analyticsEventTracker.js allowed, so no GA4 report loses data', () => {
        expect(allowed).toEqual(new Set([
            'project', 'panel_type', 'panel_number', 'item_id', 'version', 'content_lang',
            'content_id', 'content_type', 'panel_name', 'panel_category', 'position', 'ai',
            'text', 'experiment', 'feature_name', 'from', 'to', 'action', 'engagement_value',
            'engagement_type', 'logged_in', 'site_lang', 'traffic_type', 'promotion_name', 'link_type',
            'form_name', 'form_destination',
        ]));
    });

    // Scans the source for data-anl-<name> attributes written out in full. A name missing from the
    // allowed list is silently dropped in production (only a console warning), so catch it here.
    // Names inside data-anl-batch JSON are built in code and can't be found this way.
    test('include every data-anl-<name> attribute used in the code', () => {
        const repoRoot = path.resolve(__dirname, '../../../..');
        const files = [];
        const walk = dir => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!['tests', 'bundles', 'node_modules'].includes(entry.name)) { walk(full); }
                } else if (/\.(jsx?|html)$/.test(entry.name)) {
                    files.push(full);
                }
            }
        };
        walk(path.join(repoRoot, 'static/js'));
        walk(path.join(repoRoot, 'templates'));

        const notParams = new Set(['event', 'batch']);
        const used = new Map();  // name -> first file it appears in
        for (const file of files) {
            for (const [, name] of fs.readFileSync(file, 'utf8').matchAll(/data-anl-([a-zA-Z_]+)/g)) {
                if (!notParams.has(name) && !used.has(name)) { used.set(name, path.relative(repoRoot, file)); }
            }
        }

        expect(used.size).toBeGreaterThan(0);
        const notAllowed = [...used].filter(([name]) => !allowed.has(name)).map(([name, file]) => `${name} (${file})`);
        expect(notAllowed).toEqual([]);
    });
});
