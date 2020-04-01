const React      = require('react');
const {
    SimpleContentBlock,
    SimpleInterfaceBlock,
    NewsletterSignUpForm,
    TextBlockLink,
}                   = require('./Misc');

const DistanceLearningPage = () => (
    <StaticPage>
        <Header
            enTitle="Remote Learning"
            enText="Discover the power of online education. Sefaria is always available to provide foundational Jewish texts, educational materials, and the tools to allow you to engage with dynamic Jewish learning."
            enImg="/static/img/distance-learning-landing-page/remotelearning_headerimage.png"
            enImgAlt="Sefaria on tablet."
            enActionURL={null}
            enActionText={null}
            heTitle="מקורות ללימוד וללמידה למידה מרחוק"
            heText="לומדים רבים ברחבי העולם מגלים את הכוח והפוטנציאל שיש בלמידה מקוונת. אתר ספריא פתוח לכולם, בחינם, ומציע מאגר עצום של מקורות יהודיים וכלים מתקדמים להעצמת הלמידה."
            heImg="/static/img/distance-learning-landing-page/remotelearningpage_headerimage_HEB.png"
            heImgAlt="Sefaria on tablet."
            heActionURL={null}
            heActionText={null}
        />
        <GreyBox>
            <H2Block en="Browse our Latest Resources" he="דפי מקורות אקטואליים" />
            <ButtonRow>
                <SimpleButton
                    href="/groups/Seder-on-Sefaria?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he_href="/groups/%D7%93%D7%A4%D7%99-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA-%D7%90%D7%A7%D7%98%D7%95%D7%90%D7%9C%D7%99%D7%99%D7%9D?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he="דפי מקורות אקטואליים"
                    en="Seder on Sefaria"/>
                <SimpleButton
                    href="/sheets/227733?lang=bi?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he_href="https://docs.google.com/document/d/1auCOnEjr8biCgRiWPB3SmuU6g02FEwoL/edit"
                    he="קורונה"
                    en="A Jewish Response to COVID-19"/>
                <SimpleButton
                    href="/groups/Online-Learning-Resources?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he_href=""
                    he=""
                    en="Online Learning Resources"/>
            </ButtonRow>
        </GreyBox>
        <H2Block en="Resources for Everyone" he="לומדים עם ספריא" />
        <Feature
            enTitle="Learners"
            enText="Whether you’re a pro, or a new user, Sefaria has resources to help your virtual study thrive. Join a Sefaria 101 webinar, browse our tutorials, or sign up for the online student training course to up your skills on all things Sefaria. <a href='/register?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning'>Create a free account</a> to track your learning, save texts, and follow users creating things that interest you."
            enImg="/static/img/distance-learning-landing-page/remotelearningpage_learners.png"
            enImgAlt="Source Sheet - Pesach 101"
            heTitle="לומדים עם ספריא"
            heText="ספריא נותנת כלים להעצים את הלימוד המקוון שלכם. השתמשו בוובינר וב'מדריך למשתמש המתחיל' כדי ללמוד איך להשתמש באתר."
            heImg="/static/img/distance-learning-landing-page/remotelearningpage_learners_HEB.png"
            heImgAlt=""
            borderColor="#004E5F"
        />
        <ButtonRow>
            <SimpleButton
                href="/groups/Webinars-for-Learners?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224909?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="וובינרים"
                en="Webinars for Learners"/>
            <SimpleButton
                href="/groups/Tutorials-for-Learners?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href=""
                he=""
                en="Tutorials for Learners"/>
            <SimpleButton
                href="/groups/Sefaria-Student-Course?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224919?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="מדריך למשתמש המתחיל"
                en="Student Course"/>
        </ButtonRow>
        <Feature
            enTitle="Educators and Rabbis"
            enText="Sefaria is here to support your online teaching. Our <a href='/educators?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning'>Learning Department</a> has a variety of resources to get you started with distance learning using Sefaria. <a href='/register?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning'>Create a free account</a> to make and assign source sheets to your students, organize your sheets into groups, and save texts."
            enImg="/static/img/distance-learning-landing-page/remotelearningpage_educators.png"
            enImgAlt="Source Sheet - Teaching with Sefaria Online"
            heTitle="מורים ואנשי הוראה"
            heText="צוות ספריא תומך בהוראה דיגיטלית ובהוראה מרחוק. למדו בעזרת החומרים שצוות החינוך שלנו יצר עבורכם- כיצד ללמד עם ספריא, בכיתה ומחוצה לה."
            heImg="/static/img/distance-learning-landing-page/remotelearningpage_educators_HEB.png"
            heImgAlt=""
            borderColor="#CCB479"
        />
        <ButtonRow>
            <SimpleButton
                href="/groups/Webinars-for-Educators?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224909?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="וובינרים"
                en="Webinars for Educators"/>
            <SimpleButton
                href="/groups/Tutorials-for-Educators?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224923?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="קורס למורים: 'ספריא בכיתה'"
                en="Tutorials for Educators"/>
            <SimpleButton
                href="/sheets/187032?lang=bi?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/223245?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="טיפים להוראה עם ספריא"
                en="Educator Course"/>
        </ButtonRow>
        <Feature
            enTitle="Institutions & Organizations"
            enText="Is it time to start incorporating digital texts into your website, blog, or app? Sefaria has you covered. All of our software is open source and our texts are all in the creative commons – meaning you can use anything we have for your own projects. Take a look at these resources and get in touch with your web/app developer to start including Sefaria’s texts on your site."
            enImg="/static/img/distance-learning-landing-page/remotelearningpage_developers.png"
            enImgAlt="Source Sheet - Link Sefaria to your Site"
            heTitle="מפתחים"
            heText="האם תרצו להטמיע מקורות דיגיטליים לאתר או לאפליקציה שלכם? ספריא יכולה לסייע לכם. כל המידע שיש באתר הינו בקוד פתוח. תוכלו להשתמש בכל המקורות של ספריא עבור הפרוייקטים האישיים שלכם. עיינו בGit Hub כדי לראות מה יש ל API של ספריא להציע."
            heImg="/static/img/distance-learning-landing-page/remotelearningpage_developers_HEB.png"
            heImgAlt=""
            borderColor="#802F3E"
        />
        <ButtonRow>
            <SimpleButton href="/linker?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning" he="" en="Two-Way Linker"/>
            <SimpleButton href="https://github.com/Sefaria/Sefaria-Project/wiki/Projects-Powered-by-Sefaria" he="" en="Powered by Sefaria"/>
            <SimpleButton href="https://github.com/Sefaria/Sefaria-Project/wiki#developers" he="" en="GitHub"/>
        </ButtonRow>
        <CallToActionFooterWithNewsletter
            enText="Sign up for our mailing list to get resources in your inbox"
            heText="הרשמו לרשימת התפוצה שלנו על מנת לקבל עדכונים מספריא"
            includeEducatorOption={true}
        />
    </StaticPage>
);

