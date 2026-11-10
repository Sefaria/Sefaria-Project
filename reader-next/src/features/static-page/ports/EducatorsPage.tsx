import { ButtonRow, EnBlock, Feature, GreyBox, H2Block, HeBlock, Mount, PageNewsletter, Section, SimpleButton, SimpleInterfaceBlock, Spacer, StaticPageBody, UserQuote } from "./legacy-blocks";

/**
 * /educators, "Teach with Sefaria" (T-F32): the old EducatorsPage (static/js/StaticPages.jsx), which Django's content block only mounts,
 * with the same markup and classes; its newsletter sign-up ("Subscribe from educators") is this client's.
 *
 * @feature STA-012 Educators, Word-by-Word, newsletter and sponsorship pages
 */
const HELP_CENTER_EN = "https://help.sefaria.org/hc/en-us";
const HELP_CENTER_HE = "https://help.sefaria.org/hc/he";
const DARK_BLUE = "#073570"; // static/js/sefaria/palette.js colors.darkblue
const RED = "#802f3e"; // palette colors.red (the second feature's palette.colors.gold does not exist: no border colour, as there)

type Button = [en: string, he: string, href: string, heHref: string];
const buttons = (list: Button[]) =>
  list.map(([en, he, href, heHref]) => <SimpleButton key={en} white rounded={false} tall newTab href={href} he_href={heHref} he={he} en={en} />);

