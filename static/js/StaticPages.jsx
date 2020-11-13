import React from 'react';
import {
    SimpleInterfaceBlock,
    NewsletterSignUpForm,
} from './Misc';
import palette from './sefaria/palette';
import classNames from 'classnames';


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
        <Spacer/>

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
            <p>We'll be <a href="https://docs.google.com/forms/d/e/1FAIpQLSdYygtWWCte6ljlNUq7qwVItoJREeaVRXznuuVC8213xw6k4w/viewform">accepting submissions</a> from Wednesday, July 1 until Monday, August 31st. To participate, you just need to send us a URL and a short description of what you've made.</p>
            <p>A jury will select two projects to win cash prizes: $5,000 for the grand prize, and $3,600 for the student prize for work created by undergraduate students or younger, or people under the age of 23.</p>
            <p>A selection of completed projects will also be featured on a contest page and shared with our community.</p>
        </EnBlock>
        <HeBlock padded={true}>
            <p> מיום רביעי, 1 ביולי, ועד יום שני, 31 באוגוסט. להשתתפות בתחרות שלחו כתובת <a href="https://docs.google.com/forms/d/e/1FAIpQLSdYygtWWCte6ljlNUq7qwVItoJREeaVRXznuuVC8213xw6k4w/viewform">הגשות תתקבלנה</a> URL ותיאור תמציתי של התוצר.</p>
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
        <Spacer/>

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
        <Spacer/>

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
            href="https://docs.google.com/forms/d/e/1FAIpQLSdYygtWWCte6ljlNUq7qwVItoJREeaVRXznuuVC8213xw6k4w/viewform"
            he_href="https://docs.google.com/forms/d/e/1FAIpQLSdYygtWWCte6ljlNUq7qwVItoJREeaVRXznuuVC8213xw6k4w/viewform"
            enText="Ready to share what you created?"
            heText="מוכנים לשתף את מה שיצרתם?"
            enButtonText="Submit your project"
            heButtonText="הגישו את הפרוייקט שלכם"
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
            <Section>
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
            </Section>
        </EnBlock>
        <HeBlock>
            <Section>
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
            </Section>
        </HeBlock>
        <Section>
            <SimpleButton
                he="חפשו עוד לפי נושא"
                en="Explore More by Topic"
                href="/topics?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
                he_href="/topics?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets_HEB"
            />
        </Section>
        <Spacer />
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


