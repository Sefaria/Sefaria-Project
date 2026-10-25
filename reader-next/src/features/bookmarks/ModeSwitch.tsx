import type { BookmarkMode } from "~/lib/bookmarks";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { SegmentedControl } from "~/ui/SegmentedControl/SegmentedControl";

const OPTIONS = [
  { value: "manual", label: <InterfaceText en="Manual" he="ידנית" /> },
  { value: "auto", label: <InterfaceText en="Auto" he="אוטומטית" /> },
] as const;

/** Manual: the bookmark stays where you put it. Auto: it follows your reading. */
export function ModeSwitch({ value, onChange, label = "Bookmark mode" }: { value: BookmarkMode; onChange: (mode: BookmarkMode) => void; label?: string }) {
  return <SegmentedControl value={value} onValueChange={onChange} options={OPTIONS} label={label} />;
}

export const modeHint = (mode: BookmarkMode) => (mode === "auto" ? "Follows you as you read." : "Stays put until you move it.");
export const ModeHint = ({ mode }: { mode: BookmarkMode }) =>
  mode === "auto" ? <InterfaceText en="Follows you as you read." he="הסימנייה מתקדמת איתך בקריאה." /> : <InterfaceText en="Stays put until you move it." he="הסימנייה נשארת במקומה עד שתזיזו אותה." />;
