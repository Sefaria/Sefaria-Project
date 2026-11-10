import { isStaticPagePath } from "~/lib/static-page/pages";

/**
 * Which URL paths are app pages rather than texts. Every other path is a ref, opened by the reader.
 * Keep in step with the static routes in src/routes (the router's splat route catches the rest).
 */
const APP_PAGES = /^\/(?:$|texts(?:\/|$)|translations(?:\/|$)|search(?:\/|$)|topics(?:\/|$)|sheets(?:\/|$)|collections(?:\/|$)|profile(?:\/|$)|login|register|settings|calendars|notifications(?:\/|$)|torahtracker(?:\/|$)|updates(?:\/|$)|static\/)/;

/** The static information pages (/about, /terms…: lib/static-page/pages.ts) are site pages too: the header stays on a phone. */
export const isReaderPath = (pathname: string): boolean => !APP_PAGES.test(pathname) && !isStaticPagePath(pathname);
