import type { MouseEvent, ReactNode } from "react";
import { gtagEvent } from "~/lib/analytics";
import {
  CMS_ERROR,
  DEV_BOX_POSITION,
  type Bilingual,
  type Job,
  type Product,
  type Team,
  type TeamMember,
} from "~/lib/cms/cms";
import { inlineMarkdownToHtml } from "~/lib/html/markdown";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Both, InterfaceSpan } from "../ports/legacy-blocks";

/**
 * The CMS parts of the About pages /team, /products and /jobs: what the old TeamMembersPage, ProductsPage and JobsPage
 * (static/js/StaticPages.jsx) rendered into the mount point of Django's page, with the same markup and class names, so the scoped
 * legacy static.css styles them as on sefaria.org. The rest of each page (the About sidebar, the headings, the contact lines, the
 * jobs notice) is Django's content, around them.
 *
 * The views only: CmsParts.tsx asks the CMS for their data. While it loads they show "Loading...", and when the CMS cannot be
 * reached, the old pages' error.
 *
 * @feature STA-009 Jobs page
 * @feature STA-010 Team page
 * @feature STA-011 Products page
 */

export type CmsState<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

/** The old LoadingMessage. */
export function LoadingMessage() {
  const hebrew = useInterfaceLang() === "hebrew";
  return (
    <div className="loadingMessage sans-serif" aria-live="polite" aria-label={hebrew ? "טוען" : "Loading"}>
      <span className={hebrew ? "int-he" : "int-en"}>{hebrew ? "טוען מידע..." : "Loading..."}</span>
    </div>
  );
}

const CmsErrorHeading = () => <h1>{CMS_ERROR}</h1>;

/* ---------------------------------------------------------------- team */

function TeamMemberDetails({ member }: { member: TeamMember }) {
  return (
    <div className="teamMemberDetails">
      <div className="teamName">
        <InterfaceSpan en={member.name.en} he={member.name.he} />
      </div>
      <div className="teamTitle">
        <InterfaceSpan en={member.title.en} he={member.title.he} />
      </div>
    </div>
  );
}

