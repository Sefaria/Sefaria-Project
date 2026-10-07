import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { currVersionsOf, isValidEmail } from "~/lib/feedback/feedback";
import { FeedbackView } from "./FeedbackView";

// @feature CON-067
describe("FeedbackView", () => {
  const fill = async (type = "Report a bug") => {
    await userEvent.selectOptions(screen.getByRole("combobox"), type);
    await userEvent.type(screen.getByPlaceholderText("Describe the issue..."), "It broke");
  };
  it("asks for a type first, then (signed out) a valid email, and sends nothing until both are there", async () => {
    const onSubmit = vi.fn();
    render(<FeedbackView onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please select a feedback type");
    await fill();
    await userEvent.type(screen.getByPlaceholderText("Email Address"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid email address");
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("offers the seven types of the old form", () => {
    render(<FeedbackView onSubmit={() => {}} />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Select Type", "Report an issue with the text", "Request translation", "Report a bug", "Get help", "Request a feature", "Give thanks", "Other"]);
  });
  it("sends the submission and says 'Feedback sent!'", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FeedbackView onSubmit={onSubmit} />);
    await fill();
    await userEvent.type(screen.getByPlaceholderText("Email Address"), "a@b.org");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({ type: "bug_report", msg: "It broke", email: "a@b.org" });
    expect(await screen.findByText("Feedback sent!")).toBeInTheDocument();
  });
  it("signed in: no email box, no email sent", async () => {
    const onSubmit = vi.fn();
    render(<FeedbackView onSubmit={onSubmit} signedIn />);
    expect(screen.queryByPlaceholderText("Email Address")).toBeNull();
    await fill("Give thanks");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({ type: "good_vibes", msg: "It broke", email: null });
  });
  it("a failed send brings the form back with the error and what was typed (the old site stayed on 'sent')", async () => {
    render(<FeedbackView onSubmit={() => Promise.reject(new Error("x"))} signedIn />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unfortunately, there was an error sending this feedback");
    expect(screen.getByPlaceholderText("Describe the issue...")).toHaveValue("It broke");
  });
  it("validation helpers", () => {
    expect(isValidEmail("a@b.org")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(currVersionsOf("hebrew|Miqra", "english|JPS")).toEqual({ en: { languageFamilyName: "english", versionTitle: "JPS" }, he: { languageFamilyName: "hebrew", versionTitle: "Miqra" } });
  });
});
