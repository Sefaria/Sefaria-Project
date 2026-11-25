/**
 * The Hebrew layout of the old site's on-screen keyboard (the GreyWyvern "Virtual Keyboard", `VKI_layout["עברית"]`, BSD
 * licence): rows of keys, each [plain, shifted, alt-gr]. Keys with a name ("Bksp", "Tab", "Caps", "Shift", "Enter", "AltGr")
 * are controls; the space bar is the key with a space.
 */
export type KeyDef = readonly [plain: string, shifted: string, altGr?: string];

export const CONTROL_KEYS = ["Bksp", "Tab", "Caps", "Shift", "Enter", "AltGr"] as const;
export type ControlKey = (typeof CONTROL_KEYS)[number];
export const isControl = (k: string): k is ControlKey => (CONTROL_KEYS as readonly string[]).includes(k);

export const HEBREW_ROWS: readonly (readonly KeyDef[])[] = [
  [["~", "`"], ["1", "!"], ["2", "@"], ["3", "#"], ["4", "$", "₪"], ["5", "%"], ["6", "^"], ["7", "&"], ["8", "*"], ["9", ")"], ["0", "("], ["-", "_"], ["=", "+"], ["Bksp", "Bksp"]],
  [["Tab", "Tab"], ["/", "Q"], ["'", "W"], ["ק", "E", "€"], ["ר", "R"], ["א", "T"], ["ט", "Y"], ["ו", "U", "װ"], ["ן", "I"], ["ם", "O"], ["פ", "P"], ["\\", "|"], ["Enter", "Enter"]],
  [["Caps", "Caps"], ["ש", "A"], ["ד", "S"], ["ג", "D"], ["כ", "F"], ["ע", "G"], ["י", "H", "ײ"], ["ח", "J", "ױ"], ["ל", "K"], ["ך", "L"], ["ף", ":"], [",", '"'], ["]", "}"], ["[", "{"]],
  [["Shift", "Shift"], ["ז", "Z"], ["ס", "X"], ["ב", "C"], ["ה", "V"], ["נ", "B"], ["מ", "N"], ["צ", "M"], ["ת", ">"], ["ץ", "<"], [".", "?"], ["Shift", "Shift"]],
  [[" ", " "], ["AltGr", "AltGr"]],
];

export interface Modifiers { shift: boolean; caps: boolean; altGr: boolean }

/** What a key shows and types under the modifiers: Shift and Caps (together they cancel) pick the second, Alt-Gr the third if there is one. */
export function keyFace(key: KeyDef, m: Modifiers): string {
  if (isControl(key[0])) return key[0];
  if (m.altGr && key[2]) return key[2];
  return m.shift !== m.caps ? key[1] : key[0];
}
