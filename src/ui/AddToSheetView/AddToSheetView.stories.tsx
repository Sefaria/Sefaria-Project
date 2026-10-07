import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddToSheetView } from "./AddToSheetView";

const meta = {
  title: "Connections/AddToSheetView",
  component: AddToSheetView,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 420, padding: 16 }}><Story /></div>],
  args: {
    citation: { en: "Genesis 1:1-3", he: "בראשית א׳:א׳-ג׳" },
    citationHref: "/Genesis.1.1-3",
    sheets: [{ id: 101, title: "Creation <b>sources</b>" }, { id: 102, title: "Shabbat" }],
    onAdd: async () => {},
    onCreate: async (title: string) => ({ id: 103, title }),
    sheetHref: (id: number) => `https://voices.sefaria.org/sheets/${id}`,
  },
} satisfies Meta<typeof AddToSheetView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithSheets: Story = {};
export const NoSheetsYet: Story = { args: { sheets: [] } };
export const Loading: Story = { args: { sheets: undefined } };
