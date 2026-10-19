/**
 * A curated glossary of common terms (EN + HE, one-line definitions) and the matcher that finds
 * them in a selected segment. Matching is by word boundary in English (variants and plurals) and
 * by consonantal form in Hebrew, allowing one or two prefix letters (ו, ה, ב, ל, מ, ש, כ).
 */
import { plainText, stripHebrewMarks } from '../../reader/textData';

const term = (id, en, he, enMatch, heMatch, defEn, defHe) => ({ id, en, he, enMatch, heMatch, def: { en: defEn, he: defHe } });

export const GLOSSARY = [
  term('torah', 'Torah', 'תורה', ['torah'], ['תורה'], 'The Five Books of Moses; more broadly, all Jewish teaching.', 'חמשת חומשי התורה; בהרחבה, כלל הלימוד היהודי.'),
  term('tanakh', 'Tanakh', 'תנ״ך', ['tanakh', 'tanach', 'hebrew bible'], ['תנך', 'תנ"ך'], 'The Hebrew Bible: Torah, Prophets (Nevi\'im) and Writings (Ketuvim).', 'המקרא: תורה, נביאים וכתובים.'),
  term('mitzvah', 'Mitzvah', 'מצווה', ['mitzvah', 'mitzvot', 'mitzvos', 'commandments?'], ['מצוה', 'מצווה', 'מצות', 'מצוות'], 'A commandment: one of the Torah\'s 613 obligations, or a good deed.', 'ציווי מן התורה (אחת מתרי״ג המצוות) או מעשה טוב.'),
  term('halakhah', 'Halakhah', 'הלכה', ['halakhah?', 'halacha', 'halakhic', 'jewish law'], ['הלכה', 'הלכות'], 'Jewish law: the practical rules derived from the Torah by the rabbis.', 'הדין היהודי המעשי, כפי שנגזר מן התורה בידי חכמים.'),
  term('aggadah', 'Aggadah', 'אגדה', ['aggadah?', 'aggadic', 'aggadot'], ['אגדה', 'אגדות'], 'The non-legal side of rabbinic literature: stories, ethics and theology.', 'החלק הלא־הלכתי בספרות חז״ל: סיפורים, מוסר ומחשבה.'),
  term('mishnah', 'Mishnah', 'משנה', ['mishnah?', 'mishna', 'mishnayot'], ['משנה', 'משניות', 'מתניתין'], 'The first written code of the Oral Torah, edited around 200 CE.', 'הקובץ הכתוב הראשון של התורה שבעל־פה, נערך בסביבות שנת 200 לספירה.'),
  term('talmud', 'Talmud', 'תלמוד', ['talmud', 'talmudic'], ['תלמוד'], 'The Mishnah together with the Gemara, the rabbis\' discussion of it (Babylonian and Jerusalem).', 'המשנה יחד עם הגמרא, דיוני החכמים עליה (בבלי וירושלמי).'),
  term('gemara', 'Gemara', 'גמרא', ['gemara'], ['גמרא'], 'The rabbinic discussion of the Mishnah that makes up most of the Talmud.', 'דיוני האמוראים על המשנה, עיקר התלמוד.'),
  term('tanna', 'Tanna', 'תנא', ['tanna', 'tannaim', 'tannaitic'], ['תנא', 'תנאים'], 'A rabbi of the Mishnah\'s era (roughly 10–220 CE).', 'חכם מתקופת המשנה (בערך 10–220 לספירה).'),
  term('amora', 'Amora', 'אמורא', ['amora', 'amoraim', 'amoraic'], ['אמורא', 'אמוראים'], 'A rabbi of the Gemara\'s era (roughly 220–500 CE).', 'חכם מתקופת הגמרא (בערך 220–500 לספירה).'),
  term('sugya', 'Sugya', 'סוגיא', ['sugya', 'sugyot'], ['סוגיא', 'סוגיה', 'סוגיות'], 'A unit of Talmudic discussion on one question.', 'יחידת דיון תלמודית בשאלה אחת.'),
  term('baraita', 'Baraita', 'ברייתא', ['baraita', 'baraitot'], ['ברייתא', 'ברייתות', 'תניא'], 'A teaching from the Mishnah\'s era that was left out of the Mishnah.', 'משנה חיצונית: הוראה מתקופת התנאים שלא נכללה במשנה.'),
  term('midrash', 'Midrash', 'מדרש', ['midrash', 'midrashim', 'midrashic'], ['מדרש', 'מדרשים'], 'Rabbinic interpretation of Scripture, legal or narrative.', 'פרשנות חז״ל למקרא, הלכתית או סיפורית.'),
  term('parashah', 'Parashah', 'פרשה', ['parashah?', 'parsha', 'torah portion'], ['פרשה', 'פרשת'], 'The weekly Torah portion read in synagogue.', 'קטע התורה הנקרא בבית הכנסת מדי שבוע.'),
  term('haftarah', 'Haftarah', 'הפטרה', ['haftarah?', 'haftorah'], ['הפטרה'], 'The reading from the Prophets that follows the Torah reading.', 'הקריאה מן הנביאים שאחרי קריאת התורה.'),
  term('shabbat', 'Shabbat', 'שבת', ['shabbat', 'shabbos', 'sabbath'], ['שבת', 'שבתות'], 'The seventh day: rest from Friday evening to Saturday night.', 'יום המנוחה השביעי, מערב שישי עד מוצאי שבת.'),
  term('shema', 'Shema', 'שמע', ['shema'], ['שמע', 'קריאת שמע'], 'The declaration "Hear, O Israel" (Deuteronomy 6:4), recited morning and evening.', 'הכרזת "שמע ישראל" (דברים ו:ד), הנאמרת בבוקר ובערב.'),
  term('amidah', 'Amidah', 'עמידה', ['amidah', 'shemoneh esrei', 'eighteen blessings'], ['עמידה', 'שמונה עשרה'], 'The central standing prayer of every service, also called the Shemoneh Esrei.', 'התפילה המרכזית הנאמרת בעמידה בכל תפילה, הקרויה גם שמונה עשרה.'),
  term('berakhah', 'Berakhah', 'ברכה', ['berakhah?', 'berachah?', 'blessings?', 'brachah?'], ['ברכה', 'ברכות'], 'A blessing, usually beginning "Blessed are You…".', 'נוסח שבח הפותח בדרך כלל ב"ברוך אתה…".'),
  term('tefillah', 'Tefillah', 'תפילה', ['tefillah?', 'tefilah', 'prayers?'], ['תפילה', 'תפלה', 'תפילות'], 'Prayer.', 'פנייה אל האל בדיבור, בשבח, בבקשה ובהודיה.'),
  term('shacharit', 'Shacharit', 'שחרית', ['shacharit', 'morning prayer', 'morning service'], ['שחרית'], 'The morning prayer service.', 'תפילת הבוקר.'),
  term('mincha', 'Mincha', 'מנחה', ['minchah?', 'afternoon prayer', 'afternoon service'], ['מנחה'], 'The afternoon prayer service.', 'תפילת אחר הצהריים.'),
  term('maariv', 'Ma\'ariv', 'ערבית', ['ma\'?ariv', 'arvit', 'evening prayer', 'evening service'], ['ערבית', 'מעריב', 'ערבין'], 'The evening prayer service.', 'תפילת הערב.'),
  term('kohen', 'Kohen', 'כהן', ['kohen', 'kohanim', 'cohen', 'priests?', 'priestly'], ['כהן', 'כהנים'], 'A priest, descendant of Aaron, who served in the Temple.', 'צאצא של אהרן ששירת במקדש.'),
  term('levi', 'Levite', 'לוי', ['levites?', 'leviim'], ['לוי', 'לויים', 'לוים'], 'A member of the tribe of Levi, who assisted in the Temple.', 'בן שבט לוי, ששירת במקדש לצד הכהנים.'),
  term('terumah', 'Terumah', 'תרומה', ['terumah?', 'heave offering'], ['תרומה', 'תרומתן', 'תרומות'], 'The portion of produce given to the priests, eaten only in purity.', 'חלק מן היבול הניתן לכהנים ונאכל בטהרה בלבד.'),
  term('maaser', 'Ma\'aser', 'מעשר', ['ma\'?aser', 'tithes?'], ['מעשר', 'מעשרות'], 'A tenth of produce set aside for the Levites, the poor, or for eating in Jerusalem.', 'עשירית מן היבול המופרשת ללויים, לעניים או לאכילה בירושלים.'),
  term('korban', 'Korban', 'קרבן', ['korban', 'korbanot', 'sacrifices?', 'offerings?'], ['קרבן', 'קרבנות'], 'An offering brought in the Temple.', 'מנחה או זבח שהובאו בבית המקדש.'),
  term('temple', 'Beit HaMikdash', 'בית המקדש', ['temple', 'beit hamikdash'], ['בית המקדש', 'מקדש'], 'The Temple in Jerusalem; the First fell in 586 BCE, the Second in 70 CE.', 'המקדש בירושלים; הראשון חרב בשנת 586 לפנה״ס, השני בשנת 70 לספירה.'),
  term('mishkan', 'Mishkan', 'משכן', ['mishkan', 'tabernacle'], ['משכן'], 'The portable sanctuary the Israelites carried through the wilderness.', 'המקדש הנייד שנשאו בני ישראל במדבר.'),
  term('kashrut', 'Kashrut', 'כשרות', ['kashrut', 'kosher'], ['כשר', 'כשרות', 'כשרה'], 'The dietary laws: which foods may be eaten and how.', 'דיני המאכלים המותרים ואופן הכנתם.'),
  term('tumah', 'Tumah and taharah', 'טומאה וטהרה', ['tumah', 'taharah?', 'ritual(?:ly)? (?:im)?pur(?:e|ity)'], ['טומאה', 'טהרה', 'טמא', 'טהור'], 'The Torah\'s categories of ritual impurity and purity.', 'מערכת הטומאה והטהרה שבתורה.'),
  term('teshuvah', 'Teshuvah', 'תשובה', ['teshuvah?', 'repentance'], ['תשובה'], 'Repentance; literally "return".', 'חזרה מן החטא; מילולית: שיבה.'),
  term('tzedakah', 'Tzedakah', 'צדקה', ['tzedakah?', 'charity'], ['צדקה'], 'Charity, from the word for justice.', 'נתינה לנזקקים, משורש צדק.'),
  term('chesed', 'Chesed', 'חסד', ['chesed', 'hesed', 'loving-?kindness'], ['חסד', 'חסדים'], 'Loving-kindness.', 'מעשה טוב הנעשה מתוך אהבה ונדיבות.'),
  term('brit', 'Brit', 'ברית', ['brit', 'bris', 'covenant'], ['ברית'], 'The covenant between God and Israel; also circumcision (brit milah).', 'ההסכם בין האל לישראל; גם ברית המילה.'),
  term('shekhinah', 'Shekhinah', 'שכינה', ['shekhinah?', 'shechinah?', 'divine presence'], ['שכינה'], 'God\'s indwelling presence.', 'נוכחות האל השורה בעולם.'),
  term('olamhaba', 'Olam Haba', 'עולם הבא', ['olam ha-?ba', 'world to come'], ['עולם הבא', 'עוה"ב'], 'The World to Come.', 'העולם שאחרי העולם הזה, גמול הצדיקים.'),
  term('mashiach', 'Mashiach', 'משיח', ['mashiach', 'messiah', 'messianic'], ['משיח'], 'The anointed king awaited to redeem Israel.', 'המלך המשוח שיבוא לגאול את ישראל.'),
  term('galut', 'Galut', 'גלות', ['galut', 'exile', 'diaspora'], ['גלות', 'גולה'], 'Exile; the dispersion of the Jewish people.', 'פיזור עם ישראל מחוץ לארצו.'),
  term('eretz', 'Eretz Yisrael', 'ארץ ישראל', ['eretz yisrael', 'land of israel'], ['ארץ ישראל'], 'The Land of Israel.', 'הארץ שהובטחה לאבות.'),
  term('yetzer', 'Yetzer hara', 'יצר הרע', ['yetzer ha-?ra', 'evil inclination'], ['יצר הרע'], 'The inclination toward evil; its counterpart is the yetzer hatov.', 'הנטייה האנושית לחטוא; מולה עומד יצר הטוב.'),
  term('kiddush', 'Kiddush', 'קידוש', ['kiddush'], ['קידוש'], 'The blessing over wine that sanctifies Shabbat and festivals.', 'הברכה על היין המקדשת את השבת והחג.'),
  term('havdalah', 'Havdalah', 'הבדלה', ['havdalah?'], ['הבדלה'], 'The ceremony that ends Shabbat.', 'הטקס המסיים את השבת.'),
  term('roshhashanah', 'Rosh Hashanah', 'ראש השנה', ['rosh ha-?shanah?', 'new year'], ['ראש השנה'], 'The Jewish New Year, a day of judgement and the shofar.', 'ראש השנה היהודית, יום הדין ותקיעת השופר.'),
  term('yomkippur', 'Yom Kippur', 'יום הכיפורים', ['yom kippur', 'day of atonement'], ['יום הכיפורים', 'יום כיפור', 'יוה"כ'], 'The Day of Atonement, a fast day.', 'יום הכפרה והצום.'),
  term('sukkot', 'Sukkot', 'סוכות', ['sukkot', 'sukkah', 'tabernacles', 'booths?'], ['סוכות', 'סוכה'], 'The autumn harvest festival, when one dwells in a sukkah (booth).', 'חג האסיף שבו יושבים בסוכה.'),
  term('pesach', 'Pesach', 'פסח', ['pesach', 'passover', 'paschal'], ['פסח'], 'Passover, celebrating the Exodus from Egypt.', 'חג יציאת מצרים.'),
  term('shavuot', 'Shavuot', 'שבועות', ['shavuot', 'pentecost'], ['שבועות'], 'The festival of the giving of the Torah, seven weeks after Pesach.', 'חג מתן תורה, שבעה שבועות אחרי פסח.'),
  term('chanukah', 'Chanukah', 'חנוכה', ['chanukah?', 'hanukkah?'], ['חנוכה'], 'The eight-day festival of lights.', 'חג האורים בן שמונת הימים.'),
  term('purim', 'Purim', 'פורים', ['purim'], ['פורים'], 'The festival recalling the rescue told in the Book of Esther.', 'חג ההצלה המסופרת במגילת אסתר.'),
  term('roshchodesh', 'Rosh Chodesh', 'ראש חודש', ['rosh chodesh', 'new moon'], ['ראש חודש', 'ראש חדש'], 'The new moon, start of the Hebrew month.', 'תחילת החודש העברי.'),
  term('shemitah', 'Shemitah', 'שמיטה', ['shemitah?', 'shmita', 'sabbatical year'], ['שמיטה', 'שביעית'], 'The sabbatical year, when the land rests.', 'השנה השביעית שבה הארץ שובתת.'),
  term('tefillin', 'Tefillin', 'תפילין', ['tefillin', 'phylacteries'], ['תפילין', 'תפלין'], 'Leather boxes holding Torah passages, worn on arm and head in prayer.', 'בתים של עור ובהם פרשיות מן התורה, הנקשרים ליד ולראש בתפילה.'),
  term('tzitzit', 'Tzitzit', 'ציצית', ['tzitzit', 'fringes'], ['ציצית'], 'Fringes worn on four-cornered garments.', 'פתילים הנקשרים לבגד בעל ארבע כנפות.'),
  term('mezuzah', 'Mezuzah', 'מזוזה', ['mezuzah?', 'mezuzot'], ['מזוזה', 'מזוזות'], 'A scroll with Torah passages fixed to the doorpost.', 'קלף ובו פרשיות מן התורה הקבוע במשקוף.'),
  term('beitdin', 'Beit din', 'בית דין', ['beit din', 'bet din', 'rabbinic court'], ['בית דין', 'ב"ד'], 'A rabbinic court.', 'בית משפט הדן על פי ההלכה.'),
  term('sanhedrin', 'Sanhedrin', 'סנהדרין', ['sanhedrin'], ['סנהדרין'], 'The high court of 71 sages in the Second Temple era.', 'בית הדין הגדול של שבעים ואחד חכמים בימי הבית השני.'),
  term('minyan', 'Minyan', 'מניין', ['minyan'], ['מנין', 'מניין'], 'The quorum of ten adults for communal prayer.', 'עשרה מבוגרים הדרושים לתפילה בציבור.'),
  term('mikveh', 'Mikveh', 'מקווה', ['mikveh?', 'mikvah', 'ritual bath'], ['מקוה', 'מקווה'], 'A ritual bath.', 'מאגר מים לטבילה של טהרה.'),
  term('ger', 'Ger', 'גר', ['converts?', 'proselytes?', 'gerim'], ['גרים'], 'A convert to Judaism; in the Torah, also a resident stranger.', 'מי שהצטרף לעם ישראל; במקרא גם תושב זר.'),
  term('nazir', 'Nazir', 'נזיר', ['nazir', 'nazirite'], ['נזיר'], 'One who vows to abstain from wine, haircuts and contact with the dead.', 'מי שנדר להימנע מיין, מתספורת וממגע במת.'),
  term('siddur', 'Siddur', 'סידור', ['siddur'], ['סידור', 'סדור'], 'The prayer book.', 'ספר התפילות.'),
  term('kabbalah', 'Kabbalah', 'קבלה', ['kabbalah?', 'kabbalistic'], ['קבלה'], 'Jewish mysticism.', 'תורת הסוד היהודית.'),
  term('yeshiva', 'Yeshiva', 'ישיבה', ['yeshivah?', 'yeshivot'], ['ישיבה', 'ישיבות'], 'An academy of Torah study.', 'בית מדרש ללימוד תורה.'),
  term('pasuk', 'Pasuk', 'פסוק', ['pasuk', 'pesukim', 'verses?'], ['פסוק', 'פסוקים'], 'A verse of the Bible.', 'יחידת היסוד של הטקסט המקראי.'),
  term('ganeden', 'Gan Eden', 'גן עדן', ['gan eden', 'garden of eden', 'paradise'], ['גן עדן'], 'The Garden of Eden; also the heavenly reward of the righteous.', 'הגן שבו שכנו אדם וחוה; גם גמול הצדיקים.'),
];

