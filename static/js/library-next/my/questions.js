/**
 * Templated discussion questions for a lesson source, by the source's primary category. These
 * are templates, not generated text; the lesson editor labels them so and puts the assistant one
 * tap away (`assistantPrompt`). Each template has EN and HE with `{ref}` and `{book}` slots.
 */
import { bookOf } from './collections';

const T = (en, he) => ({ en, he });

const GENERIC = [
  T('What is the central claim of {ref}, in one sentence?', 'מהי הטענה המרכזית של {ref}, במשפט אחד?'),
  T('Which word or phrase in {ref} would you want to look up first, and why?', 'איזו מילה או ביטוי ב{ref} הייתם רוצים לבדוק קודם, ולמה?'),
  T('Who is the audience of {ref}? How would the text change for a different audience?', 'מי קהל היעד של {ref}? כיצד היה הטקסט משתנה לקהל אחר?'),
  T('Where does {ref} agree or argue with something else you have learned?', 'היכן {ref} מסכים או מתווכח עם משהו אחר שלמדתם?'),
  T('If you had to teach {ref} in two minutes, what would you leave out?', 'אם הייתם צריכים ללמד את {ref} בשתי דקות, מה הייתם משמיטים?'),
];

const BY_CATEGORY = {
  Tanakh: [
    T('Read {ref} aloud. Which word carries the most weight, and what happens if you stress a different one?', 'קראו את {ref} בקול. איזו מילה נושאת את המשקל הרב ביותר, ומה קורה אם מדגישים מילה אחרת?'),
    T('What does {ref} leave unsaid? What would a commentator want to fill in?', 'מה {ref} משאיר לא נאמר? מה היה פרשן רוצה להשלים?'),
    T('Who speaks and who listens in {ref}? How does the power between them shift?', 'מי מדבר ומי מקשיב ב{ref}? כיצד משתנה הכוח ביניהם?'),
    T('Compare the Hebrew and the translation of {ref}. Where do they part ways?', 'השוו בין העברית לתרגום של {ref}. היכן הם נפרדים?'),
    T('What would be lost if {ref} were missing from {book}?', 'מה היה אובד אילו {ref} היה חסר מ{book}?'),
  ],
  Talmud: [
    T('State the question the sugya in {ref} is trying to answer. Does it answer it?', 'נסחו את השאלה שהסוגיה ב{ref} מנסה לענות עליה. האם היא עונה?'),
    T('Map the voices in {ref}: who objects, who resolves, and what does the stam add?', 'מפו את הקולות ב{ref}: מי מקשה, מי מתרץ, ומה הסתם מוסיף?'),
    T('Which assumption in {ref} would a student today push back on?', 'על איזו הנחה ב{ref} היה תלמיד היום חולק?'),
    T('Find the proof text in {ref}. Is the reading of it close or creative?', 'מצאו את הפסוק המובא ב{ref}. האם הקריאה בו צמודה או יצירתית?'),
    T('What practical difference follows from each side of the dispute in {ref}?', 'איזה הבדל מעשי נובע מכל צד במחלוקת ב{ref}?'),
  ],
  Mishnah: [
    T('Rewrite {ref} as a case: who did what, and what is the ruling?', 'נסחו את {ref} כמקרה: מי עשה מה, ומה הדין?'),
    T('Why might the Mishnah in {ref} record a minority opinion at all?', 'מדוע המשנה ב{ref} מביאה בכלל דעת מיעוט?'),
    T('What principle sits behind the ruling in {ref}? Test it on a new case.', 'איזה עיקרון עומד מאחורי הדין ב{ref}? בחנו אותו על מקרה חדש.'),
    T('How does {ref} connect to the mishnah before and after it?', 'כיצד {ref} מתחבר למשנה שלפניו ושאחריו?'),
  ],
  Halakhah: [
    T('What is the rule in {ref}, and what is its source?', 'מהו הכלל ב{ref}, ומהו מקורו?'),
    T('Which real situation today does {ref} speak to? Where does it stop speaking?', 'לאיזה מצב אמיתי היום {ref} מדבר? היכן הוא מפסיק לדבר?'),
    T('Does {ref} describe an ideal or a minimum? How can you tell?', 'האם {ref} מתאר אידיאל או מינימום? איך אפשר לדעת?'),
    T('What value does the law in {ref} protect?', 'על איזה ערך ההלכה ב{ref} מגינה?'),
  ],
  Midrash: [
    T('What gap in the verse does the midrash in {ref} notice?', 'איזה פער בפסוק המדרש ב{ref} מזהה?'),
    T('Is the reading in {ref} meant literally, playfully, or both?', 'האם הקריאה ב{ref} מכוונת כפשוטה, כמשחק, או שניהם?'),
    T('What does the darshan in {ref} want the listener to feel?', 'מה הדרשן ב{ref} רוצה שהמאזין ירגיש?'),
    T('Retell {ref} in your own words. What did you add?', 'ספרו מחדש את {ref} במילים שלכם. מה הוספתם?'),
  ],
  Liturgy: [
    T('When is {ref} said, and how does the moment shape its meaning?', 'מתי אומרים את {ref}, וכיצד הרגע מעצב את משמעותו?'),
    T('Which line of {ref} is hardest to say with intention? Why?', 'איזו שורה ב{ref} הכי קשה לומר בכוונה? מדוע?'),
    T('Who is the "we" in {ref}?', 'מי הוא ה"אנחנו" ב{ref}?'),
    T('If {ref} were a letter, to whom is it addressed and what does it ask?', 'אילו {ref} היה מכתב, אל מי הוא מופנה ומה הוא מבקש?'),
  ],
  'Jewish Thought': [
    T('What problem is {ref} trying to solve?', 'איזו בעיה {ref} מנסה לפתור?'),
    T('Restate the argument of {ref} as premises and a conclusion. Which premise is weakest?', 'נסחו את הטיעון ב{ref} כהנחות ומסקנה. איזו הנחה הכי חלשה?'),
    T('Who is {ref} arguing against, named or unnamed?', 'נגד מי {ref} מתווכח, במפורש או במרומז?'),
    T('Would the author of {ref} accept a modern example of their idea?', 'האם מחבר {ref} היה מקבל דוגמה מודרנית לרעיונו?'),
  ],
};
BY_CATEGORY.Tosefta = BY_CATEGORY.Mishnah;
BY_CATEGORY.Chasidut = BY_CATEGORY['Jewish Thought'];
BY_CATEGORY.Musar = BY_CATEGORY['Jewish Thought'];
BY_CATEGORY.Kabbalah = BY_CATEGORY['Jewish Thought'];
BY_CATEGORY.Responsa = BY_CATEGORY.Halakhah;

