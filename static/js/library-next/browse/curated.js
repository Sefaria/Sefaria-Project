/**
 * Curated, editorial content for browse: the newcomer path, glossary, short reads, "where to
 * start" picks, topic picks and one-line explainers for each learning schedule. Everything is
 * EN + HE. Refs are plain Sefaria refs; `refPath()` in data.js turns them into URLs.
 */

export const START_HERE = [
  { id: 'torah', title: { en: 'Torah', he: 'תורה' }, ref: 'Genesis 1',
    blurb: { en: 'The Five Books of Moses are the foundation of everything else here. Begin at the beginning: the creation of the world.',
             he: 'חמשת חומשי התורה הם היסוד לכל השאר. מתחילים בהתחלה: בריאת העולם.' } },
  { id: 'tanakh', title: { en: 'Tanakh', he: 'תנ"ך' }, ref: 'Psalms 23',
    blurb: { en: 'Prophets and Writings complete the Hebrew Bible: history, poetry and wisdom. Psalm 23 is six verses long and known everywhere.',
             he: 'הנביאים והכתובים משלימים את התנ"ך: היסטוריה, שירה וחוכמה. מזמור כ"ג הוא שישה פסוקים שכולם מכירים.' } },
  { id: 'mishnah', title: { en: 'Mishnah', he: 'משנה' }, ref: 'Pirkei Avot 1',
    blurb: { en: 'The first written code of the Oral Torah (c. 200 CE), in short, crisp teachings. Pirkei Avot is its chapter of ethics.',
             he: 'הקובץ הכתוב הראשון של התורה שבעל פה (סביב שנת 200), בהוראות קצרות וחדות. פרקי אבות הוא פרק המוסר שלה.' } },
  { id: 'talmud', title: { en: 'Talmud', he: 'תלמוד' }, ref: 'Berakhot 2a',
    blurb: { en: 'Generations of rabbis debating the Mishnah, with stories woven in. The very first page asks: from when do we say the Shema at night?',
             he: 'דורות של חכמים שדנים במשנה, וסיפורים שזורים בתוך הדיון. הדף הראשון שואל: מאימתי קורין את שמע בערבית?' } },
  { id: 'midrash', title: { en: 'Midrash', he: 'מדרש' }, ref: 'Bereshit Rabbah 1',
    blurb: { en: 'Rabbinic storytelling and interpretation that fill the gaps in the Torah’s text. Bereshit Rabbah opens on the first word of Genesis.',
             he: 'סיפור ופרשנות של חז"ל שממלאים את הפערים בטקסט התורה. בראשית רבה נפתח במילה הראשונה של התורה.' } },
  { id: 'halakhah', title: { en: 'Halakhah and Siddur', he: 'הלכה וסידור' }, ref: 'Shulchan Arukh, Orach Chayim 1',
    blurb: { en: 'How tradition becomes practice: law codes for daily life and the prayer book. The Shulchan Arukh starts with waking up in the morning.',
             he: 'איך המסורת הופכת למעשה: ספרי הלכה לחיי היום־יום וסידור התפילה. השולחן ערוך מתחיל בקימה בבוקר.' } },
];

