import React, {useState, useRef, useEffect, memo} from 'react';
import {
    SimpleInterfaceBlock,
    TwoOrThreeBox,
    ResponsiveNBox,
    NBox, InterfaceText,
} from './Misc';
import {NewsletterSignUpForm} from "./NewsletterSignUpForm";
import palette from './sefaria/palette';
import classNames from 'classnames';
import Cookies from 'js-cookie';
import Sefaria from './sefaria/sefaria';



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
            enActionURL="#"
            enActionText="Register to Join"
            heTitle="תחרות פיתוח תוכנה"
            heText="הצטרפו אלינו לאתגר שיקדם את תחום התורה והטכנולוגיה בבניית תוצר יצירתי ועצמאי בעזרת המאגר החופשי וממשק ה־API של ספריא."
            heImg="/static/img/contest-landing-page/codemockup3.png"
            heImgAlt=""
            heActionURL="#"
            heActionText="הרשמה לתחרות"
        />

        <H2Block en="The Contest" he="התחרות"/>
        <EnBlock padded={true}>
            <p>Sefaria offers a free digital dataset of Jewish texts, translations, and interconnections that is open for anyone to reuse in novel ways. Last year, we received over 50 innovative Powered by Sefaria projects using our open data or API (<a href="/powered-by-sefaria-contest-2020">see the winners and honorable mentions!</a>). We’re eager to see what else our community can dream up to advance the frontiers of Torah and technology in this year’s contest!</p>
            <p>What you create is up to you. It could be a functioning web app or just a compelling demo; an interactive visualization, or just a question that digs into data quantitatively in search of an answer; something useful and impactful to the world of learning, or just a crazy experiment that fascinates you without a clear application. <b>The only requirement is that your project must prominently make use of the data that Sefaria has to offer</b>.</p>
            <p>To get your ideas flowing, here are three great examples from last year’s Powered by Sefaria contest. You can find dozens more projects on our <a href="https://github.com/Sefaria/Sefaria-Project/wiki/Projects-Powered-by-Sefaria">Powered by Sefaria list</a> on GitHub and on the <a href="https://www.sefaria.org/powered-by-sefaria-contest-2020">Powered by Sefaria 2020 Winners & Honorable Mentions page</a>.</p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>ספריא מציעה לציבור מסד נתונים דיגיטלי וחופשי של מקורות יהודיים, תרגומים וקישורים בין־טקסטואליים.  בשנה שעברה הגיעו לפתחנו יותר מ־50 מיזמים חדשניים שהשתמשו במסד הנתונים הפתוח  או ב־API שלנו (<a href="/powered-by-sefaria-contest-2020">ראו את המיזמים הזוכים ואת המיזמים שזכו להערכה מיוחדת</a>). אנו מלאי ציפייה לראות מה עוד מסוגלת הקהילה שלנו לעשות כדי לחצות את הגבולות המוכרים של התורה והטכנולוגיה?</p>
            <p>המיזם תלוי רק בכם: זה יכול להיות יישומון רשת פעיל או דמו משכנע; ויזואליזציה אינטראקטיבית או שאלה שיורדת לעומקם של הנתונים הכמותיים של המערכת; כלי שימושי ויעיל לעולם הלימוד או ניסוי מדליק ללא תוצר ברור שפשוט מרתק אתכם. <b>הדרישה היחידה היא שבמיזם ייעשה שימוש מובהק במסד הנתונים של ספריא</b>.</p>
            <p>כדי לעזור לכם להתחיל הינה שלוש דוגמאות מעולות מתחרות פיתוח התוכנה בשנה שעברה. אפשר למצוא עשרות מיזמים אחרים ברשימת המיזמים של התחרות ב<a href="https://github.com/Sefaria/Sefaria-Project/wiki/Projects-Powered-by-Sefaria">גיטהאב</a> וב<a href="/powered-by-sefaria-contest-2020">עמוד המיזמים הזוכים והמיזמים שזכו להערכה מיוחדת בתחרות פיתוח התוכנה לשנת 2020</a>.</p>
        </HeBlock>

        <ButtonRow white={true}>
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://www.youtube.com/watch?v=C6nMn4CLuEU"
                he_href="https://www.youtube.com/watch?v=C6nMn4CLuEU"
                he="סרגל הכלים של התלמוד"
                en="Talmud Sidebar Extension"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://www.youtube.com/watch?v=uB4In-Nc2WU"
                he_href="https://www.youtube.com/watch?v=uB4In-Nc2WU"
                he="מזמור שיר"
                en="Mizmor Shir"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://jhostyk.github.io/SeferSimilarityMap/"
                he_href="https://jhostyk.github.io/SeferSimilarityMap/"
                he="ספר – מפת דמיון בין טקסטים"
                en="Sefer Similarity Map"
            />
        </ButtonRow>


        <H2Block en="Timeline and Prize" he="לוח זמנים ופרסים" />
        <EnBlock padded={true}>
            <p>The contest is open from Sunday, June 13th through Tuesday, August 31st. <a href="https://sefaria.nationbuilder.com/contest2021">Registered participants</a> will receive a form to submit their projects. The contest deliverable must be in the form of a URL where our judges can directly access your work. For many projects, this will be a running demo of an app on the web. For other projects, your URL may point to a description and summary of the work you've done, much like a poster for a research project presented at a conference. For desktop or mobile apps, you will need to host your app on a web-based emulator (like <a href="https://appetize.io/">Appetize.io</a>) so our judges can interact with it without downloading executables.</p>
            <p>A jury will select three projects to win cash prizes: $5,000 for the grand prize, $5,000 for the Women in Tech prize, and $3,600 for the youth prize.</p>
            <p>A selection of completed projects will also be featured on a contest page and shared with our community.</p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>התחרות תתחיל ביום רשון, 13 ביוני, ותסתיים ביום שלישי, 31 באוגוסט. <a href="#">המשתתפים והמשתתפות שיירשמו</a> יקבלו טופס להגשת המיזם. ההגשה צריכה להיות בפורמט URL שדרכו יוכלו השופטים לגשת ישירות אל המיזם. עבור מיזמים רבים משמעות הדבר היא העלאת גרסת דמו חיה של היישומון, שתפעל ברשת. עבור מיזמים אחרים כתובת ה־URL תוביל לתיאור ולתקציר של המיזם, בדומה לכרזות המציגות מיזמי מחקר בכנסים. אם המיזם שלכם הוא יישומון לשולחן עבודה או לטלפון נייד, יש להפעיל אותו באמצעות אמולטור מבוסס רשת (לדוגמה <a href="https://appetize.io">Appetize.io</a>), כדי שהשופטים והשופטות יוכלו להשתמש בו בלי להוריד קובצי הרצה כלשהם.</p>
            <p>השופטים יבחרו שלושה מיזמים שיזכו בפרס כספי: 5,000 דולר לפרס הכללי, 5,000 דולר לפרס לנשים מפתחות תוכנה ו־3,600 דולר לפרס המתמודד הצעיר.</p>
            <p>מבחר מיזמים אחרים שיושלמו, יופיעו אף הם בדף התחרות וישותפו עם קהילת ספריא.</p>
        </HeBlock>

        <H2Block en="Eligibility" he="זכאות" />
        <EnBlock padded={true}>
            <p>The Contest is open to applicants from the United States and Israel. All participants are eligible to enter the grand prize. Eligible participants for the Women in Tech prize include a) individuals who identify as women or b) groups of 3 or more, the majority of whom identify as women. Participants who are eligible for the Women in Tech prize may submit their project into both the Women in Tech prize and grand prize categories, and the youth prize category if eligible. Eligible participants for the youth prize include people under the age of 23. Participants who are eligible for the youth prize may submit their project into both the youth prize and grand prize categories, as well as the Women in Tech category if eligible. All entrants under the age of 18 must obtain permission from their parent or guardian before entering the contest. <b>To learn more, see our official <a href="https://drive.google.com/file/d/1CMlxEe-xIk8RNpfdBRlytLDWsdLMXPpl/view">Contest Rules</a></b>.</p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>התחרות הכללית פתוחה למועמדים מארצות הברית ומישראל (נשים וגברים). הפרס המיוחד עבור נשים מיועד לנשים שמפתחות תוכנה או לקבוצה בתנאי שיש בה רוב נשי. א. אישה; ב. קבוצה של שלושה משתתפים או יותר, שמורכבת רובה מנשים. המשתתפות הזכאיות יכולות לשלוח את המיזם שלהן להתמודדות על כמה פרסים: הפרס הכללי, הפרס לנשים מפתחות תוכנה ועל פרס המתמודד הצעיר, אם הן עומדות בתנאיו. התנאי להתמודדות בקטגוריית פרס המתמודד הצעיר הוא שגיל המשתתף אינו עולה על 23. כל המשתתפים בתחרות מתחת לגיל 18 חייבים להציג אישור מהורה או מאפטרופוס לפני הכניסה לתחרות. לעיון נוסף, ראו את <a href="https://drive.google.com/file/d/1CMlxEe-xIk8RNpfdBRlytLDWsdLMXPpl/view">תקנון התחרות הרשמי שלנו</a>.</p>
        </HeBlock>
        <Spacer/>

        <GreyBox>
            <ImageWithText
                enText="<i>“By open-sourcing a vast array of Jewish texts, Sefaria's API makes programmatic analysis of Jewish tradition simple for the everyday programmer. talmud.page began as my own hand-tailored UI for learning Daf Yomi. The more developers use Sefaria's API to solve creative questions, the richer Jewish learning will be worldwide.”
                    <br/><br/>
                    - Ron Shapiro, <a href='https://talmud.page'>talmud.page</a></i></div>"
                enImg="/static/img/contest-landing-page/AdobeStock_314348719.png"
                enImgAlt=""
                heText='<i>"על-ידי אספקת גישה למגוון עצום של טקסטים יהודיים, ה-API של ספריא מאפשר למתכנת הפשוט לבצע ניתוח פרוגרמטי של המסורת היהודי. talmud.page החל כממשק משתמש אישי לצורך לימוד דף יומי. ככל שמפתחים ישתמשו יותר  ב-API של ספריא לפתרון שאלות יצירתיות- הלימוד היהודי בכל העולם- יזכה"
                    <br/><br/>
                    - רון שפירא, <a href="https://talmud.page">talmud.page</a></i>'
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
            <p>Interested in participating in the contest? <a href="#">Sign up</a> for updates and resources, including office hours with the Sefaria engineering team. We'll share a link for project submissions with you in the coming weeks!</p>
        </EnBlock>
        <HeBlock padded={true}>
            <p>אם אתם מעוניינים להשתתף בתחרות, <a href="#">לחצו כאן להרשמה</a>, כדי שנוכל לשלוח לכם עדכונים במהלך התחרות בנוגע לכלים ומשאבים, כולל שעות העבודה של המתכנתים שלנו, שתוכלו לשאול אותם שאלות ולהתייעץ איתם על רעיונות אחד־על־אחד. תוכלו להתמודד באופן עצמאי או כחלק מצוות, ולהירשם בכל שלב מעכשיו ועד לסיום התחרות.</p>
        </HeBlock>

        <ButtonRow white={true}>
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="#"
                he_href="#"
                he="טופס הרשמה"
                en="Register"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://drive.google.com/file/d/1CMlxEe-xIk8RNpfdBRlytLDWsdLMXPpl/view"
                he_href="https://drive.google.com/file/d/1CMlxEe-xIk8RNpfdBRlytLDWsdLMXPpl/view"
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
            href="/powered-by-sefaria-contest-2020"
            he_href="/powered-by-sefaria-contest-2020"
            enText="Need Inspiration?"
            heText="רוצה לקבל השראה?"
            enButtonText="See 2020 Projects"
            heButtonText="למיזמי 2020"
        />

        {/*
        <CallToActionFooterWithButton
            href="https://docs.google.com/forms/d/e/1FAIpQLSdYygtWWCte6ljlNUq7qwVItoJREeaVRXznuuVC8213xw6k4w/viewform"
            he_href="https://docs.google.com/forms/d/e/1FAIpQLSdYygtWWCte6ljlNUq7qwVItoJREeaVRXznuuVC8213xw6k4w/viewform"
            enText="Ready to share what you created?"
            heText="מוכנים לשתף את מה שיצרתם?"
            enButtonText="Submit your project"
            heButtonText="הגישו את הפרוייקט שלכם"
        />
        */}
    </StaticPage>
);


const RambanLandingPage = () => {
    const emailLink = <a target="_blank" href="mailto:hannah@sefaria.org?Subject=Ramban Sponsorship">hannah@sefaria.org</a>
    return <StaticPage optionalClass="englishOnly">
        <Header
            enTitle="Ramban on Torah: A Translation"
            enText="Sefaria is thrilled to release Rabbi Charles Chavel's classic English translation of Rabbi Moshe ben Nachman (known as Ramban or Nachmanides) on Torah. This historic launch makes a complete bilingual version of Ramban's commentary available online for the very first time, and it will remain free for use and re-use under a CC-BY license. We are profoundly grateful to the following donors for making this possible."
            enActionText="Read the Text"
            enActionURL="/texts/Tanakh/Rishonim%20on%20Tanakh/Ramban"
            heTitle="Ramban on Torah: A Translation"
            heText="Sefaria is thrilled to be able to offer Rabbi Charles Chavel's classic English translation of Ramban (Nachmanides) on Torah
            to the world.  This historic launch makes a complete version of this work available online for the very first time,
            and it will remain free for use and re-use under a CC-BY license. We are profoundly grateful to the following donors for making this possible."
            heActionURL="/texts/Tanakh/Rishonim%20on%20Tanakh/Ramban"
            heActionText="Read the Text"
            enImg=""
            heImg=""
        />
        <div className="staticPageBlockInner flexContainer">
        <ResponsiveNBox content={
            [['Bereshit', 'Leib and Linda Koyfman', 'In honor of Hilary and Mo Koyfman and family', '/Genesis.1.1?with=Ramban'],
            ['Noach', 'Tali and Sender Cohen', '', '/Genesis.6.9?with=Ramban'],
            ['Lech Lecha', 'Rabbi David Aladjem', 'In support of Sefaria', '/Genesis.12.1?with=Ramban'],
            ['Vayera', 'Howard and Tova Weiser', 'In honor of their children and grandchildren', '/Genesis.18.1?with=Ramban'],
            ['Chayei Sara', 'Rechtschaffen Family', "In honor of the 30th anniversary of Andrew Rechtscaffen's bar mitzvah", '/Genesis.23.1?with=Ramban'],
            ['Toldot', 'Shapira-Stern Family', 'In honor of David Shapira', '/Genesis.25.19?with=Ramban'],
            ['Vayetzei', null, null, '/Genesis.28.10?with=Ramban'],
            ['Vayishlach', null, null, '/Genesis.32.4?with=Ramban'],
            ['Vayashev', null, null, '/Genesis.37.1?with=Ramban'],
            ['Miketz', 'Raquel and Aryeh Rubin', 'In memory of the one and a half million children', '/Genesis.41.1?with=Ramban'],
            ['Vayigash', 'Laurie and Milton Wakschlag', 'In memory of their parents Fishel and Sheva Wakschlag', '/Genesis.44.18?with=Ramban'],
            ['Vayechi', 'The Stein Children', 'In memory of their father Jacob K. Stein z"l', '/Genesis.47.28?with=Ramban']]
            .map(i => <ParashaSponsorship title={i[0]} sponsorNames={i[1]} message={i[2]} link={i[3]}/>)}/>
        </div>

        <StaticHR />

        <div className="staticPageBlockInner flexContainer">
        <ResponsiveNBox content={
            [['Shemot', 'Sam and Debbie Moed', 'In memory of Henry I. Zeisel, who derived tremendous joy from learning. This perush of his bar mitzvah parashah is dedicated with love.', '/Exodus.1.1?with=Ramban'],
            ['Vaera', 'The loving children and children-in-law of Arthur Helft', 'In memory of Dr. Arthur Helft', '/Exodus.6.2?with=Ramban'],
            ['Bo', 'Honey Kessler Amado', 'In memory of her husband, Ralph A. Amado; her parents, Bernard and Mildred Kessler; and our teacher, Rabbi Moshe ben Nachman (Nachmanides).', '/Exodus.10.1?with=Ramban'],
            ['Beshalach', 'Nicole and Raanan Agus', 'In memory of Dr. Saul G. Agus z"l', '/Exodus.13.17?with=Ramban'],
            ['Yitro', 'Anonymous', 'To honor the memory of Joe and Rose Rudis', '/Exodus.18.1?with=Ramban'],
            ['Mishpatim ', null, null, '/Exodus.21.1?with=Ramban'],
            ['Terumah', 'Julia Baum and Adam Feldman', 'In memory of Earl Katz and Annette Steinman', '/Exodus.25.1?with=Ramban'],
            ['Tetzaveh', 'Huti and Jay', 'In Gratitude to all the Health Care Workers during the Pandemic', '/Exodus.27.20?with=Ramban'],
            ['Ki Tisa', 'Nicole and Raanan Agus', 'In memory of Dr. Saul G. Agus z"l', '/Exodus.30.11?with=Ramban'],
            ['Vayahkel', 'The Berkowitz Family', 'In honor of their parents and grandparents (Bebe, Bepop, Pop pop, and grandmama) who provide a sense of inspiration and demonstrate a desire to constantly learn more.', '/Exodus.35.1?with=Ramban'],
            ['Pekudei', 'The Hiltzik Family', '', '/Exodus.38.21?with=Ramban']]
            .map(i => <ParashaSponsorship title={i[0]} sponsorNames={i[1]} message={i[2]} link={i[3]}/>)}/>
        </div>

        <StaticHR />

        <div className="staticPageBlockInner flexContainer">
        <ResponsiveNBox content={
            [['Vayikra', 'Edy and Jacob Kupietzky and Family', '', '/Leviticus.1.1?with=Ramban'],
            ['Tzav', 'Rabbi Ruth Adar', 'In memory of K\'vod HaRav André Zaoui, z"l', '/Leviticus.6.1?with=Ramban'],
            ['Shmini', 'Joshua and Dinah Foer', '', '/Leviticus.9.1?with=Ramban'],
            ['Tazria', 'Diane and Howard Zack and Family', 'In honor of their parents', '/Leviticus.12.1?with=Ramban'],
            ['Metzora', 'Anne Germanacos', 'In honor of Rabbi Noa Kusher and Rabbi Jessica Kate Meyer in gratitude for their brilliance and resilience during the pandemic, and their friendship in all times.', '/Leviticus.14.1?with=Ramban'],
            ['Achrei Mot', 'Anne Germanacos', 'In honor of Rabbi Noa Kusher and Rabbi Jessica Kate Meyer in gratitude for their brilliance and resilience during the pandemic, and their friendship in all times.', '/Leviticus.16.1?with=Ramban'],
            ['Kedoshim', 'Karine and Michael Bloch', 'In honor of our children Eitan, Yoel, and Tali'], ['Emor', 'Joshua and Dinah Foer', '', '/Leviticus.19.1?with=Ramban'],
            ['Behar ', 'Tamar and Eric Goldstein', 'In honor of Aryeh’s aufruf', '/Leviticus.25.1?with=Ramban'],
            ['Bechukotai ', 'Tamar and Eric Goldstein', 'In honor of Aryeh’s aufruf', '/Leviticus.26.3?with=Ramban']]
            .map(i => <ParashaSponsorship title={i[0]} sponsorNames={i[1]} message={i[2]} link={i[3]}/>)}/>
        </div>

        <StaticHR />

        <div className="staticPageBlockInner flexContainer">
        <ResponsiveNBox content={
            [['Bamidbar', 'The Hiltzik Family', '', '/Numbers.1.1?with=Ramban'],
            ['Nasso', 'Annoymous Sponsor', 'In honor of Tzeela, Rina Faiga, Dalia and Penina Malka', '/Numbers.4.21?with=Ramban'],
            ["Beha'alotcha", null, null, '/Numbers.8.1?with=Ramban'],
            ["Sh'lach", 'Meyer Family', 'In honor of the bar mitzvah of George Meyer', '/Numbers.13.1?with=Ramban'],
            ['Korach', 'Fred Blau and Maayan Roth', 'In memory of Sarita Blau, loving mother and teacher', '/Numbers.16.1?with=Ramban'],
            ['Chukat', 'Kevin Waldman', 'In support of Sefaria', '/Numbers.19.1?with=Ramban'],
            ['Balak', null, null, '/Numbers.22.2?with=Ramban'],
            ['Pinchas', 'The Berkowitz Family', "In honor of our parent's and grandparent's (Bebe, Bepop, Pop pop, and grandmama) who provide a sense of inspiration and demonstrate a desire to constantly learn more.", '/Numbers.25.10?with=Ramban'],
            ['Matot', 'Shprintzy and Effy', 'Dedicated in memory of the late Mendel Schoenberg, son of the late Naftali Binyamin and Shprintza. Born in Sanok, Poland, in Elul, between the years 5684 and 5686. Passed away at a ripe old age at his home in Brooklyn, New York, on the First Night of Chanukah 5779.', '/Numbers.30.2?with=Ramban', '/Numbers.33.1?with=Ramban'],
            ['Masei', 'Nadine and Beni Gesundheit', '', '/Numbers.33.1?with=Ramban']]
            .map(i => <ParashaSponsorship title={i[0]} sponsorNames={i[1]} message={i[2]} link={i[3]}/>)}/>
        </div>

        <StaticHR />

        <div className="staticPageBlockInner flexContainer">
        <ResponsiveNBox content={
            [['Devarim', null, null, '/Deuteronomy.1.1?with=Ramban'],
            ['Vaetchanan', 'Becky and Avi Katz', 'In honor of Sefaria', '/Deuteronomy.3.23?with=Ramban'],
            ['Eikev', 'Annoymous Sponsor', '', '/Deuteronomy.7.12?with=Ramban'],
            ["Re'eh", 'Tamar and Eric Goldstein', "In honor of Adin's aufruf", '/Deuteronomy.11.26?with=Ramban'],
            ['Shoftim', 'Tricia Gibbs', 'In memory of F. Warren Hellman', '/Deuteronomy.16.18?with=Ramban'],
            ['Ki Tetzei', 'The Katz Family', 'In honor of the victims of Covid-19', '/Deuteronomy.21.10?with=Ramban'],
            ['Ki Tavo ', 'Rechtschaffen Family', "In honor of the 3rd anniversary of Jordan Rechtscaffen's bar mitzvah", '/Deuteronomy.26.1?with=Ramban'],
            ['Nitzavim', 'Jeremy Rosenthal', 'In honor of Judy and Stuart Rosenthal, in gratitude for their commitment to a sustained Jewish future.', '/Deuteronomy.29.9?with=Ramban'],
            ['Vayeilech', 'Nicole and Raanan Agus', 'In memory of Dr. Saul G. Agus z"l', '/Deuteronomy.31.1?with=Ramban'],
            ["Ha'Azinu", 'Mayer', 'In honour of Shalom Rosenzweig, on the occasion of his Bar Mitzvah, October 10, 1992', '/Deuteronomy.32.1?with=Ramban'],
            ["V'Zot HaBerachah", 'Elisha Wiesel', 'In memory of Elie Wiesel', '/Deuteronomy.33.1?with=Ramban']]
            .map(i => <ParashaSponsorship title={i[0]} sponsorNames={i[1]} message={i[2]} link={i[3]}/>)}/>
        </div>
        <Spacer/>
        <Spacer/>
        <Spacer/>
        <div className="staticPageCallToActionFooter">
            <div className="staticPageBlockInner flexContainer">
                <div className="callToActionText noButton">
                    <span className={`${Sefaria.languageClassFont()}`}>Interested in sponsoring a parashah? Please email {emailLink} for more information.</span>
                </div>
            </div>
        </div>
    </StaticPage>
};

