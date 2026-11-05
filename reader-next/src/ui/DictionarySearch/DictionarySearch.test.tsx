import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { DictionarySearch } from "./DictionarySearch";

const COMPLETIONS = [["אור", "אוֹר"], ["אור I", "אוֹר I"]] as const;
const setup = () => {
  const getCompletions = vi.fn(async () => COMPLETIONS);
  const onSubmit = vi.fn();
  render(<DictionarySearch getCompletions={getCompletions} onSubmit={onSubmit} />);
  return { getCompletions, onSubmit, box: screen.getByRole("combobox", { name: "Search Dictionary" }) };
};

// @feature SRC-021 @feature SRC-022
describe("DictionarySearch", () => {
  it("typing Hebrew lists the headwords' forms; choosing one submits its form", async () => {
    const { box, onSubmit, getCompletions } = setup();
    await userEvent.type(box, "אור");
    const opts = await screen.findAllByRole("option");
    expect(opts.map((o) => o.textContent)).toEqual(["אוֹר", "אוֹר I"]);
    expect(getCompletions).toHaveBeenLastCalledWith("אור", expect.anything());
    await userEvent.click(opts[1]!);
    expect(onSubmit).toHaveBeenCalledWith("אוֹר I");
  });
  it("Arrow keys and Enter choose the highlighted one; Enter with none goes to the nearest completion's form", async () => {
    const { box, onSubmit } = setup();
    await userEvent.type(box, "אור");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSubmit).toHaveBeenLastCalledWith("אוֹר I");
    await userEvent.clear(box);
    await userEvent.type(box, "אור{Enter}");
    expect(onSubmit).toHaveBeenLastCalledWith("אוֹר");
  });
  it("English letters: 'Invalid entry. Please type a Hebrew word.', no list, nothing submitted", async () => {
    const { box, onSubmit, getCompletions } = setup();
    await userEvent.type(box, "light{Enter}");
    expect(screen.getByText(/Invalid entry/)).toBeVisible();
    expect(screen.queryByRole("option")).toBeNull();
    expect(getCompletions).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("a word with no completion is submitted as typed; the keyboard icon shows in the English interface only", async () => {
    const onSubmit = vi.fn();
    render(<DictionarySearch getCompletions={async () => []} onSubmit={onSubmit} />);
    const box = screen.getByRole("combobox");
    await userEvent.type(box, "זזזז{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("זזזז");
    expect(screen.getByRole("button", { name: "Hebrew keyboard" })).toBeInTheDocument();
  });
  it("Hebrew interface: Hebrew labels, no keyboard", async () => {
    render(<InterfaceLangProvider lang="hebrew"><DictionarySearch getCompletions={async () => []} onSubmit={() => {}} /></InterfaceLangProvider>);
    await userEvent.click(screen.getByRole("combobox", { name: "חיפוש במילון" }));
    expect(screen.queryByRole("button", { name: "Hebrew keyboard" })).toBeNull();
  });
});
