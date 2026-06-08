import React, { useState } from "react";
import Input from "@static/js/common/Input.jsx";

const meta = {
  title: "Common/Input",
  component: Input,
  parameters: { layout: "padded" },
  argTypes: {
    type: { control: "radio", options: ["text", "email", "password"] },
    label: { control: "text" },
    placeholder: { control: "text" },
    error: { control: "text" },
    disabled: { control: "boolean" },
    dir: { control: "radio", options: ["ltr", "rtl"] },
  },
  args: {
    label: "Label",
    placeholder: "Value",
    name: "field",
    disabled: false,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

/** Interactive wrapper so the field is controlled in stories. */
const Controlled = (args) => {
  const [value, setValue] = useState(args.value ?? "");
  return <Input {...args} value={value} onChange={(e) => setValue(e.target.value)} />;
};

// ---- Figma `Input Field` states (node 187:76581) ----

export const Default = { render: Controlled };

export const Filled = { render: Controlled, args: { value: "moshe613@gmail.com", type: "email", label: "Email Address" } };

export const Disabled = { render: Controlled, args: { disabled: true, value: "moshe613@gmail.com" } };

export const PasswordMasked = {
  render: Controlled,
  args: { type: "password", label: "Password", value: "supersecret" },
};

export const WithForgotLink = {
  render: Controlled,
  args: {
    type: "password",
    label: "Password",
    value: "supersecret",
    trailingLink: { text: "Forgot password?", href: "/password/reset" },
  },
};

export const PlaceholderError = {
  render: Controlled,
  args: { error: "This field is required." },
};

export const FilledError = {
  render: Controlled,
  args: { value: "not-an-email", type: "email", label: "Email Address", error: "Enter a valid email address." },
};

// ---- Hebrew (RTL) — label/error follow RTL; email/password value stays LTR ----

export const HebrewLabelError = {
  render: Controlled,
  args: { dir: "rtl", label: "לייבל", placeholder: "ערך", error: "שדה חובה" },
};

export const HebrewPasswordLtrValue = {
  render: Controlled,
  args: {
    dir: "rtl",
    type: "password",
    label: "סיסמה",
    value: "asdf1234",
    trailingLink: { text: "שכחת סיסמא?", href: "/password/reset" },
    revealLabel: "הצג סיסמה",
    hideLabel: "הסתר סיסמה",
  },
};