const PBSC2020LandingPage = () => (
    <StaticPage>
        <Header
            enTitle="Powered by Sefaria Contest 2020"
            enText="Explore the Projects"
            enImg="/static/img/pbsc-2020-landing-page/codemockup3.png"
            enImgAlt=""
            heTitle="תחרות פיתוח תוכנה"
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/codemockup3.png"
            heImgAlt=""
        />

        <GreyBox>
            <H2Block en="Inviting Innovation" he=""/>
            <EnBlock padded={true}>
                <p>In an effort to seed the digital future of Jewish texts, the Powered by Sefaria Contest was launched in July 2020 — inviting the global Sefaria community to make use of our free and open digital dataset of Jewish texts, translations, and interconnections. Over the years, dozens of third parties have created apps, visualizations, and conducted research using our data or API, and we wanted to see what else our community could dream up. We saw tremendous enthusiasm and welcomed 50 high quality submissions from Sefaria users around the world. <b>Keep reading to learn more about the two winners and some incredibly innovative honorable mentions.</b></p>
            </EnBlock>
            <HeBlock padded={true}>
                <p></p>
            </HeBlock>
            <Spacer/>
        </GreyBox>

        <GreyBox light={true}>
            <H2Block en="Grand Prize Winner" he=""/>
        </GreyBox>

        <Feature
            enTitle="Talmud Sidebar Extension"
            enText="By Dov Katz<br/><br/>The Talmud Sidebar Extension brings Sefaria’s learning resources to Daf Yomi sites across the web. Created in response to the move to Zoom for Daf Yomi classes the world over in the wake of COVID-19, the extension recognizes what daf you’re learning or listening to on nearly a dozen Daf Yomi sites, and enables a sidebar to see connections from Sefaria’s library, or link straight back to Sefaria."
            enImg="/static/img/pbsc-2020-landing-page/talmudsidebar.png"
            enImgAlt="Talmud Sidebar Extension"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/talmudsidebar.png"
            heImgAlt="Talmud Sidebar Extension"
            borderColor={palette.colors.yellow}
            link="https://chrome.google.com/webstore/detail/talmud-sidebar-extension/dmpiiciebnbekblfbcdeogjkbbmeeimi"
        />

        <GreyBox>
            <H2Block en="Meet the Grand Prize Winner" he=""/>
            <EnBlock padded={true}>
                <p>Originally from Memphis, TN and now living in Modiin, Israel, Dov Katz leads a developer productivity group for the technology arm of a large financial services firm and enjoys tinkering with tech in his free time. Long interested in the ways technology could increase access to Jewish life and Torah study – he created the popular Jewish site OnlySimchas.com back in 1999! – he invented the Sidebar Extension this summer to meet the new digital needs of his own formerly in-person Daf Yomi shiur. Dov’s passion for access leads him to be a strong advocate of Open Source and he currently sits as the Chairman of the board on the Fintech Open Source Foundation.</p>
            </EnBlock>
            <HeBlock padded={true}>
                <p></p>
            </HeBlock>
            <Spacer/>
        </GreyBox>

        <GreyBox light={true}>
            <H2Block en="Youth Prize Winner" he=""/>
        </GreyBox>

        <Feature
            enTitle="Mizmor Shir"
            enText="By Immanuel Bissel, Simon Landau, and Ben Kotton<br/><br/>Mizmor Shir explores the intersections of Torah and music as two forms of holy language. Using the Kabbalistic tradition of gematria, Mizmor Shir transforms the text of the Torah into music, in keys and scales that you choose, to reveal unseen (and unheard) patterns within it. "
            enImg="/static/img/pbsc-2020-landing-page/mizmorshir.png"
            enImgAlt="Talmud Sidebar Extension"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/mizmorshir.png"
            heImgAlt="Mizmor Shir"
            borderColor={palette.colors.raspberry}
            link="http://mizmor-shir.herokuapp.com/"
        />

        <GreyBox>
            <H2Block en="Meet the Youth Prize Winners" he=""/>
            <EnBlock padded={true}>
                <p>Mizmor Shir was created by three college students – Simon Landau, a junior at USC majoring in Computer Science; Immanuel Bissel, a rising sophomore at Yale majoring in Earth and Planetary Science; and Ben Kotton, also a rising Sophomore at Yale, majoring in applied mathematics. Friends from a childhood shared in Los Angeles, all three are avid music lovers – Simon plays both orchestral bass as well as guitar in a three-piece band, Emmanuel the guitar, and Ben the Mandolin. It was this love that got them excited to respond to Sefaria’s PBS challenge with an idea that combined music with Torah and harnessed the power of technology to reveal the beauty of each in new ways.</p>
            </EnBlock>
            <HeBlock padded={true}>
                <p></p>
            </HeBlock>
            <Spacer/>
        </GreyBox>

        <H2Block en="What the Judges Had to Say" he=""/>

        <Section>
            <UserQuote
                enText="It was very exciting to see all of the creative applications to the Powered by Sefaria Contest. There was such a wide range of ideas, truly displaying the power of Sefaria to engage a range of audiences. At the core of all of the ideas was creating innovative ways to allow more people to engage with text in a deeper way, from bringing the text to life through interactive museums to creating additional features and ease for the toolbar and the Sefaria browsing experience.<br/><br/>Many of the ideas are very promising and I hope the contestants continue to explore their ideas and bring their passion to life. Thanks to Sefaria for creating such an accessible and open platform to allow for such a meaningful and collaborative competition."
                heText=""
                enName="Libby Novak, Chief Operations Officer, Maapilim; Sefaria advisory board member"
                heName=""
                image="/static/img/pbsc-2020-landing-page/libby.png"
            />
            <UserQuote
                enText="Each of the top projects that I looked into were intriguing and useful.The Sidebar extension won deservedly because it is so obviously helpful for increasing Sefaria's efficiency. But I greatly admired the cleverness of the Shulkhan tool, the mathematical sophistication of the Sefer Similarity Map, and the ingenuity and resourcefulness of all the submissions."
                heText=""
                enName="Moshe Koppel, Professor of Computer Science at Bar-Ilan University; Founder of DICTA, a laboratory creating computational linguistics tools for the analysis of Jewish and Hebrew texts"
                heName=""
                image="/static/img/pbsc-2020-landing-page/moshe.png"
            />
            <UserQuote
                enText="I was incredibly impressed by the submissions to the Powered by Sefaria contest. When Sefaria started, we could not have imagined the level of technical talent that would be applied to enhancing Sefaria's texts and platform. The submissions to the contest were both interesting and often quite practical, many adding useful features on top of Sefaria's existing platform. I was especially excited to see such wonderful energy from our younger supporters who brought creativity and vision to the contest. Congratulations to all the submitters!"
                heText=""
                enName="Mo Koyfman, Founder of early-stage venture capital firm, Shine Capital; founding Sefaria board member"
                heName=""
                image="/static/img/pbsc-2020-landing-page/mo.png"
            />
        </Section>

        <GreyBox light={true}>
            <H2Block en="Honorable Mentions" he=""/>
        </GreyBox>

        <Feature
            enTitle="Shulkhan"
            enText="By Joseph Tepperman<br/><br/>Shulkhan is a touch interface for the printed Talmud. Using a camera and projector, Shulkan can watch as you learn with a book and project translations to the passages of text that you touch."
            enImg="/static/img/pbsc-2020-landing-page/shulkhan.png"
            enImgAlt="Shulkhan"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/shulkhan.png"
            heImgAlt=""
            borderColor={palette.colors.green}
            link="http://josephtepperman.com/shulkhan.htm"
        />


        <Feature
            enTitle="Goof - Body parts in Tefillah"
            enText="By Judah Kaunfer and Matan Kotler-Berkowitz<br/><br/>Goof lets you explore texts of Tefillah through the lens of the body. Pick a body part and see texts that relate to it. <b>Goof has the honor of being the project submitted to the contest by the youngest entrant, Mr. Kaunfer, at 11 years old.</b>"
            enImg="/static/img/pbsc-2020-landing-page/goof.png"
            enImgAlt="Goof - Body parts in Tefillah"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/goof.png"
            heImgAlt=""
            borderColor={palette.colors.paleblue}
            link="https://goof.surge.sh/"
        />


        <Feature
            enTitle="Capish - Interactive Learning"
            enText="By Chanah Emunah Deitch and Shalva Eisenberg<br/><br/>Capish is an interactive learning environment for Jewish texts. For this contest, Capish added a feature that allows users to record themselves reading lines of text. As they play back their recordings the users see words highlighted as they are spoken, or jump to parts of the recording by clicking words."
            enImg="/static/img/pbsc-2020-landing-page/capish.png"
            enImgAlt="Capish - Interactive Learning"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/capish.png"
            heImgAlt=""
            borderColor={palette.colors.blue}
            link="https://capish.me/"
        />


        <Feature
            enTitle="Daf Yomi Crossword"
            enText="By Chanoch Goldfarb<br/><br/>Daf Yomi Crossword automatically generates a crossword puzzle based on any page of Talmud. The clues ask you to find words used on the page based on their context, or to find the words that commentaries choose to comment on."
            enImg="/static/img/pbsc-2020-landing-page/dafyomicrossword.png"
            enImgAlt="Daf Yomi Crossword"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/dafyomicrossword.png"
            heImgAlt=""
            borderColor={palette.colors.orange}
            link="http://ee.cooper.edu/~goldfarb/daf/"
        />


        <Feature
            enTitle="Sefer Similarity Map"
            enText="By Joseph Hostyk and Alex Zaloum<br/><br/>Sefer Similarity Map visualizes relationships among Jewish texts by analyzing their usage of words or phrases to show which texts and sections have the most in common. Exploring the results in graphical form can illuminate historical, authorial, linguistic, and stylistic connections between texts."
            enImg="/static/img/pbsc-2020-landing-page/sefersimilarity.png"
            enImgAlt="Sefer Similarity Map"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/sefersimilarity.png"
            heImgAlt=""
            borderColor={palette.colors.lightpink}
            link="https://jhostyk.github.io/SeferSimilarityMap/"
        />


        <Feature
            enTitle="Custom Mikraot Gedolot"
            enText="By Eshel Sinclair and Ben Gold<br/><br/>Custom Mikraot Gedolot lets you create your own Mikraot Gedolot. You choose the texts, translations and up to 9 commentaries, and the app will automatically generate a PDF that you can download and print."
            enImg="/static/img/pbsc-2020-landing-page/mikraotgedolot.png"
            enImgAlt="Custom Mikraot Gedolot"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/mikraotgedolot.png"
            heImgAlt=""
            borderColor={palette.colors.darkblue}
            link="http://ec2-3-129-165-55.us-east-2.compute.amazonaws.com:3002/"
        />


        <Feature
            enTitle="Sefaria Space: (Topic Museum + Text Mania)"
            enText="By David Komer<br/><br/>The Sefaria Space has two parts: the Topic Museum creates an immersive 3D environment where you can explore texts related to a topic as though they were paintings hanging on a wall. Text Mania is a 3D game based on the letters of a text of your choosing."
            enImg="/static/img/pbsc-2020-landing-page/sefariaspace.png"
            enImgAlt="Sefaria Space: (Topic Museum + Text Mania)"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/sefariaspace.png"
            heImgAlt=""
            borderColor={palette.colors.darkpink}
            link=" https://sefaria-space.web.app/"
        />


        <Feature
            enTitle="The Rabbinic Citation Network"
            enText="By Michael Satlow and Mike Sperling<br/><br/>Using Sefaria's digital text of the Bavli, the Rabbinic Citation Networks extracts the names and links of rabbis who cite (or who are cited by) other rabbis and visualizes the resulting network."
            enImg="/static/img/pbsc-2020-landing-page/rabbiniccitation.png"
            enImgAlt="The Rabbinic Citation Network"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/rabbiniccitation.png"
            heImgAlt=""
            borderColor={palette.colors.lavender}
            link="http://www.rabbiniccitations.jewishstudies.digitalscholarship.brown.edu/blog/"
        />


        <Feature
            enTitle="T'Feeling"
            enText="By Matan Kotler-Berkowitz<br/><br/>T’Feeling encourages people to think deeply and intentionally about the connections between t'fillot and emotions. The site allows users to browse t’fillot by emotion (either what they’re currently feeling or what they hope to be feeling), as well as contribute their own ratings for which t’fillot connect most to which emotions."
            enImg="/static/img/pbsc-2020-landing-page/tfeeling.png"
            enImgAlt="T'Feeling"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/tfeeling.png"
            heImgAlt=""
            borderColor={palette.colors.yellow}
            link="https://tfeeling.netlify.app"
        />


        <Feature
            enTitle="CiteMakor"
            enText="By Ariel Caplan<br/><br/>CiteMakor is a Twitter bot which accepts requests for citations and responds by tweeting back one or more images that include the cited text. The goal of CiteMakor is to make it easy to bring source texts into discussions of Jewish topics on Twitter."
            enImg="/static/img/pbsc-2020-landing-page/citemakor.png"
            enImgAlt="CiteMakor"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/citemakor.png"
            heImgAlt=""
            borderColor={palette.colors.purple}
            link="https://twitter.com/CiteMakor"
        />


        <Feature
            enTitle="Gifaria"
            enText="By John Cassil and Tiger Tang<br/><br/>For a little bit of fun, gifaria finds gifs relevant to any verse in Tanakh. This project provides an engaging way for people to interact with biblical texts in a lighthearted way."
            enImg="/static/img/pbsc-2020-landing-page/gifaria.png"
            enImgAlt="Gifaria"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/gifaria.png"
            heImgAlt=""
            borderColor={palette.colors.lightblue}
            link="https://tiger-tang.shinyapps.io/gifaria/"
        />


        <Feature
            enTitle="The Taryag Mitzvos"
            enText="By Rafi Wolfe<br/><br/>The Taryag Mitzvos is an interactive visualization of the 613 commandments, and the different ways that different scholars have enumerated that list. The interface lets users view and sort according to which opinions support each mitzvah’s inclusion, as well as compare the differences between different lists."
            enImg="/static/img/pbsc-2020-landing-page/thetaryag.png"
            enImgAlt="The Taryag Mitzvos"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/thetaryag.png"
            heImgAlt=""
            borderColor={palette.colors.lightgreen}
            link="https://thetaryag.com/"
        />


        <Feature
            enTitle="3D Tanach Family Tree"
            enText='By Moshe Escott, Shlomo Gordon, Simcha Schaum, Aaron Farntrog and Ari Abramowitz<br/><br/>The 3D Tanach Family Tree is an interactive 3D visualization of characters mentioned in Tanach. As you float through the tree you can find information about each character, search relationships between them, and find verses on Tanach where they appear.  Select "Tanach Family Tree" from the menu at top right to view.'
            enImg="/static/img/pbsc-2020-landing-page/familytree.jpg"
            enImgAlt="3D Tanach Family Tree"
            heTitle='אילן יוחסין תנ"כי תלת ממדי'
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/familytree.jpg"
            heImgAlt=""
            borderColor={palette.colors.red}
            link="http://www.basehasefer.com/"
        />


        <Feature
            enTitle="Gematriaphone"
            enText="By Alexander Boxer<br/><br/>Gematriaphone lets you hear the Torah's hidden mathematical music. Starting from any word of Torah, users can hear tones corresponding to the gematria of each word as it is highlighted on the screen."
            enImg="/static/img/pbsc-2020-landing-page/gematriaphone.png"
            enImgAlt="Gematriaphone"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/gematriaphone.png"
            heImgAlt=""
            borderColor={palette.colors.teal}
            link="http://alexboxer.com/gematriaphone/"
        />


        <Feature
            enTitle="SefariAcrostic"
            enText="Ezra Gordon<br/><br/>SefariaAcrostic searches books of Tanakh for acrostics that match a person’s Hebrew name. Acrostics can be used to create digital art or to inspire personalized artwork for a simcha, such as finding an acrostic with the couple's names for a wedding."
            enImg="/static/img/pbsc-2020-landing-page/acrostic.png"
            enImgAlt="SefariAcrostic"
            heTitle=""
            heText=""
            heImg="/static/img/pbsc-2020-landing-page/acrostic.png"
            heImgAlt=""
            borderColor={palette.colors.lightbg}
            borderColor={palette.colors.lightbg}
            link="https://20gordone.github.io/SefariaContest/"
        />


        <CallToActionFooterWithButton
            href="https://github.com/Sefaria/Sefaria-Project"
            he_href="https://github.com/Sefaria/Sefaria-Project"
            enText="Want to create something of your own?"
            heText=""
            enButtonText="GitHub"
            heButtonText="GitHub"
        />


        <H2Block en="Explore more projects" he=""/>

        <ButtonRow white={true}>
            { [ 
                ["Abba Saul", "", "https://github.com/scopreon/abba-saul/"],
                ["Amud-anan", "", "https://github.com/Binyomin-Cohen/sefaria"],
                ["Bashamayim Hi", "", "https://yosefsklar.github.io/bashamayim-hi/"],
                ["Chiddushim and Biurim", "", " https://torah.yiddishe-kop.com/"],
                ["Daily Daf Tracker", "", "https://mattpolanieckidev.github.io/dailydaf/"],
                ["I’m Learning Lucky", "", "https://github.com/jmcaplan/sefariaExtension"],
                ["Jew And A", "", "https://seph-efd35.web.app/"],
                ["Leiner", "", "https://appetize.io/app/w380pbm112n7ar9m4n6er9kpm8?device=iphone11promax&scale=100&orientation=portrait&osVersion=13.3"],
                ["Memorize Plus", "", "https://www.dropbox.com/sh/cd5xhc1gg8oqqk7/AAAeFSscagGfesVgyBkBwEiIa?dl=0"],
                ["NLP-Talmud", "", "https://github.com/adinabruce/NLP-Talmud"],
                ["Pninim", "", "https://pninim.yiddishe-kop.com/"],
                ["QUIZARIA", "", "https://www.figma.com/proto/wk07O8t1I9Wxw989SGopwr/QUIZARIA!?node-id=11%3A14&scaling=scale-down"],
                ["Quran Tanakh Kabbalah Project", "", "https://bref-saucisson-56522.herokuapp.com/"],
                ["RecurrentRav", "", "https://github.com/leerosenthalj/RecurrentRav"],
                ["Scribe", "", "https://www.youtube.com/watch?v=BkCKrLf6pvk&feature=youtu.be"],
                ["Shelita", "", "https://www.sheilta.ml/"],
                ["Talmud Note", "", "https://play.google.com/store/apps/details?id=com.graytapps.talmudnote"],
                ["The Jewish Story Through Books", "", "https://joshcooper417.github.io/"],
                ["Torah for the Blind", "", "https://torahfortheblind.com/"],
                ["Tweet Yomi", "", "https://tweetyomi.org/"],
                ["Visualizations of Sefaria", "", "https://guedalia.github.io/testab/test"],
                ["Visualizing Talmud Topics", "", "https://notebooks.azure.com/HagaiG/projects/Visualizing-Talmud-Topics"],
                ["Visualizing Works Influence", "", "https://adinabechhofer.github.io/"],
                ["Yamim Noraim Machzor", "", "https://play.google.com/store/apps/details?id=com.machzoryamimnoraim"],
                ["Yomyomishna", "", "https://yomyomishna.web.app/"]
            ].map(i => 
                <SimpleButton
                    white={true}
                    rounded={false}
                    tall={true}
                    newTab={true}
                    href={i[2]}
                    he_href={i[2]}
                    he={i[1]}
                    en={i[0]}
                />)
            }
        </ButtonRow>

    </StaticPage>
);


