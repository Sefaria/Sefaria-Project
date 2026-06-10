import React from "react";
import ProviderButton from "@static/js/common/ProviderButton.jsx";
import Button from "@static/js/common/Button.jsx";

const meta = {
  title: "Common/ProviderButton",
  component: ProviderButton,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ width: 353 }}><Story /></div>],
};
export default meta;

export const Google = { args: { provider: "google" } };
export const Apple = { args: { provider: "apple" } };
export const GoogleDisabled = { args: { provider: "google", disabled: true } };

export const Hebrew = {
  render: () => (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ProviderButton provider="google" label="להמשיך עם גוגל" />
      <ProviderButton provider="apple" label="להמשיך עם אפל" />
    </div>
  ),
};

export const AuthButtonSet = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ProviderButton provider="google" />
      <ProviderButton provider="apple" />
      <Button variant="sefaria-common-button auth-primary" size="fullwidth">
        <span>Continue with Email</span>
      </Button>
    </div>
  ),
};
