/** "Mostly Hebrew" (the old Sefaria.hebrew.isHebrew): of the first 200 characters, tags, vowels, digits and punctuation ignored, more Hebrew letters than other letters. */
export function isHebrewText(text: string): boolean {
  const s = text.replace(/<[^>]*>/g, "").replace(/[֑-ׇ]/g, "");
  let he = 0, other = 0;
  for (let i = 0; i < Math.min(200, s.length); i++) {
    const ch = s[i]!;
    if (/[0-9 .,'"?!;:\-=@#$%^&*()/<>]/.test(ch)) continue;
    const c = ch.charCodeAt(0);
    if (c > 0x590 && c < 0x5ff) he++;
    else other++;
  }
  return he > other;
}
