import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TextField, type TextFieldProps } from "./TextField";

const Controlled = (props: Partial<TextFieldProps>) => {
  const [v, setV] = useState(props.value ?? "");
  return (
    <div style={{ width: 348 }}>
      <TextField name="field" label="Email Address" {...props} value={v} onChange={(e) => setV(e.target.value)} />
    </div>
  );
};
const meta = {
  title: "Auth/TextField",
  component: Controlled,
  tags: ["autodocs"],
  parameters: { docs: { description: { component: "A labelled field with its inline error (Figma Input Field): default, filled, password with show/hide, with link, error, disabled. Ported from common/Input.jsx. Atlas: ACC-009, ACC-010." } } },
} satisfies Meta<typeof Controlled>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { args: { placeholder: "you@example.com", type: "email" } };
export const Filled: Story = { args: { value: "reader@example.org", type: "email" } };
export const Password: Story = { args: { label: "Password", name: "password", type: "password", value: "secret", placeholder: "••••••••" } };
export const WithLink: Story = { args: { label: "Password", name: "password", type: "password", placeholder: "••••••••", trailingLink: { text: "Forgot Password?", onClick: () => {} } } };
export const Error: Story = { args: { type: "email", placeholder: "you@example.com", error: "Required field" } };
export const FilledError: Story = { args: { type: "email", value: "not-an-email", error: "Invalid email address" } };
export const Disabled: Story = { args: { disabled: true, value: "reader@example.org" } };