export function EducatorsPage() {
  return (
    <Mount name="Educators">
      <StaticPageBody>
        <div className="staticPageHeader educators">
          <div className="staticPageBlockInner flexContainer">
            <div className="staticPageHeaderTextBox educators">
              <h1>
                <span className="int-en">Teach with Sefaria</span>
                <span className="int-he">מלמדים עם ספריא</span>
              </h1>
              <SimpleInterfaceBlock
                classes="staticPageHeaderText"
                en="Discover the power of digital texts and tools in your classroom. Explore Sefaria’s many resources to enrich teaching and learning in your community."
                he="גלו כיצד להעשיר את הלמידה וההוראה באמצעות מאגר מקורות דיגיטלי. באתר אפשרויות רבות ללומדים:  תוכלו למצוא מקורות, להיפגש עם מגוון של חומרי הוראה ולחזק את התלמידים שלכם כלומדים עצמאיים."
              />
            </div>
          </div>
        </div>
        <GreyBox>
          <H2Block en="Empower and Engage" he="מסע של גילוי" />
          <EnBlock padded>
            <p>
              Empower your students with Sefaria’s free library of digital texts — in Hebrew, English, and many other languages — and use our resources to spark creativity and foster learners’ facility in
              the Jewish library. Discover new ways of teaching and engaging your students in the centuries-old conversation around Jewish texts.
            </p>
          </EnBlock>
          <HeBlock padded>
            <p>
              {" "}
              דמיינו את התלמידים שלכם מטיילים במסדרונות ספריית ענק ושולפים ספרים עתיקים וחדשים בהם מתגלים דמויות, רעיונות ומחשבות מתוך העולם היהודי שנכתבו במשך 3000 שנה. בספריא החלום הופך
              למציאות. הובילו את התלמידים למסע של גילוי ולמידה בין המקורות של ארון הספרים היהודי.
            </p>
          </HeBlock>
          <Spacer />
        </GreyBox>

        <Feature
          enTitle="Educator Spotlight"
          enText="<p>Shifra Elman uses translations and topic pages to widen the lens.</p> <p><b>Who?</b> Shifra Elman, Director of Jewish Life and Learning at Gideon Hausner Jewish Day School in Palo Alto, CA</p><p><b>How?</b> In our introductory ninth-grade class, we emphasize the many Torah translations available on Sefaria. This helps students who don’t know Hebrew avoid over-reliance on a single definition.</p><p><b>Shifra's Top Tip:</b> Topic pages are a valuable starting point for my students. Even if they’re not sure where to begin with a topic, seeing the base text alongside a variety of commentaries and other resources from the Jewish bookshelf helps guide their research.</p>"
          enImg="/static/img/educators-landing-page/shifra-elman-headshot.png"
          enImgAlt="Shifra Elman Headshot"
          heTitle="איך להשתמש באתר?"
          heText='נתחיל בהתחלה: "המדריך למשתמש בספריא" מורכב מיחידות מודרכות בהן נלמדות צעד אחר צעד האפשרויות השונות באתר ספריא. באסופה "ספריא לתלמידים" נמצאות הדרכות על השימוש באתר שמותאמות במיוחד עבור למידה עצמאית של תלמידים. כדי ללמוד ולהכיר חלק מסוים באתר תוכלו להשתמש באסופה של "שאלות נפוצות".'
          heImg="/static/img/educators-landing-page/teaching-with-sefaria-library-heb.png"
          heImgAlt="Professional Development"
          borderColor={DARK_BLUE}
        />

        <ButtonRow white>
          {buttons([
            ["Get Sefaria for Educators", "מדריך למשתמש בספריא", "/newsletter", "/newsletter"],
            ["Past Educator Newsletter", "ספריא לתלמידים", "/collections/educator-newsletters?tab=sheets", "/collections/educator-newsletters?tab=sheets"],
            ["Share a Teaching Tip", "שאלות נפוצות", "mailto:education@sefaria.org", HELP_CENTER_HE],
          ])}
        </ButtonRow>

        <Feature
          enTitle="Resources for Educators"
          enText="Stay up to date with the latest news and resources from Sefaria. Learn from other educators’ experiences teaching and using Sefaria’s resources, and get inspired to try new things in your work. Get informed about all of the new texts added to the library and teach your students to be effective Sefaria users using the student course."
          enImg="/static/img/educators-landing-page/sefaria-for-educators.png"
          enImgAlt="Resources for Educators"
          heTitle="מערכי שיעור וחומרי הוראה"
          heText="צוות החינוך של ספריא יצר ואסף עבורכם המורים, חומרי הוראה בעזרתם תוכלו להעשיר ולהעמיק את הלמידה. <br><br>לפניכם אסופה של מערכי שיעור בנושאים שונים, הצעה לתהליך של עבודת חקר באמצעות ספריא ורעיונות להערכה חלופית."
          heImg="/static/img/educators-landing-page/369968.png"
          heImgAlt=""
        />

        <ButtonRow white>
          {buttons([
            [
              "Get New Text Updates",
              "10 רעיונות להערכה חלופית",
              "https://sefaria.formstack.com/forms/monthly_new_text_roundup?utm_source=sefaria&utm_medium=landingpage&utm_campaign=educators",
              "https://chiburim.sefaria.org.il/sheets/281661?lang=he",
            ],
            [
              "Sefaria in Action",
              "עבודת חקר: מסע בין מקורות",
              "/sheets/311116?lang=bi&utm_source=sefaria&utm_medium=landingpage&utm_campaign=educators",
              "https://www.sefaria.org.il/collections/%D7%A2%D7%91%D7%95%D7%93%D7%AA-%D7%97%D7%A7%D7%A8-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90-%D7%9E%D7%A1%D7%A2-%D7%91%D7%99%D7%9F-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA",
            ],
            ["For Your Students", "מערכי שיעור", "/sheets/311291?lang=bi", "https://chiburim.sefaria.org.il/sheets/361593?lang=he"],
          ])}
        </ButtonRow>
        <Feature
          enTitle="Sefaria for Educators How-Tos"
          enText="Explore our Help Center to find answers to your questions about Sefaria. Have a text or translation you'd like to see added to the library? Fill out our text request form. For a convenient way to create materials, try Sefaria for Google Docs, an extension for adding sources from the library directly into your Docs."
          enImg="/static/img/educators-landing-page/help-center-for-educators.png"
          enImgAlt="Sefaria for Educators How-Tos"
          heTitle="גם את זה יש בספריא! אל תחמיצו!"
          heText='מאגר ספריא הוא גדול ובתוכו אפשרויות לימוד רבות. מוזמנים לעיין באסופות מעניינות ושימושיות, להכיר את עמוד הקהילה והתכנים שבו וגם לגלות את "הסודות של ספריא"'
          heImg="/static/img/educators-landing-page/228260.png"
          heImgAlt=""
          borderColor={RED}
        />

        <ButtonRow white>
          {buttons([
            ["Help Center", "אסופות מומלצות", HELP_CENTER_EN, "https://voices.sefaria.org.il/sheets/360599?lang=he"],
            [
              "Request New Resources",
              "עמוד הקהילה",
              "https://sefaria.formstack.com/forms/text_request_feedback?utm_source=sefaria&utm_medium=landingpage&utm_campaign=educators",
              "https://www.sefaria.org.il/community",
            ],
            ["Sefaria for Google Docs", "הסודות של ספריא", "/sheets/529099?lang=bi&utm_source=sefaria&utm_medium=landingpage&utm_campaign=educators", "https://chiburim.sefaria.org.il/sheets/228260.2?lang=he"],
          ])}
        </ButtonRow>

        <GreyBox>
          <H2Block en="Get in touch" he="אנחנו רוצים לשמוע מכם" />
          <EnBlock padded>
            <p>
              Was your teaching enhanced by Sefaria? Did you have a “Sefaria moment” with your students? Share it with us! We love to hear how educators are using Sefaria in the field and we learn from
              the feedback we receive. We are also available to answer all of your Sefaria questions. Write to us at <a href="mailto:education@sefaria.org">education@sefaria.org</a>.
            </p>
          </EnBlock>
          <HeBlock padded>
            <p>
              אנחנו לומדים רבות ממורים ותלמידים שמספרים לנו על ההתנסות שלהם עם ספריא. נשמח מאד אם תשתפו אותנו בחוויית הלימוד שלכם. אתם מוזמנים ליצור איתנו קשר כדי לתאם הדרכה למורים וגם
              לתלמידים, לספר לנו על חוויית הלמידה עם ספריא ולהתייעץ איתנו בכל דבר ועניין
            </p>
            <p>כתבו לנו לכתובת המייל hello@sefaria.org</p>
          </HeBlock>
          <Spacer />
        </GreyBox>

        <H2Block en="What the educators have to say…" he="מורים ותלמידים ממליצים" />

        <EnBlock>
          <Section>
            <UserQuote
              heText=""
              enText="As an educator, I have come to appreciate Sefaria more and more. I now make sure to expose all of my students to what Sefaria has to offer. I show them how to use Sefaria to make source sheets. <b>I love hearing their excitement as they realize how easy it is to make a sheet on Sefaria and how organized their final products look.</b> They also are impressed at how Sefaria helps them do research by finding sources that connect to their topic. I am grateful that Sefaria is there to provide Torah resources to my students after they complete their formal Jewish education. Overall, the experience of using Sefaria with my students has been very positive!"
              enName="Sarit Anstandig | High School Judaics Teacher | Farber Hebrew Day School"
              heName=""
              image="/static/img/educators-landing-page/sarit anstandig.png"
            />
            <UserQuote
              enText="I really appreciate Sefaria. I use it all the time studying for tests, doing homework, doing learning on my own or even preparing for a seminary interview. <b>The fact that I can quickly and easily find whatever I need wherever I am and understand and study it is incredible.</b> I'm so so grateful for Sefaria. I've introduced all my friends to it and they all use it now too."
              heText=""
              enName="Anonymous day school student"
              heName=""
              image="/static/img/educators-landing-page/anonymous.png"
            />
            <UserQuote
              heText=""
              enText="Digital learning is making its way into all aspects of our students' education and learning, and if we are not on the train we will lose the hearts and minds of our students. We risk Torah being viewed as antiquated if it does not respond to our students' way of thinking about the world. Equally important, there are tools at our disposal which can enhance the experience of learning Torah and it would be malpractice not to see them. Through Sefaria's innovative educational features, my students' learning has been greatly enhanced. <b>We owe it to our students, and to ourselves, to make the most of this platform and to help make it better.</b>"
              enName="Leib Zalesch | Judaic Studies Teacher | Beth Tfiloh Dahan Community School"
              heName=""
              image="/static/img/educators-landing-page/Leib Pic Prof.png"
            />
            <UserQuote
              enText="Students have exposure to so many more commentaries than they would have in the past because of Sefaria and online texts. What I like most about Sefaria is the ability to compare and contrast texts clearly with the text side by side. It is a very powerful tool in the classroom and allows students to be more active in the learning process. Sefaria has also enhanced the level of sophistication of student project based learning."
              heText=""
              enName="Yael Goldfischer | Chair: Chumash Department | The Frisch School"
              heName=""
              image="/static/img/educators-landing-page/Yael Goldfischer.png"
            />
          </Section>
        </EnBlock>

        <HeBlock>
          <Section>
            <UserQuote
              heText='מצאתי ש-"ספריא" היא דרך טובה להמחיש לתלמידים את מה שהתגלה לנו והפעים אותנו, ומה שאנחנו לפעמים מתקשים להסביר להם: שהיהדות היא מארג שלם של הקשרים, שאינו מפסיק ליצור ולהתקיים. ב-"ספריא" ההקשרים האלה נראים לעין, מתגלים בקליק, ולוקחים את התלמיד/ה איתם למסע מסחרר שאינו נגמר: דבר מוביל לדבר, דבר קשור לדבר: פסוק לפרשנות, למדרש, לדף לימוד, לשיר עכשווי שבו מצוטט פסוק, שגם עליו יש מדרש, וכך הלאה וכך הלאה. "ספריא" היא המחשה של העושר הבלתי-נתפס של היצירה היהודית, והיא גם הזמנה לקחת בו חלק ולהוסיף את החוליה שלך לשלשלת הזהב.'
              enText=""
              enName=""
              heName='יורם גלילי, מורה לתושב"ע, מנחה מורים במשרד החינוך ובתכנית בארי של מכון הרטמן'
              image="/static/img/educators-landing-page/yoram-galil.png"
            />
            <UserQuote
              enText=""
              heText="עבורי ספריא הוא מרחב פעילות חינוכי רב ענפים, בית מדרש דיגיטלי שלם. משמש עבורי כספריה  ללימוד ולהכנת חומרי לימוד ודפי מקורות  לתלמידיי. עבור תלמידיי זה המקום שאליו נכנסים לחפש, לקרא ולבנות דפי מקורות אותם הם לומדים בחברותא ומלמדים את חבריהם.    דבר גדול הוא שתלמיד נכנס כל פעם להיכל, לספריה שלמה מחפש ומדפדף  ואגב כך  נחשף לעושר גדול - זה דבר חשוב מאין כמותו. כך  שלפעמים מחפשים אתונות ומוצאים מלוכה."
              enName=""
              heName='איציק רבי, מורה ומדריך ארצי לתושב"ע ומשפט עברי בחינוך הממלכתי, מנחה להוראת תרבות יהודית ישראלית בתכנית בארי של מכון הרטמן'
              image="/static/img/educators-landing-page/izhak-rabi.png"
            />
            <UserQuote
              heText='אני משתמשת בספריא לא פעם כמורה - לעתים בהכנת השיעורים בעצמי , אבל בעיקר - ככלי מעשי עבור התלמידות: עבור גישה לפרשנים ומקורות שלא נגישים להן בכיתה או בבית, להדגמת הקישוריות בין סוגיות בגמרא לבין פסיקת ההלכה, להיכרות עם הדמויות המוזכרות במקורות חז"ל, ועוד. הכלי של דפי מקורות הוא נהדר כפרוייקט הערכה חלופית - תהליך של איתור חומרים, חשיבה על היחס ביניהם, והגעה לתוצר שיכול להיות מעניין גם לחברותיהן לכיתה וגם לציבור הרחב דרך האתר.'
              enText=""
              enName=""
              heName='אביגיל גרוס-גלמן, מובילה רוחנית בתיכון "פלך" לבנות בזכרון יעקב'
              image="/static/img/educators-landing-page/avigail-gross.png"
            />
          </Section>
        </HeBlock>

        <div className="staticPageCallToActionFooter">
          <div className="staticPageBlockInner flexContainer">
            <SimpleInterfaceBlock classes="callToActionText" en="Sign up for our mailing list to get updates in your inbox" he="קבלו עדכונים והפניות למקורות מעניינים" />
            <div style={{ width: "200px", textAlign: "end" }}>
              <PageNewsletter contextName="educators" />
            </div>
          </div>
        </div>
      </StaticPageBody>
    </Mount>
  );
}

