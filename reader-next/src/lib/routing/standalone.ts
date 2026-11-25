/**
 * Pages that sefaria.org serves as standalone documents, outside the site's frame: no header, no site stylesheet, no cookie notice,
 * Google Tag Manager only (no gtag config, no Simple Analytics), `<html lang>` without `dir`, and no viewport meta. The root renders
 * them bare (src/routes/__root.tsx).
 *
 * @feature LEG-010 Text version diff/compare tool (/compare) — templates/compare.html
 */
import { isComparePath } from "~/lib/compare/url";

export const isStandalonePage = (pathname: string): boolean => isComparePath(pathname);
