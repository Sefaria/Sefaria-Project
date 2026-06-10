import React from "react";
import AuthPage from "@static/js/auth/AuthPage.jsx";

const meta = {
  title: "Auth/AuthPage",
  component: AuthPage,
  parameters: { layout: "fullscreen" },
};
export default meta;

const navyBg = (Story) => (
  <div style={{ width: "100%", minHeight: "100vh", boxSizing: "border-box", background: "#18345d", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <div style={{ width: "100%" }}>
      <Story />
    </div>
  </div>
);

const providerSdkMocks = (Story) => {
  window.google = {
    accounts: {
      id: {
        initialize: () => {},
        renderButton: (element) => {
          const target = document.createElement("button");
          target.type = "button";
          target.style.width = "100%";
          target.style.height = "100%";
          element.replaceChildren(target);
        },
      },
    },
  };
  window.AppleID = {
    auth: {
      init: () => {},
      signIn: () => Promise.resolve(),
    },
  };
  window.grecaptcha = {
    ready: (callback) => callback(),
    reset: () => {},
    render: (element) => {
      element.setAttribute("data-captcha-rendered", "true");
      const captcha = document.createElement("div");
      Object.assign(captcha.style, {
        boxSizing: "border-box",
        width: "348px",
        height: "76px",
        border: "1px solid #d6d6d6",
        borderRadius: "2px",
        background: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 10px",
        direction: "ltr",
        fontFamily: "Roboto, sans-serif",
      });
      captcha.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px">
          <span style="display:block;width:24px;height:24px;border:2px solid #c1c1c1;background:white"></span>
          <strong style="font-size:14px;font-weight:500">I'm not a robot</strong>
        </div>
        <div style="text-align:center;color:#a6a6a6;font-size:8px">
          <div style="font-size:28px;line-height:32px;color:#4871bf">↻</div>
          <div>reCAPTCHA</div>
          <div>Privacy - Terms</div>
        </div>`;
      element.replaceChildren(captcha);
      return 1;
    },
  };
  return <Story />;
};

export const LoginChoose = {
  decorators: [providerSdkMocks, navyBg],
  args: { initialFlow: "login", googleClientId: "demo", appleClientId: "demo", next: "/" },
};

export const RegisterChoose = {
  decorators: [providerSdkMocks, navyBg],
  args: { initialFlow: "register", googleClientId: "demo", appleClientId: "demo", recaptchaSiteKey: "demo", next: "/" },
};

export const HebrewLogin = {
  decorators: [providerSdkMocks, navyBg],
  globals: { interfaceLang: "hebrew" },
  args: { initialFlow: "login", googleClientId: "demo", appleClientId: "demo", dir: "rtl" },
};

export const HebrewRegister = {
  decorators: [providerSdkMocks, navyBg],
  globals: { interfaceLang: "hebrew" },
  args: { initialFlow: "register", googleClientId: "demo", appleClientId: "demo", recaptchaSiteKey: "demo", dir: "rtl" },
};
