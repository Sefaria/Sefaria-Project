import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { AboutLearningSchedules, PromoSlot, SidebarFooter, StayConnected, SupportSefaria } from "../NavSidebar/NavSidebar";
import { NewsletterSignUp } from "../NewsletterSignUp/NewsletterSignUp";
import { CalendarCard, CalendarsPage } from "./CalendarsPage";
import { SECTIONS } from "./story-data";

const signUp = <NewsletterSignUp subscribe={async () => undefined} isValidEmail={(e) => /@.+\./.test(e)} />;
const meta = {
  title: "Pages/CalendarsPage",
  component: CalendarsPage,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", docs: { description: { component: "Learning Schedules (/calendars) from a trimmed day of the calendars API." } } },
  args: {
    ...SECTIONS,
    intro: <AboutLearningSchedules phoneOnly />,
    footer: <SidebarFooter />,
    sidebar: (
      <>
        <AboutLearningSchedules wideOnly />
        <StayConnected newsletter={signUp} />
        <SupportSefaria />
        <PromoSlot />
      </>
    ),
  },
} satisfies Meta<typeof CalendarsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const HebrewInterface: Story = { decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><Story /></InterfaceLangProvider>] };
/** A card with several readings (a haftarah read in parts) and no description. */
export const MultiReadingCard: StoryObj = {
  render: () => (
    <div style={{ width: 328, padding: 20 }}>
      <CalendarCard listing={{ key: "Haftarah (A)", title: { en: "Haftarah (A)", he: "הפטרה (א)" }, href: "/I_Kings.1.1-31", category: "Tanakh", readings: [{ href: "/I_Kings.1.1-31", text: { en: "I Kings 1:1-31", he: "מלכים א א׳:א׳-ל״א" } }, { href: "/I_Kings.1.46", text: { en: "I Kings 1:46", he: "מלכים א א׳:מ״ו" } }] }} />
    </div>
  ),
};
