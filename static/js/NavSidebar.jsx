import {
  IntText,
} from './Misc';
import React  from 'react';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';


const NavSidebar = ({modules}) => {
  return <div className="navSidebar">
    {modules.map(m => 
      <Modules 
        type={m.type} 
        props={m.props || {}} 
        key={m.type} />
    )}
  </div>
};


const Modules = ({type, props}) => {
  // Choose the appropriate module component to render by `type`
  const moduleTypes = {
    "TheJewishLibrary":   TheJewishLibrary,
    "AboutTextCategory":  AboutTextCategory,
    "PopularTexts":       PopularTexts,
    "SponsorADay":        SponsorADay,
    "WeeklyTorahPortion": WeeklyTorahPortion,
    "DafYomi":            DafYomi,
  };
  const ModuleType = moduleTypes[type];
  return <ModuleType {...props} />
}


const Module = ({children}) => (
  <div className="navSidebarModule">{children}</div>
);


const ModuleTitle = ({children}) => (
  <h3><IntText>{children}</IntText></h3>
);


const TitledTextModule = ({title, text}) => (
  <Module>
    <ModuleTitle>{title}</ModuleTitle>
    <IntText>{text}</IntText>
  </Module>
);


const TitledBodyModule = ({title, children}) => (
  <Module>
    <ModuleTitle>{title}</ModuleTitle>
    {children}
  </Module>
);


const TheJewishLibrary = () => (
  <TitledTextModule
    title="The Jewish Library"
    text="The tradition of Torah texts is a vast, interconnected network that forms a conversation across space and time. The five books of the Torah form its foundation, and each generation of later texts functions as a commentary on those that came before it." />
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


const SponsorADay = () => (
  <TitledBodyModule title="Sponsor A Day of Learning">
    <IntText>With your help, we can add more texts and translations to the library, develop new tools for learning, and keep Sefaria accessible for Torah study anytime, anywhere.</IntText>
    <button className="button small">
      <a href="https://sefaria.nationbuilder.com/sponsor" target="_blank">
        <img src="/static/img/heart.png" alt="donation icon" />
        <IntText>Sponsor A Day</IntText>
      </a>
    </button>
  </TitledBodyModule>
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
          <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
          <a href={"/" + daf.url}>
            <IntText en={daf.displayValue.en} he={daf.displayValue.he}/>
          </a>
        </div>
      </div>
    </Module>
  );
};

export default NavSidebar;