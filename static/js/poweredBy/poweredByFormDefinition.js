/*
 * The Powered by Sefaria submission form: every field, option and line of copy, in the order
 * and wording of the Formstack form it replaces. Option values stay in English (they are what
 * gets stored); only the labels shown are translated.
 *
 * HEBREW REVIEW: every `he` string in this file is a draft that still needs a native
 * speaker's review. All of the form's Hebrew lives in this file.
 */

export const DESCRIPTION_MAX_LENGTH = 150;

export const COPY = {
  intro: {
    en: "Have you used Sefaria’s data to build an app, visualization, website, or other digital tool? <strong>We want to know about it!</strong> We’re always excited to see the projects you’re building.",
    he: "השתמשתם בנתונים של ספריא כדי לבנות אפליקציה, הדמיה, אתר או כלי דיגיטלי אחר? <strong>נשמח לשמוע על כך!</strong> אנחנו תמיד מתרגשים לראות את הפרויקטים שאתם בונים.",
  },
  introContact: {
    en: "If you have questions about our open-source data and API, you can always reach out at developers@sefaria.org.",
    he: "אם יש לכם שאלות על הנתונים בקוד פתוח ועל ה־API שלנו, תמיד אפשר לפנות אלינו בכתובת developers@sefaria.org.",
  },
  personalHeading: {en: "Personal Details", he: "פרטים אישיים"},
  personalNote: {
    en: "These details will <strong>not</strong> be displayed on the site or shared.",
    he: "פרטים אלה <strong>לא</strong> יוצגו באתר ולא ישותפו.",
  },
  projectHeading: {en: "Project Information", he: "מידע על הפרויקט"},
  projectNote: {
    en: "These details, if submitted, will be shared on our site.",
    he: "פרטים אלה, אם יישלחו, יוצגו באתר שלנו.",
  },
  consentHeading: {en: "Consent", he: "הסכמה"},
  discord: {
    en: "If you’re not already inside our Sefaria Developer Community on Discord, <a href=\"https://sefaria.formstack.com/forms/sefaria_developer_discord_community\">join us</a>!",
    he: "אם אתם עדיין לא חלק מקהילת המפתחים של ספריא בדיסקורד, <a href=\"https://sefaria.formstack.com/forms/sefaria_developer_discord_community\">הצטרפו אלינו</a>!",
  },
  logoIntro: {
    en: "Thank you for your submission! We'd love to add your project to our list of projects powered by Sefaria. In order to add your work to the list, please confirm that the Powered by Sefaria Logo has been added to your project.",
    he: "תודה על הפנייה! נשמח להוסיף את הפרויקט שלכם לרשימת הפרויקטים המבוססים על ספריא. כדי שנוכל להוסיף אותו לרשימה, אנא אשרו שהוספתם לפרויקט את הלוגו Powered by Sefaria.",
  },
  logoLearnMore: {en: "[Learn More]", he: "[למידע נוסף]"},
  next: {en: "Next", he: "הבא"},
  previous: {en: "Previous", he: "הקודם"},
  submit: {en: "Submit Form", he: "שליחת הטופס"},
  submitting: {en: "Submitting...", he: "שולח..."},
  requiredField: {en: "Required field", he: "שדה חובה"},
  invalidEmail: {
    en: "Invalid email format (e.g. your_email@domain.com)",
    he: "כתובת דוא״ל לא תקינה (לדוגמה your_email@domain.com)",
  },
  tooLong: {
    en: "Field should have a maximum number of characters [150]",
    he: "השדה יכול להכיל עד 150 תווים",
  },
  pageError: {
    en: "Please review the current page (%{current} of %{total}) and fill in valid responses for each field:",
    he: "אנא בדקו את העמוד הנוכחי (%{current} מתוך %{total}) ומלאו תשובות תקינות בכל שדה:",
  },
  charactersRemaining: {en: "Characters remaining:", he: "תווים שנותרו:"},
  logoAlt: {en: "Sefaria", he: "ספריא"},
};

export const LOGO_LEARN_MORE_URL = "https://developers.sefaria.org/docs/usage-of-our-name-and-logo";

const opt = (value, he) => ({value, label: {en: value, he: he || value}});

export const OTHER = "Other";
const otherOpt = opt(OTHER, "אחר");
const yesNo = [opt("Yes", "כן"), opt("No", "לא")];

export const SEFARIA_API = "Sefaria API";