const SheetsLandingPage = () => (
    <StaticPage>
        <Header
            enTitle="Create with Sefaria"
            enText="Mix and match sources from Sefaria’s library of Jewish texts, and add your comments, images and videos."
            enImg="/static/img/sheets-landing-page/sheetspage_headerimage.png"
            enImgAlt="Sefaria Sheets"
            enActionURL="/sheets/new?utm_source=Sefaria&utm_medium=LandingPage&utm_campaign=Sheets"
            enActionText={Sefaria._("side_nav.make_sheet")}
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
            heText="תוכלו לבחור טקסטים מתוך שלל המקורות בספרייה שלנו ולצרף אותם לדף מקורות. הקלידו את שם המקור ואת מספר הפרק כדי להוסיף אותו לדף המקורות שלכם. בשלב הבא תוכלו לערוך ולקצר את המקור, לבחור בתרגום אחר ולארגן את המקורות בסדר הרצוי לכם."
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
            heText="התוצר שלכם יכול להיות יותר מרשימת מקורות בלבד. תוכלו בקלות להוסיף הערות, פרשנות והסברים משלכם וכן טקסטים אחרים כדי ליצור משהו חדש. לחוויית לימוד משמעותית יותר תוכלו אפילו להוסיף תמונות וסרטונים."
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
            heText="תוכלו לשתף את דף המקורות באופן פרטי בעזרת לינק, להדפיס אותו עבור הכיתה שלכם או להעלות אותו לאתר שלנו לתועלת ציבור הגולשים. אתם מוזמנים להוסיף את דף המקורות לספרייה שלנו – תוכלו למצוא בה למעלה מ־200,000 דפי מקורות שנוצרו על ידי גולשי האתר."
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
                    author="יכין אפשטיין (זושא: מגלים את הסיפור החסידי)"
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
            <ButtonRow enTitle="Browse our Latest Resources" heTitle="מקורות בספריא">
                <SimpleButton
                    white={true}
                    rounded={false}
                    tall={true}
                    href="/collections/educator-newsletters?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he_href="/sheets/219410?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he="דפי מקורות אקטואליים"
                    en="Educator Newsletters"
                />
                <SimpleButton
                    white={true}
                    rounded={false}
                    tall={true}
                    href="/sheets/227733?lang=bi?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he_href="/sheets/227981.5?lang=he&utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he="נגיף הקורונה"
                    en="A Jewish Response to COVID-19"
                />
                <SimpleButton
                    white={true}
                    rounded={false}
                    tall={true}
                    href="/collections/KGvMhYW3#?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he_href="/collections/KGvMhYW3?lang=he&utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                    he="עשרת הדיברות ללמידה מרחוק"
                    en="Online Learning Resources"
                />
            </ButtonRow>
        </GreyBox>
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
                href="/collections/webinars-for-learners?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224909?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="וובינרים"
                en="Webinars for Learners"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/collections/help-center?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224919?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="מדריך למשתמש המתחיל"
                en="Tutorials for Learners"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/collections/sefaria-student-course?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
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
                href="/collections/webinars-for-educators?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224909?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="וובינרים"
                en="Webinars for Educators"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="/collections/tutorials-for-educators?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he_href="/sheets/224923?lang=he?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
                he="קורס למורים: 'ספריא בכיתה'"
                en="Tutorials for Educators"
            />
            <SimpleButton
                white={true}
                rounded={false}
                tall={true}
                href="https://sefaria.typeform.com/to/tJVexqpG?utm_source=sefaria&utm_medium=landingpage&utm_campaign=remotelearning"
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

const EducatorsPage = () => (
  <StaticPage>
    <HeaderForEducatorsPage/>
    <GreyBox>
      <H2Block en="Empower and Engage" he="מסע של גילוי"/>
      <EnBlock padded={true}>
        <p>Empower your students with Sefaria’s free library of digital texts, in Hebrew and English translation, and use our teaching materials to spark creativity and foster independence. Learn new ways of teaching and engaging your students in the centuries-old conversation around Jewish texts, and join Sefaria’s Educator community.</p>
      </EnBlock>
      <HeBlock padded={true}>
        <p>            דמיינו את התלמידים שלכם  מטיילים במסדרונות ספריית ענק ושולפים ספרים עתיקים וחדשים בהם מתגלים דמויות, רעיונות ומחשבות מתוך העולם היהודי שנכתבו במשך 3000 שנה. בספריא החלום הופך למציאות. הובילו את התלמידים למסע של גילוי ולמידה בין המקורות של ארון הספרים היהודי.</p>
      </HeBlock>
      <Spacer/>
    </GreyBox>


    <Feature
      enTitle="Professional Development"
      enText="Whether you’re a pro or a new user, Sefaria has resources to help you and your students learn and thrive. Join a Sefaria webinar, browse our tutorials, sign up for our Educator course, or request a custom workshop for your team or your students."
      enImg="/static/img/educators-landing-page/teaching-with-sefaria-library.png"
      enImgAlt="Professional Development"
      heTitle="איך להשתמש באתר?"
      heText='נתחיל בהתחלה: "המדריך למשתמש בספריא" מורכב מיחידות מודרכות בהן נלמדות צעד אחר צעד האפשרויות השונות באתר ספריא. באסופה "ספריא לתלמידים" נמצאות הדרכות על השימוש באתר שמותאמות במיוחד עבור למידה עצמאית של תלמידים. כדי ללמוד ולהכיר חלק מסוים באתר תוכלו להשתמש באסופה של "שאלות נפוצות".'
      heImg="/static/img/educators-landing-page/teaching-with-sefaria-library-heb.png"
      heImgAlt="Professional Development"
      borderColor={palette.colors.darkblue}
    />

    <ButtonRow white={true} enTitle="" heTitle="">
      { [
          ["Online Educator Course", "מדריך למשתמש בספריא", "https://sefaria.typeform.com/to/tJVexqpG", "https://www.sefaria.org.il/sheets/361600?lang=he"],
          ["Lesson Plans on Sefaria", "ספריא לתלמידים", "/collections/pedagogy-on-sefaria-exemplary-lesson-plans", "https://www.sefaria.org.il/collections/KGMlHrvA"],
          ["Schedule A Workshop", "שאלות נפוצות", "https://sefaria.typeform.com/to/Pl3biam8", "https://www.sefaria.org.il/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90"]
      ].map(i =>
          <SimpleButton
              white={true}
              rounded={false}
              tall={true}
              newTab={true}
              href={i[2]}
              he_href={i[3]}
              he={i[1]}
              en={i[0]}
          />)
      }
    </ButtonRow>

     <Feature
      enTitle="Resources for Educators"
      enText="Stay up to date with the latest news and resources from Sefaria. Learn from other educators’ experiences teaching and using Sefaria’s resources, and get inspired to try new things in your work. Discover our adaptable lesson plans and resources, or find learning materials and activities ready-to-go for your classroom!"
      enImg="/static/img/educators-landing-page/megillah-activity.png"
      enImgAlt="Resources for Educators"
      heTitle="מערכי שיעור וחומרי הוראה"
      heText="צוות החינוך של ספריא יצר ואסף עבורכם המורים, חומרי הוראה בעזרתם תוכלו להעשיר ולהעמיק את הלמידה. <br><br>לפניכם אסופה של מערכי שיעור בנושאים שונים, הצעה לתהליך של עבודת חקר באמצעות ספריא ורעיונות להערכה חלופית."
      heImg="/static/img/educators-landing-page/369968.png"
      heImgAlt=""
      borderColor={palette.colors.gold}
      link=""
     />

    <ButtonRow white={true} enTitle="" heTitle="">
      { [
          ["Past Educator Newsletters", "10 רעיונות להערכה חלופית", "/collections/qZ0UWi5y", "https://www.sefaria.org.il/sheets/281661?lang=he"],
          ["Sefaria in Action", "עבודת חקר: מסע בין מקורות", "/sheets/311116?lang=bi", "https://www.sefaria.org.il/collections/%D7%A2%D7%91%D7%95%D7%93%D7%AA-%D7%97%D7%A7%D7%A8-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90-%D7%9E%D7%A1%D7%A2-%D7%91%D7%99%D7%9F-%D7%9E%D7%A7%D7%95%D7%A8%D7%95%D7%AA"],
          ["For Your Students", "מערכי שיעור", "/sheets/311291?lang=bi", "https://www.sefaria.org.il/sheets/361593?lang=he"]
      ].map(i =>
          <SimpleButton
              white={true}
              rounded={false}
              tall={true}
              newTab={true}
              href={i[2]}
              he_href={i[3]}
              he={i[1]}
              en={i[0]}
          />)
      }
    </ButtonRow>
    <Feature
      enTitle="Sefaria for Educators How-Tos"
      enText="Browse our FAQ’s and learn more about how to use Sefaria’s tools to study and to teach. Sefaria’s Learning Team is always available to support you and your students or answer any questions you might have. If there are texts, translations, lesson plans, or student materials that would enhance your teaching, please share that with us as well."
      enImg="/static/img/educators-landing-page/tutorials-for-educators.png"
      enImgAlt="Sefaria for Educators How-Tos"
      heTitle="גם את זה יש בספריא! אל תחמיצו!"
      heText='מאגר ספריא הוא גדול ובתוכו אפשרויות לימוד רבות. מוזמנים לעיין באסופות מעניינות ושימושיות, להכיר את עמוד הקהילה והתכנים שבו וגם לגלות את "הסודות של ספריא"'
      heImg="/static/img/educators-landing-page/228260.png"
      heImgAlt=""
      borderColor={palette.colors.red}
    />

    <ButtonRow white={true} enTitle="" heTitle="">
      { [
          ["Educator FAQ", "אסופות מומלצות", "/collections/tutorials-for-educators","https://www.sefaria.org.il/sheets/360599?lang=he"],
          ["Request New Resources", "עמוד הקהילה", "https://sefaria.typeform.com/to/aaZmi4JD","https://www.sefaria.org.il/community"],
          ["Webinars for Educators", "הסודות של ספריא", "/collections/qJLU68HQ","https://www.sefaria.org.il/sheets/228260.2?lang=he"]
      ].map(i =>
          <SimpleButton
              white={true}
              rounded={false}
              tall={true}
              newTab={true}
              href={i[2]}
              he_href={i[3]}
              he={i[1]}
              en={i[0]}
          />)
      }
    </ButtonRow>

    <GreyBox>
      <H2Block en="Get in touch" he="אנחנו רוצים לשמוע מכם"/>
      <EnBlock padded={true}>
          <p>Was your teaching enhanced by Sefaria? Did you have a “Sefaria moment” with your students? Share it with us! We love to hear how educators are using Sefaria in the field and we learn from the feedback we receive. We are also available to answer all of your Sefaria questions. Write to us at education@sefaria.org.</p>
      </EnBlock>
      <HeBlock padded={true}>
          <p>אנחנו לומדים רבות ממורים ותלמידים שמספרים לנו על ההתנסות שלהם עם ספריא. נשמח מאד אם תשתפו אותנו בחוויית הלימוד שלכם. אתם מוזמנים ליצור איתנו קשר כדי לתאם הדרכה למורים וגם לתלמידים,  לספר לנו על חוויית הלמידה עם ספריא ולהתייעץ איתנו בכל דבר ועניין</p>
          <p>כתבו לנו לכתובת המייל hello@sefaria.org</p>

      </HeBlock>
      <Spacer/>
    </GreyBox>

    <H2Block en="What the educators have to say…" he="מורים ותלמידים ממליצים"/>

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
          heText='עבורי ספריא הוא מרחב פעילות חינוכי רב ענפים, בית מדרש דיגיטלי שלם. משמש עבורי כספריה  ללימוד ולהכנת חומרי לימוד ודפי מקורות  לתלמידיי. עבור תלמידיי זה המקום שאליו נכנסים לחפש, לקרא ולבנות דפי מקורות אותם הם לומדים בחברותא ומלמדים את חבריהם.    דבר גדול הוא שתלמיד נכנס כל פעם להיכל, לספריה שלמה מחפש ומדפדף  ואגב כך  נחשף לעושר גדול - זה דבר חשוב מאין כמותו. כך  שלפעמים מחפשים אתונות ומוצאים מלוכה.'
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
        <SubscribeButton
                     enAction={"Sign up to get updates"}
                     heAction={"རིམ་སྤར་ཐོབ་པ་ལ་ཞུགས་ཐོ་གསར་འགོད་བྱོས།"}
                     heLists={"Announcements_General_Hebrew|Announcements_Edu_Hebrew"}
                     enLists={"Announcements_General|Announcements_Edu"}
                     redirectURL={"/register?educator=true&next=/educators"}
        />
      </div>
    </div>


  </StaticPage>
);

const RabbisPage = () => (
  <StaticPage>
    <HeaderForRabbisPage/>
    <GreyBox>
      <H2Block en="Engage Your Community and Share Your Torah" he=""/>
      <EnBlock padded={true}>
        <p>Engage your community in learning using Sefaria’s free library of digital texts, in Hebrew and English translation. Enjoy having an extensive library at your fingertips for learning in the synagogue, on campus, at home or on the go. Share your Torah with Sefaria learners near and far.</p>
      </EnBlock>
      <Spacer/>
    </GreyBox>


    <Feature
      enTitle="Sefaria in Your Community"
      enText="Explore the ways in which Sefaria supports teaching and learning. Whether you’re a pro or a new user, Sefaria has resources to help you and your community learn and thrive. Request a custom workshop for your team or your community, discover how to use Chavruta for learning events, and share your Divrei Torah and Sermons using Collections."
      enImg="/static/img/rabbis-landing-page/sara+rabbis.jpg"
      enImgAlt="Sefaria in Your Community"
      borderColor={palette.colors.darkblue}
    />

    <ButtonRow white={true} enTitle="" heTitle="">
      { [
          ["Schedule A Workshop", "שאלות נפוצות", "https://www.sefaria.org/sheets/370615?lang=bi", "https://www.sefaria.org.il/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90"],
          ["Innovating with a Digital Library", "", "https://www.sefaria.org/sheets/415628?lang=bi", ""],
          ["Collections: A Home for Sermons and Classes", "", "https://www.sefaria.org/sheets/370836?lang=bi", ""]
      ].map(i =>
          <SimpleButton
              white={true}
              rounded={false}
              tall={true}
              newTab={true}
              href={i[2]}
              he_href={i[3]}
              he={i[1]}
              en={i[0]}
          />)
      }
    </ButtonRow>

     <Feature
      enTitle="Resources for Rabbis"
      enText="Stay up to date with the latest news and resources from Sefaria. Find relevant texts and sheets for thousands of topics, use and share Sefaria’s Chavruta feature for your own chavruta study, and get inspired to try something new in your work."
      enImg="/static/img/rabbis-landing-page/Sermon landing page screenshot.png"
      enImgAlt="Resources for Rabbis"
      borderColor={palette.colors.gold}
      link=""
     />

    <ButtonRow white={true} enTitle="" heTitle="">
      { [
          ["Past Rabbi Newsletters", "", "https://www.sefaria.org/collections/T-5hbqOq?tab=sheets", ""],
          ["Topics Tutorial", "", "https://www.sefaria.org/sheets/231377?lang=bi", ""],
          ["Studying With a Partner: A Chavruta Tutorial", "", "https://www.sefaria.org/sheets/263246?lang=bi", ""]
      ].map(i =>
          <SimpleButton
              white={true}
              rounded={false}
              tall={true}
              newTab={true}
              href={i[2]}
              he_href={i[3]}
              he={i[1]}
              en={i[0]}
          />)
      }
    </ButtonRow>
    <Feature
      enTitle="Sefaria How-Tos"
      enText="Browse our Help Center and learn more about how to use Sefaria’s tools to study and to teach. Sefaria’s Learning Team is always available to support you or answer any questions you might have. If there are texts, translations, or learning materials that would enhance your work, please share that with us as well!"
      enImg="/static/img/rabbis-landing-page/help-center-screenshot.png"
      enImgAlt="Sefaria How-Tos"
      borderColor={palette.colors.red}
    />

    <ButtonRow white={true} enTitle="" heTitle="">
      { [
          ["Help Center", "", "https://www.sefaria.org/collections/help-center",""],
          ["Webinars", "", "https://www.sefaria.org/sheets/228105?lang=bi",""],
          ["Request New Resources", "", "https://sefaria.typeform.com/to/aaZmi4JD?typeform-source=www.sefaria.org",""]
      ].map(i =>
          <SimpleButton
              white={true}
              rounded={false}
              tall={true}
              newTab={true}
              href={i[2]}
              he_href={i[3]}
              he={i[1]}
              en={i[0]}
          />)
      }
    </ButtonRow>

    <GreyBox>
      <H2Block en="Keep in touch" he="אנחנו רוצים לשמוע מכם"/>
      <EnBlock padded={true}>
          <p>Was your work enhanced by Sefaria? Did you have a “Sefaria moment” with your learning community? Share it with us! We love to hear how rabbis are using Sefaria in the field and we learn from the feedback we receive. We are also available to answer all of your Sefaria questions. Write to us at education@sefaria.org.</p>
      </EnBlock>
      <Spacer/>
    </GreyBox>

    <H2Block en="As the Rabbis say…" he="מורים ותלמידים ממליצים"/>

    <EnBlock>
    <Section>
      <UserQuote
          heText=""
          enText="“Sefaria is a gift to those of us seeking not just the conclusions to Halakhic arguments, but the entirety of the conversation; we are the ones who look up every citation and want to fully grasp the web of discourse for ourselves and Sefaria makes that so easy. It is equally a gift to those of us who teach and know the importance of providing readable and easy to find sources for our students. I use Sefaria to create and share annotated source sheets with some of the more complicated sources we discuss and invite my students to iterate on those sheets in turn. Before applying to rabbinical school, I studied how Sefaria shaped students' experiences of learning. Now, I am lucky to study Torah with my students using Sefaria.”"
          enName="Rabbanit Dr. Liz Shayne"
          heName=""
          image="/static/img/rabbis-landing-page/lizshayne 1.png"
      />
      <UserQuote
          enText="“Sefaria’s commitment to digital text access for all who seek to take hold of Torah played a pivotal and unparalleled role in my rabbinical school journey. As a blind woman in the rabbinate, Sefaria’s digital library enabled me to access texts with ease for both educational and Torah lishma purposes. With much hakarat hatov do I thank Sefaria for the holy work you are doing.”"
          heText=""
          enName="Rabbi Lauren Tuchman"
          heName=""
          image="/static/img/rabbis-landing-page/lauren-tuchman.png"
      />
      <UserQuote
        heText=""
        enText="“As a Rabbi, I have come to rely on Sefaria for my own lishmah study, as well as for creating source sheets for programs and study sessions in my community. I look forward to all that Sefaria still has in store for the Jewish world, and am proud to continue supporting your work.”"
        enName="Rabbi Max Chaiken | Temple Emanuel | Andover, MA"
        heName=""
        image="/static/img/rabbis-landing-page/Rabbi-Chaiken-Headshot.png"
      />
      <UserQuote
        enText="“Due to Hurricane Harvey in 2017 I lost about half of my library.  While some of the lost seforim have been replaced, I do not have the physical space to have access to them.  I have relied on the amazing Sefaria library to make up for the books that I am missing or cannot get to. I use Sefaria on a daily basis and there are some days that it is open on my computer all day long.  Sefaria and I spend extra time together on Friday when it is Drasha preparation time. I am grateful for the regular updates and additions Sefaria makes to the library.”"
        heText=""
        enName="Rabbi Barry Gelman | Director of the Bobbi and Vic Samuels Center For Jewish Living and Learning | ERJCC in Houston"
        heName=""
        image="/static/img/rabbis-landing-page/Rabbi Gelman 1.png"
      />
      <UserQuote
        enText="“My community and I worked this summer to put together a haggadah for the high holidays and wanted to thank you for all the help Sefaria provided as a source for Hebrew texts and inspiration. We couldn't dive as deep into our faith as we do without you! You offer us an ocean of Torah and boats to set sail upon it.”"
        heText=""
        enName="Rabbi David Winship | Temple Beth David of the South Shore"
        heName=""
        image="/static/img/rabbis-landing-page/rabbi-david-winship.png"
      />
    </Section>
    </EnBlock>



    <div className="staticPageCallToActionFooter">
      <div className="staticPageBlockInner flexContainer">
        <SimpleInterfaceBlock classes="callToActionText" en="Sign up for our mailing list to get updates in your inbox" he="קבלו עדכונים והפניות למקורות מעניינים" />
        <SubscribeButton
             enAction={"Sign up for Rabbi Newsletter"}
             heAction={"הירשמו לקבלת הניוזלטר"}
             heLists={"Announcements_General_Hebrew|Announcements_Edu_Hebrew"}
             enLists={"Announcements_General|Announcements_Edu"}
             redirectURL={"/register?next=/rabbis"}
            />
      </div>
    </div>

  </StaticPage>
);

const PBSC2020LandingPage = () => (
    <StaticPage>
        <Header
            enTitle="Powered by Sefaria Contest 2020"
            enText="Explore the Projects"
            enImg="/static/img/pbsc-2020-landing-page/codemockup3.png"
            enImgAlt=""
            heTitle="תחרות פיתוח תוכנה 2020"
            heText="הכירו את המיזמים"
            heImg="/static/img/pbsc-2020-landing-page/codemockup3.png"
            heImgAlt=""
        />

        <GreyBox>
            <H2Block en="Inviting Innovation" he=""/>
            <EnBlock padded={true}>
                <p>In an effort to seed the digital future of Jewish texts, the Powered by Sefaria Contest was launched in July 2020 — inviting the global Sefaria community to make use of our free and open digital dataset of Jewish texts, translations, and interconnections. Over the years, dozens of third parties have created apps, visualizations, and conducted research using our data or API, and we wanted to see what else our community could dream up. We saw tremendous enthusiasm and welcomed 50 high quality submissions from Sefaria users around the world. <b>Keep reading to learn more about the two winners and some incredibly innovative honorable mentions.</b></p>
            </EnBlock>
            <HeBlock padded={true}>
                <p>מתוך רצון לטפח את העתיד הדיגיטלי של מקורות יהודיים, הוצאנו לפועל ביולי 2020 את תחרות פיתוח התוכנה של ספריא. הזמנו את קהילת ספריא ברחבי העולם להשתמש במסד הנתונים הפתוח שלנו, הכולל מקורות יהודיים, תרגומים וקישורים אינטרטקסטואליים. במשך השנים השתמשו עשרות גופי צד שלישי ב־API שלנו, ערכו בעזרתו מחקרים ויצרו באמצעותו יישומים ותרשימים גרפיים. כעת רצינו לראות מה עוד הקהילה שלנו מסוגלת להמציא. נענינו בהתלהבות יוצאת דופן וקיבלנו בברכה 50 מיזמים איכותיים מאוד ממשתמשי ספריא ברחבי העולם. המשיכו לקרוא כדי לדעת עוד על שני הזוכים ועל כמה רעיונות יצירתיים מאוד הראויים בעינינו למקום של כבוד.</p>
            </HeBlock>
            <Spacer/>
        </GreyBox>

        <GreyBox light={true}>
            <H2Block en="Grand Prize Winner" he="זוכה הפרס הראשון"/>
        </GreyBox>

        <Feature
            enTitle="Talmud Sidebar Extension"
            enText="By Dov Katz<br/><br/>The Talmud Sidebar Extension brings Sefaria’s learning resources to Daf Yomi sites across the web. Created in response to the move to Zoom for Daf Yomi classes the world over in the wake of COVID-19, the extension recognizes what daf you’re learning or listening to on nearly a dozen Daf Yomi sites. It then enables a sidebar to see connections from Sefaria’s library or link straight back to Sefaria."
            enImg="/static/img/pbsc-2020-landing-page/talmudsidebar.png"
            enImgAlt="Talmud Sidebar Extension"
            heTitle="תוסף סרגל הכלים של התלמוד"
            heText="דב כץ<br/><br/>תוסף סרגל הכלים של התלמוד מביא את משאבי הלימוד של ספריא לאתרי דף יומי ברחבי הרשת. הפיתוח הזה נוצר מתוך רצון להתמודד עם המעבר של שיעורי הדף היומי ברחבי העולם אל המרחב הווירטואלי בעקבות נגיף קורונה.  התוסף יכול לזהות בדיוק מהו הדף שאנחנו לומדים או מאזינים לו מתוך קרוב לתריסר אתרי דף יומי – Hadran.org.il, YUTorah.org, Steinsaltz-center.org, OUTorah.org ועוד – ולפתוח סרגל כלים הכולל קישורים לטקסטים רלוונטיים במאגר של ספריא וכן קישור לדף היומי של ספריא."
            heImg="/static/img/pbsc-2020-landing-page/talmudsidebar.png"
            heImgAlt="תוסף סרגל הכלים של התלמוד"
            borderColor={palette.colors.yellow}
            link="https://chrome.google.com/webstore/detail/talmud-sidebar-extension/dmpiiciebnbekblfbcdeogjkbbmeeimi"
        />

        <GreyBox>
            <H2Block en="Meet the Grand Prize Winner" he="הכירו את הזוכה"/>
            <EnBlock padded={true}>
                <p>Originally from Memphis, TN and now living in Modiin, Israel, Dov Katz leads a developer productivity group for the technology arm of a large financial services firm and enjoys tinkering with tech in his free time. Long interested in the ways technology could increase access to Jewish life and Torah study – he created the popular Jewish site OnlySimchas.com back in 1999! – he invented the Sidebar Extension this summer to meet the new digital needs of his own formerly in-person Daf Yomi shiur. Dov’s passion for access leads him to be a strong advocate of Open Source and he currently sits as the Chairman of the board on the Fintech Open Source Foundation.</p>
            </EnBlock>
            <HeBlock padded={true}>
                <p>דב כץ גדל בממפיס שבמדינת טנסי בארצות הברית וכיום מתגורר במודיעין. הוא עומד בראש צוות פיתוח ייצור באגף הטכנולוגי של חברת שירותים פיננסיים גדולה, ובשעות הפנאי הוא מפתח חובב של חידושים טכנולוגיים. מציאת דרכים להרחבת הגישה לחיים יהודיים וללימוד תורה באמצעות טכנולוגיה מעסיקה את דב זה זמן רב, ועוד בשנת 1999 הוא הקים את האתר המוכר onlysimchas.com, מעין לוח שמחות אינטרנטי. בקיץ האחרון יצר את תוסף סרגל הכלים של התלמוד כדי לענות על צרכים דיגיטליים חדשים בשיעור הדף היומי שלו שהפך מקוון. בזכות התשוקה של דב לשכלול דרכי גישה דיגיטליות הוא נהיה תומך נלהב בקוד פתוח וכיום משמש יו"ר הדירקטוריון של קרן הקוד הפתוח של Fintech.</p>
            </HeBlock>
            <Spacer/>
        </GreyBox>

        <GreyBox light={true}>
            <H2Block en="Youth Prize Winner" he="זוכי פרס המתמודד הצעיר"/>
        </GreyBox>

        <Feature
            enTitle="Mizmor Shir"
            enText="By Immanuel Bissel, Simon Landau, and Ben Kotton<br/><br/>Mizmor Shir explores the intersections of Torah and music as two forms of holy language. Using the Kabbalistic tradition of gematria, Mizmor Shir transforms the text of the Torah into music, in keys and scales that you choose, to reveal unseen (and unheard) patterns within it. "
            enImg="/static/img/pbsc-2020-landing-page/mizmorshir.png"
            enImgAlt="Talmud Sidebar Extension"
            heTitle="מזמור שיר"
            heText='עמנואל ביסל, סיימון לנדאו ובן קוטון<br/><br/>"מזמור שיר" מתבונן בממשקים של תורה ומוזיקה כמפגש בין שתי צורות שונות של שפת קודש. באמצעות שימוש בגימטרייה קבלית הופך מזמור שיר את התורה הכתובה למוזיקה בתווים ובסולמות הניתנים לבחירה, וחושף בה דפוסים שלא נראו (ולא נשמעו) מעולם.'
            heImg="/static/img/pbsc-2020-landing-page/mizmorshir.png"
            heImgAlt="מזמור שיר"
            borderColor={palette.colors.raspberry}
            link="http://mizmor-shir.herokuapp.com/"
        />

        <GreyBox>
            <H2Block en="Meet the Youth Prize Winners" he="הכירו את זוכי הפרס"/>
            <EnBlock padded={true}>
                <p>Mizmor Shir was created by three college students – Simon Landau, a junior at USC majoring in Computer Science; Immanuel Bissel, a rising sophomore at Yale majoring in Earth and Planetary Science; and Ben Kotton, also a rising Sophomore at Yale, majoring in applied mathematics. Friends from a childhood shared in Los Angeles, all three are avid music lovers – Simon plays both orchestral bass as well as guitar in a three-piece band, Emmanuel the guitar, and Ben the mandolin. It was this love that got them excited to respond to Sefaria’s PBS challenge with an idea that combined music with Torah and harnessed the power of technology to reveal the beauty of each in new ways.</p>
            </EnBlock>
            <HeBlock padded={true}>
                <p>מזמור שיר נוצר בידי שלושה סטודנטים – סיימון לנדאו, סטודנט בשנה השלישית למדעי המחשב באוניברסיטת דרום קליפורניה; עמנואל ביסל, סטודנט בשנה השנייה למדעי כדור הארץ וכוכבי הלכת באוניברסיטת ייל; ובן קוטון, סטודנט בשנה השנייה למתמטיקה שימושית באוניברסיטת ייל. שלושתם חברי ילדות מלוס אנג'לס ואוהבי מוזיקה נלהבים: סיימון הוא נגן קונטרבס וגיטריסט בשלישייה מוזיקלית, עמנואל מנגן גם הוא בגיטרה, ובן מנגן במנדולינה. האהבה הזו היא שדרבנה אותם לנסות להתמודד עם האתגר של ספריא בעזרת רעיון ששילב מוזיקה ותורה ורתם את כוחה של הטכנולוגיה לחשוף את היופי שבכל אחת מהן בדרכים חדשות.</p>
            </HeBlock>
            <Spacer/>
        </GreyBox>

        <H2Block en="What the Judges Had to Say" he="דברי השופטים"/>

        <Section>
            <UserQuote
                enText="It was very exciting to see all of the creative applications to the Powered by Sefaria Contest. There was such a wide range of ideas, truly displaying the power of Sefaria to engage a range of audiences. At the core of all of the ideas was creating innovative ways to allow more people to engage with text in a deeper way, from bringing the text to life through interactive museums to creating additional features and ease for the toolbar and the Sefaria browsing experience.<br/><br/>Many of the ideas are very promising and I hope the contestants continue to explore their ideas and bring their passion to life. Thanks to Sefaria for creating such an accessible and open platform to allow for such a meaningful and collaborative competition."
                heText="התרגשנו מאוד לראות את המיזמים היצירתיים שנשלחו לתחרות פיתוח התוכנה של ספריא. מנעד הרעיונות היה רחב במיוחד וחשף את כוחה של ספריא לרתום מגוון קהלים. הלב של כל הרעיונות הללו היה אחד – יצירת דרכים חדשניות לאפשר לעוד ועוד אנשים לעסוק בטקסט באופן עמוק יותר, החל במוזיאונים אינטראקטיביים המפיחים חיים בטקסטים עצמם וכלה בשלל כלים שמטרתם להוסיף נוחות ויעילות לחוויית הגלישה בספריא או לשימוש בסרגל הכלים שלה. רבים מן הרעיונות האלה מבטיחים מאוד, ואנו מקווים שהמשתתפים והמשתתפות ימשיכו לחקור את הרעיונות שלהם ולהגשים את שאיפותיהם. תודה לספריא על יצירת פלטפורמה נגישה ופתוחה כל כך המאפשרת תחרות בעלת ערך ושיתופי פעולה."
                enName="Libby Novack, <i>Chief Operations Officer, Maapilim; Sefaria advisory board member</i>"
                heName='ליבי נובאק, סמנכ"ל תפעול בחברת "מעפילים"; חברה בצוות הייעוץ לספריא.'
                image="/static/img/pbsc-2020-landing-page/libby.png"
            />
            <UserQuote
                enText="Each of the top projects that I looked into were intriguing and useful.The Sidebar extension won deservedly because it is so obviously helpful for increasing Sefaria's efficiency. But I greatly admired the cleverness of the Shulkhan tool, the mathematical sophistication of the Sefer Similarity Map, and the ingenuity and resourcefulness of all the submissions."
                heText='כל אחד מן המיזמים המעולים שבחנתי היו מסקרנים ושימושיים. במקום הראשון זכה ביושר תוסף סרגל הכלים של התלמוד, מכיוון שברור שבכוחו להגביר את היעילות של ספריא בקרב משתמשיה. עם זאת יש בי גם הערכה רבה לפיקחות של מיזם "השולחן", לתחכום המתמטי של "ספר" – מפת הדמיון הטקסטואלית – ולתושייה וכוח ההמצאה של כל אחד מן המיזמים האחרים.'
                enName="Moshe Koppel, <i>Professor of Computer Science at Bar-Ilan University; Founder of DICTA, a laboratory creating computational linguistics tools for the analysis of Jewish and Hebrew texts</i>"
                heName='משה קופל, פרופסור במחלקה למדעי המחשב באוניברסיטת בר־אילן; המקים של "דיקטה", מעבדה לפיתוח כלי לשון דיגיטליים לניתוח של טקסטים עבריים ויהודיים.'
                image="/static/img/pbsc-2020-landing-page/moshe.png"
            />
            <UserQuote
                enText="I was incredibly impressed by the submissions to the Powered by Sefaria contest. When Sefaria started, we could not have imagined the level of technical talent that would be applied to enhancing Sefaria's texts and platform. The submissions to the contest were both interesting and often quite practical, many adding useful features on top of Sefaria's existing platform. I was especially excited to see such wonderful energy from our younger supporters who brought creativity and vision to the contest. Congratulations to all the submitters!"
                heText="התרשמתי עמוקות מן המיזמים שנשלחו לתחרות פיתוח התוכנה של ספריא. כשספריא החלה את פעילותה, לא יכולנו לדמיין שבעתיד ייעשה שימוש ברמה גבוהה כל כך של מיומנות טכנולוגית כדי לשכלל את הפלטפורמה ואת הטקסטים של ספריא. המיזמים שנשלחו לתחרות היו מעניינים ולרוב גם מעשיים למדי, ובהם תוספים שימושיים רבים לפלטפורמה הנוכחית של ספריא. התרגשתי מאוד לראות אנרגיה מופלאה כל כך מתומכינו הצעירים, שהביאו אל התחרות חזון ויצירתיות. ברכות לכל המשתתפים והמשתתפות!"
                enName="Mo Koyfman, <i>Founder of early-stage venture capital firm, Shine Capital; founding Sefaria board member</i>"
                heName="מוֹ קאופמן, מייסד Shine Capital, קרן הון־סיכון לחברות הזנק; חבר הנהלה בצוות המייסדים של ספריא."
                image="/static/img/pbsc-2020-landing-page/mo.png"
            />
        </Section>

        <GreyBox light={true}>
            <H2Block en="Honorable Mentions" he="מיזמים שזכו להערכה מיוחדת"/>
        </GreyBox>

        <Feature
            enTitle="Shulkhan"
            enText="By Joseph Tepperman<br/><br/>Shulkhan is a touch interface for the printed Talmud. Using a camera and projector, Shulkan can watch as you learn with a book and project translations to the passages of text that you touch."
            enImg="/static/img/pbsc-2020-landing-page/shulkhan.png"
            enImgAlt="Shulkhan"
            heTitle="שולחן"
            heText='ג׳וזף טפרמן<br/><br/>שולחן הוא ממשק מגע המיועד לתלמוד מודפס. באמצעות מצלמה ומקרן, "שולחן" יכול לצפות במשתמש בזמן לימוד גמרא ולהקרין תרגומים של הפיסקה שהם נוגעים בה. לקריאה נוספת על המיזם.'
            heImg="/static/img/pbsc-2020-landing-page/shulkhan.png"
            heImgAlt="שולחן"
            borderColor={palette.colors.green}
            link="http://josephtepperman.com/shulkhan.htm"
        />


        <Feature
            enTitle="Goof - Body parts in Tefillah"
            enText="By Judah Kaunfer and Matan Kotler-Berkowitz<br/><br/>Goof lets you explore texts of Tefillah through the lens of the body. Pick a body part and see texts that relate to it. <b>Goof has the honor of being the project submitted to the contest by the youngest entrant, Mr. Kaunfer, at 11 years old.</b>"
            enImg="/static/img/pbsc-2020-landing-page/goof.png"
            enImgAlt="Goof - Body parts in Tefillah"
            heTitle="גוף: איברי הגוף בתפילה"
            heText='יהודה קאונפר ומתן קוטלר־ברקוביץ<br/><br/>גוף עוזר לחקור את הטקסטים של התפילה דרך הגוף. בעזרת "גוף" אפשר לבחור באיבר בגוף ולראות את הטקסטים הקשורים אליו. למיזם זה מקום של כבוד בהיותו המיזם שנשלח לתחרות על ידי המתמודד הצעיר ביותר, מר קאונפר, בן 11 בלבד'
            heImg="/static/img/pbsc-2020-landing-page/goof.png"
            heImgAlt="גוף: איברי הגוף בתפילה"
            borderColor={palette.colors.paleblue}
            link="https://goof.surge.sh/"
        />


        <Feature
            enTitle="Capish - Interactive Learning"
            enText="By Chanah Emunah Deitch and Shalva Eisenberg<br/><br/>Capish is an interactive learning environment for Jewish texts. For this contest, Capish added a feature that allows users to record themselves reading lines of text. As they play back their recordings the users see words highlighted as they are spoken, or jump to parts of the recording by clicking words."
            enImg="/static/img/pbsc-2020-landing-page/capish.png"
            enImgAlt="Capish - Interactive Learning"
            heTitle="קאפיש: לימוד אינטראקטיבי"
            heText="חנה אמונה דייטש ושלווה אייזנברג<br/><br/>קאפיש הוא מרחב לימוד אינטראקטיבי לטקסטים יהודיים. לצורך התחרות נוסף לקאפיש כלי חדש המאפשר למשתמשים להקליט את עצמם בזמן קריאת שורות בטקסט. כאשר מפעילים את ההקלטה, אפשר לראות את המילים המושמעות בולטות בתוך הטקסט או לחלופין לדלג לחלקים אחרים בהקלטה באמצעות לחיצה על מילים בטקסט."
            heImg="/static/img/pbsc-2020-landing-page/capish.png"
            heImgAlt="קאפיש: לימוד אינטראקטיבי"
            borderColor={palette.colors.blue}
            link="https://capish.me/"
        />


        <Feature
            enTitle="Daf Yomi Crossword"
            enText="By Chanoch Goldfarb<br/><br/>Daf Yomi Crossword automatically generates a crossword puzzle based on any page of Talmud. The clues ask you to find words used on the page based on their context, or to find the words that commentaries choose to comment on."
            enImg="/static/img/pbsc-2020-landing-page/dafyomicrossword.png"
            enImgAlt="Daf Yomi Crossword"
            heTitle="תשבץ דף יומי"
            heText="חנוך גולדפרב<br/><br/>תשבץ דף יומי הוא תשבץ שנוצר אוטומטית על בסיס כל עמוד בתלמוד. הרמזים מובילים את המשתמשים למצוא מילים שנעשה בהן שימוש בעמוד בהתאם להקשר שלהן או למצוא מילים שהמפרשים עוסקים בהן."
            heImg="/static/img/pbsc-2020-landing-page/dafyomicrossword.png"
            heImgAlt="תשבץ דף יומי"
            borderColor={palette.colors.orange}
            link="http://ee.cooper.edu/~goldfarb/daf/"
        />


        <Feature
            enTitle="Sefer Similarity Map"
            enText="By Joseph Hostyk and Alex Zaloum<br/><br/>Sefer Similarity Map visualizes relationships among Jewish texts by analyzing their usage of words or phrases to show which texts and sections have the most in common. Exploring the results in graphical form can illuminate historical, authorial, linguistic, and stylistic connections between texts."
            enImg="/static/img/pbsc-2020-landing-page/sefersimilarity.png"
            enImgAlt="Sefer Similarity Map"
            heTitle="ספר– מפת דמיון בין טקסטים"
            heText='ג׳וזף הוסטיק ואלכס זאלום<br/><br/>בעזרת ניתוח של אחוזי השימוש במילים או בביטויים מסוימים, "ספר" – מפת דמיון בין טקסטים – ממחישה את הקשרים בין טקסטים יהודיים, ובאופן זה מראה לאילו מהטקסטים או הקטעים הנבחרים יש הכי הרבה במשותף. הצגת התוצאות בצורה גרפית כזו יכולה לשפוך אור על קשרים היסטוריים, לשוניים וסגנוניים ואחרים בין טקסטים.'
            heImg="/static/img/pbsc-2020-landing-page/sefersimilarity.png"
            heImgAlt="ספר– מפת דמיון בין טקסטים"
            borderColor={palette.colors.lightpink}
            link="https://jhostyk.github.io/SeferSimilarityMap/"
        />


        <Feature
            enTitle="Custom Mikraot Gedolot"
            enText="By Eshel Sinclair and Ben Gold<br/><br/>Custom Mikraot Gedolot lets you create your own Mikraot Gedolot. You choose the texts, translations and up to 9 commentaries, and the app will automatically generate a PDF that you can download and print."
            enImg="/static/img/pbsc-2020-landing-page/mikraotgedolot.png"
            enImgAlt="Custom Mikraot Gedolot"
            heTitle="מקראות גדולות בהתאמה אישית"
            heText="אשל סינקלייר ובן גולד<br/><br/>יישומון מקראות גדולות בהתאמה אישית מאפשר לך ליצור מקראות גדולות אישיות. ביכולתך לבחור את הטקסטים, את התרגומים וכן עד 9 פרשנים שונים, ובהתאם לבחירות אלה ייצור היישומון קובץ PDF באופן אוטומטי."
            heImg="/static/img/pbsc-2020-landing-page/mikraotgedolot.png"
            heImgAlt="מקראות גדולות בהתאמה אישית"
            borderColor={palette.colors.darkblue}
            link="http://ec2-3-129-165-55.us-east-2.compute.amazonaws.com:3002/"
        />


        <Feature
            enTitle="Sefaria Space: (Topic Museum + Text Mania)"
            enText="By David Komer<br/><br/>The Sefaria Space has two parts: the Topic Museum creates an immersive 3D environment where you can explore texts related to a topic as though they were paintings hanging on a wall. Text Mania is a 3D game based on the letters of a text of your choosing."
            enImg="/static/img/pbsc-2020-landing-page/sefariaspace.png"
            enImgAlt="Sefaria Space: (Topic Museum + Text Mania)"
            heTitle="מרחב ספריא (מוזיאון נושאי + טָרֶפֶת טקסט)"
            heText='דוד קומר<br/><br/>מרחב ספריא מורכב משני חלקים: המוזיאון הנושאי – סביבה תלת־ממדית סוחפת שבה אפשר לחקור טקסטים על פי נושא כאילו היו ציורים על הקיר – ו"טרפת טקסט", משחק תלת־ממד המבוסס על האותיות של הטקסט שבחרתם.'
            heImg="/static/img/pbsc-2020-landing-page/sefariaspace.png"
            heImgAlt="מרחב ספריא (מוזיאון נושאי + טָרֶפֶת טקסט)"
            borderColor={palette.colors.darkpink}
            link=" https://sefaria-space.web.app/"
        />


        <Feature
            enTitle="The Rabbinic Citation Network"
            enText="By Michael Satlow and Mike Sperling<br/><br/>Using Sefaria's digital text of the Bavli, the Rabbinic Citation Networks extracts the names and links of rabbis who cite (or who are cited by) other rabbis and visualizes the resulting network."
            enImg="/static/img/pbsc-2020-landing-page/rabbiniccitation.png"
            enImgAlt="The Rabbinic Citation Network"
            heTitle="רשת ציטוטים של חכמי התלמוד"
            heText="מייקל סאטלו ומייק ספרלינג<br/><br/>באמצעות טקסט התלמוד הבבלי המקוון בספריא, רשת הציטוטים של חכמי התלמוד מחלצת את השמות ואת הקישורים של החכמים המצטטים (או המצוטטים בידי) חכמים אחרים וממחישה את רשת התוצאות."
            heImg="/static/img/pbsc-2020-landing-page/rabbiniccitation.png"
            heImgAlt="רשת ציטוטים של חכמי התלמוד"
            borderColor={palette.colors.lavender}
            link="http://www.rabbiniccitations.jewishstudies.digitalscholarship.brown.edu/blog/"
        />


        <Feature
            enTitle="T'Feeling"
            enText="By Matan Kotler-Berkowitz<br/><br/>T’Feeling encourages people to think deeply and intentionally about the connections between t'fillot and emotions. The site allows users to browse t’fillot by emotion (either what they’re currently feeling or what they hope to be feeling), as well as contribute their own ratings for which t’fillot connect most to which emotions."
            enImg="/static/img/pbsc-2020-landing-page/tfeeling.png"
            enImgAlt="T'Feeling"
            heTitle="ת'פילינג"
            heText="מתן קוטלר־ברקוביץ<br/><br/>ת'פילינג (T’Feeling) מעודד לחשוב בצורה עמוקה ומכוונת יותר על הקשרים שבין תפילות ורגשות. האתר מציג למשתמשים שלל תפילות על פי רגש (שאותו הם מרגישים עכשיו או מייחלים לחוש), וכן מאפשר להם לדרג אילו תפילות הן המתאימות ביותר לכל רגש."
            heImg="/static/img/pbsc-2020-landing-page/tfeeling.png"
            heImgAlt="ת'פילינג"
            borderColor={palette.colors.yellow}
            link="https://tfeeling.netlify.app"
        />


        <Feature
            enTitle="CiteMakor"
            enText="By Ariel Caplan<br/><br/>CiteMakor is a Twitter bot which accepts requests for citations and responds by tweeting back one or more images that include the cited text. The goal of CiteMakor is to make it easy to bring source texts into discussions of Jewish topics on Twitter."
            enImg="/static/img/pbsc-2020-landing-page/citemakor.png"
            enImgAlt="CiteMakor"
            heTitle="המצ'טט"
            heText="אריאל קפלן<br/><br/>המצ'טט הוא בוט טוויטר המקבל בקשות למקורות מסוימים ומשיב על ידי ציוץ של תמונה אחת או יותר הכוללת את הטקסט המצוטט. מטרת־העל של המצ'טט היא להקל על הבאת מקורות טקסטואליים לתוך דיונים יהודיים עכשוויים בטוויטר."
            heImg="/static/img/pbsc-2020-landing-page/citemakor.png"
            heImgAlt=""
            borderColor={palette.colors.purple}
            link="https://twitter.com/CiteMakor"
        />


        <Feature
            enTitle="Gifaria"
            enText="By John Cassil and Tiger Tang<br/><br/>For a little bit of fun, gifaria finds GIFs relevant to any verse in Tanakh. This project provides an engaging way for people to interact with biblical texts in a lighthearted way."
            enImg="/static/img/pbsc-2020-landing-page/gifaria.png"
            enImgAlt="Gifaria"
            heTitle="גיפַריא"
            heText='ג׳ון קסיל וטייגר טאנג<br/><br/>אי אפשר בלי קצת כיף. בעזרת גיפריא תוכלו למצוא גיפים רלוונטיים לכל פסוק בתנ"ך. המיזם הזה מספק דרך אטרקטיבית וקלילה לעסוק בטקסטים תנ"כיים.'
            heImg="/static/img/pbsc-2020-landing-page/gifaria.png"
            heImgAlt="גיפַריא"
            borderColor={palette.colors.lightblue}
            link="https://tiger-tang.shinyapps.io/gifaria/"
        />


        <Feature
            enTitle="The Taryag Mitzvos"
            enText="By Rafi Wolfe<br/><br/>The Taryag Mitzvos is an interactive visualization of the 613 commandments, and the different ways that different scholars have enumerated that list. The interface lets users view and sort according to which opinions support each mitzvah’s inclusion, as well as compare the differences between different lists."
            enImg="/static/img/pbsc-2020-landing-page/thetaryag.png"
            enImgAlt="The Taryag Mitzvos"
            heTitle='תרי"ג מצוות'
            heText='רפי וולף<br/><br/>תרי"ג מצוות הוא המחשה אינטראקטיבית של 613 המצוות ושל שלל דרכי המנייה שלהן שנקטו חכמים שונים ביצירת הרשימה הזו. הממשק מאפשר למשתמשים ולמשתמשות לגלות אילו מצוות נמנו בידי אילו רבנים ולמיין אותן בהתאם, וכן להשוות בין הרשימות'
            heImg="/static/img/pbsc-2020-landing-page/thetaryag.png"
            heImgAlt='תרי"ג מצוות'
            borderColor={palette.colors.lightgreen}
            link="https://thetaryag.com/"
        />


        <Feature
            enTitle="3D Tanach Family Tree"
            enText='By Moshe Escott, Shlomo Gordon, Simcha Schaum, Aaron Farntrog and Ari Abramowitz<br/><br/>The 3D Tanach Family Tree is an interactive 3D visualization of characters mentioned in Tanach. As you float through the tree you can find information about each character, search relationships between them, and find verses on Tanach where they appear.  Select "Tanach Family Tree" from the menu at top right to view.'
            enImg="/static/img/pbsc-2020-landing-page/familytree.jpg"
            enImgAlt="3D Tanach Family Tree"
            heTitle='אילן יוחסין תנ"כי תלת ממדי'
            heText='משה אסקוט, שלמה גורדון, שמחה שאום, אהרון פרנטרוג וארי אברמוביץ<br/><br/>אילן היוחסין התנ"כי והתלת־ממדי הוא המחשה תלת־ממדית של דמויות תנ"כיות. ביכולתך לשוטט בתוך האילן ולמצוא מידע על כל דמות ודמות, לחפש קשרים ביניהן ולגלות פסוקים שבהם הן נזכרות. כדי לצפות באילן, יש ללחוץ על "אילן יוחסין תנ"כי" שבתפריט הנמצא בפינה הימנית העליונה של הדף.'
            heImg="/static/img/pbsc-2020-landing-page/familytree.jpg"
            heImgAlt='אילן יוחסין תנ"כי תלת־ממדי'
            borderColor={palette.colors.red}
            link="http://www.basehasefer.com/"
        />


        <Feature
            enTitle="Gematriaphone"
            enText="By Alexander Boxer<br/><br/>Gematriaphone lets you hear the Torah's hidden mathematical music. Starting from any word of Torah, users can hear tones corresponding to the gematria of each word as it is highlighted on the screen."
            enImg="/static/img/pbsc-2020-landing-page/gematriaphone.png"
            enImgAlt="Gematriaphone"
            heTitle='גימטריה קולית'
            heText="אלכסנדר בוקסר<br/><br/>הגימטריה הקולית מאפשרת לך לשמוע את המוזיקה המתמטית החבויה בתורה. המשתמשים והמשתמשות יכולים לבחור כל מילה בתורה, לשמוע את הצלילים על פי הגימטריה שלה ולראות אותה מודגשת על הצג."
            heImg="/static/img/pbsc-2020-landing-page/gematriaphone.png"
            heImgAlt="גימטריה קולית"
            borderColor={palette.colors.teal}
            link="http://alexboxer.com/gematriaphone/"
        />


        <Feature
            enTitle="sefaria-connections"
            enText="By Charles Loder<br/><br/>Sefaria-connections is an interactive visualization of the connections between texts in Sefaria’s library. Starting from any line of Tanakh you can choose a type of connection, see the sources that match that type, and see the sources connected to those sources."
            enImg="/static/img/pbsc-2020-landing-page/sefariaconnections.png"
            enImgAlt="SefariAcrostic"
            heTitle="קשרי ספריא"
            heText='צ׳רלס לודר<br/><br/>קשרי ספריא הם המחשה אינטראקטיבית של הַקשרים שבין הטקסטים המצויים בספריית ספריא. אפשר לבחור כל פסוק בתנ"ך ואת סוג הקשר האינטרטקסטואלי, לראות את המקורות המתאימים לסוג הקשר הזה ולגלות את המקורות הקשורים לאותם המקורות.'
            heImg="/static/img/pbsc-2020-landing-page/sefariaconnections.png"
            heImgAlt="קשרי ספריא"
            borderColor={palette.colors.tan}
            link="https://charlesloder.github.io/sefaria-connections/"
        />


        <Feature
            enTitle="SefariAcrostic"
            enText="By Ezra Gordon<br/><br/>SefariaAcrostic searches books of Tanakh for acrostics that match a person’s Hebrew name. Acrostics can be used to create digital art or to inspire personalized artwork for a simcha, such as finding an acrostic with the couple's names for a wedding."
            enImg="/static/img/pbsc-2020-landing-page/acrostic.png"
            enImgAlt="SefariAcrostic"
            heTitle="ספריאקרוסטיכון"
            heText='עזרא גורדון<br/><br/>ספריאקרוסטיכון מסוגל למצוא אקרוסטיכונים בספרי התנ"ך לפי שמות פרטיים עבריים. בעזרת המיזם אפשר ליצור אומנות דיגיטלית או קטע אומנות אישי לצורך אירוע משמח, למשל אקרוסטיכון לחתונה עם שמות בני הזוג.'
            heImg="/static/img/pbsc-2020-landing-page/acrostic.png"
            heImgAlt="ספריאקרוסטיכון"
            borderColor={palette.colors.lightbg}
            link="https://20gordone.github.io/SefariaContest/"
        />


        <CallToActionFooterWithButton
            href="https://github.com/Sefaria/Sefaria-Project"
            he_href="https://github.com/Sefaria/Sefaria-Project"
            enText="Want to create something of your own?"
            heText="רוצה ליצור משהו משלך?"
            enButtonText="GitHub"
            heButtonText="GitHub"
        />

        <ButtonRow white={true} enTitle="Explore more projects" heTitle="למידע על עוד כמה מיזמים">
            { [
                ["Abba Saul", "", "https://github.com/scopreon/abba-saul/"],
                ["Amud-anan", "", "https://github.com/Binyomin-Cohen/sefaria"],
                ["Bashamayim Hi", "", "https://yosefsklar.github.io/bashamayim-hi/"],
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
                ["Sheilta", "", "https://www.sheilta.ml/"],
                ["Talmud Note", "", "https://play.google.com/store/apps/details?id=com.graytapps.talmudnote"],
                ["Talmudoi Beyodoi", "", " https://torah.yiddishe-kop.com/"],
                ["The Jewish Story Through Books", "", "https://joshcooper417.github.io/"],
                ["Torah for the Blind", "", "https://torahfortheblind.com/"],
                ["Tweet Yomi", "", "https://tweetyomi.org/"],
                ["Visualizations of Sefaria", "", "https://guedalia.github.io/testab/test"],
                ["Visualizing Talmud Topics", "", "https://share.streamlit.io/guedalia/streamlit/main/first_app.py"],
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
                    he={i[0]}
                    en={i[0]}
                />)
            }
        </ButtonRow>

    </StaticPage>
);

const DonatePage = () => (
  <StaticPage optionalClass="donate">
    <HeaderForDonatePage/>
    <div className="center">
        <H1Block en="How to make a difference:" he="מסע של גילוי"/>
    </div>
    <div className="staticPageBlockInner flexContainer">

        <ResponsiveNBox gap="30px" content={[
            <FeatureBox
                enTitle="Make a One-Time Gift"
                heTitle=""
                enText="Whether you give $1.80, $18, or $1,800, every gift made to Sefaria supports the future of Torah."
                heText=""
                enButtonText="Donate Now"
                heButtonText=""
                enButtonUrl="https://donate.sefaria.org/en"
                heButtonUrl="https://donate.sefaria.org/he"
                borderColor="#004E5F"
            />,
            <FeatureBox
                enTitle="Become a Sustainer"
                heTitle=""
                enText="Multiply the power of your impact by signing up for a monthly donation with hundreds of other users, supporting a vision of <em>Torah for all.</em>"
                heText=""
                enButtonText="Join the Sustainers"
                heButtonText=""
                enButtonUrl="https://donate.sefaria.org/sustainers"
                heButtonUrl="https://donate.sefaria.org/sustainershe"
                borderColor="#97B386"
            />,
            <FeatureBox
                enTitle="Sponsor a Day of Learning"
                heTitle=""
                enText="Fuel a day of study on Sefaria by celebrating a special occasion, commemorating a yahrzeit, or honoring a legacy — with a gift of $360 or more."
                heText=""
                enButtonText="Sponsor a Day of Learning"
                heButtonText=""
                enButtonUrl="https://donate.sefaria.org/sponsor"
                heButtonUrl="https://donate.sefaria.org/sponsorhe"
                borderColor="#4B71B7"
            />,
            <FeatureBox
                enTitle="Sponsor a Text"
                heTitle=""
                enText="There are many opportunities to sponsor a text or translation in Sefaria's ever growing library and receive a personal dedication. "
                heText=""
                enButtonText="Learn More"
                heButtonText=""
                enButtonUrl="https://drive.google.com/file/d/1FU8bHy7jZz86aywF7_kYMV0N3_h-k0nM/view"
                heButtonUrl=""
                borderColor="#7C416F"
            />

        ]}
        />
    </div>
    <Spacer/>

    <GreyBox>
      <H1Block en="Ways to Give" he="" serif={true}/>
      <div className="staticPageBlockInner flexContainer">

          <ResponsiveNBox
            threshold3={768}
            threshold2={500}
            gap="10px"
            stretch={true}
            content={[
                <HeaderWithColorAccentBlockAndText
                    enTitle="Donate Online"
                    heTitle=""
                    enText="<p>Make a donation by <strong>credit card, PayPal, GooglePay, ApplePay, Venmo, or bank transfer</strong> on our <a href='http://donate.sefaria.org/en'>main donation page</a>.</p>"
                    heText=""
                    colorBar="#AB4E66"
                />,
                <HeaderWithColorAccentBlockAndText
                    enTitle="Donate by Mail"
                    heTitle=""
                    enText="<p><strong>Personal checks</strong> should be made payable to “Sefaria” and mailed to:</p>
                            <p>Sefaria<br/>
                            228 Park Avenue South<br/>
                            Suite 79262<br/>
                            New York, NY 10003-1502</p>"
                    heText=""
                    colorBar="#D4896C"
                />,
                <HeaderWithColorAccentBlockAndText
                    enTitle="Donor-Advised Fund"
                    heTitle=""
                    enText="<p>Sefaria accepts donations from donor-advised funds; our <strong>EIN is 46-4406454</strong>. If you need additional information to make a DAF donation, please contact Caitlyn Cushing, Development Operations Associate, at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>.</p>"
                    heText=""
                    colorBar="#CCB479"
                />,
                <HeaderWithColorAccentBlockAndText
                    enTitle="Additional Ways to Give"
                    heTitle=""
                    enText="<p>Sefaria also accepts donations via <strong>wire transfer</strong>, <strong>stock</strong>, and <strong>Cryptocurrency</strong>. For more information, please email Caitlyn Cushing, Development Operations Associate, at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>. (For wire transfers, you can also <a href='https://sefaria.formstack.com/forms/wire_request'>click here</a> to get our account information)."
                    heText=""
                    colorBar="#97B386"
                />


            ]}
          />
      </div>
      <Spacer/>
    </GreyBox>

    <div className="staticPageCallToActionFooter">
      <div className="staticPageBlockInner flexContainer light">
          <div className="msgToSupporters">
            <h1 className="serif center">
                Thank you for your support!
            </h1>
          </div>
      </div>
    </div>

    <H1Block en="Get Your questions answered." he="" serif={true}/>
    <div className="staticPageBlockInner">

        <h2 className="serif">
            <span className="int-en">Your Gift to Sefaria</span>
        </h2>
        <Accordian
            enTitle="Can I make my gift in honor or memory of someone?"
            heTitle=""
            enText="<p>Yes! If you’re donating online, check the box for “Dedicate my donation <strong>in honor or in memory</strong> of someone” right after entering your donation amount. Then enter your desired tribute information and our donation processing platform will send your message to the recipient. If you have questions about this process, please email <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a></p>"
            heText=""
            colorBar="#B8D4D3"
        />

        <Accordian
            enTitle="Where does my gift go? How does Sefaria use the donations it receives?"
            heTitle=""
            enText="<p>Generally, gifts made to Sefaria are considered “unrestricted,” meaning that our staff allocates funds where they’re needed most. This includes everything from the text and learning you see on your screen to the technology support that keeps us online to the time and energy of the Sefaria team.</p>
                    <p><a href='https://www.guidestar.org/profile/46-4406454'>Sefaria has a Platinum rating on GuideStar</a> and we’re devoted to making sure we’re transparent and open with our donors. For a closer look at our financials, <a target='_blank' href='/static/files/Sefaria_2022_990_Public.pdf'>download the most recent Sefaria 990</a>.</p>"
            heText=""
            colorBar="#B8D4D3"
        />

        <Accordian
            enTitle="Can I make a gift to support a specific program or initiative?"
            heTitle=""
            enText="<p>Our online giving page does not support restricted gifts. You can sponsor a day of learning <a href='https://donate.sefaria.org/sponsor'>here</a>. If you would like to sponsor a text or support a specific Sefaria program, please email Samantha Shokin, Grant Writer and Development Associate, at <a href='mailto:samantha@sefaria.org'>samantha@sefaria.org</a> for more information.</p>"
            heText=""
            colorBar="#B8D4D3"
        />

        <Accordian
            enTitle="I want to sponsor a day of learning or a new text. How do I know what’s available and where my message will appear?"
            heTitle=""
            enText="<p>To learn more about available sponsorship dates and texts on Sefaria, send an email to Samantha Shokin, Grant Writer and Development Associate, at <a href='mailto:samantha@sefaria.org'>samantha@sefaria.org</a>, with “Sponsorship” in your subject line. We’ll aim to get back to you within two business days.</p>
            <p>Sponsorships can be made in honor, memory, or celebration of a person, group, occasion, or anything else that matters to you. </p>
            <p>Dedications for a day, week, or month of learning will appear on Sefaria’s homepage throughout the duration of the sponsorship period beginning the evening of the date you choose. <a href='https://docs.google.com/spreadsheets/d/1CUVb18QKbRcgBvBzH-x9R_Stx-_o5YkE9bi7oYBTlRw/edit#gid=0'>Available dates can be viewed in this calendar</a>. To convert a Hebrew date to the English calendar, we recommend <a href='https://www.hebcal.com/converter/'>HebCal’s date converter</a>.</p>"
            heText=""
            colorBar="#B8D4D3"
        />


        <h2 className="serif">
            <span className="int-en">Giving Logistics</span>
        </h2>

        <Accordian
            enTitle="Is my donation tax-deductible?"
            heTitle=""
            enText="<p>Sefaria is a registered 501(c)(3) in the United States, and all donations are fully tax-deductible under the extent of the law. We are not able to issue tax receipts to donors outside the United States.</p>"
            heText=""
            colorBar="#7F85A9"
        />

        <Accordian
            enTitle="Why aren’t you tax-exempt outside of the United States?"
            heTitle=""
            enText="<p>At this time, Sefaria only meets eligibility requirements for tax-exempt status in the United States.</p>"
            heText=""
            colorBar="#7F85A9"
        />

        <Accordian
            enTitle="Can I still donate from outside the USA?"
            heTitle=""
            enText="<p>Yes! Donors outside of the USA may make a gift online  – via credit card, PayPal, GooglePay, ApplePay, Venmo, and bank transfer – <a href='https://donate.sefaria.org/en'>on this page</a> On this page you can modify your currency. You can also <a href='https://sefaria.formstack.com/forms/wire_request'>make a wire transfer</a>.</p>"
            heText=""
            colorBar="#7F85A9"
        />

        <Accordian
            enTitle="Will I get a gift receipt?"
            heTitle=""
            enText="<p>Yes! If you make your gift online, you will receive an email acknowledgment that includes all the information necessary for use as a tax receipt. If you make your gift by mail, you will receive a printed acknowledgment. If you don’t receive your gift receipt, please let us know at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a> and we will issue a replacement.</p>"
            heText=""
            colorBar="#7F85A9"
        />

        <Accordian
            enTitle="I want to donate through a donor-advised fund, federation, or foundation. What do I need to send you?"
            heTitle=""
            enText="<p>Donations from these types of institutions can be made through any of the payment methods listed in the Ways to Give section above. If you are donating from a foundation, federation, or donor-advised fund, please include any relevant gift acknowledgment information or preferences along with your gift. <strong>Sefaria's EIN is 46-4406454</strong>.</p>
                    <p>If you are sending your donation by mail, please include this information in a cover letter accompanying your check; if you are donating through a wire transfer or other electronic method, please send an email with this information to <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>. This ensures we have all the necessary information to send your gift acknowledgment and tax receipt.</p>"
            heText=""
            colorBar="#7F85A9"
        />

        <Accordian
            enTitle="I think my employer will match my gift. How can I find out?"
            heTitle=""
            enText="<p>The best way to find out if your employer matches donations made to eligible nonprofits is to ask directly at your place of work. <a href='https://www.charitynavigator.org/index.cfm?bay=content.view&cpid=1799'>You can also search for your employer on Charity Navigator</a>.</p>"
            heText=""
            colorBar="#7F85A9"
        />

        <Accordian
            enTitle="My gift is going to be matched by someone else. Will you send them an acknowledgment as well?"
            heTitle=""
            enText="<p>Typically, matching gifts are directly acknowledged through the third-party processor. If you would like to request a thank you letter from the Sefaria team for the individual or organization matching your gift, please send us an email at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>. </p>"
            heText=""
            colorBar="#7F85A9"
        />


        <h2 className="serif">
            <span className="int-en">Help and Support</span>
        </h2>

        <Accordian
            enTitle="I’m having trouble making my donation."
            heTitle=""
            enText="<p>If you’re having difficulty donating online, we want to help! Please email us at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a> with a detailed description of the issue you’re experiencing, and we will get back to you within two business days. The more information you provide in your email, the more we will be able to help resolve the situation. We appreciate your patience and generosity.</p>"
            heText=""
            colorBar="#5A99B7"
        />

        <Accordian
            enTitle="I made a one-time or monthly donation in error."
            heTitle=""
            enText="<p>To cancel and/or request a refund for a donation, please follow the link in your email confirmation to view your online Classy (Sefaria's donation processor) profile where you can manually update or cancel your monthly gift. In addition, you can email Caitlyn Cushing, Development Operations Associate <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>, for support with this process.</p>"
            heText=""
            colorBar="#5A99B7"
        />

        <Accordian
            enTitle="I never received a gift receipt / I need a new gift receipt."
            heTitle=""
            enText="<p>If you’re looking for a missing e-receipt, we first recommend checking your spam folder for any emails received from info@sefaria-inc.classy-mail.org. If you’re unable to find your gift receipt or you need a new copy of a mailed gift receipt, please email us at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>. </p>"
            heText=""
            colorBar="#5A99B7"
        />

        <Accordian
            enTitle="I want to cancel my monthly donation."
            heTitle=""
            enText="<p>We’re sorry to see you go! To cancel your sustaining donation, please follow the link in your email confirmation to view your online Classy (Sefaria's donation processor) profile where you can manually update or cancel your monthly gift. In addition, you can email Caitlyn Cushing, Development Operations Associate at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>, or by phone at <a href='tel:+13477730077'>(347) 773-0077</a></p>"
            heText=""
            colorBar="#5A99B7"
        />

        <Accordian
            enTitle="I want to change my monthly donation by updating the amount or changing my credit card."
            heTitle=""
            enText="<p>To change the amount of or credit card information associated with your monthly donation, please follow the link in your email confirmation to your Classy (Sefaria's donation processor) profile. On your profile, you can edit this information. You can also contact Caitlyn Cushing, Development Operations Associate, at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>, for assistance with this process."
            heText=""
            colorBar="#5A99B7"
        />

    </div>
    <Spacer/>

    <div className="staticPageCallToActionFooter">
      <div className="staticPageBlockInner flexContainer light">
          <div className="msgToSupporters">
            <h2 className="serif">
            Sefaria takes pride in its financial stewardship as a fully transparent, 501(c)(3) charitable organization. Sefaria’s EIN is 46-4406454.
            </h2>

          <ResponsiveNBox
            threshold3={768}
            threshold2={500}
            gap="10px"
            stretch={true}
            content={[
                <div className="finStewardBox">
                    <h2 className="serif">GuideStar Platinum</h2>
                    <p>Sefaria is proud to have received a Platinum Seal of Transparency from Guidestar, which indicates that we have proven a commitment to sharing our goals, strategies, and key metrics towards achieving our mission and vision.</p>
                    <SimpleButton
                        white={true}
                        rounded={true}
                        tall={false}
                        newTab={true}
                        href="https://www.guidestar.org/profile/46-4406454"
                        he_href=""
                        he=""
                        en="Learn More"
                    />

                </div>,

                <div className="finStewardBox">
                    <h2 className="serif">Sefaria’s 990 </h2>
                    <p>Nonprofit organizations are required to file a Form 990 each year that provides the public with information about our revenue, expenditures, and other key financial data. We are committed to making sure our 990 is always easily accessible. </p>
                    <SimpleButton
                        white={true}
                        rounded={true}
                        tall={false}
                        newTab={true}
                        href="/static/files/Sefaria_2022_990_Public.pdf"
                        he_href=""
                        he=""
                        en="See Here"
                    />

                </div>,

                <div className="finStewardBox">
                    <h2 className="serif">Annual Report </h2>
                    <p>Each year, our annual report gives an up-to-date account of our achievements, challenges, innovations, and benchmarks. The annual report also includes messages and stories from our leadership, team members, and supporters like you.</p>
                    <SimpleButton
                        white={true}
                        rounded={true}
                        tall={false}
                        newTab={true}
                        href="/static/files/Sefaria_AnnualImpactReport_R14.pdf"
                        he_href=""
                        he=""
                        en="Read Here"
                    />

                </div>
            ]}
            />


          </div>
      </div>
    </div>


  </StaticPage>
);

const WordByWordPage = () => (
  <StaticPage optionalClass="donate wordbyword">

    <div className="staticPageHeader wordbyword">
      <div className="staticPageBlockInner flexContainer">
        <div className="staticPageHeaderTextBox donate">
          <h1>
            <span className="int-en">{"Word-by-Word: A Jewish Women's Writing Circle"}</span>
          </h1>
          <div className="staticPageHeaderText"><em>"...I am grateful to God for this gift, this possibility of developing myself and of writing, of expressing all that is in me."</em><br/>- Anne Frank</div>
        </div>
      </div>
    </div>


    <div className="staticPageCallToActionFooter">
      <div className="staticPageBlockInner flexContainer light">
          <div className="msgToSupportersEven">

              <p>Word-by-Word: A Jewish Women’s Writing Circle will provide up to 20 Jewish women writers engaged in serious Torah scholarship the support and guidance to complete publishable books of Jewish textual analysis that will be significant contributions to any Jewish library. Word-by-Word will offer writers a three-year stipend and community to develop talent by providing skill-based workshops, professional coaching, peer mentoring, an annual retreat, and opportunities to network with publishers and experienced authors. Sefaria is proud to partner with Dr. Erica Brown on this new initiative, co-led by Sefaria’s Chief Learning Officer, Sara Wolkenfeld.</p>
              <p><em>This program is generously funded by Micah Philanthropies, Walder Foundation, and the Arev Fund.</em></p>

          </div>
      </div>
    </div>

    <GreyBox>
      <H2Block en="About the Program" he="" />
      <div className="staticPageBlockInner flexContainer">
          <ResponsiveNBox
            threshold3={768}
            threshold2={500}
            gap="10px"
            stretch={true}
            content={[
                <HeaderWithColorAccentBlockAndText
                    enTitle="Requirements"
                    heTitle=""
                    enText="<p>Application must include a detailed synopsis of the proposed book (1,000 words), a detailed table of contents, and two published writing samples. </p>
                            <p>The finished book must be written in English, must be at least 150 pages / 75,000 words.</p>
                            <p>Participants should be located in a time zone that makes it reasonable for them to participate in programming on U.S. time zones.</p>"
                    heText=""
                    colorBar="#AB4E66"
                />,
                <HeaderWithColorAccentBlockAndText
                    enTitle="Schedule"
                    heTitle=""
                    enText="<p>Applicants must be willing to commit to the following schedule:</p>
                            <p>Annual writing retreat each June. The first retreat is provisionally scheduled for June 18-22, 2023</p>
                            <p>Monthly online meetings of a 1.5 hour duration. Participants are required to attend 8 out of 10 of these meetings each year.</p>"
                    heText=""
                    colorBar="#D4896C"
                />,
                <HeaderWithColorAccentBlockAndText
                    enTitle="Benefits"
                    heTitle=""
                    enText="<p>Each participant will receive a total stipend of $18,000 ($6,000/year over three years).</p>
                            <p>Workshops with experts from the writing and publishing world.</p>
                            <p>Each participant is entitled to 10-15 hours of coaching per year. Program leaders will work with each author to match her with an appropriate coach. Coaching sessions will be scheduled at the discretion of the participant.</p>"
                    heText=""
                    colorBar="#CCB479"
                />
            ]}
          />
      </div>
      <Spacer/>
    </GreyBox>

    <CallToActionFooterWithButton
        href="https://drive.google.com/file/d/1DXh0J-y0hHJTZuIdaoa2k3CrJBHeBdxK/view"
        he_href=""
        enText="Read the full schedule, requirements, and application information."
        heText=""
        enButtonText="Download"
        heButtonText=""
        newTab={true}
    />
    <GreyBox light={true}>
    <H2Block en="Word-by-Word Leadership" he=""/>
</GreyBox>
    <Feature
        enTitle="Sara Wolkenfeld"
        enText="Sara Wolkenfeld is the Chief Learning Officer at Sefaria, an online database and interface for Jewish texts. Sara is also a fellow at the David Hartman Center at the Hartman Institute of North America, and is a member of Class Six of the Wexner Field Fellowship. She writes about Jewish texts and Jewish law, and her current projects focus on applying Talmudic ideas to questions of advancements in digital technology."
        enImg="/static/img/sara_circle.png"
        enImgAlt="Sara Wolkenfeld headshot"
        heTitle=""
        heText=""
        heImg=""
        heImgAlt=""
        borderColor="#004E5F"
    />

    <Feature
        enTitle="Erica Brown"
        enText="Dr. Erica Brown is the Vice Provost for Values and Leadership at Yeshiva University and the founding director of its Rabbi Lord Jonathan Sacks-Herenstein Center for Values and Leadership. She previously served as the director of the Mayberg Center for Jewish Education and Leadership and an associate professor of curriculum and pedagogy at The George Washington University. Erica is the author or co-author of 15 books on leadership, the Hebrew Bible and spirituality. Erica has a daily podcast, “Take Your Soul to Work.” Her forthcoming book Kohelet and the Search for Meaning (Maggid) will be available in 2023. Her last book Esther: Power, Fate and Fragility in Exile (Maggid) was a finalist for the National Jewish Book Award."
        enImg="/static/img/ericabrown_circle 1.png"
        enImgAlt="Erica Brown headshot"
        heTitle=""
        heText=""
        heImg=""
        heImgAlt=""
        borderColor="#004E5F"
    />
    <H1Block en="Get Your questions answered." he="" serif={true}/>
    <div className="staticPageBlockInner">
        <Accordian
            enTitle="What’s the application deadline?"
            heTitle=""
            enText="<p>The deadline for applications is March 13, 2023. We will not consider applications submitted after this date.</p>"
            heText=""
            colorBar="#B8D4D3"
        />

        <Accordian
            enTitle="How many women will be in the cohort?"
            heTitle=""
            enText="<p>We plan to welcome 20 women to this cohort.</p>"
            heText=""
            colorBar="#B8D4D3"
        />

        <Accordian
            enTitle="How does the stipend work?"
            heTitle=""
            enText="<p>Each woman will be awarded $6,000 per year, contingent on meeting the yearly writing requirements (15,000 words in the first year, 25,000 words in years two and three).</p>"
            heText=""
            colorBar="#B8D4D3"
        />

        <Accordian
            enTitle="How will the cohort support each other?"
            heTitle=""
            enText="<p>Through monthly meetings, a WhatsApp group, and regular check-ins, this cohort will build a supportive community in which women motivate each other, check in on progress, and share ideas. The monthly meetings will provide space to get to know one another, share drafts and get feedback, collaborate around best practices, and champion one another’s projects. The annual retreat will help cement these relationships and expose the cohort to developments in the field and veteran writers.</p>"
            heText=""
            colorBar="#B8D4D3"
        />

        <Accordian
            enTitle="I have more questions. How can I contact you?"
            heTitle=""
            enText="<p>Please email Rachel Buckman at <a href='mailto:rachel@sefaria.org'>rachel@sefaria.org</a></p>"
            heText=""
            colorBar="#B8D4D3"
        />


    </div>
    <Spacer/>

    <CallToActionFooterWithButton
        href="https://sefaria.typeform.com/to/wJXgn9jL"
        he_href=""
        enText="Ready to Apply? Fill out your application by March 13, 2023."
        heText=""
        enButtonText="Apply Now"
        heButtonText=""
        newTab={true}
    />



  </StaticPage>
);


const PoweredByPage = () => (
    <StaticPage>
        <Header
            enTitle="Powered by Sefaria"
            enText="Did you know that Sefaria’s open data and API can be used by anyone to create new technological solutions for learning Torah? You can find it all for free in our GitHub repository!"
            heText="Did you know that Sefaria’s open data and API can be used by anyone to create new technological solutions for learning Torah? You can find it all for free in our GitHub repository!"
            enActionURL="https://github.com/Sefaria"
            enActionText="Create Something New"
            newTab={true}
        />
        <GreyBox>
            <H2Block en="Open Source Torah" he="Open Source Torah"/>
            <EnBlock padded={true}>
                <p>We do our best to ensure that the texts we put in our library come with a Creative Commons license, so the texts can be used and reused, for free. We also make all of our code available for open source use by other developers in any way they’d like. To date, there are more than 70 projects Powered by Sefaria, and nearly 100 sites linked to the Sefaria library through our Linker API.</p>
            </EnBlock>
            <Spacer/>
        </GreyBox>
        <GreyBox light={true}>
            <H2Block en="Projects Powered by Sefaria" he="Projects Powered by Sefaria"/>
        </GreyBox>
        <Feature
            enTitle="AlHaTorah"
            enText="AlHaTorah is a website with a broad range of tools for studying Tanakh, including study guides broken down by parashah, biblical art, and interactive modules. Among the available sources, AlHaTorah makes use of biblical commentaries from Sefaria’s library."
            enImg="/static/img/powered-by-landing-page/alhatorah.org_.png"
            enImgAlt="Screenshot of AlHaTorah"
            borderColor={palette.colors.darkteal}
            link="https://alhatorah.org/"
        />
        <Feature
            enTitle="AllDaf"
            enText="This app for learning Daf Yomi from the Orthodox Union provides users with personalized feeds that adapt to learners’ interests, supporting study of the Daf in a user-friendly and approachable format. The English text on AllDaf is sourced from Sefaria."
            enImg="/static/img/powered-by-landing-page/alldaf.org_.png"
            enImgAlt="Screenshot of AllDaf"
            borderColor={palette.colors.yellow}
            link="https://alldaf.org/"
        />
        <Feature
            enTitle="Hadran"
            enText="Founded in 2018 by a group of women studying Talmud together, Hadran aims to make the study of Talmud more accessible to Jewish women at all levels of learning. Among the resources they provide are guides to learning Daf Yomi, and these lessons use texts from Sefaria."
            enImg="/static/img/powered-by-landing-page/hadran.org.il_daf_yevamot-63_.png"
            enImgAlt="Screenshot of Hadran"
            borderColor={palette.colors.green}
            link="https://hadran.org.il/"
        />
        <Feature
            enTitle="Dicta"
            enText="Dicta is a nonprofit research organization based in Israel that applies cutting-edge machine learning and natural language processing (the ability of a computer program to understand human language as it is spoken and written) to the analysis of Hebrew texts. Sefaria and Dicta often collaborate, sharing texts and splitting the costs of shared projects. Dicta offers a broad range of tools for free use by anyone, including the ability to add nikud (vocalization) to text as you type, intuitive Talmud and Bible search, and more."
            enImg="/static/img/powered-by-landing-page/talmudsearch.dicta.org.il_.png"
            enImgAlt="Screenshot of Dicta"
            borderColor={palette.colors.lightblue}
            link="https://dicta.org.il/"
        />
        <Feature
            enTitle="Artscroll Smart Siddur"
            enText="This app converts the popular ArtSchool Siddur into a fully digital format, including hyperlinks to secondary sources, translations, and commentary, as well as the ability to customize your siddur experience.  When you click on citations to non-ArtScroll books in the siddur's footnotes, they include texts from the Sefaria library."
            enImg="/static/img/powered-by-landing-page/artscroll siddur.png"
            enImgAlt="Screenshot of Artscroll Smart Siddur"
            borderColor={palette.colors.red}
            link="https://www.artscroll.com/Categories/DSD.html"
        />
        <GreyBox>
            <H2Block en="Tell us about your projects!" he="Tell us about your projects!"/>
            <EnBlock padded={true}>
                <p>Have you used Sefaria’s data to build an app, visualization, website, or other digital tool? Tell us about it! We’d love to see your project. You can also reach out to us with your questions about our open source data and API by writing to us at <a href="mailto:hello@sefaria.org">hello@sefaria.org</a>.</p>
            </EnBlock>
            <Spacer/>
        </GreyBox>

        <ButtonRow white={true} enTitle="Explore a few more projects" heTitle="Explore a few more projects">
            {[["HaTanakh.com", "http://www.hatanakh.com/"],
                ["Koveah", "https://koveah.org/"],
                ["Parasha Bytes", "https://parashabytes.zemon.name/bytes/"],
                ["Shnayim Mikra", "http://www.shnayim.com/"],
                ["Russel Neiss' Micrography", "https://github.com/rneiss/micrography"],
                ["Sefaria Wordpress Plugin", "https://github.com/JoshMB/sefaria-wp-plugin"],
                ["Mizmor Shir", "http://mizmor-shir.herokuapp.com/"],
                ["Capish - Interactive Learning", "https://capish.me/"],
                ["Sefer Similarity Map", "https://jhostyk.github.io/SeferSimilarityMap/"],
                ["Sefaria Space: (Topic Museum + Text Mania)", "https://sefaria-space.web.app/"],
                ["T'Feeling", "https://tfeeling.netlify.app/"],
                ["The Taryag Mitzvos", "https://thetaryag.com/"],
                ["Visualizations of Sefaria", "https://guedalia.github.io/testab/test"],
                ["Gematriaphone", "http://alexboxer.com/gematriaphone/"],
                ["Yamim Noraim Machzor", "https://play.google.com/store/apps/details?id=com.machzoryamimnoraim"],
                ["Sefaria Sidebar Extension", "https://github.com/DovOps/SefariaSidebarExtension/"],
                ["Kindle Seforim", "https://kindleseforim.paritcher.com/"],
                ["The Jewish Story Through Books", "https://joshcooper417.github.io/"]
            ].map(i =>
                <SimpleButton
                    white={true}
                    rounded={false}
                    tall={true}
                    newTab={true}
                    href={i[1]}
                    en={i[0]}
                />)
            }
        </ButtonRow>


    </StaticPage>
);

const PBSC2021LandingPage = () => (
    <StaticPage>
        <Header
            enTitle="Powered by Sefaria Contest 2021"
            enText="Explore the Projects"
            enImg="/static/img/pbsc-2020-landing-page/codemockup3.png"
            enImgAlt=""
            heTitle="תחרות פיתוח התוכנה של ספריא 2021"
            heText="גלו את המיזמים"
            heImg="/static/img/pbsc-2020-landing-page/codemockup3.png"
            heImgAlt=""
        />

        <GreyBox>
            <H2Block en="Inviting Innovation" he="הזמנה לחידוש"/>
            <EnBlock padded={true}>
                <p>In an effort to seed the digital future of Jewish texts, the Powered by Sefaria Contest was launched in July 2020 — inviting the global Sefaria community to make use of our free and open digital dataset of Jewish texts, translations, and interconnections. Over the years, dozens of third parties have created apps, visualizations, and conducted research using our data or API, and we wanted to see what else our community could dream up. The second annual Powered by Sefaria Contest saw tremendous enthusiasm and welcomed many high quality submissions from Sefaria users around the world. <strong>Keep reading to learn more about the two winners and some innovative honorable mentions.</strong></p>
            </EnBlock>
            <HeBlock padded={true}>
                <p>מתוך רצון לזרוע את זרעי העתיד הדיגיטלי של ארון הספרים היהודי, השקנו בשנת 2020 את תחרות פיתוח התוכנה של ספריא, ובה הזמנו את הקהילה הגלובלית של ספריא להשתמש במערך הנתונים הדיגיטלי הפתוח והחופשי של מקורות יהודיים, תרגומים וקישורים בין־טקסטואליים. לאורך השנים היינו עדים לעשרות מפתחי גוף שלישי שהשתמשו בנתונים או ב־API שלנו ליצירת יישומונים והדמיות ולצורכי מחקר, ורצינו לבדוק אילו רעיונות נוספים יש בקהילה שלנו. התחרות הפגישה אותנו עם התלהבות יוצאת מן הכלל ועם תוצרים באיכות גבוהה שקיבלנו ממשתמשי ספריא ברחבי העולם. המשיכו לקרוא כדי ללמוד על שני המנצחים ועל מיזמים נוספים שזכו בציון לשבח.</p>
            </HeBlock>
            <Spacer/>
        </GreyBox>

        <GreyBox light={true}>
            <H2Block en="Grand Prize Winner" he="זוכה הפרס הכללי"/>
        </GreyBox>

        <Feature
            enTitle="Sefaria Chavrusa"
            enText="Gershon Binder<br/><br/>Sefaria Chavrusa is designed to increase accessibility by introducing a text-to-speech feature on Sefaria. Most text-to-speech options struggle with Hebrew; Sefaria Chavrusa is a solution for people who use screen readers, are unfamiliar with reading Hebrew, or just prefer hearing texts read aloud.  It also allows for customized voices with different accents including Chassidish, Litvish, and Israeli."
            enImg="/static/img/pbsc-2021-landing-page/sefariachavrusa.png"
            enImgAlt="Screenshot of Sefaria Chavrusa"
            heTitle="או 'חברותא עם ספריא'"
            heText="מאת גרשון בינדר<br><br>'חברותא עם ספריא' היא כלי שנועד להגביר את נגישותם של טקסטים בספריא על ידי השמעה קולית של טקסטים. כיום מרבית הכלים שהופכים טקסט לשמע מתקשים לעשות זאת בעברית, ועל כן 'חברותא עם ספריא' תסייע למשתמשים שנעזרים בקוראי מסך, למשתמשים שאינם מנוסים דיים בקריאת עברית או למשתמשים שפשוט מעדיפים לשמוע את המקורות בקול. המיזם מאפשר שימוש בקולות מותאמים אישית עם מבטאים לבחירה, כגון חסידי, אשכנזי או ישראלי."
            heImg="/static/img/pbsc-2021-landing-page/sefariachavrusa.png"
            heImgAlt="Screenshot of Sefaria Chavrusa"
            borderColor={palette.colors.yellow}
            link="https://www.youtube.com/watch?v=wnvw6H9BWDw&feature=youtu.be"
        />

        <GreyBox>
            <H2Block en="Meet the Grand Prize Winner" he="פגשו את זוכה הפרס הכללי"/>
            <EnBlock padded={true}>
                <p>Originally from Huntington, Long Island, Gershon Binder is a senior at Lander College for Men working toward a degree in Computer Science. He is a graphic and web designer working with 3D rendering and Unreal Engine. He currently lives in Queens, New York.</p>
            </EnBlock>
            <HeBlock padded={true}>
                <p>גרשון בינדר מהנטינגטון שבלונג איילנד במדינת ניו יורק הוא סטודנט למדעי המחשב בשנתו האחרונה בקולג' לנדר לגברים. בינדר הוא מעצב אתרים ומעצב גרפי ועובד עם מודלים תלת-ממדיים ועם מנוע Unreal. כיום מתגורר בקווינס שבניו יורק.</p>
            </HeBlock>
            <H2Block en="What Our Team Had to Say" he="מה יש לצוות שלנו להגיד על זה"/>
            <Section noPadding={true}>
                <UserQuote
                    enText="“I was really impressed with the quality of the speech, even for unvowelized texts.  One of the things that we learned early at Sefaria is that making a text digital opens it up to people with low vision.  But the quality of Rabbinic Hebrew text-to-speech has always been poor, especially in comparison with English. This project gave me hope that we could provide low-sighted users a truly excellent spoken version of all of our texts.”"
                    heText="התרשמתי מאוד מאיכות הדיבור, אפילו עבור טקסטים ללא ניקוד. אחד הדברים שגילינו בשלב מוקדם בספריא הוא שהפיכת טקסט לדיגיטלי מאפשרת ללקויי ראיה להינות מהטקסטים שלנו. הבעיה היא שהעברה של מקורות רבניים מטקסט כתוב לדיבור פוגעת באיכות של הטקסט. הפרויקט הזה נתן לי תקווה שנוכל לספק למשתמשים לקויי ראייה גרסה מדוברת מעולה באמת של כל הטקסטים שלנו."
                    enName="Lev Israel, Chief Data Officer at Sefaria"
                    heName='לב ישראל, מנהל נתונים ראשי, בספריא'
                    image="/static/img/pbsc-2021-landing-page/lev.png"
                />
            </Section>

        </GreyBox>

        <GreyBox light={true}>
            <H2Block en="Women in Tech Winner" he="זוכת פרס נשים מפתחות טכנולוגיה"/>
        </GreyBox>

        <Feature
            enTitle="Torah Chanting Source Sheet Generator"
            enText="By Valerie Monaco<br><br>The Torah Chanting Source Sheet Generator takes a range of Torah verses and provides a generated Sefaria sheet loaded with features for people learning how to chant, including trope identification and highlighting, trope cantillation tunes, and full verse chanting audio files."
            enImg="/static/img/pbsc-2021-landing-page/torahchanting.png"
            enImgAlt="Screenshot of Torah Chanting Source Sheet Generator"
            heTitle="מחולל דפי מקורות לקריאה בתורה"
            heText='מאת ולרי מונקו<br><br>"מחולל דפי המקורות לקריאה בתורה"  אוסף מגוון  פסוקים מן התורה כדי לחולל בעזרתם דף מקורות הכולל כלי עזר לקריאה בתורה – זיהוי והדגשה של טעמי המקרא, הדגמות שמע של טעמי המקרא וכן קובצי שמע של פסוקים מלאים.'
            heImg="/static/img/pbsc-2021-landing-page/torahchanting.png"
            heImgAlt="Screenshot of Torah Chanting Source Sheet Generator"
            borderColor={palette.colors.raspberry}
            link="https://www.torahchantinghelper.net/"
        />

        <GreyBox>
            <H2Block en="Meet the Women in Tech Winner" he="פגשו את זוכת פרס נשים מפתחות טכנולוגיה"/>
            <EnBlock padded={true}>
                <p>The Torah Chanting Source Sheet Generator was created by Valerie Monaco, who officially converted to Judaism in 2013. In addition to being members at Rodef Shalom in Pittsburgh, PA, she and her wife are very involved with Congregation Bet Tikvah. Valerie works as a Senior Data Analyst for the City of Pittsburgh and has graduate degrees in psychology and human-computer interaction. As she was studying chanting, Valerie found it was difficult without a shared visual resource, and setting up a useful sheet “by hand” was time-consuming and had limitations. The Torah Chanting Source Sheet Generator eases the process of creating sheets to make it easier for people to spend their time learning.</p>
            </EnBlock>
            <HeBlock padded={true}>
                <p>"מחולל דפי המקורות לקריאה בתורה" נוצר על ידי ולרי מונקו, שהתגיירה בשנת 2013. נוסף על חברותן בקהילת "רודף שלום" בפיטסבורג שבפנסילבניה, היא ובת זוגה הן גם שותפות נלהבות בקהילת "בית תקווה". ולרי היא אנליסטית דאטה בכירה בעיריית פיטסבורג ובעלת תואר ראשון בפסיכולוגיה ובקשרי אדם־מחשב. כאשר למדה לקרוא בתורה גילתה ולרי שקשה לעשות זאת ללא דף מקורות ויזואלי משותף, ושהכנת דף שימושי כזה באופן ידני תיארך זמן רב ויהיו לה מגבלות. "מחולל דפי המקורות לקריאה בתורה" מקל על תהליך יצירת דפי המקורות ומאפשר להקדיש יותר זמן ללימוד.</p>
            </HeBlock>
            <H2Block en="What Our Team Had to Say" he="מה יש לצוות שלנו להגיד על זה"/>
            <Section noPadding={true}>
                <UserQuote
                    enText="“One of the most powerful things about Sefaria is how our tools and resources can be harnessed to provide access and ease of use for folks to grow into their Judaism and Torah learning whenever they're ready. As an adult b'nai mitzvah student Valerie knows this first hand, and her extension of our API and resources to create a tool that simplifies the process of learning Torah reading by automatically creating interactive trope exercises and highlighting trop phrases in a given selection of text is exactly the kind of project that would have been much more difficult to create without our open APIs and data.”"
                    heText=""
                    enName="Russel Neiss, Sr. Product Engineer at Sefaria"
                    heName='רזיאל ניס, מהנדס מוצר בכיר, בספריא'
                    image="/static/img/pbsc-2021-landing-page/russel.png"
                />
            </Section>
        </GreyBox>

        <GreyBox light={true}>
            <H2Block en="Honorable Mentions" he="מיזמים שזכו בציון לשבח"/>
        </GreyBox>

        <Feature
            enTitle="he_Toranit"
            enText="By Zeev Pekar<br><br>Ivrit Toranit is a free spelling dictionary. It includes Hebrew from different eras,  as well as Western and Eastern Aramaic. The dictionary is designed to reduce the ‘mispellings’ wrongly detected by the modern Hebrew spell checkers when working with Torah literature."
            enImg="/static/img/pbsc-2021-landing-page/he_toranit.png"
            enImgAlt="he_Toranit screenshot"
            heTitle="עברית תורנית"
            heText='מאת זאב פקר<br><br>"עברית תורנית" היא מילון איות ללא תשלום הכולל עברית מתקופות שונות וכן ארמית מזרחית ומערבית. המילון נועד להפחית את "שגיאות הכתיב" שבודקי האיות, הפועלים על פי העברית המודרנית, מרבים למצוא ולהתריע עליהן בעת עבודה עם ספרות תורנית.'
            heImg="/static/img/pbsc-2021-landing-page/he_toranit.png"
            heImgAlt="he_Toranit screenshot"
            borderColor={palette.colors.green}
            link="https://gitlab.com/pninim.org/he_TORANIT"
        />


        <Feature
            enTitle="ShenaimMikra - Text to Speech"
            enText="By Abraham Saiovici<br><br>ShnaimMikra Text-to-Speech is an application that pulls in the weekly Parsha along with the Rashis and synthesizes the text into speech, providing a way of hearing the Parsha on the go. Handy for long commutes!"
            enImg="/static/img/pbsc-2021-landing-page/shenaim mikra.png"
            enImgAlt="ShenaimMikra - Text to Speech"
            heTitle="שניימקרא – טקסט לשמע"
            heText='מאת אברהם סיוביצ’י<br><br>"שניימקרא – טקסט לשמע" הוא יישומון השולף את פרשת השבוע עם פרשנות רש"י מסנתז את הטקסט לשמע ומאפשר לשמוע את הפרשה "בלכתך בדרך". שימושי מאוד לנסיעות ארוכות לעבודה!'
            heImg="/static/img/pbsc-2021-landing-page/shenaim mikra.png"
            heImgAlt="שניימקרא – טקסט לשמע"
            borderColor={palette.colors.paleblue}
            link="http://shnaim-mikra-abe.s3-website-us-east-1.amazonaws.com/"
        />


        <Feature
            enTitle="Verse-Based Search"
            enText="By Oren Mishali<br><br>An innovative tool that helps users search for sources by quotations. On selecting a set of verses, the site generates a list of texts that quote verses from the set. This tool provides an different way to quickly find relevant sources - sorting results by their relationship to a specific verse rather than topic or text"
            enImg="/static/img/pbsc-2021-landing-page/verse search.png"
            enImgAlt="Verse-Based Search"
            heTitle="חיפוש מבוסס פסוקים"
            heText='מאת אורן משעלי<br><br>"חיפוש מבוסס פסוקים" הוא כלי חדשני שעוזר למשתמשים לחפש מקורות על פי ציטוטים. באמצעות בחירה של סדרת פסוקים, האתר מחולל רשימה של טקסטים המצטטים פסוקים בסדרה. הכלי הזה מספק דרך חלופית למציאת מקורות רלוונטיים במהירות – הוא ממיין תוצאות על פי הקשר שלהם לפסוק מסוים במקום לפי הקשר שלהם לנושא או לטקסט.'
            heImg="/static/img/pbsc-2021-landing-page/verse search.png"
            heImgAlt="חיפוש מבוסס פסוקים"
            borderColor={palette.colors.blue}
            link="http://jbse.cs.technion.ac.il/#/show?uri=section-tanach-1-1"
        />


        <Feature
            enTitle="Stories of the Zohar"
            enText="By Yair Gardin<br><br>A digital resource of the stories of the sages that appear in the Zohar, allowing easy perusal of the stories. The site includes mapping of all the stories of the Zohar according to parshas and topics, as well as accompanying visuals and links to similar stories."
            enImg="/static/img/pbsc-2021-landing-page/zohar stories.png"
            enImgAlt="Daf Yomi Crossword"
            heTitle="סיפורי הזוהר"
            heText='מאת יאיר גרדין<br><br>זהו משאב דיגיטלי לסיפורי החכמים שבזוהר, המאפשר קריאה מעמיקה בקלות. האתר כולל מיפוי של כל סיפורי הזוהר על פי פרשות ונושאים, וכן הדמיות המלוות את הסיפורים וקישורים לסיפורים דומים. '
            heImg="/static/img/pbsc-2021-landing-page/zohar stories.png"
            heImgAlt="תשבץ דף יומי"
            borderColor={palette.colors.orange}
            link="https://www.zohar-stories.com/"
        />


        <CallToActionFooterWithButton
            href="https://github.com/Sefaria/Sefaria-Project"
            he_href="https://github.com/Sefaria/Sefaria-Project"
            enText="Want to create something of your own?"
            heText="רוצה ליצור משהו משלך?"
            enButtonText="GitHub"
            heButtonText="גיטהאב"
        />

        <ButtonRow white={true} enTitle="Explore the 2021 projects" heTitle="גלו את מיזמי 2021">
            { [
                ["Talmud Sidebar Extension", "תוסף סרגל הכלים של התלמוד", "https://chrome.google.com/webstore/detail/talmud-sidebar-extension/dmpiiciebnbekblfbcdeogjkbbmeeimi"],
                ["Mizmor Shir", "מזמור שיר", "http://mizmor-shir.herokuapp.com/"],
                ["Shulkhan", "שולחן", "http://josephtepperman.com/shulkhan.htm"],
                ["Goof - Body parts in Tefillah", "גוף: איברי הגוף בתפילה", "https://goof.surge.sh/"],
                ["Capish - Interactive Learning", "קאפיש: לימוד אינטראקטיבי", "https://capish.me/"],
                ["Daf Yomi Crossword", "תשבץ דף יומי", "http://ee.cooper.edu/~goldfarb/daf"],
                ["Sefer Similarity Map", "ספר– מפת דמיון בין טקסטים", "https://jhostyk.github.io/SeferSimilarityMap"],
                ["Custom Mikraot Gedolot", "מקראות גדולות בהתאמה אישית", "http://ec2-3-129-165-55.us-east-2.compute.amazonaws.com:3002/"],
                ["Sefaria Space: (Topic Museum + Text Mania)", "מרחב ספריא (מוזיאון נושאי + טָרֶפֶת טקסט)", "https://sefaria-space.web.app/"],
                ["The Rabbinic Citation Network", "רשת ציטוטים של חכמי התלמוד", "http://www.rabbiniccitations.jewishstudies.digitalscholarship.brown.edu/blog/"],
                ["T'Feeling", "פילינג", "https://tfeeling.netlify.app"],
                ["CiteMakor", "המצ'טט", "https://twitter.com/CiteMakor"],
                ["Gifaria", "גיפַריא", "https://tiger-tang.shinyapps.io/gifaria"],
                ["The Taryag Mitzvos", "תרי\"ג מצוות", "https://thetaryag.com/"],
                ["3D Tanach Family Tree", "אילן יוחסין תנ\"כי תלת ממדי", "http://www.basehasefer.com"],
                ["Gematriaphone", "גימטריה קולית", "http://alexboxer.com/gematriaphone"],
                ["sefaria-connections", "קשרי ספריא", "https://charlesloder.github.io/sefaria-connections"],
                ["SefariAcrostic", "ספריאקרוסטיכון", "https://20gordone.github.io/SefariaContest"],

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

const Accordian = ({enTitle, heTitle, enText, heText, colorBar}) => (
     <details style={{borderColor: colorBar}}>
      <summary>
      <span className="int-en">{enTitle}</span>
          <span className="int-he">{heTitle}</span>
      </summary>
      <div className="int-en" dangerouslySetInnerHTML={{__html:enText}} />
      <div className="int-he" dangerouslySetInnerHTML={{__html:heText}} />
     </details>
)


const StaticPage = ({children, optionalClass=""}) => {
    var staticPageClass = "staticPage";
    if (optionalClass !== "") {
        staticPageClass += " " + optionalClass;
    }
    return <div className={staticPageClass}>
        {children}
    </div>
};

const Spacer = ({height}) => <div className={"staticPageSpacer"} style={{height: height || 60}}></div>;

const HeBlock = ({children, padded}) => <div className={"int-he" + (padded ? " staticPageBlockInner" : "")}>{children}</div>;

const EnBlock = ({children, padded}) => <div className={"int-en" + (padded ? " staticPageBlockInner" : "")}>{children}</div>;

const GreyBox = ({children, light}) => <div className={light ? "lightgreyBackground" : "greyBackground"}>{children}</div>

const H1Block = ({en, he}) =>
  <div className="staticPageBlockInner">
    <h1 className="staticPageH1 serif">
        <SimpleInterfaceBlock en={en} he={he} />
    </h1>
  </div>;


const H2Block = ({en, he, classes, serif}) =>
  <div className="staticPageBlockInner">
    <h2 className={serif ? "staticPageH2 serif" : "staticPageH2"}>
        <SimpleInterfaceBlock en={en} he={he} />
    </h2>
  </div>;

const HeaderWithColorAccentBlockAndText = ({enTitle, heTitle, enText, heText, colorBar}) => (
    <div className="HeaderWithColorAccentBlockAndText">
        <h2 className="serif">
            <span className="int-en">{enTitle}</span>
            <span className="int-he">{heTitle}</span>
        </h2>

        <hr style={{borderColor: colorBar}} />

        <div className="int-en" dangerouslySetInnerHTML={{__html:enText}} />
        <div className="int-he" dangerouslySetInnerHTML={{__html:heText}} />

    </div>
)

const SubscribeButton = ({enAction, heAction, heLists, enLists, redirectURL}) => {
  const email = Sefaria._email;
  const [message, setMessage] = useState("");
  const [messageStyle, setMessageStyle] = useState("");
  const heActionText = useRef(heAction);
  const enActionText = useRef(enAction);

  if (email.length === 0) {
    enActionText.current = enAction;
    heActionText.current = heAction;
  }

  const handleClick = () => {
      if (Sefaria.util.isValidEmailAddress(email)) {
          setMessage("Subscribing...");
          setMessageStyle("italics");
          const lists = Sefaria.interfaceLang == "hebrew" ? heLists : enLists

          const request = new Request(
              "/api/subscribe/" + email,
              {headers: {'X-CSRFToken': Cookies.get('csrftoken')}}
          );
          fetch(request, {
              method: 'POST',
              mode: 'same-origin',
              credentials: 'same-origin',
              body: {"lists": lists},
          }).then(response => {
              if (!response.ok) {
                  response.text().then(resp_text => {
                      setMessage(resp_text)
                      setMessageStyle("");
                  });
              } else {
                  response.json().then(resp_json => {
                      if (resp_json.hasOwnProperty("status") && resp_json["status"] == "ok") {
                          setMessage("message.subscribed");
                          setMessageStyle("");
                      } else if (resp_json.hasOwnProperty("error")) {
                          setMessage(resp_json["error"]);
                          setMessageStyle("");
                      }
                  });
              }
          }).catch(error => {
              setMessage(error.message);
          });
      }
  }

  return <span>
      <div className="simpleButtonWrapper signUpEducators">
        <div onClick={handleClick} className={classNames({button:1, flexContainer:1, "int-en":1, white: true, tall: false, rounded:true})}>
          <span className="int-en">{email.length === 0 ? <a href={redirectURL}>{enActionText.current}</a> : enActionText.current}<img src="/static/img/circled-arrow-right.svg"/></span>
        </div>
        <div onClick={handleClick} className={classNames({button:1, flexContainer:1, "int-he":1, white: true, tall: false, rounded:true})}>
          <span className="int-he">{email.length === 0 ? <a href={redirectURL}>{heActionText.current}</a> : heActionText.current}<img src="/static/img/circled-arrow-left.svg"/></span>
        </div>
      </div>
      <div className={`signUpEducatorsMessage ${messageStyle}`}>{message}<br/></div>
  </span>
}

const HeaderForEducatorsPage = () => {
  var enTitle="Teach with Sefaria"
  var enText="Discover the power of digital texts and tools in your classroom. Explore Sefaria’s many resources to enrich teaching and learning in your community."
  var heText="גלו כיצד להעשיר את הלמידה וההוראה באמצעות מאגר מקורות דיגיטלי. באתר אפשרויות רבות ללומדים:  תוכלו למצוא מקורות, להיפגש עם מגוון של חומרי הוראה ולחזק את התלמידים שלכם כלומדים עצמאיים."
  var heTitle="מלמדים עם ספריא"

  return <div className="staticPageHeader educators">
    <div className="staticPageBlockInner flexContainer">
      <div className="staticPageHeaderTextBox educators">
        <h1>
          <span className="int-en">{enTitle}</span>
          <span className="int-he">{heTitle}</span>
        </h1>
        <SimpleInterfaceBlock classes="staticPageHeaderText" he={heText} en={enText}/>
        <SubscribeButton
             enAction={"Sign up to get updates"}
             heAction={"རིམ་སྤར་ཐོབ་པ་ལ་ཞུགས་ཐོ་གསར་འགོད་བྱོས།"}
             heLists={"Announcements_General_Hebrew|Announcements_Edu_Hebrew"}
             enLists={"Announcements_General|Announcements_Edu"}
             redirectURL={"/register?educator=true&next=/educators"}
            />
      </div>
    </div>
  </div>
};

const HeaderForRabbisPage = () => {
  var enTitle="Sefaria for Rabbis"
  var enText="Discover the power of digital texts and tools to fuel your rabbinate. Explore Sefaria’s many resources to enrich learning and teaching in your community."

  return <div className="staticPageHeader rabbis">
    <div className="staticPageBlockInner flexContainer">
      <div className="staticPageHeaderTextBox educators">
        <h1>
          <span className="int-en">{enTitle}</span>
        </h1>
        <SimpleInterfaceBlock classes="staticPageHeaderText" en={enText}/>
        <SubscribeButton
             enAction={"Sign up for Rabbi Newsletter"}
             heAction={"הירשמו לקבלת הניוזלטר"}
             heLists={"ANNOUNCEMENTS_General_Hebrew|ANNOUNCEMENTS_Rabbi_Hebrew"}
             enLists={"ANNOUNCEMENTS_General|ANNOUNCEMENTS_Rabbi"}
             redirectURL={"/register?next=/rabbis"}
            />
      </div>
    </div>
  </div>
};


const HeaderForDonatePage = () => {
  var enTitle="Your gift. Your impact."
  var enText="When you give to Sefaria, you’re powering a living library of more than 3,000 years of Jewish texts. Donate today and support the future of Jewish learning, innovation, and conversation."
  var heText="גלו כיצד להעשיר את הלמידה וההוראה באמצעות מאגר מקורות דיגיטלי. באתר אפשרויות רבות ללומדים:  תוכלו למצוא מקורות, להיפגש עם מגוון של חומרי הוראה ולחזק את התלמידים שלכם כלומדים עצמאיים."
  var heTitle="מלמדים עם ספריא"

  return <div className="staticPageHeader donate">
    <div className="staticPageBlockInner flexContainer">
      <div className="staticPageHeaderTextBox donate">
        <h1>
          <span className="int-en">{enTitle}</span>
          <span className="int-he">{heTitle}</span>
        </h1>
        <SimpleInterfaceBlock classes="staticPageHeaderText" he={heText} en={enText}/>
      </div>
    </div>
  </div>
};


const Header = ({enTitle, heTitle, enText, heText, enImg, heImg, enImgAlt, heImgAlt, enActionURL, enActionText, heActionURL, heActionText, newTab}) => {
    var staticPageHeaderClass = "staticPageHeader";
    var imgComponent = "";
    if (enImg === "" && heImg === "") {
      staticPageHeaderClass += " textOnly";
    }
    else
    {
      imgComponent = <span><img className="int-en" src={enImg} alt={enImgAlt}/><img className="int-he" src={heImg} alt={heImgAlt}/></span>;
    }
    return <div className={staticPageHeaderClass}>
        <div className="staticPageBlockInner flexContainer">
            <div className="staticPageHeaderTextBox">
                <h1>
                    <span className="int-en">{enTitle}</span>
                    <span className="int-he">{heTitle}</span>
                </h1>
                <SimpleInterfaceBlock classes="staticPageHeaderText" he={heText} en={enText}/>
                {enActionURL ?
                    <SimpleButton en={enActionText} he={heActionText} href={enActionURL} he_href={heActionURL}
                                  white={true} newTab={newTab}/> : null}
            </div>
            <div className="staticPageHeaderImg">
                {imgComponent}
            </div>
        </div>
    </div>
};

const Section = ({children, noPadding}) =>
    <div className={classNames({
        "staticPageBlockInner": 1,
        "staticPageSection": !noPadding,
    })}>
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
                <span className="int-en" dangerouslySetInnerHTML={{__html:enName}} />
                <span className="int-he" dangerouslySetInnerHTML={{__html:heName}} />
            </div>
        </div>
    </div>;

const Sheet = ({title, link, author, image}) =>
    <div className="staticPageSheetItem">
        <a href={link}>{title}</a>
        <img src={image}/>
        <span className="staticPageSheetAuthor">{author}</span>
    </div>;

const CallToActionFooterWithButton = ({href, he_href, enText, heText, enButtonText, heButtonText, newTab=false}) => (
  <div className="staticPageCallToActionFooter">
    <div className="staticPageBlockInner flexContainer">
      <SimpleInterfaceBlock classes="callToActionText" en={enText} he={heText} />
      <SimpleButton href={href} he_href={he_href} en={enButtonText} he={heButtonText} white={true} newTab={newTab}/>
    </div>
  </div>
);

const CallToActionFooter = ({enText, heText}) => (
    <div className="staticPageCallToActionFooter">
        <div className="staticPageBlockInner flexContainer">
            <SimpleInterfaceBlock classes="callToActionText noButton" en={enText} he={heText} />
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

const FeatureBox = ({enTitle, heTitle, enText, heText, enButtonText, heButtonText, enButtonUrl, heButtonUrl, borderColor}) => (
    <div className="featureBox" style={{borderColor: borderColor}}>
        <div className="featureHeader">
            <h3>
                <span className="int-en">{enTitle}</span>
                <span className="int-he">{heTitle}</span>
            </h3>
        </div>
        <div className="int-en" dangerouslySetInnerHTML={{__html:enText}} />
        <div className="int-he" dangerouslySetInnerHTML={{__html:heText}} />

        <SimpleButton
            white={false}
            rounded={true}
            tall={false}
            href={enButtonUrl}
            he_href={heButtonUrl}
            he={heButtonText}
            en={enButtonText}
        />

    </div>
)

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

const ButtonRow = ({children, light, white, enTitle, heTitle}) => (
    <div className={classNames({
        "buttonRow": 1,
        "blockVerticalPadding": 1,
        "lightgreyBackground": light,
        "greyBackground": !white && !light
    })}>
        {enTitle && heTitle ?  <H2Block en={enTitle} he={heTitle}/> : null }
        <div className="staticPageBlockInner flexContainer">{children}</div>
    </div>
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

const ParashaSponsorship = ({title, sponsorNames, message, link}) => {
    if (!sponsorNames) {
        return <div className="parashaSponsorship">
            <div className="parashaTitle">{title}</div>
            <div className="parashaSponsorNames"><a target="_blank" href='mailto:hannah@sefaria.org?subject=Ramban Sponsorship'><b><i>Available for Sponsorship</i></b></a></div>
        </div>
    }
    else {
        return <div className="parashaSponsorship">
            <a href={link} className="parashaTitle">{title}</a>
            <div className="parashaSponsorNames">{sponsorNames}</div>
            {message ?
            <div className="parashaMessage">{message}</div> : null }
        </div>
    }
};

const StaticHR = () =>
    <div className="staticPageBlockInner"><hr /></div>;

const ConditionalLink = ({ link, children }) =>
  link ? <a href={link} target="_blank">{children}</a> : children;

/*
* Team Page
*/

// Takes an array and boolean proposition function to be evaluated against each element
// Returns two arrays within an array
// The first contains the elements for which the proposition function evaluates to true. The second contains the rest
const partition = (arr, prop) =>
    arr.reduce(
        (accumulator, currentValue) => {
            accumulator[prop(currentValue) ? 0 : 1].push(currentValue);
            return accumulator;
        },
        [[], []]
    );

// Defines a comparator to be used for sorting team members
const byLastName = () => {
    const locale = Sefaria.interfaceLang === "hebrew" ? "he" : "en";
    return (a, b) => {
        const lastNameA = a.teamMemberDetails.teamName[locale].split(" ").pop();
        const lastNameB = b.teamMemberDetails.teamName[locale].split(" ").pop();
        return lastNameA.localeCompare(lastNameB, locale);
    };
};

const TeamTitle = ({ teamTitle }) => (
    <div className="teamTitle">
        <InterfaceText text={teamTitle} />
    </div>
);

const TeamName = ({ teamName }) => (
    <div className="teamName">
        <InterfaceText text={teamName} />
    </div>
);

const TeamMemberDetails = ({ teamMemberDetails }) => (
    <div className="teamMemberDetails">
        <TeamName teamName={teamMemberDetails.teamName} />
        <TeamTitle teamTitle={teamMemberDetails.teamTitle} />
    </div>
);

const TeamMemberImage = ({ teamMember }) => (
    <div className="teamMemberImage">
        <img
            src={teamMember.teamMemberImage}
            alt={`Headshot of ${teamMember.teamMemberDetails.teamName.en}`}
        />
    </div>
);

const TeamMember = ({ teamMember }) => (
    <div className="teamMember">
        <TeamMemberImage teamMember={teamMember} />
        <TeamMemberDetails teamMemberDetails={teamMember.teamMemberDetails} />
    </div>
);

const TeamMembers = ({ teamMembers }) => (
    <>
        {teamMembers.map((teamMember) => (
            <TeamMember key={teamMember.id} teamMember={teamMember} />
        ))}
    </>
);

const BoardMember = ({ boardMember }) => (
    <div className="teamBoardMember">
        <TeamMemberDetails teamMemberDetails={boardMember.teamMemberDetails} />
    </div>
);

const BoardMembers = ({ boardMembers }) => {
    let chairmanBoardMember;
    const chairmanIndex = boardMembers.findIndex(
        (boardMember) =>
            boardMember.teamMemberDetails.teamTitle.en.toLowerCase() ===
            "chairman"
    );
    if (chairmanIndex !== -1) {
        chairmanBoardMember = boardMembers.splice(chairmanIndex, 1);
    }
    const [cofounderBoardMembers, regularBoardMembers] = partition(
        boardMembers,
        (boardMember) =>
            boardMember.teamMemberDetails.teamTitle.en.toLowerCase() ===
            "co-founder"
    );

    return (
        <>
            {chairmanBoardMember && (
                <BoardMember boardMember={chairmanBoardMember[0]} />
            )}
            {cofounderBoardMembers.map((boardMember) => (
                <BoardMember key={boardMember.id} boardMember={boardMember} />
            ))}
            {regularBoardMembers.sort(byLastName()).map((boardMember) => (
                <BoardMember key={boardMember.id} boardMember={boardMember} />
            ))}
        </>
    );
};

const TeamMembersPage = memo(() => {
    const [ordinaryTeamMembers, setOrdinaryTeamMembers] = useState([]);
    const [teamBoardMembers, setTeamBoardMembers] = useState([]);
    const [error, setError] = useState(null);

    const fetchTeamMembersJSON = async () => {
        const query = `
            query {
                teamMembers(pagination: { limit: -1 }) {
                    data {
                        id
                        attributes {
                            teamName
                            teamTitle
                            isTeamBoardMember
                            teamMemberImage {
                                data {
                                    attributes {
                                        url
                                    }
                                }
                            }
                            localizations {
                                data {
                                    attributes {
                                        locale
                                        teamName
                                        teamTitle
                                    }
                                }
                            }
                        }
                    }
                }
            }
            `;
        try {
            const response = await fetch(STRAPI_INSTANCE + "/graphql", {
                method: "POST",
                mode: "cors",
                cache: "no-cache",
                credentials: "omit",
                headers: {
                    "Content-Type": "application/json",
                },
                redirect: "follow",
                referrerPolicy: "no-referrer",
                body: JSON.stringify({ query }),
            });
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.statusText}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            throw error;
        }
    };

    const loadTeamMembers = async () => {
        if (typeof STRAPI_INSTANCE !== "undefined" && STRAPI_INSTANCE) {
            try {
                const teamMembersData = await fetchTeamMembersJSON();

                const teamMembersFromStrapi =
                    teamMembersData.data.teamMembers.data.map(
                        (teamMember) => {
                            const heLocalization =
                                teamMember.attributes.localizations.data[0];

                            return {
                                id: teamMember.id,
                                isTeamBoardMember:
                                    teamMember.attributes.isTeamBoardMember,
                                teamMemberImage:
                                    teamMember.attributes.teamMemberImage
                                        ?.data?.attributes?.url,
                                teamMemberDetails: {
                                    teamName: {
                                        en: teamMember.attributes.teamName,
                                        he: heLocalization.attributes
                                            .teamName,
                                    },
                                    teamTitle: {
                                        en: teamMember.attributes.teamTitle,
                                        he: heLocalization.attributes
                                            .teamTitle,
                                    },
                                },
                            };
                        }
                    );

                const [ordinaryMembers, boardMembers] = partition(
                    teamMembersFromStrapi,
                    (teamMember) => !teamMember.isTeamBoardMember
                );

                setOrdinaryTeamMembers(ordinaryMembers);
                setTeamBoardMembers(boardMembers);
            } catch (error) {
                console.error("Fetch error:", error);
                setError("Error: Sefaria's CMS cannot be reached");
            }
        } else {
            setError("Error: Sefaria's CMS cannot be reached");
        }
    };

    useEffect(() => {
        loadTeamMembers();
    }, []);

    return (
        <div>
            {error ? (
                <h1>{error}</h1>
            ) : (
                <>
                    <section className="main-text team-members">
                        <TeamMembers
                            teamMembers={ordinaryTeamMembers.sort(byLastName())}
                        />
                    </section>
                    <header>
                        <h2>
                            <span className="int-en">BOARD OF DIRECTORS</span>
                            <span className="int-he">מועצת המנהלים</span>
                        </h2>
                    </header>
                    <section className="main-text board-members">
                        <BoardMembers boardMembers={teamBoardMembers} />
                    </section>
                </>
            )}
        </div>
    );
});

/*
* Jobs Page
*/

// Show a different header with a description of Sefaria for the page in the case that there are jobs available
const JobsPageHeader = ({ jobsAreAvailable }) => {
    return (
        <>
            <header>
                <h1 className="serif">
                    <span className="int-en">Jobs at Pecha</span>
                    <span className="int-he">משרות פנויות בספריא</span>
                </h1>

                {jobsAreAvailable ? (
                    <>
                        <h2>
                            <span className="int-en">About Pecha</span>
                            <span className="int-he">אודות ספריא</span>
                        </h2>
                        <p>
                            <span className="int-en">
                                Pecha is a nonprofit organization dedicated to creating the
                                future of Buddhist text in an open and participatory way. We are assembling
                                a free, living library of Buddhist texts and their interconnections,
                                in Tibetan and in translation.
                            </span>
                            <span className="int-he">
                                ספריא היא ארגון ללא מטרות רווח שמטרתו יצירת הדור הבא של לימוד התורה
                                באופן פתוח ומשותף. אנחנו בספריא מרכיבים ספרייה חיה וחופשית של טקסטים
                                יהודיים וכלל הקישורים ביניהם, בשפת המקור ובתרגומים.
                            </span>
                        </p>
                    </>
                ) : null}
            </header>
        </>
    );
};

const Job = ({ job }) => {
    return (
        <div className="job">
            <a className="joblink" target="_blank" href={job.jobLink}>
                {job.jobDescription}
            </a>
        </div>
    );
};

// Show the list of job postings within a department category
const JobsListForDepartment = ({ jobsList }) => {
    return (
        <section className="jobsListForDepartment">
            {jobsList.map((job) => (
                <Job key={job.id} job={job} />
            ))}
        </section>
    );
};

// Job postings are grouped by department. This component will show the jobs for a specific department
// Each department has a header for its category before showing a list of the job postings there
const JobPostingsByDepartment = ({ department, departmentJobPostings }) => {
    return (
        <section className="section department englishOnly">
            <header>
                <h2 className="anchorable">{department}</h2>
            </header>
            <JobsListForDepartment key={department} jobsList={departmentJobPostings} />
        </section>
    );
};

// Show all the job postings grouped by department and render each department separately
const GroupedJobPostings = ({ groupedJobPostings }) => {

    return (
        Object.entries(groupedJobPostings).map(([department, departmentJobPostings]) => {
            return (
                <JobPostingsByDepartment
                    key={department}
                    department={department}
                    departmentJobPostings={departmentJobPostings}
                />
            );
        })
    );
};


const NoJobsNotice = () => {
    return (
        <div className="section nothing">
            <p>
                <span className="int-en">
                    Sefaria does not currently have any open positions.
                    Please follow us on <a target="_blank" href="http://www.facebook.com/sefaria.org" >Facebook</a>
                    to hear about our next openings.
                </span>
                <span className="int-he">
                    ספריא איננה מחפשת כעת עובדים חדשים.
                    עקבו אחרינו ב<a target="_blank" href="http://www.facebook.com/sefaria.org" >פייסבוק</a>&nbsp;
                    כדי להשאר מעודכנים במשרות עתידיות.
                </span>
            </p>
        </div>
    );
};



const JobsPage = memo(() => {
    const [groupedJobPostings, setGroupedJobPostings] = useState({});
    const [error, setError] = useState(null);

    const fetchJobsJSON = async () => {
        const currentDateTime = new Date().toISOString();
        const query = `
            query { 
                jobPostings(
                    pagination: { limit: -1 }
                    filters: {
                        jobPostingStartDate: { lte: \"${currentDateTime}\" }
                        jobPostingEndDate: { gte: \"${currentDateTime}\" }
                    }
                ) {
                    data {
                        id
                        attributes {
                            jobLink
                            jobDescription
                            jobDepartmentCategory
                        }
                    }
                }
            }
        `;
    
        try {
            const response = await fetch(STRAPI_INSTANCE + "/graphql", {
                method: "POST",
                mode: "cors",
                cache: "no-cache",
                credentials: "omit",
                headers: {
                    "Content-Type": "application/json",
                },
                redirect: "follow",
                referrerPolicy: "no-referrer",
                body: JSON.stringify({ query }),
            });
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.statusText}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            throw error;
        }
    };
    
    const loadJobPostings = async () => {
        if (typeof STRAPI_INSTANCE !== "undefined" && STRAPI_INSTANCE) {
            try {
                const jobsData = await fetchJobsJSON();

                const jobsFromStrapi = jobsData.data?.jobPostings?.data?.map((jobPosting) => {
                    return {
                        id: jobPosting.id,
                        jobLink: jobPosting.attributes.jobLink,
                        jobDescription: jobPosting.attributes.jobDescription,
                        jobDepartmentCategory: jobPosting.attributes.jobDepartmentCategory
                            .split("_")
                            .join(" "),
                    };
                });

                // Group the job postings by department
                const groupedJobs = jobsFromStrapi.reduce((jobPostingsGroupedByDepartment, jobPosting) => {
                    const category = jobPosting.jobDepartmentCategory;
                    if (!jobPostingsGroupedByDepartment[category]) {
                        jobPostingsGroupedByDepartment[category] = [];
                    }
                    jobPostingsGroupedByDepartment[category].push(jobPosting);
                    return jobPostingsGroupedByDepartment;
                }, {});

                setGroupedJobPostings(groupedJobs);
            } catch (error) {
                console.error("Fetch error:", error);
                setError("Error: Sefaria's CMS cannot be reached");
            }
        } else {
            setError("Error: Sefaria's CMS cannot be reached");
        }
    };

    useEffect(() => {
        loadJobPostings();
    }, []);

    return (
        <div>
            {error ? (
                <h1>{error}</h1>
            ) : (
                <>
                    <JobsPageHeader jobsAreAvailable={Object.keys(groupedJobPostings)?.length} />
                    {Object.keys(groupedJobPostings)?.length ? (
                        <GroupedJobPostings groupedJobPostings={groupedJobPostings} />
                    ) : (
                        <NoJobsNotice />
                    )}
                </>
            )}
        </div>
    );
});

export {
    RemoteLearningPage,
    SheetsLandingPage,
    PBSC2020LandingPage,
    PBSC2021LandingPage,
    PoweredByPage,
    ContestLandingPage,
    RambanLandingPage,
    EducatorsPage,
    RabbisPage,
    DonatePage,
    WordByWordPage,
    JobsPage,
    TeamMembersPage,
};
