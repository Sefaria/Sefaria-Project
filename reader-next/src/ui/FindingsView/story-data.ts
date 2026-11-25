import { groupByMethod, parseFindings, type Finding } from "~/lib/connections/findings";

/**
 * Made-up findings on Genesis 1 in the shape the Library Assistant's findings API answers (`GET <apiBaseUrl>/findings/ref/Genesis 1`).
 * The methods, people and sheets are placeholders.
 */
export const GENESIS_1_ANSWER = {
  ref: "Genesis 1",
  findings: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      url: "https://chat-dev.sefaria.org/findings/00000000-0000-4000-8000-000000000001",
      method: { slug: "example-method", title: { en: "Rabbi Ploni's Method", he: "שיטת רבי פלוני" } },
      skill: { name: "example-close-reading", title: "Example close reading" },
      title: "The first verse as a heading for the chapter",
      conclusion:
        "Read with this method, the opening verse is a summary heading rather than the first act of creation: the verses that follow unfold what it announces. The method's habit of asking what each clause adds leads to the conclusion that 'the heavens and the earth' names the whole of what the chapter goes on to describe, and that the second verse describes the state of things before the first day begins. The reading rests on the parallel structure of the days and on a comparison with a psalm that uses the same pairing.",
      label: "AI-assisted reading in the approach of Rabbi Ploni",
      anchorRefs: ["Genesis 1:1", "Genesis 1:2"],
      refs: [
        { ref: "Genesis 1:1-2", role: "anchor" },
        { ref: "Genesis 2:4", role: "support" },
        { ref: "Psalms 104:2", role: "support" },
      ],
      sheetUrl: "https://www.sefaria.org/sheets/100001",
      created: "2026-11-20T09:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      url: "https://chat-dev.sefaria.org/findings/00000000-0000-4000-8000-000000000002",
      method: { slug: "example-method", title: { en: "Rabbi Ploni's Method", he: "שיטת רבי פלוני" } },
      skill: { name: "example-close-reading", title: "Example close reading" },
      title: "Light before the luminaries",
      conclusion: "The method separates the light of the first day from the lights of the fourth, and reads the first as a condition for time rather than a source in the sky.",
      label: "AI-assisted reading in the approach of Rabbi Ploni",
      anchorRefs: ["Genesis 1:3"],
      refs: [
        { ref: "Genesis 1:3", role: "anchor" },
        { ref: "Genesis 1:14-16", role: "position" },
      ],
      sheetUrl: "https://www.sefaria.org/sheets/100002",
      created: "2026-11-24T15:30:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      url: "https://chat-dev.sefaria.org/findings/00000000-0000-4000-8000-000000000003",
      method: { slug: "another-method", title: { en: "Rabbi Almoni's Questions", he: "שאלות רבי אלמוני" } },
      skill: { name: "example-questions", title: "Example questions" },
      title: "מדוע נפתחה התורה בבריאה",
      conclusion: "לפי השיטה, פתיחת התורה בבריאת העולם מלמדת שהארץ כולה של הבורא, והיא הבסיס לסיפורים שיבואו אחריה.",
      label: "קריאה בסיוע בינה מלאכותית בדרכו של רבי אלמוני",
      anchorRefs: ["Genesis 1:1"],
      refs: [
        { ref: "Genesis 1:1", role: "anchor" },
        { ref: "Psalms 24:1", role: "support" },
      ],
      sheetUrl: null,
      created: "2026-11-22T12:00:00Z",
    },
  ],
};

export const GENESIS_1: Finding[] = parseFindings(GENESIS_1_ANSWER);
export const GROUPS = groupByMethod(GENESIS_1);
