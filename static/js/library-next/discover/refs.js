/** Ref → reader URL. Uses the data layer's `normRef` once `Sefaria.setup()` ran; otherwise a plain heuristic. */
import Sefaria from '../../sefaria/sefaria';

export function refToUrl(ref) {
  const s = String(ref || '').trim();
  if (!s) { return '/'; }
  if (Array.isArray(Sefaria.virtualBooks) && typeof Sefaria.normRef === 'function') {
    try { return '/' + Sefaria.normRef(s); } catch (e) { /* fall through */ }
  }
  const parts = s.split(' ');
  // the sections are the trailing run of tokens that carry a digit ("1:3", "11b:4", "1:1-6:8")
  let cut = parts.length;
  for (let j = parts.length - 1; j > 0; j--) {
    if (/^[\divxlc]*\d[\d:a-z,\-]*$/i.test(parts[j])) { cut = j; } else { break; }
  }
  const title = parts.slice(0, cut).join('_');
  const sections = parts.slice(cut).join('_').replace(/:/g, '.');
  return '/' + (sections ? `${title}.${sections}` : title);
}
