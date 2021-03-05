import {
  IntText,
} from './Misc';
import React  from 'react';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import {NewsletterSignUpForm} from './Misc'


const NavSidebar = ({modules}) => {
  return <div className="navSidebar">
    {modules.map((m, i) => 
      <Modules 
        type={m.type} 
        props={m.props || {}} 
        key={i} />
    )}
  </div>
};


const Modules = ({type, props}) => {
  // Choose the appropriate module component to render by `type`
  const moduleTypes = {
    "AboutSefaria":        AboutSefaria,
    "Resources":           Resources,
    "TheJewishLibrary":    TheJewishLibrary,
    "AboutTextCategory":   AboutTextCategory,
    "PopularTexts":        PopularTexts,
    "SupportSefaria":      SupportSefaria,
    "SponsorADay":         SponsorADay,
    "WeeklyTorahPortion":  WeeklyTorahPortion,
    "DafYomi":             DafYomi,
    "AboutTopics":         AboutTopics,
    "TrendingTopics":      TrendingTopics,
    "TitledText":          TitledText,
    "Visualizations":      Visualizations,
    "JoinTheConversation": JoinTheConversation,
    "GetTheApp":           GetTheApp,
    "StayConnected":       StayConnected,
    "AboutStudySchedules": AboutStudySchedules,
  };
  const ModuleType = moduleTypes[type];
  return <ModuleType {...props} />
}


const Module = ({children, blue}) => {
  const classes = classNames({navSidebarModule: 1, blue: blue});
  return <div className={classes}>{children}</div>
};


const ModuleTitle = ({children, en, he, h1}) => {
  const content = children ?
    <IntText>{children}</IntText>
    : <IntText en={en} he={he} />;

  return h1 ?
    <h1>{content}</h1>
    : <h3>{content}</h3>
};


const TitledText = ({enTitle, heTitle, enText, heText}) => {
  return <Module>
    <ModuleTitle en={enTitle} he={heTitle} />
    <IntText en={enText} he={heText} />
  </Module>
};


const AboutSefaria = () => (
  <Module>
    <ModuleTitle h1={true}>A Living Library of Torah</ModuleTitle>
    <IntText>Sefaria is a place to explore 3,000 years of Jewish texts. We offer you direct access to texts, translations, and commentaries for free so that you participate in the tradition of making meaning of our heritage.</IntText> <a href="/about" className="inTextLink"><IntText>Learn More</IntText> <IntText>&rsaquo;</IntText></a>
  </Module>
);


const Resources = () => (
  <Module>
    <ModuleTitle>Resources</ModuleTitle>
    <div className="linkList">
      <IconLink text="Study Schedules" url="/calendars" icon="calendar.svg" />
      <IconLink text="Sheets" url="/sheets" icon="sheet.svg" />
      <IconLink text="Collections" url="/collections" icon="collection.svg" />
      <IconLink text="Educators" url="/educators" icon="educators.svg" />
      <IconLink text="Visualizations" url="/visualizations" icon="visualizations.svg" />
      <IconLink text="Torah Tab" url="/torah-tab" icon="torah-tab.svg" />
      <IconLink text="Help" url="/help" icon="help.svg" />
    </div>
  </Module>
);


const TheJewishLibrary = () => (
  <Module>
    <ModuleTitle>The Jewish Library</ModuleTitle>
    <IntText>The tradition of Torah texts is a vast, interconnected network that forms a conversation across space and time. The five books of the Torah form its foundation, and each generation of later texts functions as a commentary on those that came before it.</IntText>
  </Module>
);


const PopularTexts = ({texts}) => (
  <Module>
    <ModuleTitle>Popular Texts</ModuleTitle>
    {texts.map(text => 
      <div className="navSidebarLink ref" key={text}>
        <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
        <a href={"/" + Sefaria.normRef(text)}><IntText>{text}</IntText></a>
      </div>
    )}
  </Module>
);


const SupportSefaria = ({blue}) => (
  <Module blue={blue}>
    <ModuleTitle>Support Sefaria</ModuleTitle>
    <IntText>Sefaria is an open source, non-profit project. Support us by making a tax-deductible donation.</IntText>
    <br />
    <a className={"button small" + (blue ? " white" : "")} href="https://sefaria.nationbuilder.com/supportsefaria" target="_blank">
      <img src="/static/img/heart.png" alt="donation icon" />
      <IntText>Make a Donation</IntText>
    </a>
  </Module>
);


