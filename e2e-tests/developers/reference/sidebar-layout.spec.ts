import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../../pages/pageManager';
import { ENDPOINTS, enterPortal } from '../developers-entry';

// The reference layout and sidebar (PLAN §6.2 A): 288px sticky sidebar, groups, section headings, method
// pills and deprecated icons, the filter and Cmd/Ctrl-/, the collapse control, and the breakpoints.
test.describe('Developers Reference, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, ENDPOINTS.texts.path));
  });

  test('DEV-REF-050: The sidebar is 288px wide and stays in place while the article scrolls', async () => {
    const shell = pm.onDevelopersShell();
    expect((await shell.sidebarBox())?.width).toBe(288);
    // Sticky: once the header has scrolled away the sidebar holds its place however far the article goes.
    const first = await shell.scrollArticleAndMeasureSidebarTop(600);
    const second = await shell.scrollArticleAndMeasureSidebarTop(1200);
    expect(Math.round(second.after)).toBe(Math.round(first.after));
    expect(first.after).toBeGreaterThanOrEqual(0);
    expect(first.after).toBeLessThanOrEqual(first.before);
  });

  test('DEV-REF-051: On load only the group containing the current page is open', async () => {
    const shell = pm.onDevelopersShell();
    const open = await shell.openSidebarGroups();
    expect(open).toHaveLength(1);
    const items = await shell.sidebarItems();
    const active = items.find((i) => i.active);
    expect(active?.href).toBe(ENDPOINTS.texts.path);
    expect(active!.depth).toBeGreaterThan(0);
  });

  test('DEV-REF-052: Other groups open and close on click', async () => {
    const shell = pm.onDevelopersShell();
    const before = await shell.openSidebarGroups();
    expect(before).not.toContain('Topic');
    await shell.toggleSidebarGroup('Topic');
    expect(await shell.openSidebarGroups()).toContain('Topic');
    await shell.toggleSidebarGroup('Topic');
    expect(await shell.openSidebarGroups()).toEqual(before);
  });

  test('DEV-REF-053: Both "Index" groups exist', async () => {
    const items = await pm.onDevelopersShell().sidebarItems();
    expect(items.filter((i) => i.name === 'Index')).toHaveLength(2);
  });

  test('DEV-REF-054: Section headings are upper-case', async () => {
    const headings = await pm.onDevelopersShell().sidebarSectionHeadings();
    expect(headings).toEqual(expect.arrayContaining(['WELCOME', 'SEFARIA API']));
    for (const heading of headings) expect(heading).toBe(heading.toUpperCase());
  });

  test('DEV-REF-055: Endpoint rows carry their method pill; get-v1-texts and get-topic-slug show the deprecated icon', async () => {
    const shell = pm.onDevelopersShell();
    const items = await shell.sidebarItems();
    expect(items.find((i) => i.href === ENDPOINTS.texts.path)?.method).toBe('GET');
    for (const path of ENDPOINTS.deprecated) {
      await shell.openPath(path);
      expect((await shell.sidebarItems()).find((i) => i.href === path)?.deprecated, path).toBe(true);
    }
  });

  test('DEV-REF-056: The filter narrows the tree as you type', async () => {
    const shell = pm.onDevelopersShell();
    const all = (await shell.sidebarItems()).length;
    await shell.filterSidebar('calendar');
    const narrowed = await shell.sidebarItems();
    expect(narrowed.length).toBeLessThan(all);
    expect(narrowed.some((i) => /calendar/i.test(i.name))).toBe(true);
    await shell.clearSidebarFilter();
    expect((await shell.sidebarItems()).length).toBe(all);
  });

  test('DEV-REF-057: Cmd-/ or Ctrl-/ focuses the filter', async () => {
    const shell = pm.onDevelopersShell();
    expect(await shell.isSidebarFilterFocused()).toBe(false);
    await shell.focusSidebarFilterWithShortcut();
    expect(await shell.isSidebarFilterFocused()).toBe(true);
  });

  test('DEV-REF-058: The collapse control hides the sidebar and the choice survives a reload', async () => {
    const shell = pm.onDevelopersShell();
    expect(await shell.isSidebarCollapsed()).toBe(false);
    await shell.collapseSidebar();
    // Collapsed, the sidebar leaves only its narrow rail with the "Show sidebar navigation" control.
    expect((await shell.sidebarBox())?.width ?? 0).toBeLessThan(64);
    await shell.openPath(ENDPOINTS.texts.path);
    expect(await shell.isSidebarCollapsed()).toBe(true);
    await shell.expandSidebar();
    expect((await shell.sidebarBox())?.width).toBe(288);
  });

  test('DEV-REF-059: At 1070px the article narrows to 292px beside the playground', async () => {
    await page.setViewportSize({ width: 1070, height: 900 });
    const boxes = await pm.onDevelopersReference().layoutBoxes();
    expect(boxes.article?.width).toBe(292);
    expect(boxes.playground!.x).toBeGreaterThan(boxes.article!.x);
  });

  test('DEV-REF-060: At 1065px and below the playground moves under the article', async () => {
    await page.setViewportSize({ width: 1065, height: 900 });
    const boxes = await pm.onDevelopersReference().layoutBoxes();
    expect(boxes.playground!.y).toBeGreaterThanOrEqual(boxes.article!.y + boxes.article!.height - 1);
  });

  test("DEV-REF-061: At 768px the sidebar is replaced by the mobile header's dropdown", async () => {
    await page.setViewportSize({ width: 768, height: 900 });
    const shell = pm.onDevelopersShell();
    expect((await pm.onDevelopersReference().layoutBoxes()).sidebar).toBeNull();
    expect(await shell.openMobileSubnav()).toBe(ENDPOINTS.texts.title);
    expect(await shell.sidebarBox()).not.toBeNull();
  });

  test('DEV-REF-062: The tag group address answers 302 to its first visible child', async () => {
    const result = await pm.onDevelopersCopyPage().httpGet('/reference/text');
    expect(result.status).toBe(302);
    expect(new URL(result.headers['location'], page.url()).pathname).toBe(ENDPOINTS.texts.path);
  });
});
