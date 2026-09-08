/**
 * Synthetic replicas of the recorded Strapi scenarios.
 *
 * Each entry rebuilds, through the payload factory, the response body captured in the .har file
 * it names — same documents, same locales, same dates, same row order. The recordings themselves
 * are INERT REFERENCE: nothing reads them at runtime; they stay committed so anyone can see what
 * Strapi really produced. The equality of these replicas to their recordings was verified
 * mechanically once, when they were generated (2026-08-31, by diffing each recording's rows
 * against FIELD_DEFAULTS); from then on the rule below is what preserves it.
 *
 * ⚠️ NEVER CHANGE THE FIELD VALUES WRITTEN IN THIS FILE. They are frozen recorded data — editing
 * one silently breaks the promise that these scenarios describe payloads Strapi really produced,
 * and the specs' `expected` blocks in strapi.fixtures.js are pinned to them. Two safe kinds of
 * change: adding a NEW scenario (build it from the factory; it makes no recording claim), and
 * fields the factory adds over time (a new query field appears here automatically as its factory
 * DEFAULT — that is correct and expected; a recorded document predates the field, and the
 * default is defined to mean exactly what absence meant).
 *
 * WHY THE SPECS ROUTE THROUGH THESE RATHER THAN THE RECORDINGS (decision 2026-08-31):
 *   routeFromHAR matches on the GraphQL POST body, so ANY change to the query in
 *   static/js/context.js — even one added field — invalidated all fourteen recordings at once,
 *   and re-recording meant reconstructing each scenario's Strapi publish state. Synthetic routes
 *   match the URL glob alone and survive query changes.
 */

import {
  banner,
  modal,
  sidebarAd,
  targetCountries,
  strapiPayload,
} from '../support/strapi-payload-factory.js';

