import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Foundations/Tokens",
  parameters: { layout: "padded", docs: { description: { component: "Design tokens ported from the old client (see docs/COMPONENT_AUDIT.md §A). Switch Theme in the toolbar." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const CATEGORIES = ["Tanakh", "Commentary", "Mishnah", "Talmud", "Midrash", "Halakhah", "Kabbalah", "Liturgy", "Jewish Thought", "Tosefta", "Chasidut", "Musar", "Responsa", "Second Temple", "Modern Commentary", "Reference", "Targum", "Sheets"];
const SURFACES = ["surface", "surface-subtle", "surface-muted", "highlight", "highlight-soft", "brand", "link", "danger", "success"];
const SPACES = [1, 2, 3, 4, 5, 6, 8, 10, 12];

const swatch = { display: "grid", gap: 4, fontSize: 12 } as const;

export const Colors: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 24 }}>
      <section>
        <h3>Category palette</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
          {CATEGORIES.map((c) => (
            <div key={c} style={swatch}>
              <div style={{ height: 40, borderRadius: 6, background: `var(--sefaria-cat-${c.toLowerCase().replace(/ /g, "-")})` }} />
              {c}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Surfaces &amp; interaction</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
          {SURFACES.map((s) => (
            <div key={s} style={swatch}>
              <div style={{ height: 40, borderRadius: 6, border: "1px solid var(--sefaria-color-border)", background: `var(--sefaria-color-${s})` }} />
              {s}
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <div style={{ fontFamily: "var(--sefaria-font-text-en)", fontSize: "var(--sefaria-reader-body-en)" }}>
        English text face: When God began to create heaven and earth
      </div>
      <div lang="he" dir="rtl" style={{ fontFamily: "var(--sefaria-font-text-he)", fontSize: "calc(var(--sefaria-reader-body-en) * var(--sefaria-reader-body-he-ratio))" }}>
        בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ
      </div>
      <div style={{ fontFamily: "var(--sefaria-font-ui-en)" }}>UI sans (English): Texts · Topics · Donate</div>
      <div lang="he" dir="rtl" style={{ fontFamily: "var(--sefaria-font-ui-he)" }}>ממשק (עברית): מקורות · נושאים · תרומה</div>
    </div>
  ),
};

export const Spacing: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 6 }}>
      {SPACES.map((n) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
          <code style={{ width: 110 }}>space-{n}</code>
          <div style={{ height: 12, width: `var(--sefaria-space-${n})`, background: "var(--sefaria-color-brand)" }} />
        </div>
      ))}
    </div>
  ),
};
