/** Each page kind's stylesheets, from the client build (vite-plugins/page-kind-css.ts); empty in the browser and in dev. */
declare module "virtual:page-kind-css" {
  const css: Partial<Record<"text" | "book", string[]>>;
  export default css;
}