/* Endpoint categories in the order of the category question. */
export const ENDPOINT_CATEGORIES = [
  {value: "Calendars", he: "לוחות שנה", formstackId: "196602151", endpoints: [
    "/api/calendars", "/api/calendars/next-read", "/api/calendars/topics/holiday",
    "/api/calendars/topics/parasha", "/api/sheets/get_aliyot"]},
  {value: "Collections", he: "אוספים", formstackId: "196602402", endpoints: [
    "/api/collections", "/api/collections/user-collections"]},
  {value: "Index", he: "אינדקס", formstackId: "196602409", endpoints: [
    "/api/authors/indexes", "/api/counts", "/api/counts/links", "/api/counts/words", "/api/index",
    "/api/index/titles", "/api/shape", "/api/v2/index", "/api/v2/raw/index"]},
  {value: "Lexicon", he: "מילון", formstackId: "196602439", endpoints: [
    "/api/words", "/api/words/completion"]},
  {value: "Reference", he: "הפניות", formstackId: "196602566", endpoints: ["/api/ref"]},
  {value: "Related", he: "קשרים", formstackId: "196602632", endpoints: [
    "/api/link-summary", "/api/links", "/api/ref-topic-links", "/api/related", "/api/related/websites"]},
  {value: "Sheets", he: "דפי מקורות", formstackId: "196602641", endpoints: [
    "/api/sheets", "/api/sheets/all-sheets", "/api/sheets/modified", "/api/sheets/ref",
    "/api/sheets/tag-list", "/api/sheets/tag-list/user", "/api/sheets/trending-tags",
    "/api/sheets/user", "/api/v2/sheets/bulk"]},
  {value: "Term", he: "מונחים", formstackId: "196602679", endpoints: ["/api/name", "/api/terms"]},
  {value: "Text", he: "טקסטים", formstackId: "196602688", endpoints: [
    "/api/bulktext", "/api/manuscripts", "/api/passages", "/api/texts", "/api/texts/random",
    "/api/texts/translations", "/api/texts/versions", "/api/v3/texts"]},
  {value: "Topic", he: "נושאים", formstackId: "196602699", endpoints: [
    "/api/recommend/topics", "/api/texts/random-by-topic", "/api/topics", "/api/topics-graph",
    "/api/v2/topics"]},
  {value: "Miscellaneous", he: "שונות", formstackId: "196602489", endpoints: [
    "/api/async", "/api/category", "/api/find-refs", "/api/img-gen", "/api/profile",
    "/api/search-wrapper"]},
];

/* Formstack renders the specific-endpoint questions with Miscellaneous fifth, not last. */
export const ENDPOINT_FIELD_ORDER = [
  "Calendars", "Collections", "Index", "Lexicon", "Miscellaneous", "Reference", "Related",
  "Sheets", "Term", "Text", "Topic",
];

export const endpointFieldName = (category) => "endpoints" + category;

const SPECIFIC_ENDPOINTS_LABEL = {
  en: "Which specific endpoints did you use?",
  he: "באילו נקודות קצה (endpoints) ספציפיות השתמשתם?",
};

const endpointFields = ENDPOINT_FIELD_ORDER.map(category => {
  const def = ENDPOINT_CATEGORIES.find(c => c.value === category);
  return {
    name: endpointFieldName(category), formstackId: def.formstackId, type: "checkbox",
    label: SPECIFIC_ENDPOINTS_LABEL, width: "half", endpointSection: true,
    options: def.endpoints.map(e => opt(e)),
    showWhen: (v) => (v.sefariaTools || []).includes(SEFARIA_API) &&
      (v.endpointCategories || []).includes(category),
  };
});

