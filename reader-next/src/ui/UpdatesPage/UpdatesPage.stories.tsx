import type { Meta, StoryObj } from "@storybook/react-vite";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { NotificationItem } from "../Notification/Notification";
import { NOTIFICATIONS } from "../Notification/story-data";
import { AboutSidebar, UpdateForm, UpdateItem, UpdatesPage } from "./UpdatesPage";

function Page({ moderator }: { moderator?: boolean }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <UpdatesPage
      he={he}
      sidebar={<AboutSidebar current="updates" href={(p) => p} />}
      form={moderator ? <UpdateForm validate={() => null} onSubmit={async () => null} /> : undefined}
    >
      {NOTIFICATIONS.slice(0, 3).map((n) => (
        <UpdateItem key={n.id} onDelete={moderator ? () => undefined : undefined}>
          <NotificationItem n={n} he={he} imageAlt="Notification image" />
        </UpdateItem>
      ))}
    </UpdatesPage>
  );
}

const meta = {
  title: "Pages/UpdatesPage",
  component: Page,
  parameters: { layout: "fullscreen", docs: { description: { component: "New Additions (/updates): the About sidebar and the site's announcements." } } },
} satisfies Meta<typeof Page>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
/** What a moderator sees: the form to add an update and a delete button on each. */
export const Moderator: Story = { args: { moderator: true } };
