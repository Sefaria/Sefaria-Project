import type { Meta, StoryObj } from "@storybook/react-vite";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { ContentLanguage } from "./ContentLanguage";

const Demo = () => (
  <ContentLanguage>
    <h1 style={{ margin: 0 }}><InterfaceText en="Berakhot" he="ברכות" /></h1>
    <p><InterfaceText en="Talmud" he="תלמוד" /> ({useInterfaceLang()})</p>
  </ContentLanguage>
);
const meta = { title: "Library/ContentLanguage", component: Demo, tags: ["autodocs"], decorators: [(Story) => <div style={{ padding: 24, maxWidth: 500 }}><Story /></div>], parameters: { docs: { description: { component: "The aleph button that turns a library page's content to Hebrew (right-to-left, Hebrew titles) without changing the site's language." } } } } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
