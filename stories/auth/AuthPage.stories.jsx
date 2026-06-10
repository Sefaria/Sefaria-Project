import React from "react";
import AuthPage from "@static/js/auth/AuthPage.jsx";

const meta = {
  title: "Auth/AuthPage",
  component: AuthPage,
  parameters: { layout: "fullscreen" },
};
export default meta;

const navyBg = (Story) => (
  <div style={{ minHeight: "100vh", background: "#18345d", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <Story />
  </div>
);

export const LoginChoose = {
  decorators: [navyBg],
  args: { initialFlow: "login", googleClientId: "demo", appleClientId: "demo", next: "/" },
};

export const RegisterChoose = {
  decorators: [navyBg],
  args: { initialFlow: "register", googleClientId: "demo", appleClientId: "demo", recaptchaSiteKey: "demo", next: "/" },
};

export const Hebrew = {
  decorators: [navyBg],
  args: { initialFlow: "login", googleClientId: "demo", appleClientId: "demo", dir: "rtl" },
};