export const QUESTION_CATEGORIES = Object.keys(BY_CATEGORY);

function fill(template, ref) {
  const book = bookOf(ref);
  return { en: template.en.replace(/\{ref\}/g, ref).replace(/\{book\}/g, book), he: template.he.replace(/\{ref\}/g, ref).replace(/\{book\}/g, book) };
}

/**
 * `count` questions for `ref` in `category` (a Sefaria primary category), as `[{ en, he }]`.
 * Deterministic for a given `offset`, so "more" cycles through the templates without repeats.
 */
export function generateQuestions(category, ref, { count = 3, offset = 0 } = {}) {
  const pool = [...(BY_CATEGORY[category] || []), ...GENERIC];
  const out = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    out.push(fill(pool[(offset + i) % pool.length], ref));
  }
  return out;
}

/** The prompt handed to the assistant for a lesson's sources, in the interface language. */
export function assistantPrompt(lesson, lang = 'en') {
  const refs = (lesson.sources || []).map(s => s.ref).filter(Boolean);
  const list = refs.length ? refs.join(', ') : (lesson.title || '');
  return lang === 'he'
    ? `אני מכין/ה שיעור בשם "${lesson.title || ''}" על ${list}. הצע/י שלוש שאלות לדיון בכיתה, מהקל אל הקשה, והסבר/י בקצרה מה כל שאלה בודקת.`
    : `I am preparing a lesson called "${lesson.title || ''}" on ${list}. Suggest three classroom discussion questions, from accessible to demanding, and say briefly what each one tests.`;
}
