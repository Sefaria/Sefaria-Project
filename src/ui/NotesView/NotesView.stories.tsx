import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { NotesView } from "./NotesView";

const meta = {
  title: "Connections/NotesView",
  component: NotesView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: "16px 40px" }}><Story /></div>],
  args: { onSave: async () => {}, onDelete: async () => {}, allNotesHref: "https://www.sefaria.org/texts/notes", notes: [] },
} satisfies Meta<typeof NotesView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoNotes: Story = {};
export const WithNotes: Story = { args: { notes: [{ _id: "a1", text: "In the beginning — see also John 1:1.\nA second line with https://www.sefaria.org" }, { _id: "a2", text: "Another note." }] } };
export const Loading: Story = { args: { notes: undefined } };
export const HebrewInterface: Story = { args: { notes: [{ _id: "a1", text: "הערה" }] }, decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl"><Story /></div></InterfaceLangProvider>] };
