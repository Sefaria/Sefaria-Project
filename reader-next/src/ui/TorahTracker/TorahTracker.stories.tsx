import type { Meta, StoryObj } from "@storybook/react-vite";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { CategoryBars, ChartRow, Donut, Favorites, StatCard, StatsHeading, TorahTrackerPage } from "./TorahTracker";
import { BARS, FAVORITES, SLICES } from "./story-data";

const MODES = [
  { key: "currently", en: "Previous Year", he: "לשנה האחרונה" },
  { key: "alltime", en: "All Time", he: "כל הזמן" },
];

function Page({ loading }: { loading?: boolean }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <TorahTrackerPage he={he} name={loading ? undefined : "Ada Lovelace"} modes={MODES} mode="currently" onMode={() => undefined}>
      {loading ? null : (
        <div>
          <StatsHeading en="Your Overall Activity" he="הפעילות שלך במבט" />
          <StatCard icon="/icons/book-icon-black.svg" value={128} label={he ? "ספרים שנקראו" : "Texts Read"} />
          <StatsHeading en="Your Reading by Category" he="לימוד לפי סוגה" />
          <ChartRow>
            <Donut slices={SLICES} title={{ en: "Your Reading", he: "הלימוד שלך" }} />
            <Donut slices={SLICES} title={{ en: "Average Sefaria User", he: "משתמש ממוצע בספריא" }} />
          </ChartRow>
          <StatsHeading en="Your Top Categories" he="מצעד סוגות הלימוד" />
          <ChartRow><CategoryBars bars={BARS} height={170} he={he} averageLabel={he ? "משתמש ממוצע בספריא" : "Average Sefaria User"} /></ChartRow>
          <Favorites items={FAVORITES} />
        </div>
      )}
    </TorahTrackerPage>
  );
}

const meta = {
  title: "Pages/TorahTracker",
  component: Page,
  parameters: { layout: "fullscreen", docs: { description: { component: "Torah Tracker (/torahtracker): the reader's reading by category against the average reader's." } } },
} satisfies Meta<typeof Page>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Loading: Story = { args: { loading: true } };
