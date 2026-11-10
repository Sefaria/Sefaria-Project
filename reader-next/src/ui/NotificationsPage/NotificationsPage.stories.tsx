import type { Meta, StoryObj } from "@storybook/react-vite";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { PromoSlot, SidebarFooter, StayConnected } from "../NavSidebar/NavSidebar";
import { NewsletterSignUp } from "../NewsletterSignUp/NewsletterSignUp";
import { NotificationItem } from "../Notification/Notification";
import { NOTIFICATIONS } from "../Notification/story-data";
import { NotificationsPage } from "./NotificationsPage";

function Page({ empty }: { empty?: boolean }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <NotificationsPage
      he={he}
      footer={<SidebarFooter />}
      sidebar={<><StayConnected newsletter={<NewsletterSignUp subscribe={async () => undefined} isValidEmail={(e) => /@.+\./.test(e)} />} /><PromoSlot /></>}
    >
      {empty ? [] : NOTIFICATIONS.map((n) => <NotificationItem key={n.id} n={n} he={he} imageAlt="Notification image" />)}
    </NotificationsPage>
  );
}

const meta = {
  title: "Pages/NotificationsPage",
  component: Page,
  parameters: { layout: "fullscreen", docs: { description: { component: "The reader's notifications (/notifications)." } } },
} satisfies Meta<typeof Page>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { empty: true } };
