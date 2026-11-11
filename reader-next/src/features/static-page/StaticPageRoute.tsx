import type { StaticPageModel } from "~/lib/static-page/content";
import type { StaticPageOwner } from "~/lib/static-page/pages";
import { DonatePage } from "./ports/DonatePage";
import { EducatorsPage } from "./ports/EducatorsPage";
import { MobileAppPage } from "./ports/MobileAppPage";
import { StaticPage, StaticPageFrame } from "./StaticPage";

/** The pages this client has its own version of: Django's content block for them is only an empty mount point. */
const PORTS: Record<string, () => React.ReactNode> = {
  mobile: MobileAppPage,
  educators: EducatorsPage,
  // the English /ways-to-give (the Hebrew one is Django's content)
  "ways-to-give": DonatePage,
};

/** A static page: Django's content in this shell, or this client's port of it (lib/static-page/pages.ts). */
export function StaticPageRoute({ model, owner }: { model: StaticPageModel; owner: StaticPageOwner }) {
  const Port = owner === "port" ? PORTS[model.page] : undefined;
  if (Port) return <StaticPageFrame model={model}><Port /></StaticPageFrame>;
  return <StaticPage model={model} />;
}