const HE_PREFIX = '[והבלמשכ]{0,2}';
const heBoundary = s => new RegExp(`(?:^|[^א-ת])${HE_PREFIX}${s}(?:$|[^א-ת])`);

/** Hebrew text without vowels or cantillation (the glossary's matching form). */
export function consonants(text) {
  return stripHebrewMarks(text || '', { vowels: false }).replace(/[׳״]/g, '"');
}

/**
 * Terms found in a selection's text, in order of first appearance: `[{ term, lang, at }]`.
 * `en` and `he` are HTML or plain text; both are searched.
 */
export function detectTerms({ en = '', he = '' } = {}, list = GLOSSARY) {
  const enText = plainText(en);
  const heText = consonants(plainText(he));
  const found = [];
  for (const t of list) {
    let at = Infinity; let lang = null;
    for (const v of t.enMatch) {
      const m = new RegExp(`\\b(?:${v})\\b`, 'i').exec(enText);
      if (m && m.index < at) { at = m.index; lang = 'en'; }
    }
    if (lang === null) {
      for (const v of t.heMatch) {
        const m = heBoundary(v.replace(/"/g, '"?')).exec(heText);
        if (m && m.index < at) { at = m.index; lang = 'he'; }
      }
    }
    if (lang) { found.push({ term: t, lang, at }); }
  }
  return found.sort((a, b) => a.at - b.at || a.term.en.localeCompare(b.term.en));
}

export function findTerm(id) {
  return GLOSSARY.find(t => t.id === id) || null;
}
