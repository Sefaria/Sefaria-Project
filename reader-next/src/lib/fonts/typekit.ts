/**
 * Adobe Garamond Pro, the English text face of sefaria.org, from Sefaria's own Adobe Fonts (Typekit) kit `aeg8div` — the same kit
 * the old site loads in templates/base.html. The kit's stylesheet declares the faces (font-display: auto); the woff2 files are
 * preloaded with the page so the text is set in its real face at first paint and never reflows under the reader (TXD-054, TXD-060).
 *
 * The URLs are copied from https://use.typekit.net/aeg8div.css (kit last published 2019-01-30). If the kit is republished their
 * `primer` changes: e2e/fonts.spec.ts checks them against the live stylesheet.
 *
 * Licence: Adobe Fonts terms; the kit belongs to Sefaria and its allowed-domains list must include every host this client is served
 * from (an owner task at deployment).
 */
export const TYPEKIT_KIT = "aeg8div";
export const TYPEKIT_CSS = `https://use.typekit.net/${TYPEKIT_KIT}.css`;
const PRIMER = "7fa3915bdafdf03041871920a205bef951d72bf64dd4c4460fb992e3ecc3a862";
export const GARAMOND_FILES = {
  regular: `https://use.typekit.net/af/2011b6/00000000000000003b9b00c1/27/l?primer=${PRIMER}&fvd=n4&v=3`,
  italic: `https://use.typekit.net/af/5cace6/00000000000000003b9b00c2/27/l?primer=${PRIMER}&fvd=i4&v=3`,
  bold: `https://use.typekit.net/af/af619f/00000000000000003b9b00c5/27/l?primer=${PRIMER}&fvd=n7&v=3`,
  boldItalic: `https://use.typekit.net/af/6c275f/00000000000000003b9b00c6/27/l?primer=${PRIMER}&fvd=i7&v=3`,
} as const;