export const SCENARIO_PAYLOADS = {
  // Replicates e2e-tests/fixtures/strapi-modal-published.har — frozen recorded data, never edit (see header).
  publishedModal: strapiPayload({
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
          modalHeader: null,
          modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
          buttonText: "Donate Monthly",
          buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
          createdAt: "2026-05-20T13:23:09.375Z",
          updatedAt: "2026-08-04T23:00:26.283Z",
          publishedAt: "2026-08-04T23:00:26.301Z",
        },
        locales: {
          en: {},
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-modal-hebrew-only.har — frozen recorded data, never edit (see header).
  publishedModalHebrewOnly: strapiPayload({
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
          modalHeader: "Support Sefaria",
          modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
          buttonText: "תן עכשיו",
          buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
          createdAt: "2026-08-05T09:47:30.056Z",
          updatedAt: "2026-08-05T09:56:10.127Z",
          publishedAt: "2026-08-05T09:56:10.132Z",
        },
        locales: {
          he: {},
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-modal-both-locales.har — frozen recorded data, never edit (see header).
  publishedModalBothLocales: strapiPayload({
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-05T10:10:43.514Z",
            publishedAt: "2026-08-05T10:10:43.518Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-05T09:56:10.127Z",
            publishedAt: "2026-08-05T09:56:10.132Z",
          },
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-sidebar-ad-published.har — frozen recorded data, never edit (see header).
  publishedSidebarAd: strapiPayload({
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-05T10:10:43.514Z",
            publishedAt: "2026-08-05T10:10:43.518Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-05T09:56:10.127Z",
            publishedAt: "2026-08-05T09:56:10.132Z",
          },
        },
      }),
    ],
    sidebarAds: [
      sidebarAd({
        window: { start: "2026-08-02T06:00:00.000Z", end: "2026-08-10T06:00:00.000Z" },
        shared: {
          documentId: "lnc4yt9rfeklxbaynb8ef0j2",
          internalCampaignId: "GCT Sidebar Social Issues Topic",
          title: "Your Letter in the Torah",
          bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
          buttonText: "Get Yours Free",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "prayer, beliefs, !social-issues",
          debug: true,
          createdAt: "2025-11-11T20:03:24.854Z",
          updatedAt: "2026-08-06T02:18:18.880Z",
          publishedAt: "2026-08-06T02:18:18.906Z",
        },
        locales: {
          en: {},
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-sidebar-ad-hebrew-only.har — frozen recorded data, never edit (see header).
  publishedSidebarAdHebrewOnly: strapiPayload({
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-05T10:10:43.514Z",
            publishedAt: "2026-08-05T10:10:43.518Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-05T09:56:10.127Z",
            publishedAt: "2026-08-05T09:56:10.132Z",
          },
        },
      }),
    ],
    sidebarAds: [
      sidebarAd({
        window: { start: "2026-08-02T06:00:00.000Z", end: "2026-08-10T06:00:00.000Z" },
        shared: {
          documentId: "lnc4yt9rfeklxbaynb8ef0j2",
          internalCampaignId: "GCT Sidebar Social Issues Topic",
          title: "האות שלך בתורה",
          bodyText: "קבלו את האות שלכם בספר התורה הדיגיטלי השיתופי שלנו או הקדשו אחת למישהו שאתם אוהבים.",
          buttonText: "קבלו את שלכם בחינם",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "prayer, beliefs, !social-issues",
          debug: true,
          createdAt: "2026-08-06T08:37:52.892Z",
          updatedAt: "2026-08-06T08:38:54.808Z",
          publishedAt: "2026-08-06T08:38:54.817Z",
        },
        locales: {
          he: {},
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-sidebar-ad-both-locales.har — frozen recorded data, never edit (see header).
  publishedSidebarAdBothLocales: strapiPayload({
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-05T10:10:43.514Z",
            publishedAt: "2026-08-05T10:10:43.518Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-05T09:56:10.127Z",
            publishedAt: "2026-08-05T09:56:10.132Z",
          },
        },
      }),
    ],
    sidebarAds: [
      sidebarAd({
        window: { start: "2026-08-02T06:00:00.000Z", end: "2026-08-10T06:00:00.000Z" },
        shared: {
          documentId: "lnc4yt9rfeklxbaynb8ef0j2",
          internalCampaignId: "GCT Sidebar Social Issues Topic",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "prayer, beliefs, !social-issues",
          debug: true,
        },
        locales: {
          en: {
            title: "Your Letter in the Torah",
            bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
            buttonText: "Get Yours Free",
            createdAt: "2025-11-11T20:03:24.854Z",
            updatedAt: "2026-08-06T08:48:20.366Z",
            publishedAt: "2026-08-06T08:48:20.373Z",
          },
          he: {
            title: "האות שלך בתורה",
            bodyText: "קבלו את האות שלכם בספר התורה הדיגיטלי השיתופי שלנו או הקדשו אחת למישהו שאתם אוהבים.",
            buttonText: "קבלו את שלכם בחינם",
            createdAt: "2026-08-06T08:37:52.892Z",
            updatedAt: "2026-08-06T08:38:54.808Z",
            publishedAt: "2026-08-06T08:38:54.817Z",
          },
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-modal-country-targeted.har — frozen recorded data, never edit (see header).
  modalCountryTargeted: strapiPayload({
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            countriesToTarget: {"countryMode": "include", "countries": [{"name": "United Kingdom", "code": "GB"}]},
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-06T11:12:24.070Z",
            publishedAt: "2026-08-06T11:12:24.085Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            countriesToTarget: targetCountries("all", []),
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-06T11:12:45.695Z",
            publishedAt: "2026-08-06T11:12:45.702Z",
          },
        },
      }),
    ],
    sidebarAds: [
      sidebarAd({
        window: { start: "2026-08-02T06:00:00.000Z", end: "2026-08-10T06:00:00.000Z" },
        shared: {
          documentId: "lnc4yt9rfeklxbaynb8ef0j2",
          internalCampaignId: "GCT Sidebar Social Issues Topic",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "prayer, beliefs, !social-issues",
          debug: true,
        },
        locales: {
          en: {
            title: "Your Letter in the Torah",
            bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
            buttonText: "Get Yours Free",
            createdAt: "2025-11-11T20:03:24.854Z",
            updatedAt: "2026-08-06T08:48:20.366Z",
            publishedAt: "2026-08-06T08:48:20.373Z",
          },
          he: {
            title: "האות שלך בתורה",
            bodyText: "קבלו את האות שלכם בספר התורה הדיגיטלי השיתופי שלנו או הקדשו אחת למישהו שאתם אוהבים.",
            buttonText: "קבלו את שלכם בחינם",
            createdAt: "2026-08-06T08:37:52.892Z",
            updatedAt: "2026-08-06T08:38:54.808Z",
            publishedAt: "2026-08-06T08:38:54.817Z",
          },
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-banner-country-targeted.har — frozen recorded data, never edit (see header).
  bannerCountryTargeted: strapiPayload({
    banners: [
      banner({
        window: { start: "2026-08-04T04:00:00.000Z", end: "2026-08-08T17:00:00.000Z" },
        shared: {
          documentId: "iv7m6otlx0wm8r42808nypl0",
          internalBannerName: "2026-purim-banner-2",
        },
        locales: {
          en: {
            bannerText: "A generous donor is **MATCHING** all donations this Purim, up to $36,000! Celebrate the joy of Jewish learning with a matched gift today. ",
            buttonText: "Double My Donation",
            buttonURL: "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=web",
            countriesToTarget: {"countryMode": "exclude", "countries": [{"name": "United States", "code": "US"}]},
            createdAt: "2026-02-11T21:05:12.668Z",
            updatedAt: "2026-08-06T22:58:18.574Z",
            publishedAt: "2026-08-06T22:58:18.580Z",
          },
          he: {
            bannerText: "תורם נדיב **משווה** את כל התרומות בפורים הזה, עד 36,000 דולר! חגגו את שמחת הלימוד היהודי עם מתנה תואמת עוד היום.",
            buttonText: "הכפל את התרומה שלי",
            buttonURL: "https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=web",
            countriesToTarget: {"countryMode": "include", "countries": [{"name": "Israel", "code": "IL"}]},
            createdAt: "2026-08-05T08:29:15.175Z",
            updatedAt: "2026-08-07T00:01:27.319Z",
            publishedAt: "2026-08-07T00:01:27.329Z",
          },
        },
      }),
    ],
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            countriesToTarget: {"countryMode": "include", "countries": [{"name": "United Kingdom", "code": "GB"}]},
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-06T11:12:24.070Z",
            publishedAt: "2026-08-06T11:12:24.085Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            countriesToTarget: targetCountries("all", []),
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-06T11:12:45.695Z",
            publishedAt: "2026-08-06T11:12:45.702Z",
          },
        },
      }),
    ],
    sidebarAds: [
      sidebarAd({
        window: { start: "2026-08-02T06:00:00.000Z", end: "2026-08-10T06:00:00.000Z" },
        shared: {
          documentId: "lnc4yt9rfeklxbaynb8ef0j2",
          internalCampaignId: "GCT Sidebar Social Issues Topic",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "prayer, beliefs, !social-issues",
          debug: true,
        },
        locales: {
          en: {
            title: "Your Letter in the Torah",
            bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
            buttonText: "Get Yours Free",
            createdAt: "2025-11-11T20:03:24.854Z",
            updatedAt: "2026-08-06T08:48:20.366Z",
            publishedAt: "2026-08-06T08:48:20.373Z",
          },
          he: {
            title: "האות שלך בתורה",
            bodyText: "קבלו את האות שלכם בספר התורה הדיגיטלי השיתופי שלנו או הקדשו אחת למישהו שאתם אוהבים.",
            buttonText: "קבלו את שלכם בחינם",
            createdAt: "2026-08-06T08:37:52.892Z",
            updatedAt: "2026-08-06T08:38:54.808Z",
            publishedAt: "2026-08-06T08:38:54.817Z",
          },
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-banner-expired.har — frozen recorded data, never edit (see header).
  bannerExpired: strapiPayload({
    banners: [
      banner({
        window: { start: "2026-08-01T04:00:00.000Z", end: "2026-08-03T17:00:00.000Z" },
        shared: {
          documentId: "iv7m6otlx0wm8r42808nypl0",
          internalBannerName: "2026-purim-banner-2",
          bannerText: "A generous donor is **MATCHING** all donations this Purim, up to $36,000! Celebrate the joy of Jewish learning with a matched gift today. ",
          buttonText: "Double My Donation",
          buttonURL: "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=web",
          countriesToTarget: {"countryMode": "exclude", "countries": [{"name": "United States", "code": "US"}]},
          createdAt: "2026-02-11T21:05:12.668Z",
          updatedAt: "2026-08-07T04:20:15.493Z",
          publishedAt: "2026-08-07T04:20:15.501Z",
        },
        locales: {
          en: {},
        },
      }),
    ],
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            countriesToTarget: {"countryMode": "include", "countries": [{"name": "United Kingdom", "code": "GB"}]},
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-06T11:12:24.070Z",
            publishedAt: "2026-08-06T11:12:24.085Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            countriesToTarget: targetCountries("all", []),
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-06T11:12:45.695Z",
            publishedAt: "2026-08-06T11:12:45.702Z",
          },
        },
      }),
    ],
    sidebarAds: [
      sidebarAd({
        window: { start: "2026-08-02T06:00:00.000Z", end: "2026-08-10T06:00:00.000Z" },
        shared: {
          documentId: "lnc4yt9rfeklxbaynb8ef0j2",
          internalCampaignId: "GCT Sidebar Social Issues Topic",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "prayer, beliefs, !social-issues",
          debug: true,
        },
        locales: {
          en: {
            title: "Your Letter in the Torah",
            bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
            buttonText: "Get Yours Free",
            createdAt: "2025-11-11T20:03:24.854Z",
            updatedAt: "2026-08-06T08:48:20.366Z",
            publishedAt: "2026-08-06T08:48:20.373Z",
          },
          he: {
            title: "האות שלך בתורה",
            bodyText: "קבלו את האות שלכם בספר התורה הדיגיטלי השיתופי שלנו או הקדשו אחת למישהו שאתם אוהבים.",
            buttonText: "קבלו את שלכם בחינם",
            createdAt: "2026-08-06T08:37:52.892Z",
            updatedAt: "2026-08-06T08:38:54.808Z",
            publishedAt: "2026-08-06T08:38:54.817Z",
          },
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-banner-future.har — frozen recorded data, never edit (see header).
  bannerNotYetStarted: strapiPayload({
    banners: [
      banner({
        window: { start: "2026-08-08T04:00:00.000Z", end: "2026-08-10T17:00:00.000Z" },
        shared: {
          documentId: "iv7m6otlx0wm8r42808nypl0",
          internalBannerName: "2026-purim-banner-2",
          bannerText: "A generous donor is **MATCHING** all donations this Purim, up to $36,000! Celebrate the joy of Jewish learning with a matched gift today. ",
          buttonText: "Double My Donation",
          buttonURL: "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=web",
          countriesToTarget: {"countryMode": "all", "countries": [{"name": "United States", "code": "US"}]},
          createdAt: "2026-02-11T21:05:12.668Z",
          updatedAt: "2026-08-07T06:12:16.866Z",
          publishedAt: "2026-08-07T06:12:16.882Z",
        },
        locales: {
          en: {},
        },
      }),
    ],
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            countriesToTarget: {"countryMode": "include", "countries": [{"name": "United Kingdom", "code": "GB"}]},
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-06T11:12:24.070Z",
            publishedAt: "2026-08-06T11:12:24.085Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            countriesToTarget: targetCountries("all", []),
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-06T11:12:45.695Z",
            publishedAt: "2026-08-06T11:12:45.702Z",
          },
        },
      }),
    ],
    sidebarAds: [
      sidebarAd({
        window: { start: "2026-08-02T06:00:00.000Z", end: "2026-08-10T06:00:00.000Z" },
        shared: {
          documentId: "lnc4yt9rfeklxbaynb8ef0j2",
          internalCampaignId: "GCT Sidebar Social Issues Topic",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "prayer, beliefs, !social-issues",
          debug: true,
        },
        locales: {
          en: {
            title: "Your Letter in the Torah",
            bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
            buttonText: "Get Yours Free",
            createdAt: "2025-11-11T20:03:24.854Z",
            updatedAt: "2026-08-06T08:48:20.366Z",
            publishedAt: "2026-08-06T08:48:20.373Z",
          },
          he: {
            title: "האות שלך בתורה",
            bodyText: "קבלו את האות שלכם בספר התורה הדיגיטלי השיתופי שלנו או הקדשו אחת למישהו שאתם אוהבים.",
            buttonText: "קבלו את שלכם בחינם",
            createdAt: "2026-08-06T08:37:52.892Z",
            updatedAt: "2026-08-06T08:38:54.808Z",
            publishedAt: "2026-08-06T08:38:54.817Z",
          },
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-sidebar-ad-date-states.har — frozen recorded data, never edit (see header).
  sidebarAdDateStates: strapiPayload({
    banners: [
      banner({
        window: { start: "2026-08-08T04:00:00.000Z", end: "2026-08-10T17:00:00.000Z" },
        shared: {
          documentId: "iv7m6otlx0wm8r42808nypl0",
          internalBannerName: "2026-purim-banner-2",
          bannerText: "A generous donor is **MATCHING** all donations this Purim, up to $36,000! Celebrate the joy of Jewish learning with a matched gift today. ",
          buttonText: "Double My Donation",
          buttonURL: "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=web",
          countriesToTarget: {"countryMode": "all", "countries": [{"name": "United States", "code": "US"}]},
          createdAt: "2026-02-11T21:05:12.668Z",
          updatedAt: "2026-08-07T06:12:16.866Z",
          publishedAt: "2026-08-07T06:12:16.882Z",
        },
        locales: {
          en: {},
        },
      }),
    ],
    modals: [
      modal({
        window: { start: "2026-08-04T04:45:00.000Z", end: "2026-08-11T03:45:00.000Z" },
        shared: {
          documentId: "pwhm4xcatmvsp7bxlvedeu4u",
          internalModalName: "shavuot-2026-modal-example",
        },
        locales: {
          en: {
            modalHeader: null,
            modalText: "\n“Who is wise? One who learns from every person.” – Pirkei Avot 4:1\n\nWe chose this verse for this year’s tote bag because it is a reminder that wisdom is available to us all. Sefaria's mission is to help you gain wisdom from the breadth of the Jewish textual tradition. We are making it possible for more people to learn Torah than perhaps at any other point in Jewish history.\n\nThis Shavuot, start your monthly gift to power Jewish learning and claim your free tote bag!\n\nUpdate: We still need **100** new monthly donors to meet our goal! Give today to give back to Sefaria.",
            buttonText: "Donate Monthly",
            buttonURL: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
            countriesToTarget: {"countryMode": "include", "countries": [{"name": "United Kingdom", "code": "GB"}]},
            createdAt: "2026-05-20T13:23:09.375Z",
            updatedAt: "2026-08-06T11:12:24.070Z",
            publishedAt: "2026-08-06T11:12:24.085Z",
          },
          he: {
            modalHeader: "Support Sefaria",
            modalText: "״איזהו חכם? הלומד מכל אדם.״ — פרקי אבות ד׳, א׳\n\nבחרנו במשנה זו עבור תיק הבד של השנה, משום שהיא מזכירה לנו שהחוכמה זמינה לכולנו. המשימה של ספריא היא לסייע לכם לשאוב חוכמה ממלוא רוחבה של מסורת הטקסטים היהודית. אנו מאפשרים ליותר אנשים ללמוד תורה מאשר אולי בכל תקופה אחרת בהיסטוריה היהודית.\n\nבחג השבועות הזה, התחילו לתרום מדי חודש כדי לתמוך בלימוד יהודי, וקבלו תיק בד במתנה!\n\nעדכון: עדיין חסרים לנו 100 תורמים חודשיים חדשים כדי לעמוד ביעד שלנו! תרמו עוד היום והחזירו לספריא על כל מה שהיא מעניקה לכם.",
            buttonText: "תן עכשיו",
            buttonURL: "https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web",
            countriesToTarget: targetCountries("all", []),
            createdAt: "2026-08-05T09:47:30.056Z",
            updatedAt: "2026-08-06T11:12:45.695Z",
            publishedAt: "2026-08-06T11:12:45.702Z",
          },
        },
      }),
    ],
    sidebarAds: [
      sidebarAd({
        window: { start: "2026-08-06T06:00:00.000Z", end: "2026-08-10T06:00:00.000Z" },
        shared: {
          documentId: "ool1xdhrf2dcgy5qd6ts2v0w",
          internalCampaignId: "GCT Sidebar Social Issues Topic 2",
          title: "Active Ad",
          bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
          buttonText: "Get Yours Free",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "!everywhere",
          debug: true,
          createdAt: "2026-08-07T06:59:17.153Z",
          updatedAt: "2026-08-07T07:37:41.013Z",
          publishedAt: "2026-08-07T07:37:41.021Z",
        },
        locales: {
          en: {},
        },
      }),
      sidebarAd({
        shared: {
          documentId: "lnc4yt9rfeklxbaynb8ef0j2",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          debug: true,
        },
        locales: {
          en: {
            internalCampaignId: "GCT Sidebar Social Issues Topic 1",
            title: "Expired Ad",
            bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
            buttonText: "Get Yours Free",
            keywords: "!everywhere",
            createdAt: "2025-11-11T20:03:24.854Z",
            updatedAt: "2026-08-07T07:37:51.678Z",
            publishedAt: "2026-08-07T07:37:51.686Z",
            startTime: "2026-08-01T06:00:00.000Z",
            endTime: "2026-08-03T06:00:00.000Z",
          },
          he: {
            internalCampaignId: "GCT Sidebar Social Issues Topic",
            title: "האות שלך בתורה",
            bodyText: "קבלו את האות שלכם בספר התורה הדיגיטלי השיתופי שלנו או הקדשו אחת למישהו שאתם אוהבים.",
            buttonText: "קבלו את שלכם בחינם",
            keywords: "prayer, beliefs, !social-issues",
            createdAt: "2026-08-06T08:37:52.892Z",
            updatedAt: "2026-08-06T08:38:54.808Z",
            publishedAt: "2026-08-06T08:38:54.817Z",
            startTime: "2026-08-02T06:00:00.000Z",
            endTime: "2026-08-10T06:00:00.000Z",
          },
        },
      }),
      sidebarAd({
        window: { start: "2026-08-12T06:00:00.000Z", end: "2026-08-14T06:00:00.000Z" },
        shared: {
          documentId: "v40dvrnzqi6av0g483e4h8zs",
          internalCampaignId: "GCT Sidebar Social Issues Topic 3",
          title: "Future Ad",
          bodyText: "Claim your letter in our collaborative digital Torah scroll or dedicate one to someone you love.",
          buttonText: "Get Yours Free",
          buttonURL: "https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic",
          buttonIcon: {"url": "/uploads/collection_black_77313d4544.svg", "alternativeText": "Collection Graphic"},
          keywords: "!everywhere",
          debug: true,
          createdAt: "2026-08-07T07:11:31.203Z",
          updatedAt: "2026-08-07T07:38:01.701Z",
          publishedAt: "2026-08-07T07:38:01.711Z",
        },
        locales: {
          en: {},
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-banner-published.har — frozen recorded data, never edit (see header).
  publishedBanner: strapiPayload({
    banners: [
      banner({
        window: { start: "2026-08-04T04:00:00.000Z", end: "2026-08-08T17:00:00.000Z" },
        shared: {
          documentId: "iv7m6otlx0wm8r42808nypl0",
          internalBannerName: "2026-purim-banner-2",
          bannerText: "A generous donor is **MATCHING** all donations this Purim, up to $36,000! Celebrate the joy of Jewish learning with a matched gift today. ",
          buttonText: "Double My Donation",
          buttonURL: "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=web",
          createdAt: "2026-02-11T21:05:12.668Z",
          updatedAt: "2026-08-05T07:52:13.047Z",
          publishedAt: "2026-08-05T07:52:13.064Z",
        },
        locales: {
          en: {},
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-banner-hebrew-only.har — frozen recorded data, never edit (see header).
  publishedBannerHebrewOnly: strapiPayload({
    banners: [
      banner({
        window: { start: "2026-08-04T04:00:00.000Z", end: "2026-08-08T17:00:00.000Z" },
        shared: {
          documentId: "iv7m6otlx0wm8r42808nypl0",
          internalBannerName: "2026-purim-banner-2",
          bannerText: "תורם נדיב **משווה** את כל התרומות בפורים הזה, עד 36,000 דולר! חגגו את שמחת הלימוד היהודי עם מתנה תואמת עוד היום.",
          buttonText: "הכפל את התרומה שלי",
          buttonURL: "https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=web",
          createdAt: "2026-08-05T08:29:15.175Z",
          updatedAt: "2026-08-05T08:43:45.265Z",
          publishedAt: "2026-08-05T08:43:45.274Z",
        },
        locales: {
          he: {},
        },
      }),
    ],
  }),

  // Replicates e2e-tests/fixtures/strapi-banner-both-locales.har — frozen recorded data, never edit (see header).
  publishedBannerBothLocales: strapiPayload({
    banners: [
      banner({
        window: { start: "2026-08-04T04:00:00.000Z", end: "2026-08-08T17:00:00.000Z" },
        shared: {
          documentId: "iv7m6otlx0wm8r42808nypl0",
          internalBannerName: "2026-purim-banner-2",
        },
        locales: {
          en: {
            bannerText: "A generous donor is **MATCHING** all donations this Purim, up to $36,000! Celebrate the joy of Jewish learning with a matched gift today. ",
            buttonText: "Double My Donation",
            buttonURL: "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=web",
            createdAt: "2026-02-11T21:05:12.668Z",
            updatedAt: "2026-08-05T09:06:02.257Z",
            publishedAt: "2026-08-05T09:06:02.262Z",
          },
          he: {
            bannerText: "תורם נדיב **משווה** את כל התרומות בפורים הזה, עד 36,000 דולר! חגגו את שמחת הלימוד היהודי עם מתנה תואמת עוד היום.",
            buttonText: "הכפל את התרומה שלי",
            buttonURL: "https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=web",
            createdAt: "2026-08-05T08:29:15.175Z",
            updatedAt: "2026-08-05T08:43:45.265Z",
            publishedAt: "2026-08-05T08:43:45.274Z",
          },
        },
      }),
    ],
  }),
};