/* Page 1 and page 2, as an ordered list of blocks: headings, static copy and fields. */
export const FORM_PAGES = [
  [
    {block: "richText", copy: "intro", second: "introContact", className: "pbfIntro"},
    {block: "heading", copy: "personalHeading"},
    {block: "richText", copy: "personalNote"},
    {name: "firstName", formstackId: "179244240", type: "text", required: true, width: "half",
      autoComplete: "given-name", label: {en: "First Name", he: "שם פרטי"}},
    {name: "lastName", formstackId: "179244241", type: "text", required: true, width: "half",
      autoComplete: "family-name", label: {en: "Last Name", he: "שם משפחה"}},
    {name: "email", formstackId: "179244264", type: "email", required: true, width: "half",
      autoComplete: "email", label: {en: "Email", he: "דוא״ל"}},
    {name: "currentRole", formstackId: "179244268", type: "text", width: "half",
      autoComplete: "organization-title", label: {en: "Current Role", he: "תפקיד נוכחי"}},
    {name: "heardFrom", formstackId: "193691179", type: "radio", width: "full", otherName: "heardFromOther",
      label: {en: "How did you hear about Sefaria's data and tools?", he: "איך שמעתם על הנתונים והכלים של ספריא?"},
      options: [opt("Friend", "חבר/ה"), opt("Colleague", "עמית/ה לעבודה"), opt("Family member", "בן/בת משפחה"),
        opt("An internet search", "חיפוש באינטרנט"), otherOpt]},
    {name: "isDeveloper", formstackId: "196457843", type: "radio", width: "half",
      label: {en: "Are you a professional software developer?", he: "האם אתם מפתחי תוכנה במקצועכם?"},
      options: yesNo},
    {name: "yearsExperience", formstackId: "196457848", type: "select", width: "half",
      label: {en: "How many years of programming experience do you have?", he: "כמה שנות ניסיון בתכנות יש לכם?"},
      options: [opt("None", "אין"), opt("<5 years", "פחות מ־5 שנים"), opt("5-10 years", "5–10 שנים"),
        opt("10+ years", "יותר מ־10 שנים")]},

    {block: "heading", copy: "projectHeading"},
    {block: "richText", copy: "projectNote"},
    {name: "projectName", formstackId: "179244711", type: "text", required: true, width: "half",
      label: {en: "Project Name", he: "שם הפרויקט"}},
    {name: "projectLink", formstackId: "179244929", type: "text", required: true, width: "half",
      inputMode: "url", label: {en: "Link to the Project", he: "קישור לפרויקט"}},
    {name: "sourceCodeLink", formstackId: "179355747", type: "text", width: "full", inputMode: "url",
      placeholder: {en: "Optional", he: "לא חובה"},
      label: {en: "Link to Source Code", he: "קישור לקוד המקור"}},
    {name: "description", formstackId: "179244923", type: "textarea", required: true, width: "full",
      maxLength: DESCRIPTION_MAX_LENGTH, label: {en: "Project Description", he: "תיאור הפרויקט"}},
    {name: "categories", formstackId: "179248693", type: "checkbox", required: true, width: "full",
      otherName: "categoriesOther", label: {en: "Category", he: "קטגוריה"},
      help: {en: "Select all that apply.", he: "יש לסמן את כל התשובות המתאימות."},
      options: [opt("Learning & Study Tools", "כלי לימוד"),
        opt("AI Projects, Apps, & Other Tools", "פרויקטי בינה מלאכותית, אפליקציות וכלים אחרים"),
        opt("Visualization & Data Analysis", "הדמיה וניתוח נתונים"),
        opt("Community, Interaction, & Social", "קהילה, אינטראקציה ורשתות חברתיות"),
        opt("Extensions and API Integrations", "תוספים ושילובי API"), otherOpt]},
    {name: "sefariaTools", formstackId: "196457970", type: "checkbox", width: "full",
      otherName: "sefariaToolsOther",
      label: {en: "Which Sefaria data or tools did you use for your project?", he: "באילו נתונים או כלים של ספריא השתמשתם בפרויקט?"},
      options: [opt("Sefaria-Export"), opt(SEFARIA_API, "ה־API של ספריא"), opt("Sefaria MCP"),
        opt("Sefaria-Project code", "הקוד של Sefaria-Project"), opt("Sefaria ai-chatbot code", "הקוד של Sefaria ai-chatbot"),
        opt("Sefaria Embedded code", "הקוד של Sefaria Embedded"),
        opt("Sefaria ML models on HuggingFace", "מודלי ML של ספריא ב־HuggingFace"),
        opt("Tutorials", "מדריכים"), opt("Documentation", "תיעוד"), opt("Sefaria Patot", "ספריא פתות"), otherOpt]},
    {name: "endpointCategories", formstackId: "196602042", type: "checkbox", width: "full", endpointSection: true,
      label: {en: "Which categories of endpoints did you utilize?", he: "באילו קטגוריות של נקודות קצה השתמשתם?"},
      options: ENDPOINT_CATEGORIES.map(c => opt(c.value, c.he)),
      showWhen: (v) => (v.sefariaTools || []).includes(SEFARIA_API)},
    ...endpointFields,
    {name: "otherTech", formstackId: "193691243", type: "text", width: "full",
      label: {en: "Which non-Sefaria technologies or tools did you use for your project?", he: "באילו טכנולוגיות או כלים שאינם של ספריא השתמשתם בפרויקט?"}},
    {name: "inspiration", formstackId: "196457952", type: "textarea", width: "full",
      label: {en: "What inspired you to build this tool? What use case were you solving for?", he: "מה נתן לכם השראה לבנות את הכלי? איזה צורך הוא בא לפתור?"}},
    {name: "vibeCoded", formstackId: "196457992", type: "radio", width: "half",
      label: {en: "Was this project vibe-coded?", he: "האם הפרויקט נבנה ב־vibe coding?"}, options: yesNo},
    {name: "monthlyUsers", formstackId: "196457997", type: "radio", width: "half", otherName: "monthlyUsersOther",
      label: {en: "How many users approximately use this project on a monthly basis?", he: "בערך כמה משתמשים משתמשים בפרויקט בכל חודש?"},
      options: [opt("None, it's mostly a proof of concept", "אף אחד, זו בעיקר הוכחת היתכנות"),
        opt("~10"), opt("~100"), opt("~1000"), otherOpt]},

    {block: "heading", copy: "consentHeading"},
    {name: "consent", formstackId: "179245509", type: "radio", required: true, width: "full",
      label: {en: "Do you consent to have your project data displayed on our page?", he: "האם אתם מסכימים שפרטי הפרויקט יוצגו בעמוד שלנו?"},
      options: yesNo},
    {name: "anythingElse", formstackId: "179245600", type: "textarea", width: "full",
      label: {en: "Anything else you would like to add?", he: "יש עוד משהו שתרצו להוסיף?"}},
    {block: "richText", copy: "discord", className: "pbfDiscord"},
  ],
  [
    {block: "logoIntro"},
    {name: "logo", formstackId: "191150099", type: "radio", required: true, width: "full",
      label: {en: "Select one:", he: "בחרו אחת מהאפשרויות:"},
      options: [
        opt("Yes! I have added the Powered by Sefaria Logo to my project.", "כן! הוספתי לפרויקט את הלוגו Powered by Sefaria."),
        opt("I have not added the Powered by Sefaria Logo to my project yet.", "עדיין לא הוספתי לפרויקט את הלוגו Powered by Sefaria."),
      ]},
  ],
];

