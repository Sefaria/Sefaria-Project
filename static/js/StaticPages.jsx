const React      = require('react');
const {
    SimpleInterfaceBlock,
    NewsletterSignUpForm,
}                   = require('./Misc');
const classNames = require('classnames');


/*  Templates:

        <Header
            enTitle=""
            enText=""
            enImg="/static/img/"
            enImgAlt=""
            enActionURL={null}
            enActionText={null}
            heTitle=""
            heText=""
            heImg="/static/img/"
            heImgAlt=""
            heActionURL={null}
            heActionText={null}
        />

        <H2Block
            en=""
            he=""
        />

        <EnBlock padded={true}>
            {Any content}
        </EnBlock

        <HeBlock padded={true}>
            {Any content}
        </HeBlock>

        <Feature
            enTitle=""
            enText=""
            enImg="/static/img/"
            enImgAlt=""
            heTitle=""
            heText=""
            heImg="/static/img/"
            heImgAlt=""
            borderColor="#"
        />

        <About
            enTitle=""
            heTitle=""
            enText=""
            heText=""
            backgroundColor=""
        />




 */
const ContestLandingPage = () => (
    <StaticPage>
        <Header
            enTitle="Powered by Sefaria Contest"
            enText="Advance the frontiers of tech and Torah this summer. Build something new using our free data or API."
            enImg="/static/img/contest-landing-page/codemockup3.png"
            enImgAlt=""
            enActionURL="http://sefaria.nationbuilder.com/contest"
            enActionText="Register to Join"
            heTitle="תחרות פיתוח תוכנה"
            heText="הצטרפו אלינו לאתגר שיקדם את תחום התורה והטכנולוגיה בבניית תוצר יצירתי ועצמאי בעזרת המאגר החופשי וממשק ה־API של ספריא."
            heImg="/static/img/contest-landing-page/codemockup3.png"
            heImgAlt=""
            heActionURL="http://sefaria.nationbuilder.com/contest"
            heActionText="הרשמה לתחרות"
        />

        <H2Block en="The Contest" he="התחרות"/>
        <EnBlock padded={true}>
            <p>Sefaria offers a free digital dataset of Jewish texts, translations, and interconnections that is open for anyone to reuse in novel ways. Over the years dozens of third parties have created apps, visualizations, and done research using our data or API. We’ve seen some incredible projects and we’d love to see what else our community can dream up.</p>
            <p>What you create is up to you. It could be a functioning web app or just a compelling demo; an interactive visualization or just a question that digs into data quantitatively in search of an answer; something useful and impactful to the world of learning, or just a crazy experiment that fascinates you without a clear application. <b>The only criteria being that it prominently makes use of the data that Sefaria has to offer.</b></p>
            <p>To get your ideas flowing, here are three great examples of projects using Sefaria’s data or API that were created in the last few years. You can find dozens more on our "<a href="https://github.com/Sefaria/Sefaria-Project/wiki/Projects-Powered-by-Sefaria">Powered by Sefaria</a>" list on Github.</p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>ספריא מציעה מאגר נתונים דיגיטלי חופשי של טקסטים יהודיים, תרגומים וקישורים, וכל אלה פתוחים לכל מי שרוצה לעשות בהם שימוש יצירתי. במהלך השנים עשרות משתמשים יצרו יישומונים והמחשות וביצעו מחקרים באמצעות שימוש בנתונים וב־API של ספריא. התוודענו לכמה מיזמים מדהימים, ונשמח לראות אילו עוד חלומות הקהילה שלנו יכולה להגשים.</p>
            <p>הרעיון תלוי בכם: תוכלו ליצור יישומון פעיל או מיצג משכנע; המחשה אינטראקטיבית או שאלה שפתרונה יימצא בנתונים כמותיים במאגרים של ספריא; משהו יעיל שישפיע על עולם הלימוד או ניסוי מטורף שמרתק אתכם בלי אפליקציה ברורה.
                &nbsp;<b>הקריטריון היחיד להשתתפות בתחרות הוא שימוש בנתונים של ספריא.</b>
            </p>
            <p>לפני שאתם מתחילים להעלות רעיונות, הינה שלוש דוגמאות נהדרות של מיזמים שעושים שימוש בנתונים או בממשק ה־API של ספריא משנים קודמות. תוכלו למצוא עוד עשרות דוגמאות של מיזמים ברשימת
                "<a href="https://github.com/Sefaria/Sefaria-Project/wiki/Projects-Powered-by-Sefaria">Powered by Sefaria</a>"
                באתר Github.</p>
        </HeBlock>

        <ButtonRow>
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://talmud.dev/"
                he_href="https://talmud.dev/"
                he="talmud.dev"
                en="talmud.dev"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://github.com/shman/SefariaAddOn-Google"
                he_href="https://github.com/shman/SefariaAddOn-Google"
                he="התוסף של ספריא לגוגל דוקס (Google Docs)"
                en="Google Docs Sefaria Add-on"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://www.sefaria.org/explore"
                he_href="https://www.sefaria.org.il/explore"
                he="Sefaria’s Link Explorer"
                en="Sefaria’s Link Explorer"
            />
        </ButtonRow>


        <H2Block en="Timeline and Prize" he="לוח זמנים ופרסים" />
        <EnBlock padded={true}>
            <p>We'll be accepting submissions from Wednesday, July 1 until Monday, August 31st. To participate, you just need to send us a URL and a short description of what you've made.</p>
            <p>A jury will select two projects to win cash prizes: $5,000 for the grand prize, and $3,600 for the student prize for work created by undergraduate students or younger, or people under the age of 23.</p>
            <p>A selection of completed projects will also be featured on a contest page and shared with our community.</p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>הגשות תתקבלנה מיום רביעי, 1 ביולי, ועד יום שני, 31 באוגוסט. להשתתפות בתחרות שלחו כתובת URL ותיאור תמציתי של התוצר.</p>
            <p>חבר השופטים שלנו יבחר שני מיזמים: הפרס הראשון בסך $5,000 , והפרס השני בסך 3,600$ יוענק למתכנת/ת צעיר/ה עבור מיזם שיוגש על ידי מי שלומד לתואר ראשון או על ידי צעירים מתחת לגיל 23.</p>
            <p>מבחר מיזמים אחרים שיושלמו, יופיעו אף הם בדף התחרות וישותפו עם קהילת ספריא.</p>
        </HeBlock>

        <H2Block en="Eligibility" he="זכאות" />
        <EnBlock padded={true}>
            <p>The Contest is open to applicants from the United States and Israel. All participants are eligible to enter the grand prize, and those who are eligible for the youth prize may submit their project into both categories. All entrants under the age of 18 must obtain permission from their parent or guardian before entering the contest. <b>To learn more, see our official <a href="https://d3n8a8pro7vhmx.cloudfront.net/sefaria/pages/1085/attachments/original/1594012430/PoweredbySefaria_Contest_Official_Rules.pdf?1594012430">Contest Rules</a>.</b></p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>התחרות פתוחה למועמדים מארצות הברית ומישראל. כל המשתתפים זכאים למועמדות לפרס הראשון, ומועמדים לפרס המתמודד הצעיר יוכלו להגיש את המיזם בשתי הקטגוריות. משתתפים מתחת לגיל 18 נדרשים להביא אישור מהורה או אפוטרופוס כדי להשתתף בתחרות. למידע נוסף עיינו
                &nbsp;<a href="https://d3n8a8pro7vhmx.cloudfront.net/sefaria/pages/1085/attachments/original/1594012430/PoweredbySefaria_Contest_Official_Rules.pdf?1594012430">
                בכללי התחרות הרשמיים
                </a>
                .</p>
        </HeBlock>

        <GreyBox>
            <ImageWithText
                enText="<i>“By open-sourcing a vast array of Jewish texts, Sefaria's API makes programmatic analysis of Jewish tradition simple for the everyday programmer. talmud.page began as my own hand-tailored UI for learning Daf Yomi. The more developers use Sefaria's API to solve creative questions, the richer Jewish learning will be worldwide.”
                        <br/><br/>
                    - Ron Shapiro, <a href='https://talmud.page'>talmud.page</a></i></div>"
                enImg="/static/img/contest-landing-page/AdobeStock_314348719.png"
                enImgAlt=""
                heText='<i>"על-ידי אספקת גישה למגוון עצום של טקסטים יהודיים, ה-API של ספריא מאפשר למתכנת הפשוט לבצע ניתוח פרוגרמטי של המסורת היהודי. talmud.page החל כממשק משתמש בעיצובי ללימוד דף יומי. שימוש רב יותר של מפתחים ב-API של ספריא לפתרון שאלות יצירתיות יעשיר את הלימוד היהודי בכל העולם"
                <br/><br/>
                 - רון שפירא
                 <a href="https://talmud.page">talmud.page</a></i>'
                heImg="/static/img/contest-landing-page/AdobeStock_314348719.png"
                heImgAlt=""
            />
        </GreyBox>

        <H2Block en="Winner Selection" he="בחירת הזוכה" />
        <EnBlock padded={true}>
            <p>Winners will be selected by a panel of three judges. The judges will evaluate each project on the basis of four criteria:</p>
            <ol>
                <li>Highlighting of Jewish texts and their unique value</li>
                <li>Technological accomplishment</li>
                <li>Potential for impact or inspiration</li>
                <li>Creativity</li>
            </ol>
            <p>Projects that existed prior to the call for submission may enter on the basis of additional work added since the time the contest began. Judges will evaluate the projects on the basis of the additional work. Projects don’t have to be 100% complete or polished to enter either; our judges will be happy to see the potential in a promising start. </p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>הזוכים ייבחרו על ידי פאנל של שלושה שופטים. השופטים יבחנו כל פרויקט על בסיס הקריטריונים הבאים:</p>
            <ol>
                <li>דגש על טקסטים יהודיים וערכם המיוחד</li>
                <li>ההישגים הטכנולוגיים שבמיזם</li>
                <li>פוטנציאל ההשפעה או ההשראה הטמון במיזם</li>
                <li>יצירתיות המיזם</li>
            </ol>
            <p>אפשר להגיש מיזמים שהתחילו עוד לפני פרסום הקול קורא, כל עוד תיעשה עבודה נוספת במיזם אחרי שהתחרות כבר החלה. השופטים יעריכו את המיזמים על פי העבודה שהתווספה.</p>
        </HeBlock>

        <H2Block en="Registration" he="הרשמה"/>
        <EnBlock padded={true}>
            <p><a href="http://sefaria.nationbuilder.com/contest">Click here</a> to register your interest in participating so we can keep you up to date as the contest progresses with tools and resources, including engineering office hours where you can ask questions or work out ideas 1:1 with our team. You can register as an individual or team, and sign up at any point between now and the end of the contest.</p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>אם אתם מעוניינים להשתתף בתחרות, לחצו כאן להרשמה, כדי שנוכל לשלוח לכם עדכונים במהלך התחרות בנוגע לכלים ומשאבים, כולל שעות העבודה של המתכנתים שלנו, שתוכלו לשאול אותם שאלות ולהתייעץ איתם על רעיונות אחד־על־אחד. תוכלו להתמודד באופן עצמאי או כחלק מצוות, ולהירשם בכל שלב מעכשיו ועד לסיום התחרות.</p>
        </HeBlock>

        <ButtonRow>
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="http://sefaria.nationbuilder.com/contest"
                he_href="http://sefaria.nationbuilder.com/contest"
                he="טופס הרשמה"
                en="Register"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://drive.google.com/file/d/1-TdCwaxGvGaPPZgEiWoYakqygZLyYtBf/view?usp=sharing"
                he_href="https://drive.google.com/file/d/1-TdCwaxGvGaPPZgEiWoYakqygZLyYtBf/view?usp=sharing"
                he="כללי התחרות"
                en="Official Rules"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://github.com/Sefaria/Sefaria-Project"
                he_href="https://github.com/Sefaria/Sefaria-Project"
                he="GitHub"
                en="GitHub"
            />
        </ButtonRow>
        <CallToActionFooterWithButton
            href="http://sefaria.nationbuilder.com/contest"
            he_href="http://sefaria.nationbuilder.com/contest"
            enText="Let’s Innovate Together"
            heText="בואו נחדש ביחד!"
            enButtonText="Register"
            heButtonText="טופס הרשמה"
        />
    </StaticPage>
);

