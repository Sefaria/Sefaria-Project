// @feature NTF-002
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { NotificationItem } from "./Notification";
import { NOTIFICATIONS } from "./story-data";

describe("NotificationItem (the old NotificationsPanel kinds)", () => {
  it("a new text: 'New Text:' and the book's link, the date, the description", () => {
    render(<NotificationItem n={NOTIFICATIONS[0]!} he={false} imageAlt="Notification image" />);
    expect(screen.getByText("New Text")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ben Yehuda Dictionary" })).toHaveAttribute("href", "/Ben_Yehuda_Dictionary");
    expect(screen.getByText("3 weeks ago")).toBeInTheDocument();
    expect(screen.getByText(/Historical Hebrew dictionary/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Notification image" })).toHaveAttribute("src", "/img/icon.png");
  });
  it("a new version, in English and in Hebrew", () => {
    const { container, rerender } = render(<NotificationItem n={NOTIFICATIONS[1]!} he={false} imageAlt="x" />);
    expect(container).toHaveTextContent("New Hebrew version of Learning to Read Midrash: Learning to Read Midrash, Hebrew edition");
    rerender(
      <InterfaceLangProvider lang="hebrew">
        <NotificationItem n={NOTIFICATIONS[1]!} he imageAlt="x" />
      </InterfaceLangProvider>,
    );
    expect(container).toHaveTextContent("גרסה חדשה של לפשוטו של מדרש בעברית : Learning to Read Midrash");
    // the description has no Hebrew: the English shows (the old InterfaceText html)
    expect(container).toHaveTextContent("21st-century book by Simi Peters");
  });
  it("an announcement's HTML keeps its links; a sheet published names the reader and links the sheet", () => {
    render(<NotificationItem n={NOTIFICATIONS[2]!} he={false} imageAlt="x" />);
    expect(screen.getByRole("link", { name: "Tanaj Español" })).toHaveAttribute("href", "/Genesis.1");
    render(<NotificationItem n={NOTIFICATIONS[3]!} he={false} imageAlt="x" />);
    expect(screen.getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/profile/ada");
    expect(screen.getByRole("link", { name: "Shabbat Candles" })).toHaveAttribute("href", "/sheets/1");
    expect(screen.getByText("published a new sheet")).toBeInTheDocument();
  });
});
