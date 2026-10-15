/**
 * Which URL paths are app pages rather than texts. Every other path is a ref, opened by the reader.
 * Keep in step with the static routes in src/routes (the router's splat route catches the rest).
 */
const APP_PAGES = /^\/(?:$|texts(?:\/|$)|search(?:\/|$)|topics(?:\/|$)|sheets(?:\/|$)|collections(?:\/|$)|profile(?:\/|$)|login|register|settings|calendars|static\/)/;

export const isReaderPath = (pathname: string): boolean => !APP_PAGES.test(pathname);