const SheetsLandingPage = () => (
    <StaticPage>
        <Header
            enTitle="Sheets"
            enText="Mix and match sources from Sefaria’s library of Jewish texts, and add your comments, images and videos."
            enImg="/static/img/sheets-landing-page/sheetspage_headerimage.png"
            enImgAlt="Sefaria Sheets"
            enActionURL="/sheets/new?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
            enActionText="Make a Sheet"
            heTitle="דפי מקורות"
            heText="בחרו לכם מקורות מארון הספרים היהודי של ספריא והוסיפו הערות, תמונות או סרטונים משלכם."
            heImg="/static/img/sheets-landing-page/sheetspage_headerimage_HEB.png"
            heImgAlt="דפי מקורות"
            heActionURL="/sheets/new?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets_HEB"
            heActionText="בנו דף מקורות"
        />
        <GreyBox light={true}>
            <H2Block
                en="Discover new ways to learn & teach"
                he="גלו דרכים חדשות ללמוד וללמד"
            />
        </GreyBox>
        <Feature
            enTitle="Organize Sources"
            enText="Sheets let you mix and match sources from our library. Type in a source title and chapter to add it to your sheet, then edit the source to cut it down or customize  the translation. Use sources in any order you wish. "
            enImg="/static/img/sheets-landing-page/organizesources.jpg"
            enImgAlt="Organize Sources"
            heTitle="סדרו את המקורות"
            heText="דפי מקורות מאפשרים לכם לבחור ולצרף שלל מקורות מהספרייה שלנו. הקלידו את שם המקור ומספר הפרק כדי להוסיף אותו לדף המקורות שלכם. בשלב הבא תוכלו לערוך ולקצר את המקור, לבחור בתרגום אחר ולארגן את המקורות בסדר הרצוי לכם."
            heImg="/static/img/sheets-landing-page/organizesources_HEB.jpg"
            heImgAlt="סדרו את המקורות"
            borderColor="#004E5F"
        />
        <Feature
            enTitle="Add Your Commentary"
            enText="Make it more than sources. You can easily add your own commentary or texts from outside our library to create something new. You can also add images and videos to enhance your reader’s experience even more. "
            enImg="/static/img/sheets-landing-page/commentary_sheet.jpg"
            enImgAlt="Add Your Commentary"
            heTitle="הוסיפו הערות משלכם"
            heText="היצירה שלכם יכולה להיות יותר מרשימת מקורות בלבד. תוכלו בקלות להוסיף הערות, פרשנות והסברים משלכם וכן טקסטים אחרים כדי ליצור משהו חדש. לחוויית לימוד משמעותית יותר תוכלו אפילו להוסיף תמונות וסרטונים."
            heImg="/static/img/sheets-landing-page/addcommentary_HEB.jpg"
            heImgAlt="הוסיפו הערות משלכם"
            borderColor="#CCB479"
        />
        <Feature
            enTitle="Share Your Work"
            enText="You can share your sheet privately with a link, publicly on our site, or print it out for your class. Make your sheet public and add it to our library of over 200,000 user-created sheets. "
            enImg="/static/img/sheets-landing-page/shareyoursheets.jpg"
            enImgAlt="Share Your Work"
            heTitle="שתפו"
            heText="תוכלו לשתף את דף המקורות באופן פרטי בעזרת לינק, להדפיס אותו עבור הכיתה שלכם או להעלות אותו באתר שלנו לתועלת ציבור הגולשים. אתם מוזמנים להוסיף את דף המקורות לספרייה שלנו – תוכלו למצוא בה למעלה מ-200 אלף דפי מקורות שנוצרו על ידי גולשי האתר."
            heImg="/static/img/sheets-landing-page/shareyoursheets_HEB.jpg"
            heImgAlt="שתפו"
            borderColor="#802F3E"
        />
        <Feature
            enTitle="Find Great Resources"
            enText="Browse user-created sheets by topic to research for your next class, learn something new, or to get inspiration for your own sheets. Filter results further by keyword and sort by relevance, views, or creation date."
            enImg="/static/img/sheets-landing-page/sheetssearch.jpg"
            enImgAlt="Find Great Resources"
            heTitle="אתרו מקורות מעולים"
            heText="כדי להעשיר את השיעור הבא שלכם, ללמוד משהו חדש או לחפש השראה לדף מקורות משלכם, דפדפו לפי נושא בדפי מקורות שיצרו משתמשים אחרים. סננו את התוצאות לפי מילות מפתח או לפי רלוונטיות, תצוגה או תאריך."
            heImg="/static/img/sheets-landing-page/sheetssearch_HEB.jpg"
            heImgAlt="אתרו מקורות מעולים"
            borderColor="#5A99B7"
        />
        <H2Block
            en="See what people are making with Sheets"
            he="ראו מה משתמשים אחרים יוצרים בעזרת דפי המקורות שלהם"
        />
        <EnBlock>
            <SheetList>
                <Sheet
                    title="Creation and Consciousness"
                    link="/sheets/17566?lang=bi&utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
                    author="Michael Feuer"
                    image="/static/img/sheets-landing-page/michael.png"
                />
                <Sheet
                    title="Is Love the Death of Duty? A Tanakh Take on the Game of Thrones Maxim"
                    link="/sheets/184685?lang=bi&utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
                    author="Olivia Friedman"
                    image="/static/img/sheets-landing-page/olivia.png"
                />
                <Sheet
                    title="Practical Torah for Time Management"
                    link="/sheets/193023?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
                    author="Loren Berman (Moishe House)"
                    image="/static/img/sheets-landing-page/loren.png"
                />
                <Sheet
                    title="The Four (Thousand) Questions: Cultivating Question-Asking at Your Pesach Seder"
                    link="/sheets/9219?lang=bi&utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
                    author="Dasi Fruchter"
                    image="/static/img/sheets-landing-page/dasi.png"
                />
            </SheetList>
        </EnBlock>
        <HeBlock>
            <SheetList>
                <Sheet
                    title="תפילת הדרך"
                    link="/sheets/216261?lang=he&utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets_HEB"
                    author="אתר מדרשת"
                    image="/static/img/sheets-landing-page/midreshet.png"
                />
                <Sheet
                    title="כיצד למד הבעל שם טוב את התורה?"
                    link="/sheets/112651?lang=he&utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets_HEB"
                    author="יכין אפשטיין (זושא מגלים את הסיפור החסידי)"
                    image="/static/img/sheets-landing-page/yachin.png"
                />
                <Sheet
                    title="ילדים רואים את עצמם כאילו יצאו ממצרים"
                    link="/sheets/222661?lang=he&utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets_HEB"
                    author="חדוה יחיאלי"
                    image="/static/img/sheets-landing-page/hedva.png"
                />
                <Sheet
                    title="מעשה ברבי ישמעאל"
                    link="/sheets/141399?lang=he&utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets_HEB"
                    author="יורם גלילי (בואו נלמד משפט ויושר)"
                    image="/static/img/sheets-landing-page/yoram.png"
                />
            </SheetList>
        </HeBlock>
        <ButtonRow white={true}>
            <SimpleButton
                he="חפשו עוד לפי נושא"
                en="Explore More by Topic"
                href="/topics?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
                he_href="/topics?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets_HEB"
            />
        </ButtonRow>
        <CallToActionFooterWithButton
            href="/sheets/228095?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
            he_href="/sheets/226003?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets_HEB"
            enText="Start creating a sheet today."
            heText="צרו דף מקורות היום"
            enButtonText="How to Create a Sheet"
            heButtonText="איך יוצרים דף מקורות"
        />
    </StaticPage>
);
const RemoteLearningPage = () => (
    <StaticPage>
        <Header
            enTitle="Remote Learning"
            enText="Discover the power of online education. Sefaria is always available to provide foundational Jewish texts, educational materials, and the tools to allow you to engage with dynamic Jewish learning."
            enImg="/static/img/distance-learning-landing-page/remotelearning_headerimage.png"
            enImgAlt="Sefaria on tablet."
            enActionURL={null}
            enActionText={null}
            heTitle="מקורות ללימוד וללמידה מרחוק"
            heText="לומדים רבים ברחבי העולם מגלים את הכוח והפוטנציאל שיש בלמידה מקוונת. אתר ספריא פתוח לכולם בחינם, ומציע מאגר רחב של מקורות יהודיים וכלים מתקדמים להעצמת הלמידה."
            heImg="/static/img/distance-learning-landing-page/remotelearningpage_headerimage_HEB.png"
            heImgAlt="Sefaria on tablet."
            heActionURL={null}
            heActionText={null}
        />
        <GreyBox>
            <H2Block en="Browse our Latest Resources" he="מקורות בספריא" />
        </GreyBox>
        <ButtonRow>
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/groups/Educator-Newsletters?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/219410?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="דפי מקורות אקטואליים"
                en="Educator Newsletters"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/groups/A-Jewish-Response-to-Coronavirus?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/227981.5?lang=he&utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="נגיף הקורונה"
                en="A Jewish Response to COVID-19"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/groups/Online-Learning-Resources?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/228257?lang=he&utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="עשרת הדיברות ללמידה מרחוק"
                en="Online Learning Resources"
            />
        </ButtonRow>
        <GreyBox light={true}>
            <H2Block en="Resources for Everyone" he="לומדים עם ספריא" />
        </GreyBox>
        <Feature
            enTitle="Learners"
            enText="Whether you’re a pro, or a new user, Sefaria has resources to help your virtual study thrive. Join a Sefaria 101 webinar, browse our tutorials, or sign up for the online student training course to up your skills on all things Sefaria. <a href='/register?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning'>Create a free account</a> to track your learning, save texts, and follow users creating things that interest you."
            enImg="/static/img/distance-learning-landing-page/remotelearningpage_learners.png"
            enImgAlt="Source Sheet - Pesach 101"
            heTitle="לומדים עם ספריא"
            heText={
                "ספריא נותנת כלים להעצים את הלימוד המקוון שלכם. השתמשו בוובינרים וב'מדריך למשתמש המתחיל' כדי ללמוד איך להשתמש באתר. "
                + "<a href='/register?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning'>"
                + "צרו חשבון משתמש"
                + "</a>"
                + " כדי לארגן את חומרי הלימוד שלכם, לשמור מקורות ולעקוב אחר חומרים של אנשים אחרים שמעניינים אתכם."
            }
            heImg="/static/img/distance-learning-landing-page/remotelearningpage_learners_HEB.png"
            heImgAlt=""
            borderColor="#004E5F"
        />
        <ButtonRow light={true}>
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/groups/Webinars-for-Learners?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224909?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="וובינרים"
                en="Webinars for Learners"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/groups/Tutorials-for-Learners?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224919?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="מדריך למשתמש המתחיל"
                en="Tutorials for Learners"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/groups/Sefaria-Student-Course?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/228260?lang=he&utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="הסודות של ספריא"
                en="Student Course"
            />
        </ButtonRow>
        <Feature
            enTitle="Educators & Rabbis"
            enText="Sefaria is here to support your online teaching. Our <a href='/educators?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning'>Learning Department</a> has a variety of resources to get you started with distance learning using Sefaria. <a href='/register?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning'>Create a free account</a> to make and assign source sheets to your students, organize your sheets into groups, and save texts."
            enImg="/static/img/distance-learning-landing-page/remotelearningpage_educators.png"
            enImgAlt="Source Sheet - Teaching with Sefaria Online"
            heTitle="מורים ואנשי הוראה"
            heText={"צוות ספריא תומך בהוראה דיגיטלית ובהוראה מרחוק. למדו בעזרת החומרים שצוות החינוך שלנו יצר עבורכם, בכיתה ומחוצה לה. "
                + "<a href='/register?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning'>"
                + "צרו חשבון משתמש"
                + "</a>"
                + ' כדי ליצור דפי מקורות עבורכם או עבור תלמידים, לארגן דפי מקורות ע"פי נושאים ולשמור מקורות נבחרים.'
            }
            heImg="/static/img/distance-learning-landing-page/remotelearningpage_educators_HEB.png"
            heImgAlt=""
            borderColor="#CCB479"
        />
        <ButtonRow light={true}>
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/groups/Webinars-for-Educators?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224909?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="וובינרים"
                en="Webinars for Educators"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/groups/Tutorials-for-Educators?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224923?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="קורס למורים: 'ספריא בכיתה'"
                en="Tutorials for Educators"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/sheets/187032?lang=bi?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/223245?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="טיפים להוראה עם ספריא"
                en="Educator Course"
            />
        </ButtonRow>
        <Feature
            enTitle="Institutions & Organizations"
            enText="Is it time to start incorporating digital texts into your website, blog, or app? Sefaria has you covered. All of our software is open source and our texts are all in the creative commons – meaning you can use anything we have for your own projects. Take a look at these resources and get in touch with your web/app developer to start including Sefaria’s texts on your site."
            enImg="/static/img/distance-learning-landing-page/remotelearningpage_developers.png"
            enImgAlt="Source Sheet - Link Sefaria to your Site"
            heTitle="מוסדות וארגונים"
            heText="האם תרצו להטמיע מקורות דיגיטליים לאתר, לבלוג או לאפליקציה שלכם? ספריא יכולה לסייע לכם. כל המידע שיש באתר הינו בקוד פתוח, ותוכלו להשתמש בכל המקורות של ספריא עבור הפרוייקטים האישיים שלכם. אתם מוזמנים לפנות למפתחים ולמהנדסים שלכם בכדי להשתמש במקורות של ספריא באתר שלכם."
            heImg="/static/img/distance-learning-landing-page/remotelearningpage_developers_HEB.png"
            heImgAlt=""
            borderColor="#802F3E"
        />
        <ButtonRow light={true}>
            <SimpleButton white={true} tall={true} rounded={false} href="/linker?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning" he="לינקר דו צדדי" en="Two-Way Linker"/>
            <SimpleButton white={true} tall={true} rounded={false} href="https://github.com/Sefaria/Sefaria-Project/wiki/Projects-Powered-by-Sefaria" he="אתרים המופעלים ע”י ספריא" en="Powered by Sefaria"/>
            <SimpleButton white={true} tall={true} rounded={false} href="https://github.com/Sefaria/Sefaria-Project/wiki#developers" he="Github גיטהאב" en="GitHub"/>
        </ButtonRow>
        <CallToActionFooterWithNewsletter
            enText="Sign up for our mailing list to get updates in your inbox."
            heText="הרשמו לרשימת התפוצה שלנו על מנת לקבל עדכונים מספריא."
            includeEducatorOption={true}
        />
    </StaticPage>
);

