// @feature CON-047
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopicSearch, type TopicSearchSuggestion } from "./TopicSearch";

const SUGGESTIONS: TopicSearchSuggestion[] = [{ name: "Grass", key: "grass" }, { name: "Grasshopper", key: "grasshopper" }, { name: "Create a new topic: gras", key: "" }];
const setup = (onAdd = vi.fn(async () => {})) => {
  render(<TopicSearch getSuggestions={async () => SUGGESTIONS} onAdd={onAdd} createHref={() => "https://www.sefaria.org/Genesis.1.11?with=Topics"} createPrefix="Create a new topic: " />);
  return { onAdd, input: screen.getByRole("combobox", { name: "Search for a Topic" }) };
};
const type = async (input: HTMLElement, v: string) => act(async () => void fireEvent.change(input, { target: { value: v } }));

describe("TopicSearch (moderators: tag the passage with a topic)", () => {
  it("lists the matching topics and the create row as the reader types, with an Add Topic button", async () => {
    const { input } = setup();
    expect(screen.queryByRole("button", { name: "Add Topic" })).not.toBeInTheDocument();
    await type(input, "gras");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Grass", "Grasshopper", "Create a new topic: gras"]);
    expect(screen.getByRole("button", { name: "Add Topic" })).toBeInTheDocument();
  });

  it("fills the box with the chosen topic and connects it on Add Topic, then says so", async () => {
    const { input, onAdd } = setup();
    await type(input, "gras");
    fireEvent.click(screen.getByRole("option", { name: "Grass" }));
    expect(input).toHaveValue("Grass");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Add Topic" })));
    expect(onAdd).toHaveBeenCalledWith("grass");
    expect(screen.getByRole("status")).toHaveTextContent("Topic added.");
    expect(input).toHaveValue("");
  });

  it("refuses text that is not one of the suggestions, as the old validate did", async () => {
    const { input, onAdd } = setup();
    await type(input, "gras");
    await act(async () => void fireEvent.keyDown(input, { key: "Enter" }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please select an option through the dropdown menu.");
  });

  it("arrow keys highlight an option while focus stays in the box; Enter chooses it", async () => {
    const { input } = setup();
    await type(input, "gras");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = screen.getByRole("option", { name: "Grasshopper" });
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", second.id);
    expect(screen.getByRole("listbox").id).toBe(input.getAttribute("aria-controls"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Grasshopper");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    const { input } = setup(vi.fn(async () => { throw new Error("Only moderators can connect edit topic sources."); }));
    await type(input, "grass");
    await act(async () => void fireEvent.keyDown(input, { key: "Enter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Only moderators can connect edit topic sources.");
  });

  it("sends topic creation to sefaria.org (the old inline TopicEditor is not built)", async () => {
    const { input } = setup();
    await type(input, "gras");
    fireEvent.click(screen.getByRole("option", { name: "Create a new topic: gras" }));
    expect(screen.getByRole("link", { name: /Create “gras” on sefaria.org/ })).toHaveAttribute("href", "https://www.sefaria.org/Genesis.1.11?with=Topics");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