const StaticPage = ({children}) => (
    <div className="staticPage">
        {children}
    </div>
);

const Spacer = ({height}) => <div className={"staticPageSpacer"} style={{height: height || 60}}></div>;

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

const Section = ({children}) =>
    <div className={"staticPageBlockInner staticPageSection"}>
        {children}
    </div>;

const UserQuote = ({enText, heText, image, enName, heName}) =>
    <div className="staticPageUserQuote">
        <div className="staticPageUserQuoteContent">
            <div className="int-en" dangerouslySetInnerHTML={{__html:enText}} />
            <div className="int-he" dangerouslySetInnerHTML={{__html:heText}} />
        </div>
        <div className="staticPageUserQuoteNameBox">
            <img src={image} />
            <div className="staticPageUserQuoteName">
                <span className="int-en">{enName}</span>
                <span className="int-he">{heName}</span>
            </div>
        </div>
    </div>;

const Sheet = ({title, link, author, image}) =>
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
    <div className="feature blockVerticalPadding" style={{backgroundColor: "inherit"}}>
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

const Feature = ({enTitle, heTitle, enText, heText, enImg, heImg, enImgAlt, heImgAlt, borderColor, link}) => (
    <div className="feature">
        <div className="staticPageBlockInner flexContainer">
            <div className="featureText" style={{borderColor: borderColor}}>
                <div className="featureHeader">
                    <ConditionalLink link={link}>
                        <h3>
                            <span className="int-en">{enTitle}</span>
                            <span className="int-he">{heTitle}</span>
                        </h3>
                    </ConditionalLink>
                </div>
                <div className="int-en" dangerouslySetInnerHTML={{__html:enText}} />
                <div className="int-he" dangerouslySetInnerHTML={{__html:heText}} />
            </div>
            <ConditionalLink link={link}>
                <div className="featureImage">
                    <img className="int-en" src={enImg} alt={enImgAlt}/>
                    <img className="int-he" src={heImg} alt={heImgAlt}/>
                </div>
            </ConditionalLink>
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

const SimpleButton = ({href, he_href, he, en, white, rounded=true, tall=false, newTab=false}) => (
    <div className="simpleButtonWrapper">
        <a href={href} className={classNames({button:1, flexContainer:1, "int-en":1, white: white, tall: tall, rounded:rounded})} target={newTab ? "_blank" : "_self"}>
            <span className="int-en">{en}</span>
        </a>
        <a href={he_href || href} className={classNames({button:1, flexContainer:1, "int-he":1, white: white, tall: tall, rounded:rounded})}>
            <span className="int-he">{he}</span>
        </a>
    </div>
);

const ConditionalLink = ({ link, children }) => 
  link ? <a href={link} target="_blank">{children}</a> : children;


export {
    RemoteLearningPage,
    SheetsLandingPage,
    ContestLandingPage,
    PBSC2020LandingPage,
}