const StaticPage = ({children}) => (
    <div className="staticPage">
        {children}
    </div>
);

const HeBlock = ({children, padded}) => <div className={"int-he" + (padded ? " staticPageBlockInner" : "")}>{children}</div>;
const EnBlock = ({children, padded}) => <div className={"int-en" + (padded ? " staticPageBlockInner" : "")}>{children}</div>;

const GreyBox = ({children, light}) => <div className={light ? "lightgreyBackground" : "greyBackground"}>{children}</div>;

const H2Block = ({en, he, classes}) =>
    <div className="staticPageBlockInner">
        <h2 className="staticPageH2">
            <SimpleInterfaceBlock en={en} he={he} />
        </h2>
    </div>;

const Header = ({enTitle, heTitle, enText, heText, enImg, heImg, enImgAlt, heImgAlt, enActionURL, enActionText, heActionURL, heActionText}) => (
    <div className="staticPageHeader">
        <div className="staticPageBlockInner flexContainer">
            <div className="staticPageHeaderTextBox">
                <h1>
                    <span className="int-en">{enTitle}</span>
                    <span className="int-he">{heTitle}</span>
                </h1>
                <SimpleInterfaceBlock classes="staticPageHeaderText" he={heText} en={enText} />
                {enActionURL ? <SimpleButton en={enActionText} he={heActionText} href={enActionURL} he_href={heActionURL} white={true}/> : null}
            </div>
            <div className="staticPageHeaderImg">
                <img className="int-en" src={enImg} alt={enImgAlt} />
                <img className="int-he" src={heImg} alt={heImgAlt} />
            </div>
        </div>
    </div>
);