const SponsorADay = () => (
  <Module>
    <ModuleTitle>Sponsor A Day of Learning</ModuleTitle>
    <IntText>With your help, we can add more texts and translations to the library, develop new tools for learning, and keep Sefaria accessible for Torah study anytime, anywhere.</IntText>
    <br />
    <a className="button small" href="https://sefaria.nationbuilder.com/sponsor" target="_blank">
      <img src="/static/img/heart.png" alt="donation icon" />
      <IntText>Sponsor A Day</IntText>
    </a>
  </Module>
);


const AboutTextCategory = ({cats}) => {
  const tocObject = Sefaria.tocObjectByCategories(cats);
  const enTitle = "About " + tocObject.category;
  const heTitle = "אודות " + tocObject.heCategory;

  return (
    <Module>
      <h3><IntText en={enTitle} he={heTitle}/></h3>
      <IntText en={tocObject.enDesc} he={tocObject.heDesc} />
    </Module>
  );
};


const WeeklyTorahPortion = () => {
  const parashah = Sefaria.calendars.filter(c => c.title.en === "Parashat Hashavua")[0];
  const haftarot = Sefaria.calendars.filter(c => c.title.en.startsWith("Haftarah"))

  return (
    <Module>
      <ModuleTitle>Weekly Torah Portion</ModuleTitle>
      <div className="readingsSection">
        <IntText className="readingsSectionTitle" en={parashah.displayValue.en} he={parashah.displayValue.he} />
        <div className="navSidebarLink ref">
          <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
          <a href={"/" + parashah.url}><IntText>{parashah.ref}</IntText></a>
        </div>
      </div>
      <div className="readingsSection">
        <IntText className="readingsSectionTitle">Haftarah</IntText>
        {haftarot.map(h => 
        <div className="navSidebarLink ref" key={h.url}>
          <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
          <a href={"/" + h.url}><IntText>{h.ref}</IntText></a>
        </div>)}
      </div>
      <a href="/topics/category/torah-portions" className="allLink">
        <IntText>All Portions</IntText> <IntText>&rsaquo;</IntText>
      </a>
    </Module>
  );
};


const DafYomi = () => {
  const daf = Sefaria.calendars.filter(c => c.title.en === "Daf Yomi")[0];

  return (
    <Module>
      <ModuleTitle>Daily Study</ModuleTitle>
      <div className="readingsSection">
        <IntText className="readingsSectionTitle">Daf Yomi</IntText>
        <div className="navSidebarLink ref">
          <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt={Sefaria._("book icon")} />
          <a href={"/" + daf.url}>
            <IntText en={daf.displayValue.en} he={daf.displayValue.he}/>
          </a>
        </div>
      </div>
    </Module>
  );
};


const Visualizations = ({categories}) => {
  const visualizations = [
    {en: "Tanakh & Talmud", 
      he: 'תנ"ך ותלמוד', 
      url: "/explore"},
    {en: "Talmud & Mishneh Torah", 
      he: "תלמוד ומשנה תורה",
      url: "/explore-Bavli-and-Mishneh-Torah"},
    {en: "Talmud & Shulchan Arukh", 
      he: "תלמוד ושולחן ערוך",
      url: "/explore-Bavli-and-Shulchan-Arukh"},
    {en: "Mishneh Torah & Shulchan Arukh", 
      he: "משנה תורה ושולחן ערוך",
      url: "/explore-Mishneh-Torah-and-Shulchan-Arukh"},
    {en: "Tanakh & Midrash Rabbah",
      he: 'תנ"ך ומדרש רבה',
      url: "/explore-Tanakh-and-Midrash-Rabbah"},
    {en: "Tanakh & Mishneh Torah",
      he: 'תנ"ך ומשנה תורה',
      url: "/explore-Tanakh-and-Mishneh-Torah"},
    {en: "Tanakh & Shulchan Arukh",
      he: 'תנ"ך ושולחן ערוך',
      url: "/explore-Tanakh-and-Shulchan-Arukh"},
  ];

  const links = visualizations.filter(v => categories.some(cat => v.en.indexOf(cat) > -1));

  if (links.length == 0) { return null; }

  return (
    <Module>
      <ModuleTitle>Visualizations</ModuleTitle>
      <IntText>Explore interconnections among texts with our interactive visualizations.</IntText>
      <div className="linkList">
        {links.map((link, i) => 
          <div className="navSidebarLink gray" key={i}>
            <img src="/static/icons/visualization.svg" className="navSidebarIcon" alt={Sefaria._("visualization icon")} />
            <a href={link.url}><IntText en={link.en} he={link.he}/></a>
          </div>
        )}
      </div>
      <a href="/visualizations" className="allLink">
        <IntText>All Visualizations</IntText> <IntText>&rsaquo;</IntText>
      </a>
    </Module>
  );
};