/** The team: the staff with their pictures, then the board of directors (the old TeamMembersPage). */
export function TeamMembersView({ state }: { state: CmsState<Team> }) {
  if (state.status === "error") return <CmsErrorHeading />;
  if (state.status === "loading") return <LoadingMessage />;
  const { members, board } = state.data;
  return (
    <div>
      <section className="main-text team-members">
        {members.map((m) => (
          <div className="teamMember" key={m.id}>
            <div className="teamMemberImage">
              <img src={m.image ?? undefined} alt={`Headshot of ${m.name.en}`} />
            </div>
            <TeamMemberDetails member={m} />
          </div>
        ))}
      </section>
      <header>
        <h2>
          <Both en="BOARD OF DIRECTORS" he="מועצת המנהלים" />
        </h2>
      </header>
      <section className="main-text board-members">
        {board.map((m) => (
          <div className="teamBoardMember" key={m.id}>
            <TeamMemberDetails member={m} />
          </div>
        ))}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ products */

/** The old productsAnalytics: `products_clicked` with the product's rank, name and the link's text. */
function productsAnalytics(product: Product, linkText: string | null, label: string | null, linkType: string) {
  gtagEvent("products_clicked", {
    project: "Products",
    panel_type: "strapi-static",
    panel_number: 1,
    panel_name: "Products",
    position: product.rank ?? undefined,
    link_text: linkText ?? undefined,
    experiment: label === "Experiment" ? 1 : 0,
    feature_name: product.title.en,
    link_classes: linkType,
    engagement_type: "navigation",
    engagement_value: 0,
  });
}

const pick = (b: Bilingual, hebrew: boolean) => (hebrew ? b.he || b.en : b.en || b.he);
const langClass = (b: Bilingual, hebrew: boolean) => `${hebrew ? "int-he" : "int-en"}${hebrew && !b.he ? " enInHe" : !hebrew && !b.en ? " heInEn" : ""}`;

function DevBox() {
  const hebrew = useInterfaceLang() === "hebrew";
  return (
    <aside className="productsDevBox">
      <div className="productsDevHeader">
        <InterfaceSpan en="Powered by Sefaria" he="פרויקטים מכח ספריא" />
      </div>
      <div>
        {hebrew ? (
          <span className="int-he">
            נסו את המוצרים שמפתחי תוכנה וידידי ספריא מרחבי העולם בנו עבורכם! <a href="https://powered-by.sefaria.org">גלו את הפרויקטים</a>
          </span>
        ) : (
          <span className="int-en">
            Check out the products our software developer friends from around the world have been building for you! <a href="https://powered-by.sefaria.org">Explore</a>
          </span>
        )}
      </div>
    </aside>
  );
}

function ProductEntry({ product }: { product: Product }) {
  const hebrew = useInterfaceLang() === "hebrew";
  const onDescClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest?.("a[href]");
    if (a && e.currentTarget.contains(a)) productsAnalytics(product, a.textContent, null, "product_desc");
  };
  return (
    <div className="product">
      <div className="productsHeader">
        <div className="productsTitleAndLabel">
          <span className="productsTitle">
            <InterfaceSpan en={product.title.en} he={product.title.he} />
          </span>
          {product.type.en ? (
            <span className="productsTypeLabel">
              <InterfaceSpan en={product.type.en} he={product.type.he} />
            </span>
          ) : null}
        </div>
        <div className="cta">
          {product.ctas.map((cta) => (
            <a key={cta.id} href={cta.url} onClick={() => productsAnalytics(product, cta.text.en, product.type.en, "cta")}>
              {cta.icon ? <img className="productsCTAIcon" src={cta.icon} alt={hebrew ? "סמל לחיצה" : "Click icon"} /> : null}
              <span className="productsCTA">
                <InterfaceSpan en={cta.text.en} he={cta.text.he} />
              </span>
            </a>
          ))}
        </div>
      </div>
      <div className="productInner">
        <div className="productImgWrapper">
          <img src={product.image ?? undefined} alt={`Image for product: ${product.title.en}`} />
        </div>
        {/* the description's links are the CMS's; a click on one is counted, as on the old page */}
        <div className="productDescWrapper" onClick={onDescClick}>
          <span className={langClass(product.description, hebrew)} dangerouslySetInnerHTML={{ __html: `<div class="reactMarkdown">${inlineMarkdownToHtml(pick(product.description, hebrew), false, { newTab: false })}</div>` }} />
        </div>
      </div>
    </div>
  );
}

/** Sefaria's products, with the "Powered by Sefaria" box after the second (the old ProductsPage). */
export function ProductsView({ state }: { state: CmsState<Product[]> }) {
  let list: ReactNode = null;
  if (state.status === "loading") list = <LoadingMessage />;
  else if (state.status === "error") list = <CmsErrorHeading />;
  else if (state.data.length) {
    const entries = state.data.map((p) => <ProductEntry key={p.id} product={p} />);
    list = (
      <div className="productsFlexWrapper">
        {entries.slice(0, DEV_BOX_POSITION)}
        <DevBox />
        {entries.slice(DEV_BOX_POSITION)}
      </div>
    );
  } else list = <div className="productsFlexWrapper" />;
  return (
    <>
      <h1 className="aboutHeader">
        <Both en="Sefaria's Products" he="המוצרים של ספריא" />
      </h1>
      {list}
    </>
  );
}

/* ---------------------------------------------------------------- jobs */

function JobsHeader({ jobsAvailable }: { jobsAvailable: boolean }) {
  return (
    <header>
      <h1 className="aboutHeader">
        <Both en="Jobs at Sefaria" he="משרות פנויות בספריא" />
      </h1>
      {jobsAvailable ? (
        <>
          <h2>
            <Both en="About Sefaria" he="אודות ספריא" />
          </h2>
          <p>
            <Both
              en="Sefaria is a nonprofit organization dedicated to creating the future of Torah in an open and participatory way. We are assembling a free, living library of Jewish texts and their interconnections, in Hebrew and in translation."
              he="ספריא היא ארגון ללא מטרות רווח שמטרתו יצירת הדור הבא של לימוד התורה באופן פתוח ומשותף. אנחנו בספריא מרכיבים ספרייה חיה וחופשית של טקסטים יהודיים וכלל הקישורים ביניהם, בשפת המקור ובתרגומים."
            />
          </p>
        </>
      ) : null}
    </header>
  );
}

function NoJobsNotice() {
  return (
    <div className="section nothing">
      <p>
        <span className="int-en">
          Sefaria does not currently have any open positions. Please follow us on{" "}
          <a target="_blank" href="http://www.facebook.com/sefaria.org" rel="noreferrer">
            Facebook
          </a>
          to hear about our next openings.
        </span>
        <span className="int-he">
          ספריא איננה מחפשת כעת עובדים חדשים. עקבו אחרינו ב
          <a target="_blank" href="http://www.facebook.com/sefaria.org" rel="noreferrer">
            פייסבוק
          </a>
          &nbsp; כדי להשאר מעודכנים במשרות עתידיות.
        </span>
      </p>
    </div>
  );
}

/** The open positions by department, or the notice that there are none (the old JobsPage). */
export function JobsView({ state }: { state: CmsState<[string, Job[]][]> }) {
  if (state.status === "error") return <CmsErrorHeading />;
  if (state.status === "loading") return <LoadingMessage />;
  const groups = state.data;
  return (
    <div>
      <JobsHeader jobsAvailable={groups.length > 0} />
      {groups.length
        ? groups.map(([department, jobs]) => (
            <section className="section department englishOnly" key={department}>
              <header>
                <h2 className="anchorable">{department}</h2>
              </header>
              <section className="jobsListForDepartment">
                {jobs.map((job) => (
                  <div className="job" key={job.id}>
                    <a className="joblink" target="_blank" href={job.link} rel="noreferrer">
                      {job.description}
                    </a>
                  </div>
                ))}
              </section>
            </section>
          ))
        : <NoJobsNotice />}
    </div>
  );
}

