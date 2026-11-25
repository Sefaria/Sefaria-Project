// @feature NTF-001
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotificationsPage } from "./NotificationsPage";

describe("the notifications page", () => {
  it("the bell and title; while loading, the loading slot", () => {
    render(<NotificationsPage he={false} loading={<p>loading</p>} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Notifications");
    expect(screen.getByRole("img", { name: "Notification icon" })).toHaveAttribute("src", "/icons/notification.svg");
    expect(screen.getByText("loading")).toBeInTheDocument();
  });
  it("none: the old message", () => {
    render(<NotificationsPage he={false}>{[]}</NotificationsPage>);
    expect(screen.getByText("Looks like you don’t have any notifications yet.")).toBeInTheDocument();
    expect(screen.getByText("Try following sheet creators to get notified when they publish a new sheet.")).toBeInTheDocument();
  });
  it("the list", () => {
    render(<NotificationsPage he={false}>{[<p key="a">one</p>]}</NotificationsPage>);
    expect(screen.getByText("one")).toBeInTheDocument();
  });
});
