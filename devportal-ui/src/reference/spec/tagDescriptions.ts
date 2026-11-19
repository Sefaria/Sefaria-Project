// The spec's tag descriptions, for the tags popover next to the title (live shows the tag and its description).
// Contract C3 carries only tag names; spec/tagDescriptions.test.ts keeps this map equal to docs/openAPI.json.
export const TAG_DESCRIPTIONS: Readonly<Record<string, string>> = {
  Text: 'Operations related to retrieving texts',
  Index: 'Operations related to Sefaria indices',
  Related: 'Operations related to retrieving links and relationships between texts',
  Calendars: 'Operations related to retrieving calendar data',
  Lexicon: 'Operations related to retrieving lexicon (dictionary) data',
  Topic: 'Operations related to retrieving topic data',
  Term: 'Operations related to retrieving Term data (a Sefaria Term is a shared title node)',
  Sheets: 'Operations related to Sefaria source sheets',
  Collections: 'Operations related to Sefaria collections \u2014 curated groups of source sheets',
  Ref: 'Operations related to validating and analyzing text references',
  Misc: 'Miscellaneous API endpoints',
};
