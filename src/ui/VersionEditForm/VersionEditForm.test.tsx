import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VersionEditForm } from "./VersionEditForm";

const initial = { versionTitle: "Koren", license: "Some Custom License", status: null, isPrimary: false, priority: 1, direction: "ltr" };
afterEach(() => vi.restoreAllMocks());

// @feature VER-030
describe("VersionEditForm", () => {
  it("has the old editor's fields, keeps an unlisted license, and saves the draft", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<VersionEditForm initial={initial} licenses={["CC-BY", "Public Domain"]} onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
    for (const l of ["Version Title", "Hebrew Version Title", "Short Version Title", "Version Source", "License", "Direction", "isSource", "isPrimary", "Digitized by Sefaria", "Priority", "Locked", "VersionNotes", "Hebrew VersionNotes"]) {
      expect(screen.getByLabelText(l)).toBeInTheDocument();
    }
    expect(screen.getByRole("option", { name: "Some Custom License" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "(None Listed)" })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Locked"));
    await userEvent.click(screen.getByLabelText("isPrimary"));
    await userEvent.clear(screen.getByLabelText("Priority"));
    await userEvent.type(screen.getByLabelText("Priority"), "3");
    await userEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "locked", isPrimary: true, priority: "3" }));
  });

  it("asks before deleting and shows a server error", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onDelete = vi.fn().mockRejectedValue(new Error("Only moderators can delete texts."));
    render(<VersionEditForm initial={initial} licenses={[]} onSave={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Version" }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete Version" }));
    expect(confirm).toHaveBeenCalledWith("Are you sure you want to delete this text version?");
    expect(await screen.findByRole("alert")).toHaveTextContent("Only moderators can delete texts.");
  });
});
