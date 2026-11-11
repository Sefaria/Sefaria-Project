import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import berakhot from "../../../fixtures/api/berakhot-2a/versions.json";
import genesis from "../../../fixtures/api/genesis-1/versions.json";
import { BookVersionRow } from "./BookVersionRow";
import type { BookVersion } from "./version-order";

const find = (list: unknown[], title: string) => (list as BookVersion[]).find((v) => v.versionTitle.startsWith(title))!;
/** Notes in both languages, no picture of the edition. */
const VOCALIZED = find(berakhot, "William Davidson Edition - Vocalized Aramaic");
/** Notes and a picture of the printed edition with a buy link. */
const CONTEMPORARY = find(genesis, "The Contemporary Torah");
/** No notes at all. */
const TAAMEI = find(genesis, "Tanach with Ta'amei Hamikra");
/** A translation whose language comes from its "[ru]" title suffix. */
const RUSSIAN = find(berakhot, "Berakhot:Translation to Russian");

const meta = {
  title: "Pages/BookPage/BookVersionRow",
  component: BookVersionRow,
  tags: ["autodocs"],
  decorators: [(Story) => <div style={{ maxWidth: 665, padding: 16 }}><Story /></div>],
  parameters: {
    docs: {
      description: {
        component:
          "One version on the book page's Versions tab: the title is the link to read it, the language as a grey pill at the far side, notes in the interface language, then source, digitization, licence, revision history and buy-in-print. Moderators get a pencil beside the title. Data: the real versions API responses for Berakhot and Genesis.",
      },
    },
  },
  args: { version: VOCALIZED, href: "/Berakhot.2a?vhe=hebrew|William_Davidson_Edition_-_Vocalized_Aramaic", bookUrl: "Berakhot" },
} satisfies Meta<typeof BookVersionRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithNotes: Story = {};
export const WithoutNotes: Story = { args: { version: TAAMEI, href: "/Genesis.1?vhe=hebrew|Tanach_with_Ta'amei_Hamikra", bookUrl: "Genesis" } };
export const WithEditionPicture: Story = { args: { version: CONTEMPORARY, href: "/Genesis.1?ven=english|The_Contemporary_Torah", bookUrl: "Genesis" } };
export const LanguageFromTitle: Story = { args: { version: RUSSIAN, href: "/Berakhot.2a?ven=russian|Berakhot:Translation_to_Russian_[ru]" } };
export const Moderator: Story = { args: { onEdit: () => undefined } };
export const Hebrew: Story = {
  args: { onEdit: () => undefined },
  decorators: [(Story) => <InterfaceLangProvider lang="hebrew"><div dir="rtl" lang="he"><Story /></div></InterfaceLangProvider>],
};
/** Several rows: a rule between them, none above the first. */
export const List: Story = {
  render: () => (
    <div>
      {[VOCALIZED, RUSSIAN, TAAMEI].map((v) => <BookVersionRow key={v.versionTitle} version={v} href="/Berakhot.2a" bookUrl="Berakhot" />)}
    </div>
  ),
};
