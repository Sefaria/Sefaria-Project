import { describe, expect, it } from "vitest";
import { isReaderPath } from "./paths";

describe("isReaderPath", () => {
  it.each(["/Genesis.1", "/Berakhot.2a.3", "/Pesach_Haggadah,_Kadesh", "/Jastrow,_%D7%90_I.1"])("%s is a text", (p) => expect(isReaderPath(p)).toBe(true));
  it.each(["/", "/texts", "/texts/Tanakh", "/search", "/topics/shabbat", "/sheets/123"])("%s is an app page", (p) => expect(isReaderPath(p)).toBe(false));
  it("does not mistake a book starting with an app word for an app page", () => {
    expect(isReaderPath("/Textsof_Something.1")).toBe(true);
  });
});
