// @feature LEG-010 @feature LEG-031
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { diffSegments } from "~/lib/compare/diff";
import { CompareForm, DiffTable, NextChapterButton, VersionDiffPage } from "./VersionDiff";

/**
 * The version-diff tool (/compare, LEG-010): sefaria.org's bare staff page in the browser's own styles. One story per state of the
 * page: the empty form, the form with versions, a table of diffs (insertions green, changes across a tag red), loading.
 */
const a = diffSegments("וַיַּ֣עַשׂ אֱלֹהִים֮ אֶת־הָרָקִ֒יעַ֒ וַֽיְהִי", "וַיַּ֣עַשׂ אֱלֹהִים֮ אֶת־הָרָקִיעַ֒ וַֽיְהִי");
const b = diffSegments("ab<i>c</i> same", "aX same");
const rows = [
  { segRef: "Genesis 1:1", ...diffSegments("בְּרֵאשִׁ֖ית בָּרָ֣א", "בְּרֵאשִׁ֖ית בָּרָ֣א") },
  { segRef: "Genesis 1:7", ...a },
  { segRef: "Genesis 1:8", ...b },
];
const noop = () => undefined;

function Page({ withVersions = true, table = true, loading = false }: { withVersions?: boolean; table?: boolean; loading?: boolean }) {
  return (
    <VersionDiffPage checked={new Set(["ו"])} onFilterToggle={noop} onFilterUpdate={noop}>
      <CompareForm values={{ secRef: "Genesis 1", lang: "he", v1: "Miqra according to the Masorah", v2: "Tanach with Nikkud" }} versionOptions={withVersions ? ["Miqra according to the Masorah", "Tanach with Nikkud"] : null} onChange={noop} onSubmit={noop} />
      {table ? (
        <DiffTable
          secRef="Genesis 1"
          v1="Miqra according to the Masorah"
          v2="Tanach with Nikkud"
          lang="he"
          rows={loading ? null : rows.map((r) => ({ segRef: r.segRef, v1: r.v1, v2: r.v2 }))}
          filters={new Set()}
          editing={{ canEdit: async () => true, apply: noop }}
        />
      ) : null}
      <NextChapterButton onClick={noop} />
    </VersionDiffPage>
  );
}

const meta = { title: "Pages/VersionDiff", component: Page, tags: ["autodocs"], parameters: { layout: "fullscreen" } } satisfies Meta<typeof Page>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyForm: Story = { args: { withVersions: false, table: false } };
export const WithVersions: Story = { args: { table: false } };
export const Diffs: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText("Genesis 1:7")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-diff="ins"]').length).toBeGreaterThan(0);
    await expect(canvasElement.querySelectorAll('[data-diff="del"]').length).toBeGreaterThan(0);
    // a click on a change (canEdit says yes) opens the change dialog
    await userEvent.click(canvasElement.querySelector('[data-diff="ins"]') as HTMLElement);
    await expect(await c.findByRole("dialog", { name: "Change" })).toBeVisible();
    await expect(c.getByRole("button", { name: "Apply Change" })).toBeVisible();
  },
};
export const LoadingText: Story = { args: { loading: true } };
