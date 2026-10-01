/**
 * Who's who: ~45 figures (EN + HE names, one-line blurbs, Sefaria topic slugs) and the matcher
 * that finds them in a selection. Names are matched by word boundary in English and by
 * consonantal form in Hebrew. Unknown "Rabbi X" patterns can be resolved against the topics API
 * (see WhosWhoTool); the curated list is the offline floor.
 */
import { plainText } from '../../reader/textData';
import { consonants } from './glossary';

const fig = (slug, en, he, enMatch, heMatch, blurbEn, blurbHe, era) => ({ slug, en, he, enMatch, heMatch, blurb: { en: blurbEn, he: blurbHe }, era });

export const FIGURES = [
  fig('adam', 'Adam', 'אדם הראשון', ['adam'], ['אדם הראשון'], 'The first human, formed from the earth and placed in the Garden of Eden.', 'האדם הראשון, שנוצר מן האדמה והושם בגן עדן.', 'bible'),
  fig('eve', 'Eve', 'חוה', ['eve'], ['חוה'], 'The first woman, "mother of all the living".', 'האישה הראשונה, "אם כל חי".', 'bible'),
  fig('noah', 'Noah', 'נח', ['noah'], ['נח'], 'Built the ark and survived the flood with his family and the animals.', 'בנה את התיבה וניצל מן המבול עם משפחתו ובעלי החיים.', 'bible'),
  fig('abraham', 'Abraham', 'אברהם', ['abraham', 'abram'], ['אברהם', 'אברם'], 'The first patriarch, who left his homeland at God\'s call and entered a covenant.', 'אבי האומה, שעזב את מולדתו בציווי האל וכרת עמו ברית.', 'bible'),
  fig('sarah', 'Sarah', 'שרה', ['sarah', 'sarai'], ['שרה', 'שרי'], 'The first matriarch, wife of Abraham and mother of Isaac.', 'האם הראשונה, אשת אברהם ואם יצחק.', 'bible'),
  fig('isaac', 'Isaac', 'יצחק', ['isaac'], ['יצחק'], 'Son of Abraham and Sarah, bound on the altar and spared; father of Jacob and Esau.', 'בן אברהם ושרה, נעקד וניצל; אבי יעקב ועשו.', 'bible'),
  fig('rebecca', 'Rebecca', 'רבקה', ['rebecca', 'rebekah', 'rivka'], ['רבקה'], 'Wife of Isaac; secured the blessing for her son Jacob.', 'אשת יצחק; פעלה למען ברכת בנה יעקב.', 'bible'),
  fig('jacob', 'Jacob', 'יעקב', ['jacob'], ['יעקב'], 'Third patriarch, renamed Israel; father of the twelve tribes.', 'האב השלישי, שנקרא גם ישראל; אבי שנים־עשר השבטים.', 'bible'),
  fig('rachel', 'Rachel', 'רחל', ['rachel'], ['רחל'], 'Jacob\'s beloved wife, mother of Joseph and Benjamin.', 'אשתו האהובה של יעקב, אם יוסף ובנימין.', 'bible'),
  fig('leah', 'Leah', 'לאה', ['leah'], ['לאה'], 'Jacob\'s first wife, mother of six tribes.', 'אשתו הראשונה של יעקב, אם שישה שבטים.', 'bible'),
  fig('joseph', 'Joseph', 'יוסף', ['joseph'], ['יוסף'], 'Sold by his brothers, rose to rule Egypt and saved his family from famine.', 'נמכר בידי אחיו, עלה לגדולה במצרים והציל את משפחתו מן הרעב.', 'bible'),
  fig('judah', 'Judah', 'יהודה', ['judah'], ['יהודה'], 'Fourth son of Jacob, ancestor of King David; the name "Jew" comes from him.', 'בנו הרביעי של יעקב, אבי שושלת דוד; ממנו השם "יהודי".', 'bible'),
  fig('moses', 'Moses', 'משה', ['moses', 'moshe'], ['משה'], 'Led Israel out of Egypt and received the Torah at Sinai.', 'הוציא את ישראל ממצרים וקיבל את התורה בסיני.', 'bible'),
  fig('aaron', 'Aaron', 'אהרן', ['aaron', 'aharon'], ['אהרן', 'אהרון'], 'Moses\' brother and the first High Priest.', 'אחי משה והכהן הגדול הראשון.', 'bible'),
  fig('miriam', 'Miriam', 'מרים', ['miriam'], ['מרים'], 'Prophetess and sister of Moses and Aaron; led the women in song at the sea.', 'נביאה, אחות משה ואהרן; הובילה את הנשים בשירה על הים.', 'bible'),
  fig('pharaoh', 'Pharaoh', 'פרעה', ['pharaoh'], ['פרעה'], 'The king of Egypt; the Exodus story\'s Pharaoh refused to let Israel go.', 'מלך מצרים; פרעה של סיפור יציאת מצרים סירב לשלח את ישראל.', 'bible'),
  fig('joshua', 'Joshua', 'יהושע', ['joshua'], ['יהושע'], 'Moses\' successor, who led Israel into the land.', 'ממשיכו של משה, שהנהיג את ישראל בכניסה לארץ.', 'bible'),
  fig('deborah', 'Deborah', 'דבורה', ['deborah'], ['דבורה'], 'Prophetess and judge who led Israel to victory over Sisera.', 'נביאה ושופטת שהובילה את ישראל לניצחון על סיסרא.', 'bible'),
  fig('ruth', 'Ruth', 'רות', ['ruth'], ['רות'], 'A Moabite who joined Israel; great-grandmother of King David.', 'מואבייה שהצטרפה לעם ישראל; סבתא רבתא של דוד המלך.', 'bible'),
  fig('hannah', 'Hannah', 'חנה', ['hannah'], ['חנה'], 'Prayed silently for a child and became the mother of Samuel; a model for prayer.', 'התפללה בלחש לילד וילדה את שמואל; דגם לתפילה.', 'bible'),
  fig('samuel-(prophet)', 'Samuel', 'שמואל הנביא', ['samuel'], ['שמואל'], 'The prophet who anointed Saul and David as kings.', 'הנביא שמשח את שאול ואת דוד למלכים.', 'bible'),
  fig('king-david', 'David', 'דוד', ['david'], ['דוד'], 'Shepherd, warrior and king of Israel; traditional author of the Psalms.', 'רועה, לוחם ומלך ישראל; מחבר התהילים על פי המסורת.', 'bible'),
  fig('king-solomon', 'Solomon', 'שלמה', ['solomon'], ['שלמה'], 'David\'s son, who built the First Temple and was famed for wisdom.', 'בן דוד, בונה בית המקדש הראשון, הידוע בחכמתו.', 'bible'),
  fig('elijah', 'Elijah', 'אליהו', ['elijah', 'eliyahu'], ['אליהו'], 'Prophet who challenged the prophets of Baal and ascended in a whirlwind.', 'הנביא שהתעמת עם נביאי הבעל ועלה בסערה השמיימה.', 'bible'),
  fig('isaiah', 'Isaiah', 'ישעיהו', ['isaiah'], ['ישעיהו', 'ישעיה'], 'Prophet of Jerusalem whose visions of justice and peace are read as haftarot.', 'נביא ירושלמי שחזונות הצדק והשלום שלו נקראים בהפטרות.', 'bible'),
  fig('jeremiah', 'Jeremiah', 'ירמיהו', ['jeremiah'], ['ירמיהו', 'ירמיה'], 'Prophet who warned of Jerusalem\'s destruction and lamented it.', 'הנביא שהזהיר מפני חורבן ירושלים וקונן עליו.', 'bible'),
  fig('ezekiel', 'Ezekiel', 'יחזקאל', ['ezekiel'], ['יחזקאל'], 'Prophet of the Babylonian exile; saw the divine chariot and the dry bones.', 'נביא גלות בבל; חזה את המרכבה ואת העצמות היבשות.', 'bible'),
  fig('esther', 'Esther', 'אסתר', ['esther'], ['אסתר'], 'Queen of Persia who saved her people; heroine of Purim.', 'מלכת פרס שהצילה את עמה; גיבורת פורים.', 'bible'),
  fig('mordekhai', 'Mordecai', 'מרדכי', ['mordecai', 'mordechai'], ['מרדכי'], 'Esther\'s cousin and guardian, who exposed Haman\'s plot.', 'בן דודה ואומנה של אסתר, שחשף את מזימת המן.', 'bible'),
  fig('hillel', 'Hillel', 'הלל', ['hillel'], ['הלל'], 'Sage of the late Second Temple era, known for patience and leniency.', 'חכם מסוף ימי הבית השני, הידוע בסבלנותו ובהקלותיו.', 'tanna'),
  fig('shammai', 'Shammai', 'שמאי', ['shammai'], ['שמאי'], 'Hillel\'s contemporary and counterpart, known for strictness.', 'בן זמנו ובר הפלוגתא של הלל, הידוע בחומרותיו.', 'tanna'),
  fig('rabban-gamliel', 'Rabban Gamliel', 'רבן גמליאל', ['rabban gamliel', 'rabban gamaliel'], ['רבן גמליאל'], 'Head of the Sanhedrin at Yavneh after the Temple\'s destruction.', 'נשיא הסנהדרין ביבנה לאחר החורבן.', 'tanna'),
  fig('rabbi-eliezer-b-hyrcanus', 'Rabbi Eliezer', 'רבי אליעזר', ['rabbi eliezer(?: ben hyrcanus| b\\. hyrcanus)?'], ['רבי אליעזר'], 'A leading Tanna of the generation after the destruction, famed for his memory.', 'מגדולי התנאים בדור שלאחר החורבן, ידוע בזיכרונו המופלג.', 'tanna'),
  fig('rabbi-yehoshua-b-hananyah', 'Rabbi Yehoshua', 'רבי יהושע', ['rabbi yehoshua', 'rabbi joshua'], ['רבי יהושע'], 'Rabbi Eliezer\'s frequent disputant; a Levite who sang in the Temple.', 'בר הפלוגתא הקבוע של רבי אליעזר; לוי ששר במקדש.', 'tanna'),
  fig('rabbi-akiva', 'Rabbi Akiva', 'רבי עקיבא', ['rabbi akiva', 'rabbi akiba'], ['רבי עקיבא'], 'Began studying at forty and became the greatest Tanna; martyred by Rome.', 'החל ללמוד בגיל ארבעים ונעשה גדול התנאים; מת על קידוש השם.', 'tanna'),
  fig('rabbi-tarfon', 'Rabbi Tarfon', 'רבי טרפון', ['rabbi tarfon'], ['רבי טרפון'], 'A priest and Tanna, colleague of Rabbi Akiva.', 'כהן ותנא, חברו של רבי עקיבא.', 'tanna'),
  fig('rabbi-yishmael-b-elisha', 'Rabbi Yishmael', 'רבי ישמעאל', ['rabbi yishmael', 'rabbi ishmael'], ['רבי ישמעאל'], 'Tanna known for his thirteen principles of interpretation.', 'תנא הידוע בשלוש־עשרה המידות שהתורה נדרשת בהן.', 'tanna'),
  fig('rabbi-meir', 'Rabbi Meir', 'רבי מאיר', ['rabbi meir'], ['רבי מאיר'], 'Student of Rabbi Akiva; anonymous Mishnah teachings are attributed to him.', 'תלמיד רבי עקיבא; "סתם משנה" מיוחסת לו.', 'tanna'),
  fig('shimon-bar-yochai', 'Rabbi Shimon bar Yochai', 'רבי שמעון בר יוחאי', ['rabbi shimon(?: bar| ben| b\\.)? yo[cṛh]ai', 'rabbi shimon'], ['רבי שמעון בר יוחאי', 'רבי שמעון', 'רשב"י'], 'Tanna who hid from Rome in a cave; the Zohar is attributed to him.', 'תנא שהסתתר מפני הרומאים במערה; ספר הזוהר מיוחס לו.', 'tanna'),
  fig('rabi', 'Rabbi Yehuda HaNasi', 'רבי יהודה הנשיא', ['rabbi yehuda ha-?nasi', 'rabbi judah the prince', 'rebbi'], ['רבי יהודה הנשיא', 'רבינו הקדוש'], 'Compiled the Mishnah around 200 CE; called simply "Rabbi".', 'עורך המשנה בסביבות שנת 200 לספירה; מכונה "רבי".', 'tanna'),
  fig('rav', 'Rav', 'רב', ['\\brav\\b(?! [a-z])'], [], 'First-generation Babylonian Amora who founded the academy at Sura.', 'אמורא בבלי מהדור הראשון, מייסד הישיבה בסורא.', 'amora'),
  fig('shmuel-(amora)', 'Shmuel', 'שמואל (אמורא)', ['shmuel', 'samuel(?= said| says)'], [], 'Rav\'s colleague in Babylonia, an authority in civil law and astronomy.', 'חברו של רב בבבל, בר־סמכא בדיני ממונות ובאסטרונומיה.', 'amora'),
  fig('rabbi-yochanan-b-napacha', 'Rabbi Yochanan', 'רבי יוחנן', ['rabbi yo[cḥh]anan'], ['רבי יוחנן'], 'Leading Amora of the Land of Israel; founder of the Tiberias academy.', 'גדול אמוראי ארץ ישראל; מייסד הישיבה בטבריה.', 'amora'),
  fig('rabbi-shimon-b-lakish', 'Reish Lakish', 'ריש לקיש', ['reish lakish', 'resh lakish'], ['ריש לקיש', 'רבי שמעון בן לקיש'], 'Former gladiator who became Rabbi Yochanan\'s study partner and brother-in-law.', 'גלדיאטור לשעבר שהפך לחברותא ולגיסו של רבי יוחנן.', 'amora'),
  fig('abaye', 'Abaye', 'אביי', ['abaye'], ['אביי'], 'Babylonian Amora whose debates with Rava fill the Talmud.', 'אמורא בבלי שמחלוקותיו עם רבא ממלאות את התלמוד.', 'amora'),
  fig('rava', 'Rava', 'רבא', ['rava'], ['רבא'], 'Babylonian Amora; the law usually follows him against Abaye.', 'אמורא בבלי; ההלכה כמותו ברוב מחלוקותיו עם אביי.', 'amora'),
  fig('rav-ashi', 'Rav Ashi', 'רב אשי', ['rav ashi'], ['רב אשי'], 'Headed the Sura academy and began the Talmud\'s final editing.', 'ראש ישיבת סורא, שהחל בעריכת התלמוד.', 'amora'),
  fig('rashi', 'Rashi', 'רש״י', ['rashi'], ['רש"י'], 'Eleventh-century French commentator on the Bible and the Talmud.', 'פרשן המקרא והתלמוד בן המאה האחת־עשרה מצרפת.', 'rishon'),
  fig('rambam', 'Rambam', 'רמב״ם', ['rambam', 'maimonides'], ['רמב"ם'], 'Maimonides: twelfth-century philosopher and codifier of Jewish law.', 'רבי משה בן מימון: פילוסוף ופוסק בן המאה השתים־עשרה.', 'rishon'),
  fig('ramban', 'Ramban', 'רמב״ן', ['ramban', 'nachmanides', 'nahmanides'], ['רמב"ן'], 'Nachmanides: thirteenth-century Catalan commentator and kabbalist.', 'רבי משה בן נחמן: פרשן ומקובל קטלוני בן המאה השלוש־עשרה.', 'rishon'),
  fig('ibn-ezra1', 'Ibn Ezra', 'אבן עזרא', ['ibn ezra'], ['אבן עזרא', 'ראב"ע'], 'Twelfth-century Spanish grammarian and Bible commentator.', 'מדקדק ופרשן מקרא ספרדי בן המאה השתים־עשרה.', 'rishon'),
];

