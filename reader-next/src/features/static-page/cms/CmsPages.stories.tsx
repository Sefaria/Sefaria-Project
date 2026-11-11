import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import products from "../../../../fixtures/api/_cms/products.json";
import team from "../../../../fixtures/api/_cms/team.json";
import { shapeJobs, shapeProducts, shapeTeam, type Product, type Team as TeamData } from "~/lib/cms/cms";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { LEGACY_STATIC_CSS } from "~/lib/static-page/legacy-css.gen";
import { JobsView, ProductsView, TeamMembersView, type CmsState } from "./CmsPages";

/**
 * The CMS parts of /team, /products and /jobs, inside the frame and scoped legacy CSS of a static page, filled from the CMS answers
 * recorded from www.sefaria.org (fixtures/api/_cms). The pictures are replaced by a local placeholder, so the stories never reach the
 * CMS's media host.
 */
const PICTURE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ccc"/></svg>')}`;

function Frame({ page, children }: { page: string; children: ReactNode }) {
  const he = useInterfaceLang() === "hebrew";
  const lang = he ? "interface-hebrew" : "interface-english";
  return (
    <>
      <style>{LEGACY_STATIC_CSS}</style>
      <div id="staticContentWrapper" className={lang} data-static-page={page} dir={he ? "rtl" : "ltr"}>
        <div id="content" className={lang}>
          <div className="superAbout">
            {page === "products" ? (
              <div id="productsPage">{children}</div>
            ) : (
              <div className="container static sans-serif" id={page === "team" ? "teamPage" : "jobsPage"}>
                <div className="inner">{children}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const teamData = (locale: "en" | "he"): TeamData => {
  const t = shapeTeam(team.data, locale);
  const pic = (m: TeamData["members"][number]) => ({ ...m, image: PICTURE });
  return { members: t.members.slice(0, 6).map(pic), board: t.board.map(pic) };
};
const productsData = (): Product[] => shapeProducts(products.data).map((p) => ({ ...p, image: PICTURE, ctas: p.ctas.map((c) => ({ ...c, icon: c.icon ? PICTURE : null })) }));

type Part = "team" | "products" | "jobs";
type Status = "ready" | "loading" | "error" | "empty";

function Page({ part, status }: { part: Part; status: Status }) {
  const locale = useInterfaceLang() === "hebrew" ? "he" : "en";
  const of = <T,>(data: T): CmsState<T> => (status === "loading" ? { status: "loading" } : status === "error" ? { status: "error" } : { status: "ready", data });
  return (
    <Frame page={part}>
      {part === "team" ? <TeamMembersView state={of(teamData(locale))} /> : null}
      {part === "products" ? <ProductsView state={of(status === "empty" ? [] : productsData())} /> : null}
      {part === "jobs" ? (
        <JobsView
          state={of(
            status === "empty"
              ? []
              : shapeJobs({
                  jobPostings: [
                    { documentId: "1", jobLink: "https://example.org/job/1", jobDescription: "Senior Software Engineer", jobDepartmentCategory: "Engineering" },
                    { documentId: "2", jobLink: "https://example.org/job/2", jobDescription: "Learning Specialist", jobDepartmentCategory: "Learning" },
                  ],
                }),
          )}
        />
      ) : null}
    </Frame>
  );
}

const meta = {
  title: "Pages/About CMS parts",
  component: Page,
  parameters: { layout: "fullscreen", docs: { description: { component: "The parts of /team, /products and /jobs filled from the CMS (Strapi): loaded, loading, and the CMS unreachable." } } },
} satisfies Meta<typeof Page>;
export default meta;
type Story = StoryObj<typeof meta>;

/** @feature STA-010 */
export const Team: Story = { args: { part: "team", status: "ready" } };
export const TeamLoading: Story = { args: { part: "team", status: "loading" } };
export const TeamCmsUnreachable: Story = { args: { part: "team", status: "error" } };
/**
 * The "Powered by Sefaria" box's link is the old page's blue (#4b71b7) on its grey (#ededec), 4.1:1, as on www.sefaria.org; the
 * scoped legacy CSS is kept as it is, so the contrast rule is off for this story only.
 */
const LEGACY_DEV_BOX = { a11y: { config: { rules: [{ id: "color-contrast", enabled: false }] } } };
/** @feature STA-011 */
export const Products: Story = { args: { part: "products", status: "ready" }, parameters: LEGACY_DEV_BOX };
export const ProductsLoading: Story = { args: { part: "products", status: "loading" } };
export const ProductsCmsUnreachable: Story = { args: { part: "products", status: "error" } };
/** @feature STA-009 */
export const Jobs: Story = { args: { part: "jobs", status: "ready" } };
export const JobsNone: Story = { args: { part: "jobs", status: "empty" } };
export const JobsCmsUnreachable: Story = { args: { part: "jobs", status: "error" } };
