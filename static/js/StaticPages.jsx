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


 */
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

const HeBlock = ({children}) => <div className="int-he">{children}</div>;
const EnBlock = ({children}) => <div className="int-en">{children}</div>;

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