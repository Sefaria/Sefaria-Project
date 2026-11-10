import type { Meta, StoryObj } from "@storybook/react-vite";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { NotificationItem, NotificationList } from "./Notification";
import { NOTIFICATIONS } from "./story-data";

function List() {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div style={{ maxWidth: 665, padding: 30 }} dir={he ? "rtl" : "ltr"} lang={he ? "he" : "en"}>
      <NotificationList>
        {NOTIFICATIONS.map((n) => <NotificationItem key={n.id} n={n} he={he} imageAlt="Notification image" />)}
      </NotificationList>
    </div>
  );
}

const meta = {
  title: "Components/Notification",
  component: List,
  parameters: { docs: { description: { component: "A notification row (the old NotificationsPanel Notification): a new text or version, an announcement, a Voices notification." } } },
} satisfies Meta<typeof List>;
export default meta;
export const Kinds: StoryObj<typeof meta> = {};
