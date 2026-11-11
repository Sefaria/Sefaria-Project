import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { CalendarsPage } from "./CalendarsPage";

// @feature CAL-001 — v-a11y N1: the page has an h1 (axe page-has-heading-one), for assistive technology only
describe("CalendarsPage", () => {
  it("names the page in an h1, in the interface language", () => {
    const { unmount } = render(<CalendarsPage weeklyPortion={[]} daily={[]} weekly={[]} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Learning Schedules");
    unmount();
    render(<InterfaceLangProvider lang="hebrew"><CalendarsPage weeklyPortion={[]} daily={[]} weekly={[]} /></InterfaceLangProvider>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("לוח לימוד יומי");
  });
});