export const GLOSSARY = [
  { en: 'Torah', he: 'תורה', defEn: 'The Five Books of Moses; also, Jewish learning as a whole.', defHe: 'חמשת חומשי משה; וגם כינוי ללימוד היהודי כולו.' },
  { en: 'Tanakh', he: 'תנ"ך', defEn: 'The Hebrew Bible: Torah, Prophets (Nevi’im) and Writings (Ketuvim).', defHe: 'המקרא: תורה, נביאים וכתובים.' },
  { en: 'Mishnah', he: 'משנה', defEn: 'The first code of the Oral Torah, compiled around 200 CE in six orders.', defHe: 'הקובץ הראשון של התורה שבעל פה, נערך סביב שנת 200 בשישה סדרים.' },
  { en: 'Talmud (Gemara)', he: 'תלמוד (גמרא)', defEn: 'Centuries of rabbinic discussion of the Mishnah; Babylonian and Jerusalem editions.', defHe: 'דיוני חכמים במשנה לאורך מאות שנים; יש תלמוד בבלי וירושלמי.' },
  { en: 'Midrash', he: 'מדרש', defEn: 'Rabbinic interpretation and storytelling on the Bible.', defHe: 'פרשנות וסיפור של חז"ל על המקרא.' },
  { en: 'Halakhah', he: 'הלכה', defEn: 'Jewish law: how the tradition is lived day to day.', defHe: 'המשפט היהודי: איך המסורת נחיית ביום־יום.' },
  { en: 'Aggadah', he: 'אגדה', defEn: 'The non-legal side of rabbinic literature: stories, ethics, theology.', defHe: 'הצד הלא־הלכתי של ספרות חז"ל: סיפורים, מוסר, אמונה.' },
  { en: 'Parashah', he: 'פרשה', defEn: 'The weekly Torah portion; the whole Torah is read in a year.', defHe: 'פרשת השבוע; את כל התורה קוראים במשך שנה.' },
  { en: 'Haftarah', he: 'הפטרה', defEn: 'A reading from the Prophets that follows the weekly Torah portion.', defHe: 'קריאה מהנביאים שבאה אחרי פרשת השבוע.' },
  { en: 'Daf', he: 'דף', defEn: 'A two-sided page of Talmud (2a, 2b…); Daf Yomi is one a day.', defHe: 'דף דו־צדדי של תלמוד (ב ע"א, ב ע"ב…); דף יומי הוא דף אחד ליום.' },
  { en: 'Mitzvah', he: 'מצווה', defEn: 'A commandment; colloquially, a good deed.', defHe: 'ציווי מהתורה; בלשון הדיבור, מעשה טוב.' },
  { en: 'Siddur', he: 'סידור', defEn: 'The prayer book, with the daily and Shabbat services.', defHe: 'ספר התפילה, עם תפילות החול והשבת.' },
];

export const FIVE_MINUTE_READS = [
  { ref: 'Genesis 1', minutes: 5, title: { en: 'Creation', he: 'בריאת העולם' }, blurb: { en: 'Seven days, from light to rest.', he: 'שבעה ימים, מהאור ועד המנוחה.' } },
  { ref: 'Deuteronomy 6:4-9', minutes: 2, title: { en: 'The Shema', he: 'קריאת שמע' }, blurb: { en: 'Six verses said twice a day.', he: 'שישה פסוקים שאומרים פעמיים ביום.' } },
  { ref: 'Psalms 23', minutes: 1, title: { en: 'Psalm 23', he: 'מזמור כ"ג' }, blurb: { en: '“The Lord is my shepherd.”', he: '״ה׳ רועי לא אחסר״.' } },
  { ref: 'Pirkei Avot 1', minutes: 5, title: { en: 'Ethics of the Fathers, ch. 1', he: 'פרקי אבות, פרק א' }, blurb: { en: 'Hillel: “If I am not for myself, who will be for me?”', he: 'הלל: ״אם אין אני לי, מי לי?״' } },
  { ref: 'Ecclesiastes 3:1-8', minutes: 2, title: { en: 'A time for everything', he: 'לכל זמן ועת' }, blurb: { en: 'The famous poem of seasons.', he: 'השיר המפורסם על העיתים.' } },
  { ref: 'Ruth 1', minutes: 5, title: { en: 'Ruth, ch. 1', he: 'רות, פרק א' }, blurb: { en: '“Where you go, I will go.”', he: '״אל אשר תלכי אלך״.' } },
];

/** Top-level category → one great ref to open (newcomer "where to start"). */
export const WHERE_TO_START = {
  Tanakh: 'Genesis 1',
  Mishnah: 'Pirkei Avot 1',
  Talmud: 'Berakhot 2a',
  Midrash: 'Bereshit Rabbah 1',
  Halakhah: 'Shulchan Arukh, Orach Chayim 1',
  Kabbalah: 'Sefer Yetzirah 1',
  Liturgy: 'Pesach Haggadah, Kadesh',
  'Jewish Thought': 'Kuzari 1:1',
  Tosefta: 'Tosefta Berakhot 1',
  Chasidut: 'Likutei Moharan 1',
  Musar: 'Mesilat Yesharim 1',
  'Second Temple': 'Ben Sira 1',
};