/*
    <div className="staticPageHeaderAction">
        <a className="button int-en" href={enActionURL}>{enActionText}</a>
        <a className="button int-he" href={heActionURL}>{heActionText}</a>
    </div>
 */
const SheetList = ({children}) =>
    <div className={"staticPageBlockInner staticPageSheetList"}>
        {children}
    </div>;

const Sheet = ({title,link,author,image}) =>
    <div className="staticPageSheetItem">
        <a href={link}>{title}</a>
        <img src={image}/>
        <span className="staticPageSheetAuthor">{author}</span>
    </div>;

const CallToActionFooterWithButton = ({href, he_href, enText, heText, enButtonText, heButtonText}) => (
    <div className="staticPageCallToActionFooter">
        <div className="staticPageBlockInner flexContainer">
            <SimpleInterfaceBlock classes="callToActionText" en={enText} he={heText} />
            <SimpleButton href={href} he_href={he_href} en={enButtonText} he={heButtonText} white={true}/>
        </div>
    </div>
);
const CallToActionFooterWithNewsletter = ({enText, heText, includeEducatorOption}) => (
    <div className="staticPageCallToActionFooter">
        <div className="staticPageBlockInner flexContainer">
            <SimpleInterfaceBlock classes="callToActionText" en={enText} he={heText} />
            <NewsletterSignUpForm contextName="Distance Learning Static Page" includeEducatorOption={includeEducatorOption} />
        </div>
    </div>
);

