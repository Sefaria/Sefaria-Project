import type { BookmarkMode } from "~/lib/bookmarks";
import { SegmentedControl } from "~/ui/SegmentedControl/SegmentedControl";

const OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "auto", label: "Auto" },
] as const;

/** Manual: the bookmark stays where you put it. Auto: it follows your reading. */
export function ModeSwitch({ value, onChange, label = "Bookmark mode" }: { value: BookmarkMode; onChange: (mode: BookmarkMode) => void; label?: string }) {
  return <SegmentedControl value={value} onValueChange={onChange} options={OPTIONS} label={label} />;
}

export const modeHint = (mode: BookmarkMode) => (mode === "auto" ? "Follows you as you read." : "Stays put until you move it.");
