/**
 * Where the gallery lives on the developer portal (PLAN §2.14 item 1). Every in-app link and every
 * static file URL goes through these, so nothing assumes the gallery is served from `/`.
 */
export const GALLERY_BASE = '/powered-by';

/** A path inside the gallery: `galleryPath()` is the browse page, `galleryPath('charts')` the charts page. */
export function galleryPath(path = ''): string {
  const rest = path.replace(/^\/+/, '');
  return rest ? `${GALLERY_BASE}/${rest}` : GALLERY_BASE;
}

/** The pathname relative to the gallery root, lowercased: `/powered-by/Charts` is `/charts`, the root is `/`. */
export function galleryRelativePath(pathname: string): string {
  const path = pathname.toLowerCase();
  if (path === GALLERY_BASE || path === `${GALLERY_BASE}/`) return '/';
  return path.startsWith(`${GALLERY_BASE}/`) ? path.slice(GALLERY_BASE.length) : path;
}

/** URL of a file under `devportal-ui/public/gallery/`, which the build serves under the bundle's base. */
export function galleryAsset(file: string): string {
  return `${import.meta.env.BASE_URL}gallery/${file.replace(/^\/+/, '')}`;
}

/** The absolute URL of the gallery on the current origin, e.g. `https://developers.sefaria.org/powered-by`. */
export function gallerySiteUrl(origin: string = window.location.origin): string {
  return `${origin}${GALLERY_BASE}`;
}