export const ALL_FIELDS = FORM_PAGES.flat().filter(item => item.name);

export const emptyValues = () => {
  const values = {};
  ALL_FIELDS.forEach(f => {
    values[f.name] = f.type === "checkbox" ? [] : "";
    if (f.otherName) { values[f.otherName] = ""; }
  });
  return values;
};

export const isFieldVisible = (field, values, {hideEndpointSections = false} = {}) => {
  if (field.endpointSection && hideEndpointSections) { return false; }
  return field.showWhen ? field.showWhen(values) : true;
};

const isEmpty = (value) => Array.isArray(value) ? value.length === 0 : !String(value || "").trim();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The error key for a field's current value, or null when it is fine. */
export const fieldError = (field, values) => {
  const value = values[field.name];
  if (field.required && isEmpty(value)) { return "requiredField"; }
  if (field.type === "email" && !isEmpty(value) && !EMAIL_PATTERN.test(String(value).trim())) { return "invalidEmail"; }
  if (field.maxLength && String(value || "").length > field.maxLength) { return "tooLong"; }
  return null;
};

/* Errors for the visible fields of one page (or of every page when page is null). */
export const validate = (values, {page = null, hideEndpointSections = false} = {}) => {
  const pages = page === null ? FORM_PAGES : [FORM_PAGES[page]];
  const errors = {};
  pages.flat().filter(item => item.name).forEach(field => {
    if (!isFieldVisible(field, values, {hideEndpointSections})) { return; }
    const error = fieldError(field, values);
    if (error) { errors[field.name] = error; }
  });
  return errors;
};

/* Required fields that are still empty, across the whole form. */
export const missingRequiredFields = (values, {hideEndpointSections = false} = {}) => (
  ALL_FIELDS
    .filter(f => f.required && isFieldVisible(f, values, {hideEndpointSections}) && isEmpty(values[f.name]))
    .map(f => f.name)
);

/* The answers as submitted: values of fields hidden by the form's logic are dropped. */
export const submittedValues = (values, {hideEndpointSections = false} = {}) => {
  const result = {...values};
  ALL_FIELDS.forEach(f => {
    if (!isFieldVisible(f, values, {hideEndpointSections})) {
      result[f.name] = f.type === "checkbox" ? [] : "";
    }
  });
  return result;
};