const About = ({enTitle, heTitle, enText, heText, backgroundColor}) => (
    <div className={"staticPageAbout" + (backgroundColor == "grey" ? " greyBackground" : "")}>
        <div className="staticPageBlockInner">
            <h2>
                <span className="int-en">{enTitle}</span>
                <span className="int-he">{heTitle}</span>
            </h2>
            <SimpleInterfaceBlock classes="staticPageAboutText" he={heText} en={enText} />
        </div>
    </div>
);

const ImageWithText = ({enText, heText, enImg, heImg, enImgAlt, heImgAlt}) => (
    <div className="feature" style={{backgroundColor: "inherit"}}>
        <div className="staticPageBlockInner flexContainer">
            <div className="featureText" style={{borderTop: 0}}>
                <div className="int-en" dangerouslySetInnerHTML={{__html:enText}} />
                <div className="int-he" dangerouslySetInnerHTML={{__html:heText}} />
            </div>
            <div className="featureImage">
                <img className="int-en" src={enImg} alt={enImgAlt}/>
                <img className="int-he" src={heImg} alt={heImgAlt}/>
            </div>
        </div>
    </div>
);

const Feature = ({enTitle, heTitle, enText, heText, enImg, heImg, enImgAlt, heImgAlt, borderColor}) => (
    <div className="feature">
        <div className="staticPageBlockInner flexContainer">
            <div className="featureText" style={{borderColor: borderColor}}>
                <div className="featureHeader">
                    <h3>
                        <span className="int-en">{enTitle}</span>
                        <span className="int-he">{heTitle}</span>
                    </h3>
                </div>
                <div className="int-en" dangerouslySetInnerHTML={{__html:enText}} />
                <div className="int-he" dangerouslySetInnerHTML={{__html:heText}} />
            </div>
            <div className="featureImage">
                <img className="int-en" src={enImg} alt={enImgAlt}/>
                <img className="int-he" src={heImg} alt={heImgAlt}/>
            </div>
        </div>
    </div>
);

const ButtonRow = ({children, light, white}) => (
    white
        ? <div className="staticPageBlockInner blockVerticalPadding flexContainer">{children}</div>
        : <GreyBox light={light}>
            <div className="staticPageBlockInner blockVerticalPadding flexContainer">{children}</div>
          </GreyBox>
);

const SimpleButton = ({href, he_href, he, en, white, rounded=true, tall=false}) => (
    <div className="simpleButtonWrapper">
        <a href={href} className={classNames({button:1, flexContainer:1, "int-en":1, white: white, tall: tall, rounded:rounded})}>
            <span className="int-en">{en}</span>
        </a>
        <a href={he_href || href} className={classNames({button:1, flexContainer:1, "int-he":1, white: white, tall: tall, rounded:rounded})}>
            <span className="int-he">{he}</span>
        </a>
    </div>
);




module.exports.RemoteLearningPage = RemoteLearningPage;
module.exports.SheetsLandingPage = SheetsLandingPage;
module.exports.ContestLandingPage = ContestLandingPage;