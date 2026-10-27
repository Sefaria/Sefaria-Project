import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import fs from "fs";
import path from "path";
import NewsletterFormView from "../NewsletterFormView";
import NewsletterConfirmationView from "../NewsletterConfirmationView";
import SuccessView from "../SuccessView";
import MarketingEmailToggle from "../MarketingEmailToggle";
import { FORM_STATUS } from "../stateSymbols";

jest.mock("../../sefaria/sefaria", () => ({
  interfaceLang: "english",
  _: (id) => require("../testSupport/i18nTestUtils").translate(id),
  _bilingual: (id) => require("../testSupport/i18nTestUtils").bilingual(id),
}));
jest.mock("../../Misc", () => ({
  InterfaceText: ({ children, text }) => <span>{text ? text.en : children}</span>,
  LoadingMessage: () => <span>Loading</span>,
  ToggleSet: ({ name, options, setOption }) => <div>{options.map(option => (
    <button key={option.name} {...option.analyticsAttributes}
      onClick={() => setOption(name, option.name)}>{option.content}</button>
  ))}</div>,
}));

// Exercise the real delegated tracker against rendered newsletter components.
const trackerSource = fs.readFileSync(path.join(__dirname, "../../analyticsEventTracker.js"), "utf8");
const formProps = {
  formData: { firstName: "", lastName: "", email: "", confirmEmail: "", selectedNewsletters: {} },
  formStatus: { status: FORM_STATUS.IDLE, isLoggedIn: false },
  newsletters: [],
  onFieldChange: jest.fn(),
  onSubmit: jest.fn(),
};

describe("Newsletter analytics delivery", () => {
  let container, trackerRoot, visible, observed, mutations;
  beforeEach(() => {
    global.gtag = jest.fn();
    // Jest 24's jsdom does not implement MutationObserver. Feed DOM additions
    // into the real tracker's observer callback below.
    global.MutationObserver = jest.fn(callback => {
      mutations = callback;
      return { observe: jest.fn() };
    });
    observed = new Set();
    global.IntersectionObserver = jest.fn(callback => {
      const observer = {
        observe: node => observed.add(node),
        unobserve: node => observed.delete(node),
      };
      visible = node => {
        if (observed.has(node)) callback([{ target: node, isIntersecting: true }], observer);
      };
      return observer;
    });
    trackerRoot = document.createElement("div");
    trackerRoot.id = "newsletter-analytics-test";
    container = document.createElement("div");
    // Match the template: tracker root -> static page wrapper -> React mount.
    // The tracker intentionally stops before the root when scanning ancestors.
    const pageWrapper = document.createElement("div");
    pageWrapper.appendChild(container);
    trackerRoot.appendChild(pageWrapper);
    document.body.appendChild(trackerRoot);
    const tracker = new Function(`${trackerSource}\nreturn AnalyticsEventTracker;`)();
    tracker.attach("#newsletter-analytics-test", ["click", "inputStart", "scrollIntoView"]);
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    trackerRoot.remove();
    delete global.gtag;
    delete global.IntersectionObserver;
    delete global.MutationObserver;
  });
  const render = async element => {
    const previousNodes = new Set(container.querySelectorAll("*"));
    act(() => { ReactDOM.render(element, container); });
    const addedNodes = Array.from(container.querySelectorAll("*")).filter(node =>
      !previousNodes.has(node) && (node.parentNode === container || previousNodes.has(node.parentNode))
    );
    mutations([{ addedNodes }]);
  };

  it("identifies each field once without sending its contents", async () => {
    await render(<NewsletterFormView {...formProps} />);
    for (const id of ["firstName", "lastName", "email", "confirmEmail"]) {
      const input = container.querySelector(`#${id}`);
      input.value = "private@example.com";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(gtag).toHaveBeenLastCalledWith("event", "form_interaction", {
        item_id: id, form_name: "newsletter_signup", form_destination: "new_subscription",
      });
    }
    expect(gtag).toHaveBeenCalledTimes(4);
  });

  it("records both marketing choices and suppresses disabled choices", async () => {
    const onToggle = jest.fn();
    await render(<MarketingEmailToggle wantsMarketingEmails={true} onToggle={onToggle} />);
    for (const choice of ["yes", "no"]) {
      container.querySelector(`[data-anl-text="${choice}"]`).click();
      expect(gtag).toHaveBeenLastCalledWith("event", "marketing_email_preference", {
        text: choice, form_name: "newsletter_signup",
      });
    }
    expect(onToggle.mock.calls).toEqual([[true], [false]]);
    gtag.mockClear();
    onToggle.mockClear();
    await render(<MarketingEmailToggle wantsMarketingEmails={true} onToggle={onToggle} disabled />);
    container.querySelectorAll("button").forEach(button => button.click());
    expect(gtag).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it.each(["validation", "backend"])("reports %s errors once when visible", async kind => {
    await render(<NewsletterFormView {...formProps}
      hasAttemptedSubmit={kind === "validation"}
      fieldErrors={kind === "validation" ? { email: "Invalid email" } : {}}
      formStatus={kind === "backend"
        ? { ...formProps.formStatus, status: FORM_STATUS.ERROR, errorMessage: "Request failed" }
        : formProps.formStatus} />);
    const error = container.querySelector('[data-anl-event="form_error:scrollIntoView"]');
    expect(gtag).not.toHaveBeenCalled();
    visible(error);
    visible(error);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "form_error", {
      form_name: "newsletter_signup", form_destination: "new_subscription", engagement_type: "error",
    });
  });

  it("reports subscription success, survey errors, and final completion independently", async () => {
    const props = {
      selectedNewsletters: {}, learningLevels: [], selectedLevel: null,
      formStatus: { status: FORM_STATUS.SUCCESS },
    };
    await render(<NewsletterConfirmationView {...props} />);
    const confirmation = container.querySelector(".newsletterConfirmationView");
    visible(confirmation);
    visible(confirmation);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenLastCalledWith("event", "newsletter_signup_success", {
      form_name: "newsletter_confirmation", engagement_type: "success",
    });
    await render(<NewsletterConfirmationView {...props}
      formStatus={{ status: FORM_STATUS.ERROR, errorMessage: "Survey failed" }} />);
    visible(container.querySelector(".learningLevelErrorMessage"));
    expect(gtag).toHaveBeenLastCalledWith("event", "form_error", {
      form_name: "learning_level_survey", engagement_type: "error",
    });
    // Rerendering the confirmation for a survey error does not resend subscription success.
    visible(confirmation);
    expect(gtag).toHaveBeenCalledTimes(2);
    await render(<SuccessView />);
    const success = container.querySelector(".successView");
    visible(success);
    visible(success);
    expect(gtag).toHaveBeenCalledTimes(3);
    expect(gtag).toHaveBeenLastCalledWith("event", "newsletter_signup_complete", {
      form_name: "newsletter_signup_complete", engagement_type: "form_complete",
    });
  });
});