const StaticPage = ({children}) => (
    <div className="staticPage">
        {children}
    </div>
);

const GreyBox = ({children}) => (
    <div className="greyBackground">
        {children}
    </div>
);
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
                {enActionURL ?
                <div className="staticPageHeaderAction">
                    <a className="button int-en" href={enActionURL}>{enActionText}</a>
                    <a className="button int-he" href={heActionURL}>{heActionText}</a>
                </div>
                : null}
            </div>
            <div className="staticPageHeaderImg">
                <img className="int-en" src={enImg} alt={enImgAlt} />
                <img className="int-he" src={heImg} alt={heImgAlt} />
            </div>
        </div>
    </div>
);

const CallToActionFooterWithButton = ({href, enText, heText, enButtonText, heButtonText}) => (
    <div className="staticPageCallToActionFooter">
        <SimpleInterfaceBlock classes="callToActionText" en={enText} he={heText} />
        <CallToActionButton href={href} en={enButtonText} he={heButtonText} />
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
                <p className="int-en" dangerouslySetInnerHTML={{__html:enText}} />
                <p className="int-he" dangerouslySetInnerHTML={{__html:heText}} />
            </div>
            <div className="featureImage">
                <img className="int-en" src={enImg} alt={enImgAlt}/>
                <img className="int-he" src={heImg} alt={heImgAlt}/>
            </div>
        </div>
    </div>
);

const ButtonRow = ({children}) => (
    <div className="staticPageBlockInner blockVerticalPadding flexContainer">
        {children}
    </div>
);

const SimpleButton = ({href, he_href, he, en}) => (
    <div className="simpleButtonWrapper">
        <a href={href} className="button white flexContainer int-en">
            <span className="int-en">{en}</span>
        </a>
        <a href={he_href || href} className="button white flexContainer int-he">
            <span className="int-he">{he}</span>
        </a>
    </div>
);
const CallToActionButton =  ({href, he, en}) => (
    <div className="">
        <a href={href} className="button flexContainer">
            <span className="int-en">{en}</span>
            <span className="int-he">{he}</span>
        </a>
    </div>
);



module.exports.DistanceLearningPage = DistanceLearningPage;