export const TOPIC_PICKS = [
  { slug: 'shabbat', title: { en: 'Shabbat', he: 'שבת' } },
  { slug: 'teshuvah', title: { en: 'Repentance', he: 'תשובה' } },
  { slug: 'prayer', title: { en: 'Prayer', he: 'תפילה' } },
  { slug: 'torah-study', title: { en: 'Torah study', he: 'תלמוד תורה' } },
  { slug: 'tzedakah', title: { en: 'Tzedakah', he: 'צדקה' } },
  { slug: 'justice', title: { en: 'Justice', he: 'צדק' } },
  { slug: 'creation', title: { en: 'Creation', he: 'בריאה' } },
  { slug: 'love', title: { en: 'Love', he: 'אהבה' } },
];

/** `/api/calendars` item title (en) → one-line explainer for newcomers. */
export const CALENDAR_EXPLAINERS = {
  'Parashat Hashavua': { en: 'The weekly Torah portion read in synagogue; the whole Torah every year.', he: 'פרשת השבוע הנקראת בבית הכנסת; כל התורה בכל שנה.' },
  Haftarah: { en: 'A reading from the Prophets that accompanies the parasha.', he: 'קריאה מהנביאים המלווה את הפרשה.' },
  'Daf Yomi': { en: 'One page of Talmud a day; the whole Talmud in about seven and a half years.', he: 'דף תלמוד אחד ביום; כל התלמוד בכשבע שנים וחצי.' },
  929: { en: 'One chapter of Tanakh a day, five days a week; all 929 chapters in about three and a half years.', he: 'פרק תנ"ך אחד ביום, חמישה ימים בשבוע; כל 929 הפרקים בכשלוש שנים וחצי.' },
  'Daily Mishnah': { en: 'Two mishnayot a day; the whole Mishnah in about six years.', he: 'שתי משניות ביום; כל המשנה בכשש שנים.' },
  'Daily Rambam': { en: 'One chapter a day of Maimonides’ law code, the Mishneh Torah.', he: 'פרק אחד ביום מספר ההלכה של הרמב"ם, משנה תורה.' },
  'Daily Rambam (3 Chapters)': { en: 'Three chapters a day of the Mishneh Torah; the whole code in a year.', he: 'שלושה פרקים ביום ממשנה תורה; כל הספר בשנה.' },
  'Daf a Week': { en: 'One page of Talmud a week, for a slower, deeper pace.', he: 'דף תלמוד אחד בשבוע, בקצב איטי ומעמיק יותר.' },
  'Halakhah Yomit': { en: 'A few paragraphs of practical Jewish law a day, from the Shulchan Arukh.', he: 'כמה סעיפים של הלכה למעשה ביום, מהשולחן ערוך.' },
  'Arukh HaShulchan Yomi': { en: 'A daily portion of the Arukh HaShulchan, a 19th-century law code.', he: 'מנה יומית מערוך השולחן, ספר הלכה מהמאה ה־19.' },
  'Tanakh Yomi': { en: 'A daily cycle through the Prophets and Writings by traditional divisions.', he: 'מחזור יומי בנביאים ובכתובים לפי החלוקה המסורתית.' },
  'Chok LeYisrael': { en: 'A daily sampler: Torah, Prophets, Mishnah, Talmud, Zohar and law for the week’s parasha.', he: 'מנה יומית מעורבת: תורה, נביאים, משנה, גמרא, זוהר והלכה לפי פרשת השבוע.' },
  'Tanya Yomi': { en: 'A daily portion of the Tanya, the foundational work of Chabad Chasidut.', he: 'מנה יומית מספר התניא, ספר היסוד של חסידות חב"ד.' },
  'Yerushalmi Yomi': { en: 'One page of the Jerusalem Talmud a day.', he: 'דף אחד ביום מהתלמוד הירושלמי.' },
};
