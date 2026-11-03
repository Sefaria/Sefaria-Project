/**
 * @jest-environment node
 *
 * Node SSR has no window, document, or localStorage. SiteWideBanner reads all three to
 * decide dismissal state, so on the server it must render nothing (and must not throw)
 * rather than crash the whole page render — see the promo-banner SSR regression.
 */
import React from "react";
import ReactDOMServer from "react-dom/server";

jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: { _: (k) => k, util: {} } }));
jest.mock("../sefaria/sefariaJquery", () => ({ __esModule: true, default: {} }));

// eslint-disable-next-line import/first
import { SiteWideBanner } from "../SiteWideBanner";

describe("SiteWideBanner under Node SSR", () => {
  it("renders nothing and does not throw, with backoff dismissal enabled", () => {
    expect(typeof localStorage).toBe("undefined");
    const html = ReactDOMServer.renderToString(
      <SiteWideBanner
        mainText="Hello"
        actionButtons={() => null}
        cookieName="test_banner"
        gtagParams={{}}
        enableBackoffDismissal={true}
      />
    );
    expect(html).toBe("");
  });

  it("renders nothing and does not throw, with the legacy cookie dismissal", () => {
    const html = ReactDOMServer.renderToString(
      <SiteWideBanner mainText="Hello" actionButtons={() => null} cookieName="test_banner" gtagParams={{}} />
    );
    expect(html).toBe("");
  });
});
