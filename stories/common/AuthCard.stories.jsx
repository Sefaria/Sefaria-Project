import React from "react";
import AuthCard from "@static/js/common/AuthCard.jsx";
import ProviderButton from "@static/js/common/ProviderButton.jsx";
import Divider from "@static/js/common/Divider.jsx";
import LegalText from "@static/js/common/LegalText.jsx";
import Captcha from "@static/js/common/Captcha.jsx";
import Input from "@static/js/common/Input.jsx";
import Button from "@static/js/common/Button.jsx";

const meta = {
  title: "Common/AuthCard",
  component: AuthCard,
  parameters: { layout: "fullscreen" },
};
export default meta;

/** Navy background approximating the source-connections wallpaper (final asset from Penina). */
const navyBg = (Story) => (
  <div style={{ minHeight: "100vh", background: "#18345d", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <Story />
  </div>
);

const legal = (
  <>By continuing, you are agreeing to Sefaria's <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Policy</a>.</>
);

// ---------- Sign In — choose screen ----------
export const ChooseSignIn = {
  decorators: [navyBg],
  render: () => (
    <AuthCard heading="Sign In" sub={<>Don't have an account? <a href="/register">Sign Up</a></>}>
      <div className="sefaria-auth-stack">
        <ProviderButton provider="google" />
        <ProviderButton provider="apple" />
        <Divider>or</Divider>
        <Button variant="sefaria-common-button auth-primary" size="fullwidth"><span>Continue with Email</span></Button>
      </div>
      <LegalText>{legal}</LegalText>
    </AuthCard>
  ),
};

// ---------- Create Account — email form (content-swap step, with back arrow) ----------
export const EmailRegister = {
  decorators: [navyBg],
  render: () => (
    <AuthCard heading="Create an Account" onBack={() => {}} sub={<>Already have an account? <a href="/login">Sign In</a></>}>
      <div className="sefaria-auth-stack">
        <Input label="Email Address" type="email" name="email" value="moshe613@gmail.com" onChange={() => {}} />
        <Input label="Password" type="password" name="password" value="supersecret" onChange={() => {}} />
        <Input label="First Name" name="first" value="Moshe" onChange={() => {}} />
        <Input label="Last Name" name="last" value="Rabbenu" onChange={() => {}} />
        <Captcha>
          <div style={{ width: 300, height: 74, border: "1px solid #d3d3d3", borderRadius: 3, display: "flex", alignItems: "center", gap: 12, padding: "0 12px", background: "#f9f9f9" }}>
            <input type="checkbox" style={{ width: 24, height: 24 }} readOnly />
            <span style={{ font: "14px sans-serif", color: "#222" }}>I'm not a robot</span>
          </div>
        </Captcha>
        <Button variant="sefaria-common-button auth-primary" size="fullwidth"><span>Create Account</span></Button>
      </div>
      <LegalText>{legal}</LegalText>
    </AuthCard>
  ),
};

// ---------- Primitives ----------
export const DividerOnly = { render: () => <div style={{ maxWidth: 360, padding: 24 }}><Divider>or</Divider></div> };

export const LegalTextOnly = { render: () => <div style={{ maxWidth: 360, padding: 24 }}><LegalText>{legal}</LegalText></div> };

export const CaptchaError = {
  render: () => (
    <div style={{ maxWidth: 360, padding: 24 }}>
      <Captcha error="Please complete the captcha.">
        <div style={{ width: 300, height: 74, border: "1px solid #d3d3d3", borderRadius: 3, display: "flex", alignItems: "center", gap: 12, padding: "0 12px", background: "#f9f9f9" }}>
          <input type="checkbox" style={{ width: 24, height: 24 }} readOnly />
          <span style={{ font: "14px sans-serif", color: "#222" }}>I'm not a robot</span>
        </div>
      </Captcha>
    </div>
  ),
};