const AboutTopics = () => (
  <Module>
    <ModuleTitle>About Topics</ModuleTitle>
    <IntText>Topics bring you straight to selections of texts and user created source sheets about thousands of subjects. Sources that appear are drawn from existing indices of Jewish texts (like Aspaklaria) and from the sources our users include on their public source sheets.</IntText>
  </Module>
);


const TrendingTopics = () => (
  <Module>
    <ModuleTitle>Trending Topics</ModuleTitle>
    {Sefaria.trendingTopics.map((topic, i) => 
      <div className="navSidebarLink ref" key={i}>
        <a href={"/topics/" + topic.slug}><IntText en={topic.en} he={topic.he}/></a>
      </div>
    )}
  </Module>
);


const JoinTheConversation = () => (
  <Module>
    <ModuleTitle>Join the Conversation</ModuleTitle>
    <IntText>Mix and match sources from our library, along with outside sources, comments, images and videos.</IntText>
    <br />
    <a className="button small" href="/sheets/new">
      <img src="/static/icons/new-sheet.svg" alt="make a sheet icon" />
      <IntText>Make a Sheet</IntText>
    </a>
  </Module>
);


const GetTheApp = () => (
  <Module>
    <ModuleTitle>Get the Mobile App</ModuleTitle>
    <IntText>Access the Jewish library anywhere and anytime with the</IntText> <a href="/mobile" className="inTextLink"><IntText>Sefaria mobile app.</IntText></a>
    <br />
    <a target="_blank" className="button small white appButton ios" href="https://itunes.apple.com/us/app/sefaria/id1163273965?ls=1&mt=8">
      <img src="/static/icons/ios.svg" alt={Sefaria._("Sefaria app on IOS")} />
      <IntText>iOS</IntText>
    </a>
    <a target="_blank" className="button small white appButton" href="https://play.google.com/store/apps/details?id=org.sefaria.sefaria">
      <img src="/static/icons/android.svg" alt={Sefaria._("Sefaria app on Android")} />
      <IntText>Android</IntText>
    </a>
  </Module>
);


const StayConnected = () => {
  const fbURL = Sefaria.interfaceLang == "hebrew" ? "https://www.facebook.com/sefaria.org.il" : "https://www.facebook.com/sefaria.org";

  return (
    <Module>
      <ModuleTitle>Stay Connected</ModuleTitle>
      <IntText>Get updates on new texts, learning resources, features, and more.</IntText>
      <br />
      <NewsletterSignUpForm context="sidebar" />

      <a target="_blank" className="button small white appButton iconOnly" href={fbURL}>
        <img src="/static/icons/facebook.svg" alt={Sefaria._("Sefaria on Facebook")} />
      </a>
      <a target="_blank" className="button small white appButton iconOnly" href="https://twitter.com/SefariaProject">
        <img src="/static/icons/twitter.svg" alt={Sefaria._("Sefaria on Twitter")} />
      </a>
      <a target="_blank" className="button small white appButton iconOnly" href="https://www.instagram.com/sefariaproject">
        <img src="/static/icons/instagram.svg" alt={Sefaria._("Sefaria on Instagram")} />
      </a>
      <a target="_blank" className="button small white appButton iconOnly" href="https://www.youtube.com/user/SefariaProject">
        <img src="/static/icons/youtube.svg" alt={Sefaria._("Sefaria on YouTube")} />
      </a>

    </Module>
  );
};


const AboutStudySchedules = () => (
  <Module>
    <ModuleTitle h1={true}>Study Schedules</ModuleTitle>
    <IntText>Since biblical times, the Torah has been divided into sections which are read each week on a set yearly calendar. Following this practice, many other calendars have been created to help communities of learners work through specific texts together.</IntText>
  </Module>
);



const IconLink = ({text, url, icon}) => (
  <div className="navSidebarLink gray">
    <img src={"/static/icons/" + icon} className="navSidebarIcon" alt={`${Sefaria._(text)} ${Sefaria._("icon")}`} />
    <a href={url}><IntText>{text}</IntText></a>
  </div>
);


export default NavSidebar;