/** Figures named in a selection, in order of first appearance: `[{ figure, lang, at }]`. */
export function detectFigures({ en = '', he = '' } = {}, list = FIGURES) {
  const enText = plainText(en);
  const heText = consonants(plainText(he));
  const found = [];
  for (const f of list) {
    let at = Infinity; let lang = null;
    for (const v of f.enMatch) {
      const m = new RegExp(`\\b(?:${v})\\b`, 'i').exec(enText);
      if (m && m.index < at) { at = m.index; lang = 'en'; }
    }
    if (lang === null) {
      for (const v of f.heMatch) {
        const m = new RegExp(`(?:^|[^א-ת])[ולבשכמ]?${v.replace(/"/g, '"?')}(?:$|[^א-ת])`).exec(heText);
        if (m && m.index < at) { at = m.index; lang = 'he'; }
      }
    }
    if (lang) { found.push({ figure: f, lang, at }); }
  }
  return found.sort((a, b) => a.at - b.at);
}

const TITLE_RE = /\b(Rabbi|Rav|Rabban|Rebbi)\s+([A-Z][a-zḤḥ'’]+(?:\s+(?:bar|ben|b\.)\s+[A-Z][a-z'’]+)?)/g;

/** "Rabbi X" / "Rav X" names in the English text that the curated list did not match. */
export function unknownRabbis(en, known = []) {
  const text = plainText(en);
  const seen = new Set(known.map(f => f.en.toLowerCase()));
  const out = [];
  let m;
  while ((m = TITLE_RE.exec(text)) && out.length < 4) {
    const name = `${m[1]} ${m[2]}`.replace(/\s+/g, ' ');
    const key = name.toLowerCase();
    if (seen.has(key) || FIGURES.some(f => f.enMatch.some(v => new RegExp(`^(?:${v})$`, 'i').test(name)))) { continue; }
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** The first person topic in a `/api/name` response, or null. */
export function personFromName(data) {
  const objs = (data && data.completion_objects) || [];
  const hit = objs.find(o => o.type === 'PersonTopic' || o.type === 'AuthorTopic');
  return hit ? { slug: hit.key, en: hit.title, he: hit.title } : null;
}
