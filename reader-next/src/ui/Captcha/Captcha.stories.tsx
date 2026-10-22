import type { Meta, StoryObj } from "@storybook/react-vite";
import { Captcha } from "./Captcha";

const Widget = () => <div style={{ width: 302, height: 76, background: "#f9f9f9", border: "1px solid #d3d3d3", borderRadius: 3 }} aria-label="reCAPTCHA stand-in" role="img" />;
const meta = {
  title: "Auth/Captcha",
  component: Captcha,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "The reCAPTCHA box and its error state (red outline, inline message). The widget is a stand-in here. Atlas: ACC-010." } } },
  decorators: [(Story) => <div style={{ width: 348 }}><Story /></div>],
  args: { children: <Widget /> },
} satisfies Meta<typeof Captcha>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithError: Story = { args: { error: "Verify that you are not a robot" } };
