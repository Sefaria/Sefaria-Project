import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import {AppStoreButton, DonateLink, EnglishText, HebrewText, ImageWithCaption} from './Misc'
import {NewsletterSignUpForm} from "./NewsletterSignUpForm";
import {InterfaceText, ProfileListing, Dropdown} from './Misc';
import { Promotions } from './Promotions'
import {SignUpModalKind} from "./sefaria/signupModalContent";
import Util from "./sefaria/util";
import Button from "./common/Button";


const NavSidebar = ({sidebarModules, includeFooter = true}) => {
  return (
    <aside className="navSidebar sans-serif" role="complementary" aria-label={Sefaria._("nav_sidebar.sidebar_navigation")}>
      {sidebarModules.map((m, i) =>
        <SidebarModules
          type={m.type}
          props={m.props || {}}
          key={i} />
      )}
      {!!includeFooter && <SidebarFooter />} 
    </aside>
  );
};

NavSidebar.propTypes = {
  sidebarModules: PropTypes.arrayOf(PropTypes.shape({
    type: PropTypes.string.isRequired,
    props: PropTypes.object
  })).isRequired,
  includeFooter: PropTypes.bool
};


const SidebarModules = ({type, props}) => {
  // Choose the appropriate module component to render by `type`
  const moduleTypes = {
    "AboutSefaria":           AboutSefaria,
    "Promo":                  Promo,
    "Resources":              Resources,
    "TheJewishLibrary":       TheJewishLibrary,
    "AboutTextCategory":      AboutTextCategory,
    "AboutText":              AboutText,
    "SupportSefaria":         SupportSefaria,
    "SponsorADay":            SponsorADay,
    "LearningSchedules":      LearningSchedules,
    "Translations":           Translations,
    "WeeklyTorahPortion":     WeeklyTorahPortion,
    "DafYomi":                DafYomi,
    "AboutTopics":            AboutTopics,
    "TrendingTopics":         TrendingTopics,
    "TopicLandingTopicCatList":  TopicLandingTopicCatList,
    "AZTopicsLink":           AZTopicsLink,
    "RelatedTopics":          RelatedTopics,
    "TitledText":             TitledText,
    "Visualizations":         Visualizations,
    "JoinTheCommunity":       JoinTheCommunity,
    "JoinTheConversation":    JoinTheConversation,
    "GetTheApp":              GetTheApp,
    "StayConnected":          StayConnected,
    "AboutLearningSchedules": AboutLearningSchedules,
    "CreateASheet":           CreateASheet,
    "WhatIsSefariaVoices":     WhatIsSefariaVoices,
    "VoicesNewsletterSignUp": VoicesNewsletterSignUp,
    "AboutTranslatedText":    AboutTranslatedText,
    "AboutCollections":       AboutCollections,
    "ExploreCollections":     ExploreCollections,
    "DownloadVersions":       DownloadVersions,
    "WhoToFollow":            WhoToFollow,
    "Image":                  Image,
    "Wrapper":                Wrapper,
    "PortalAbout":            PortalAbout,
    "PortalMobile":           PortalMobile,
    "PortalOrganization":     PortalOrganization,
    "PortalNewsletter":       PortalNewsletter,
    "RecentlyViewed":        RecentlyViewed,
    "StudyCompanion":        StudyCompanion,
  };
  if (!type) { return null; }
  const SidebarModuleType = moduleTypes[type];
  return <SidebarModuleType {...props} />
};


const SidebarModule = ({children, blue, wide}) => {
  const classes = classNames({navSidebarModule: 1, "sans-serif": 1, blue, wide});
  return <div className={classes}>{children}</div>
};


const SidebarModuleTitle = ({children, en, he}) => {
  const content = children ?
    <InterfaceText>{children}</InterfaceText>
    : <InterfaceText text={{en, he}} />;
  return <h1>{content}</h1>;
};

const TitledText = ({children, title, text}) => {
  return <SidebarModule>
            <SidebarModuleTitle en={title.en} he={title.he}/>
            <p class="sidebarModuleText">
                 <InterfaceText markdown={{en: text.en, he: text.he}} />
            </p>
            {children}
        </SidebarModule>
};
const RecentlyViewedItem = ({oref}) => {
   const trackItem = () => {
     gtag('event', 'recently_viewed', {link_text: oref.ref, link_type: 'ref'})
   }
   const params = Sefaria.util.getUrlVersionsParams(oref.versions);
   const url = "/" + Sefaria.normRef(oref.ref) + (params ? "?" + params  : "");
   return <li>
            <a href={url} onClick={() => trackItem()}>{Sefaria._v({"he": oref.he_ref, "en": oref.ref})}</a>
         </li>;
}
const RecentlyViewedList = ({items}) => {
   const recentlyViewedListItems = items.map(x => { return <RecentlyViewedItem oref={x} key={`RecentlyViewedItem${x.ref}`}/>});
   return <div className={"navSidebarLink serif recentlyViewed"}><ul>{recentlyViewedListItems}</ul></div>;
}
const RecentlyViewed = ({toggleSignUpModal, mobile}) => {
   const [recentlyViewedItems, setRecentlyViewedItems] = useState([]);
   const handleAllHistory = (e) => {
    if (!Sefaria._uid) {
      e.preventDefault();
      toggleSignUpModal(SignUpModalKind.ViewHistory);
    }
    gtag('event', 'recently_viewed', {link_type: 'all_history', logged_in: !!Sefaria._uid});
   }

   const filterRecentlyViewedItems = () => {
        let itemsToShow = [];
        let booksFound = [];
        Sefaria.userHistory.items.forEach(x => {
        if (!booksFound.includes(x.book) && x.book !== "Sheet") {
           booksFound.push(x.book);
           itemsToShow.push(x);
        }});

        itemsToShow = itemsToShow.slice(0, 3);
        setRecentlyViewedItems(itemsToShow);
   }

   useEffect( () => {
       if (!Sefaria.userHistory.loaded) {
           Sefaria.loadUserHistory(20, filterRecentlyViewedItems);
       } else {
           filterRecentlyViewedItems();
       }
   }, []);

   if (!Sefaria.userHistory.items || Sefaria.userHistory.items.length === 0) {
     return null;
   }
   const allHistoryPhrase = mobile ? "nav_sidebar.all_history" : "nav_sidebar.all_history_desktop";
   const recentlyViewedList = <RecentlyViewedList items={recentlyViewedItems}/>;
   return <SidebarModule>
            <div className="recentlyViewed">
                <div id="header">
                  <SidebarModuleTitle>nav_sidebar.recently_viewed</SidebarModuleTitle>
                  {!mobile && recentlyViewedList}
                  <a href="/history" id="history" onClick={handleAllHistory}><InterfaceText>{allHistoryPhrase}</InterfaceText></a>
                </div>
                {mobile && recentlyViewedList}
            </div>
          </SidebarModule>;
}

const Promo = () =>
    <SidebarModule>
        <Promotions adType="sidebar"/>
    </SidebarModule>
;

const StudyCompanion = () => (
    <SidebarModule>
        <SidebarModuleTitle>Study Companion</SidebarModuleTitle>
        <div><InterfaceText>Get the Weekly Parashah Study Companion in your inbox.</InterfaceText></div>
        <a className="button small"
           data-anl-event="select_promotion:click|view_promotion:scrollIntoView"
           data-anl-promotion_name="Parashah Email Signup - Topic TOC"
           href="https://learn.sefaria.org/weekly-parashah/">
            <img src="/static/icons/email-newsletter.svg" alt={Sefaria._("Sign up for our weekly parashah study companion")}/>
            <InterfaceText>common.sign_up</InterfaceText>
        </a>
    </SidebarModule>
)


const AboutSefaria = ({hideTitle}) => (
  <SidebarModule>
    {!hideTitle ?
    <SidebarModuleTitle>nav_sidebar.a_living_library_of_torah</SidebarModuleTitle> : null }
    <InterfaceText>
      <EnglishText>
          Sefaria is home to 3,000 years of Jewish texts. We are a nonprofit organization offering free access to texts, translations,
          and commentaries so that everyone can participate in the ongoing process of studying, interpreting, and creating Torah.
        </EnglishText>
        <HebrewText>
          ספריא היא ביתם של 3,000 שנות ספרות יהודית.
          אנו ארגון ללא מטרות רווח המציע גישה חופשית למקורות יהודיים, לתרגומים ולפרשנויות,
          ומטרתנו לאפשר לכל אחד ואחת להשתתף בתהליך המתמשך של לימוד וחידוש בתורה.
        </HebrewText>
    </InterfaceText>
    <a href="/about" className="inTextLink">
      <InterfaceText>
          <EnglishText>Learn More ›</EnglishText>
          <HebrewText>לקריאה נוספת ›</HebrewText>
      </InterfaceText>
    </a>
      {!hideTitle && <InterfaceText>
          <EnglishText>
            <a className="button get-start" href={Sefaria._siteSettings.HELP_CENTER_URLS.GETTING_STARTED} data-target-module={Sefaria.VOICES_MODULE}>
                <img src="/static/icons/vector.svg" alt={Sefaria._("nav_sidebar.play_video")}/>
                <div className="get-start">
                  Getting Started (2 min)
                </div>
            </a>
          </EnglishText>
          <HebrewText>
            <a className="button get-start" href="https://youtu.be/rCADxtqPqnw">
                <img src="/static/icons/vector.svg" alt={Sefaria._("nav_sidebar.play_video")}/>
                <div className="get-start">
                  הכירו את ספריא (2 דק')
                </div>
            </a>
          </HebrewText>
      </InterfaceText>
    }
  </SidebarModule>
);


const AboutTranslatedText = ({translationsSlug}) => {

  const translationLookup = {
    "ar": {title: "نصوص يهودية بالعربية", body: "سفاريا هي موطن 3000 سنة من النصوص اليهودية. نحن منظمة غير ربحية تقدم وصولاً مجانيًا إلى النصوص والترجمات والتعليقات حتى يتمكن الجميع من المشاركة في العملية المستمرة لدراسة التوراة وتفسيرها وخلقها."},
    "de": {title: "Eine lebendige Bibliothek der Tora", body: "Sefaria ist eine Bibliothek für jüdische Texte aus 3.000 Jahren. Wir sind eine gemeinnützige Organisation, die freien Zugang zu Texten, Übersetzungen und Kommentaren bietet, damit jede und jeder am fortlaufenden Prozess des Studierens, Interpretierens und der Entwicklung der Tora teilnehmen kann."},
    "eo": {title: "Vivanta Biblioteko de Torao", body: "Sefaria estas hejmo de 3,000 jaroj da judaj tekstoj. Ni estas neprofitcela organizo ofertanta senpagan aliron al tekstoj, tradukoj kaj komentaĵoj por ke ĉiuj povu partopreni en la daŭra procezo de studado, interpretado kaj kreado de Torao."},
    "es": {title: "Una biblioteca viva de la Torá", body: "Sefaria alberga 3.000 años de textos judíos. Somos una organización sin fines de lucro que ofrece acceso gratuito a textos, traducciones y comentarios para que todos puedan participar en el proceso continuo de estudio, interpretación y creación de la Torá."},
    "fa": {title:"کتابخانه زنده تورات", body: "سفاریا خانه 3000 سال متون یهودی است. ما یک سازمان غیرانتفاعی هستیم که دسترسی رایگان به متون، ترجمه ها و تفسیرها را ارائه می دهیم تا همه بتوانند در روند مداوم مطالعه، تفسیر و ایجاد تورات شرکت کنند."},
    "fi": {title: "Tooran elävä kirjasto", body: "Sefaria on koti 3000 vuoden juutalaisille teksteille. Olemme voittoa tavoittelematon organisaatio, joka tarjoaa ilmaisen pääsyn teksteihin, käännöksiin ja kommentteihin, jotta kaikki voivat osallistua jatkuvaan Tooran opiskelu-, tulkkaus- ja luomisprosessiin."},
    "fr": {title: "Une bibliothèque vivante de la Torah", body: "Une bibliothèque de Torah vivante. Sefaria abrite 3 000 ans de textes juifs. Nous sommes une organisation à but non lucratif offrant un accès gratuit aux textes de la Torah, aux commentaires et aux traductions, afin que chacun puisse participer au processus infini de l'étude, de l'interprétation et de la création de la Torah."},
    "it": {title: "Una biblioteca vivente della Torah", body: "Sefaria ospita 3.000 anni di testi ebraici. Siamo un'organizzazione senza scopo di lucro che offre libero accesso a testi, traduzioni e commenti in modo che tutti possano partecipare al processo in corso di studio, interpretazione e creazione della Torah."},
    "pl": {title: "Żywa Biblioteka Tory", body: "Sefaria jest domem dla 3000 lat żydowskich tekstów. Jesteśmy organizacją nonprofit oferującą bezpłatny dostęp do tekstów, tłumaczeń i komentarzy, dzięki czemu każdy może uczestniczyć w bieżącym procesie studiowania, tłumaczenia i tworzenia Tory."},
    "pt": {title: "Uma Biblioteca Viva da Torá", body: "Sefaria é o lar de 3.000 anos de textos judaicos. Somos uma organização sem fins lucrativos que oferece acesso gratuito a textos, traduções e comentários para que todos possam participar do processo contínuo de estudo, interpretação e criação da Torá."},
    "ru": {title: "Живая библиотека Торы", body: "Сефария является домом для еврейских текстов 3000-летней давности. Мы — некоммерческая организация, предлагающая бесплатный доступ к текстам, переводам и комментариям, чтобы каждый мог участвовать в продолжающемся процессе изучения, толкования и создания Торы."},
    "yi": {title: "א לעבעדיקע ביבליאטעק פון תורה", body: "אין ספֿריאַ איז אַ היים פֿון 3,000 יאָר ייִדישע טעקסטן. מיר זענען אַ נאַן-נוץ אָרגאַניזאַציע וואָס אָפפערס פריי אַקסעס צו טעקסטן, איבערזעצונגען און קאָמענטאַרן אַזוי אַז אַלעמען קענען אָנטייל נעמען אין די אָנגאָינג פּראָצעס פון לערנען, ינטערפּריטיישאַן און שאפן תורה."}
  }
  return (
  <SidebarModule>
    <SidebarModuleTitle>{translationLookup[translationsSlug] ?
          translationLookup[translationsSlug]["title"] : "nav_sidebar.a_living_library_of_torah"}</SidebarModuleTitle>
        { translationLookup[translationsSlug] ?
          translationLookup[translationsSlug]["body"] :
          <InterfaceText>
          <EnglishText>
          Sefaria is home to 3,000 years of Jewish texts. We are a nonprofit organization offering free access to texts, translations,
          and commentaries so that everyone can participate in the ongoing process of studying, interpreting, and creating Torah.
        </EnglishText>
        <HebrewText>
          ספריא היא ביתם של 3,000 שנות ספרות יהודית.
          אנו ארגון ללא מטרות רווח המציע גישה חופשית למקורות יהודיים, לתרגומים ולפרשנויות,
          ומטרתנו לאפשר לכל אחד ואחת להשתתף בתהליך המתמשך של לימוד וחידוש בתורה.
        </HebrewText>
        </InterfaceText>
        }
  </SidebarModule>
);
}


const Resources = () => (
  <SidebarModule>
    <h3><InterfaceText>resources_module.resources</InterfaceText></h3>
    <div className="linkList">
      <IconLink text="nav_sidebar.mobile_apps" url="/mobile" icon="mobile.svg" />
      <IconLink text="nav_sidebar.teach_with_sefaria" url="/educators" icon="educators.svg" />
      <IconLink text="nav_sidebar.visualizations" url="/visualizations" icon="visualizations.svg" />
      <IconLink text="nav_sidebar.torah_tab" url="/torah-tab" icon="torah-tab.svg" />
      <IconLink text="header.help" url={Sefaria._v({he: Sefaria._siteSettings.HELP_CENTER_URLS.HE, en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US})} icon="help.svg" openInNewTab={true} />
    </div>
  </SidebarModule>
);


const getSidebarFooterData = () => [{'he': 'אודות','en': 'About', 'url': `${Sefaria.getModuleURL(Sefaria.LIBRARY_MODULE).origin}/about`},
                                    {'he': 'עזרה','en':'Help', 'url': Sefaria._v({he: Sefaria._siteSettings.HELP_CENTER_URLS.HE, en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US})},
                                    {'he': 'צרו קשר','en':'Contact Us', 'url': 'mailto:hello@sefaria.org'},
                                    {'he': 'ניוזלטר','en':'Newsletter', 'url': `${Sefaria.getModuleURL(Sefaria.LIBRARY_MODULE).origin}/newsletter`},
                                    {'he': 'בלוג','en':'Blog', 'url': 'https://blog.sefaria.org/'},
                                    {'he': 'אינסטגרם','en':'Instagram', 'url': 'https://www.instagram.com/sefariaproject/'},
                                    {'he': 'פייסבוק','en':'Facebook', 'url': 'https://www.facebook.com/sefaria.org'},
                                    {'he': 'יוטיוב','en':'YouTube', 'url':'https://www.youtube.com/user/SefariaProject'},
                                    {'he': 'חנות','en':'Shop', 'url': 'https://store.sefaria.org/'},
                                    {'he': 'תנאים','en':'Terms', 'url': `${Sefaria.getModuleURL(Sefaria.LIBRARY_MODULE).origin}/terms`},
                                    {'he': 'מדיניות פרטיות','en':'Privacy Policy', 'url': `${Sefaria.getModuleURL(Sefaria.LIBRARY_MODULE).origin}/privacy-policy`},
                                    {'he': 'אפשרויות תרומה','en':'Ways to Give', 'url': `${Sefaria.getModuleURL(Sefaria.LIBRARY_MODULE).origin}/ways-to-give`},
                                    {'he': 'תרומות','en':'Donate', 'url': Sefaria._v({en: 'https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=Footer', he: 'https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=Footer'})},
                                  ];


const SidebarFooter = () => {

  const data = getSidebarFooterData();

  return (
    <div className = "stickySidebarFooter navSidebarModule">
        <h1/>
        <div className="footerContainer">
          {data.map(footerLink =>
            <a href={footerLink.url}
               onKeyDown={(e) => Util.handleKeyboardClick(e)}>
              <InterfaceText text={{'en': footerLink.en, 'he': footerLink.he}}  />
            </a>
          )}
        </div>
    </div>
);
}



const TheJewishLibrary = ({hideTitle}) => (
  <SidebarModule>
    {!hideTitle ?
    <SidebarModuleTitle>The Jewish Library</SidebarModuleTitle> : null}
    <InterfaceText>The tradition of Torah texts is a vast, interconnected network that forms a conversation across space and time. The five books of the Torah form its foundation, and each generation of later texts functions as a commentary on those that came before it.</InterfaceText>
  </SidebarModule>
);


const SupportSefaria = ({blue}) => (
  <SidebarModule blue={blue}>
    <SidebarModuleTitle>nav_sidebar.support_sefaria</SidebarModuleTitle>
    <InterfaceText>nav_sidebar.sefaria_is_an_open_source_nonprofit_project_support</InterfaceText>
    <br />
    <DonateLink classes={"button small" + (blue ? " white" : "")} source={"NavSidebar-SupportSefaria"}>
      <img src="/static/img/heart.png" alt={Sefaria._("common.donation_icon")} />
      <InterfaceText>nav_sidebar.make_a_donation</InterfaceText>
    </DonateLink>
  </SidebarModule>
);


const SponsorADay = () => (
  <SidebarModule>
    <SidebarModuleTitle>nav_sidebar.sponsor_a_day_of_learning</SidebarModuleTitle>
    <InterfaceText>nav_sidebar.with_your_help_we_can_add_more_texts</InterfaceText>
    <br />
    <DonateLink classes={"button small"} link={"dayOfLearning"} source={"NavSidebar-SponsorADay"}>
      <img src="/static/img/heart.png" alt={Sefaria._("common.donation_icon")} />
      <InterfaceText>nav_sidebar.sponsor_a_day</InterfaceText>
    </DonateLink>
  </SidebarModule>
);


const AboutTextCategory = ({cats}) => {
  const tocObject = Sefaria.tocObjectByCategories(cats);
  const enTitle = "About " + tocObject.category;
  const heTitle = "אודות " + tocObject.heCategory;

  if ((Sefaria.interfaceLang === "hebrew" && !tocObject.heDesc) ||
      (Sefaria.interfaceLang === "english" && !tocObject.enDesc)) {
    return null;
  }

  return (
    <SidebarModule>
      <SidebarModuleTitle><InterfaceText text={{en: enTitle, he: heTitle}} /></SidebarModuleTitle>
      <InterfaceText markdown={{en: tocObject.enDesc, he: tocObject.heDesc}} />
    </SidebarModule>
  );
};


const AboutText = ({index, hideTitle}) => {
  const lang = Sefaria._getShortInterfaceLang();

  let composed = [index.compPlaceString?.[lang], index.compDateString?.[lang]].filter(x=>!!x).join(", ");
  composed = composed.replace(/[()]/g, "");

  if (index.categories.length == 2 && index.categories[0] == "Tanakh" && ["Torah", "Prophets", "Writings"].indexOf(index.categories[1]) !== -1) {
    // Don't show date/time for Tanakh.
    composed = null;
  }

  let authors   = index?.authors || [];
  authors = authors.filter(a => !!a[lang]).map(a => <a href={"/topics/" + a.slug} key={a.slug}><InterfaceText>{a[lang]}</InterfaceText></a>);
  authors = [].concat(...authors.map(x => [<span>, </span>, x])).slice(1); // Like a join for an array of React elements
  const heDesc = index.heDesc || index.heShortDesc;
  const enDesc = index.enDesc || index.enShortDesc;
  const description = lang === "he" ? heDesc : enDesc;

  if (!authors.length && !composed && !description) { return null; }

  return (
    <SidebarModule>
      {hideTitle ? null :
          <SidebarModuleTitle>about_box.about_this_text</SidebarModuleTitle>}
      { composed || authors.length ?
      <div className="aboutTextMetadata">

        {authors.length ?
        <div className="aboutTextAuthor">
          {authors.length == 1 ?
              <span><InterfaceText>nav_sidebar.author</InterfaceText>:</span>
          : <span><InterfaceText>common.authors</InterfaceText>:</span>}
          <span className="aboutTextAuthorText">
            &nbsp;{authors}
          </span>
        </div> : null}

        {composed ?
        <div className="aboutTextComposed">
          <InterfaceText>nav_sidebar.composed</InterfaceText>:
          <span className="aboutTextComposedText">
            &nbsp;<InterfaceText>{composed}</InterfaceText>
          </span>
        </div> : null}

      </div> : null}
      {description ?
      <InterfaceText markdown={{en: enDesc, he: heDesc}} disallowedMarkdownElements={[]}/> : null}
    </SidebarModule>
  );
};


const TranslationLinks = () => {
  return (
    <div className="navSidebarLink serif language">
      {<ul>{Object.keys(Sefaria.ISOMap).map(key => Sefaria.ISOMap[key]["showTranslations"] ? <li key={key}><a href={`/translations/${key}`}>
          {Sefaria.ISOMap[key]["nativeName"]}
          </a></li> : null)} </ul>}
      </div>
  );
};


const ParashahLink = () => {
  const parashah = Sefaria.calendars.filter(c => c.title.en === "Parashat Hashavua")[0];
  return (
    <div className="navSidebarLink ref serif">
      <img src="/static/icons/book.svg" className="navSidebarIcon" alt={Sefaria._("common.book_icon")} />
      <a href={"/" + parashah.url}><InterfaceText text={{en: parashah.ref, he: parashah.heRef}} /></a>
    </div>
  );
};


const ParashahName = () => {
  const parashah = Sefaria.calendars.filter(c => c.title.en === "Parashat Hashavua")[0];
  return <InterfaceText text={parashah.displayValue} />
};


const HaftarotLinks = () => {
  const haftarot = Sefaria.calendars.filter(c => c.title.en.startsWith("Haftarah"))
  return (
    <>
      {haftarot.map(h =>
      <div className="navSidebarLink ref serif" key={h.url}>
        <img src="/static/icons/book.svg" className="navSidebarIcon" alt={Sefaria._("common.book_icon")} />
        <a href={"/" + h.url}><InterfaceText text={h.displayValue} /></a>
      </div>)}
    </>
  );
};


const DafLink = () => {
  const daf = Sefaria.calendars.filter(c => c.title.en === "Daf Yomi")[0];
  return (
    <div className="navSidebarLink ref serif">
      <img src="/static/icons/book.svg" className="navSidebarIcon" alt={Sefaria._("common.book_icon")} />
      <a href={"/" + daf.url}>
        <InterfaceText text={daf.displayValue} />
      </a>
    </div>
  );
}

const Translations = () => {
  return (<SidebarModule>
    <SidebarModuleTitle>translations_box.translations</SidebarModuleTitle>
    <InterfaceText>
      <EnglishText>
        Access key works from the library in several languages.
      </EnglishText>
      <HebrewText>
        יצירות נבחרות מהספרייה בתרגומים לשפות שונות.
      </HebrewText>
    </InterfaceText>
    <TranslationLinks />
  </SidebarModule>)
}


const LearningSchedules = () => {
  return (
    <SidebarModule>
      <SidebarModuleTitle>header.learning_schedules</SidebarModuleTitle>
      <div className="readingsSection">
        <span className="readingsSectionTitle">
          <InterfaceText>common.weekly_torah_portion</InterfaceText>: <ParashahName />
        </span>
        <ParashahLink />
      </div>
      <div className="readingsSection">
        <span className="readingsSectionTitle">
          <InterfaceText >Haftarah</InterfaceText>
        </span>
        <HaftarotLinks />
      </div>
      <div className="readingsSection">
        <span className="readingsSectionTitle">
          <InterfaceText >Daf Yomi</InterfaceText>
        </span>
        <DafLink />
      </div>
      <a href="/calendars" className="allLink">
        <InterfaceText>
        <EnglishText>All Learning Schedules ›</EnglishText>
        <HebrewText>לוחות לימוד נוספים ›</HebrewText>
        </InterfaceText>
      </a>
    </SidebarModule>
  );
};


const WeeklyTorahPortion = () => {
  return (
    <SidebarModule>
      <SidebarModuleTitle>common.weekly_torah_portion</SidebarModuleTitle>
      <div className="readingsSection">
        <span className="readingsSectionTitle">
          <ParashahName />
        </span>
        <ParashahLink />
      </div>
      <div className="readingsSection">
        <span className="readingsSectionTitle">
          <InterfaceText >Haftarah</InterfaceText>
        </span>
        <HaftarotLinks />
      </div>
      <a href="/topics/category/torah-portions" className="allLink">
        <InterfaceText>
        <EnglishText>All Portions ›</EnglishText>
        <HebrewText>פרשות השבוע ›</HebrewText>
        </InterfaceText>
      </a>
    </SidebarModule>
  );
};


const DafYomi = () => {
  return (
    <SidebarModule>
      <SidebarModuleTitle>calendars_page.daily_learning</SidebarModuleTitle>
      <div className="readingsSection">
        <span className="readingsSectionTitle">
          <InterfaceText >Daf Yomi</InterfaceText>
        </span>
        <DafLink />
      </div>
    </SidebarModule>
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
    <SidebarModule>
      <SidebarModuleTitle>nav_sidebar.visualizations</SidebarModuleTitle>
      <InterfaceText>nav_sidebar.explore_interconnections_among_texts_with_our_interactive</InterfaceText>
      <div className="linkList">
        {links.map((link, i) =>
          <div className="navSidebarLink gray" key={i}>
            <img src="/static/icons/visualization.svg" className="navSidebarIcon" alt={Sefaria._("nav_sidebar.visualization_icon")} />
            <a href={link.url}><InterfaceText text={{en: link.en, he: link.he}} /></a>
          </div>
        )}
      </div>
      <a href="/visualizations" className="allLink">
        <InterfaceText>
        <EnglishText>All Visualizations ›</EnglishText>
        <HebrewText>תרשימים גרפיים נוספים ›</HebrewText>
        </InterfaceText>
      </a>
    </SidebarModule>
  );
};


const AboutTopics = ({hideTitle}) => (
  <SidebarModule>
    {hideTitle ? null :
    <SidebarModuleTitle>nav_sidebar.about_topics</SidebarModuleTitle> }
    <InterfaceText>
        <HebrewText>
דפי הנושא מציגים מקורות נבחרים מארון הספרים היהודי עבור אלפי נושאים. ניתן לדפדף לפי קטגוריה או לחפש לפי נושא ספציפי, ובסרגל הצד מוצגים הנושאים הפופולריים ביותר ואלה הקשורים אליהם.  הקליקו ושוטטו בין הנושאים השונים כדי ללמוד עוד.
        </HebrewText>
        <EnglishText>
        Topics Pages present a curated selection of various genres of sources on thousands of chosen subjects. You can browse by category, search for something specific, or view the most popular topics — and related topics — on the sidebar. Explore and click through to learn more.
        </EnglishText>
    </InterfaceText>
  </SidebarModule>
);

const TrendingTopics = () => {
    let [trendingTopics, setTrendingTopics] = useState(null);
    useEffect(() => {
        Sefaria.getTrendingTopics().then(result => setTrendingTopics(result));
    }, []);

    if (!trendingTopics) { return null; }
    return(
    <div data-anl-feature_name="Trending" data-anl-link_type="topic">
        <SidebarModule>
            <SidebarModuleTitle>nav_sidebar.trending_topics</SidebarModuleTitle>
            <div className="topic-landing-sidebar-list">
            {trendingTopics.map((topic, i) =>
                <div className="navSidebarLink ref serif" key={i}>
                    <a
                        href={"/topics/" + topic.slug}
                        data-anl-link_type="topic"
                        data-anl-event="navto_topic:click"
                        data-anl-text={topic.primaryTitle.en}
                    >
                        <InterfaceText text={{en: topic.primaryTitle.en, he: topic.primaryTitle.he}}/>
                    </a>
                </div>
            )}
            </div>
        </SidebarModule>
    </div>)
};
const TopicLandingTopicCatList = () => {
    const topicCats = Sefaria.topicTocPage();
    return(
        <span data-anl-feature_name="Browse Topics">
        <SidebarModule>
            <span id="browseTopics">
            <SidebarModuleTitle>
                nav_sidebar.browse_topics
            </SidebarModuleTitle>
            </span>
            <div className="topic-landing-sidebar-list">
                {topicCats.map((topic, i) =>
                    <div className="navSidebarLink ref serif" key={i}>
                        <a href={"/topics/category/" + topic.slug}
                            data-anl-link_type="category"
                            data-anl-text={topic.primaryTitle.en}
                            data-anl-event="navto_topic:click"
                        >
                            <InterfaceText text={{en: topic.primaryTitle.en, he: topic.primaryTitle.he}}/>
                        </a>
                    </div>
                )}
            </div>
        </SidebarModule>
        </span>
    )
};
const AZTopicsLink = () => {
    return (
        <span
            data-anl-feature_name="Browse A-Z"
        >
        <SidebarModule>
            <a href={'/topics/all/a'}
            data-anl-link_type="see all"
            data-anl-text="All Topics A-Z ›"
            data-anl-event="navto_topic:click"
            >
            <SidebarModuleTitle>nav_sidebar.all_topics_a_z</SidebarModuleTitle>
            </a>
        </SidebarModule>
        </span>
    )
};


const RelatedTopics = ({title}) => {
  const [topics, setTopics] = useState(Sefaria.getIndexDetailsFromCache(title)?.relatedTopics || []);
  const [showMore, setShowMore] = useState(false);
  const showMoreLink = !showMore && topics.length > 5;
  const shownTopics = showMore ? topics : topics.slice(0,5);
  useEffect(() => {
        Sefaria.getIndexDetails(title).then(data => setTopics(data.relatedTopics));
  },[title]);
  return (topics.length ? <SidebarModule>
    <SidebarModuleTitle>nav_sidebar.related_topics</SidebarModuleTitle>
    {shownTopics.map((topic, i) =>
      <div className="navSidebarLink ref serif" key={i}>
        <a href={"/topics/" + topic.slug}><InterfaceText text={{en: topic.title.en, he: topic.title.he}}/></a>
      </div>
    )}
    {showMoreLink ?
    <a className="moreLink" onClick={()=>{setShowMore(true);}}>
      <InterfaceText>nav_sidebar.more</InterfaceText>
    </a> : null}
  </SidebarModule> : null);
};

const JoinTheCommunity = ({wide}) => {
  return (
    <SidebarModule wide={wide}>
      <div>
        <SidebarModuleTitle>nav_sidebar.join_the_conversation</SidebarModuleTitle>
        <InterfaceText>nav_sidebar.people_around_the_world_use_sefaria_to_create</InterfaceText>
      </div>
      <div>
        <a className="button small" href={`${Sefaria.getModuleURL(Sefaria.VOICES_MODULE).origin}/`}>
          <img src="/static/icons/community-black.svg" alt={Sefaria._("community")} />
          <InterfaceText>nav_sidebar.explore_the_community</InterfaceText>
        </a>
      </div>
    </SidebarModule>
  );
};

const JoinTheConversation = ({wide}) => {
  return (
    <SidebarModule wide={wide}>
      <div className="joinTheConversation">
        <SidebarModuleTitle>nav_sidebar.join_the_conversation</SidebarModuleTitle>
        <InterfaceText>nav_sidebar.mix_and_match_sources_from_the_sefaria_library</InterfaceText>
      </div>
      <CreateSheetsButton/>
    </SidebarModule>
  );
};


const GetTheApp = () => (
  <SidebarModule>
    <SidebarModuleTitle>nav_sidebar.get_the_mobile_app</SidebarModuleTitle>
    <InterfaceText>nav_sidebar.access_the_jewish_library_anywhere_and_anytime_with</InterfaceText> <a href="/mobile" className="inTextLink"><InterfaceText>nav_sidebar.sefaria_mobile_app</InterfaceText></a>
    <br />
    <AppStoreButton
        href="https://itunes.apple.com/us/app/sefaria/id1163273965?ls=1&mt=8"
        platform='ios'
        altText={Sefaria._("nav_sidebar.sefaria_app_on_ios")}
    />
    <AppStoreButton
        href="https://play.google.com/store/apps/details?id=org.sefaria.sefaria"
        platform='android'
        altText={Sefaria._("nav_sidebar.sefaria_app_on_android")}
    />
  </SidebarModule>
);


const StayConnected = () => { 
  const fbURL = Sefaria.interfaceLang == "hebrew" ? "https://www.facebook.com/sefaria.org.il" : "https://www.facebook.com/sefaria.org";

  return (
    <SidebarModule>
      <SidebarModuleTitle>nav_sidebar.stay_connected</SidebarModuleTitle>
      <InterfaceText>nav_sidebar.get_updates_on_new_texts_learning_resources_features</InterfaceText>
      <br />
      <NewsletterSignUpForm context="sidebar" />
      <div className="social-links">
        <Button
          icon={"facebook"}
          variant="secondary"
          className="appButton white button iconOnly"
          ariaLabel={Sefaria._("nav_sidebar.sefaria_on_facebook")}
          href={fbURL}
        />
        <Button
          icon={"instagram"}
          variant="secondary"
          className="appButton white button iconOnly"
          ariaLabel={Sefaria._("nav_sidebar.sefaria_on_instagram")}
          href="https://www.instagram.com/sefariaproject"
        />
        <Button
          icon={"youtube"}
          variant="secondary"
          className="appButton white button iconOnly"
          ariaLabel={Sefaria._("nav_sidebar.sefaria_on_youtube")}
          href="https://www.youtube.com/user/SefariaProject"
        />
      </div>
    </SidebarModule>
  );
};

const GetStartedButton = () => {
    const href = Sefaria._v(Sefaria._siteSettings.WHAT_ARE_VOICES_PATHS);
    return <Button variant="secondary sefaria-common-button" className="getStartedSheets" href={href} targetModule={Sefaria.VOICES_MODULE}>
          <InterfaceText text={{'en': 'Learn More', 'he': 'למידע נוסף'}} />
      </Button>;
}
const VoicesNewsletterSignUpButton = () => {
  const href = Sefaria._v({"en": "https://www.sefaria.org/newsletter", "he": "https://www.sefaria.org.il/newsletter"});
  return <Button href={href} data-target-module={Sefaria.SHEETS_MODULE} target="_blank">
        <InterfaceText text={{'en': 'Subscribe', 'he': 'להרשמה'}} />
  </Button>;
}
const CreateSheetsButton = () => {
  return (
    <Button icon={"new-sheet-black"} href="/sheets/new" targetModule={Sefaria.VOICES_MODULE}>
      <InterfaceText text={{'en': 'Create', 'he': 'דף חדש'}} />
    </Button>
  ) 
}
const CreateASheet = () => {
    const textId = Sefaria.multiPanel ?
        'nav_sidebar.mix_and_match_sources_to_share_digitally' :
        'nav_sidebar.use_a_computer_to_mix_and_match_sources';
    const enText = Sefaria.translation('english', textId);
    const heText = Sefaria.hebrewTranslation(textId)
    return (
        <TitledText title={{'en': 'Create', 'he': 'יצירת דף מקורי'}}
                    text={{'en': enText,
                        'he': heText}}>
            {Sefaria.multiPanel && <CreateSheetsButton/>}
        </TitledText>
    );
}

const WhatIsSefariaVoices = () => (
    <TitledText title={{'en': 'What is Voices on Sefaria?', 'he': 'נא להכיר: חיבורים בספריא'}}
                text={{'en': 'Voices on Sefaria is a dedicated space for you to create and discover Torah-based content — from source sheets and lesson plans to divrei Torah and essays.',
                       'he': 'פלטפורמה חדשה זו נוצרה עבורכם, הלומדים והלומדות, כדי שתוכלו ליצור ולאסוף חומרים מקוריים השואבים ממקורות הספרות היהודית. דף לימוד? חיבור ספרותי? בלוג? דבר תורה? פה זה המקום לתת ליצירתיות ולסקרנות להוביל את הדרך.'}}>
        <GetStartedButton/>
    </TitledText>
);

const VoicesNewsletterSignUp = () => (
  <TitledText title={{'en': 'Get Updates', 'he': 'הישארו מעודכנים!'}}
  text={{'en': 'Want to stay in the loop on Sefaria’s newest offerings? Join our mailing list.',
   'he': 'אצלנו, יש כל הזמן משהו חדש באופק. הירשמו לניוזלטר של ספריא כדי להיות תמיד בעניינים.'}}>
    <VoicesNewsletterSignUpButton/>
  </TitledText>
);
const AboutLearningSchedules = () => (
  <SidebarModule>
    <SidebarModuleTitle>header.learning_schedules</SidebarModuleTitle>
    <InterfaceText>
        <EnglishText>
            Since biblical times, the Torah has been divided into sections which are read each week on a set yearly calendar.
            Following this practice, many other calendars have been created to help communities of learners work through specific texts together.
        </EnglishText>
        <HebrewText>
            מימי קדם חולקה התורה לקטעי קריאה שבועיים שנועדו לסיום הספר כולו במשך תקופת זמן של שנה.
            בעקבות המנהג הזה התפתחו לאורך השנים סדרי לימוד תקופתיים רבים נוספים, ובעזרתם יכולות קהילות וקבוצות של לומדים ללמוד יחד טקסטים שלמים.
        </HebrewText>
    </InterfaceText>
  </SidebarModule>
);


const AboutCollections = ({hideTitle}) => (
  <SidebarModule>
    {hideTitle ? null :
    <SidebarModuleTitle>nav_sidebar.about_collections</SidebarModuleTitle>}
    <InterfaceText>
        <EnglishText>Collections are user generated bundles of sheets which can be used privately, shared with friends, or made public on Sefaria.</EnglishText>
        <HebrewText>אסופות הן מקבצים של דפי מקורות שנוצרו על ידי משתמשי האתר. הן ניתנות לשימוש פרטי, לצורך שיתוף עם אחרים או לשימוש ציבורי באתר ספריא.</HebrewText>
    </InterfaceText>
      {!hideTitle &&
      <Button icon={"collection-black"}>
        <a href="/collections/new" data-target-module={Sefaria.VOICES_MODULE}>
          <InterfaceText>nav_sidebar.create_a_collection</InterfaceText>
        </a>
      </Button>
}
  </SidebarModule>
);


const ExploreCollections = () => (
  <SidebarModule>
    <SidebarModuleTitle>common.collections</SidebarModuleTitle>
    <InterfaceText>nav_sidebar.organizations_communities_and_individuals_around_the_world_curate</InterfaceText>
    <div>
      <a className="button small white" href="/collections" data-target-module={Sefaria.VOICES_MODULE}>
        <img src="/static/icons/collection.svg" alt={Sefaria._("nav_sidebar.collection_icon")} />
        <InterfaceText>nav_sidebar.explore_collections</InterfaceText>
      </a>
    </div>
  </SidebarModule>
);


const WhoToFollow = ({toggleSignUpModal}) => (
  <SidebarModule>
    <SidebarModuleTitle>nav_sidebar.who_to_follow</SidebarModuleTitle>
    {Sefaria.followRecommendations.map(user =>
    <ProfileListing {...user} key={user.uid} toggleSignUpModal={toggleSignUpModal} />)}
  </SidebarModule>
);


const Image = ({url}) => (
  <SidebarModule>
    <img className="imageModuleImage" src={url} alt={Sefaria._("nav_sidebar.module_image")} />
  </SidebarModule>
);


const Wrapper = ({title, content}) => (
  <SidebarModule>
    {title ? <SidebarModuleTitle>{title}</SidebarModuleTitle> : null}
    {content}
  </SidebarModule>
);


const IconLink = ({text, url, icon, openInNewTab}) => (
  <div className="navSidebarLink gray">
    <img src={"/static/icons/" + icon} className="navSidebarIcon" alt={`${Sefaria._(text)} ${Sefaria._("nav_sidebar.icon")}`} />
    <a href={url} target={openInNewTab ? "_blank" : "_self"}><InterfaceText>{text}</InterfaceText></a>
  </div>
);


const DownloadVersions = ({sref}) => {
    //sref is generally an index title, but just in case we ever need a different resolution
    const [versions, setVersions] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const [downloadSelected, setDownloadSelected] = useState({dlVersionTitle: null, dlVersionFormat: null, dlVersionLanguage: null});

    const isVersionPublicDomain = v => {
        return !(v.license && v.license.startsWith("Copyright"));
    }
    const handleInputChange = (event) => {
        const target = event.target;
        const value = target.value;
        const name = target.name;
        let newState = {};
        if(name == "dlVersionName"){
           let [versionTitle, versionLang] = value.split("/");
           newState = {
              dlVersionTitle: versionTitle,
              dlVersionLanguage: versionLang
           };
        }else{
            newState = {[name]: value}
        }
        const dlstate = {...downloadSelected, ...newState};
        setDownloadSelected(dlstate);
        if (downloadParamsReady(dlstate)){
            setIsReady(true);
        }
    }
    const downloadParamsReady = (downloadParams) => {
        return !Object.values(downloadParams).some(x => x === null);
    }
    const versionDlLink = () => {
        return isReady ? `/download/version/${sref} - ${downloadSelected.dlVersionLanguage} - ${downloadSelected.dlVersionTitle}.${downloadSelected.dlVersionFormat}` : "#";
    }
    const handleClick = (event) => {
        if(!isReady) {
            event.preventDefault();
            return false;
        }
        recordDownload();
        return true;
    }
    const recordDownload = () => {
        Sefaria.track.event("Reader", "Version Download", `${sref} / ${downloadSelected.dlVersionTitle} / ${downloadSelected.dlVersionLanguage} / ${downloadSelected.dlVersionFormat}`);
    }
    useEffect(() => {
        Sefaria.getVersions(sref).then(data => {
            data = Object.values(data).flat();
            data = data.filter(isVersionPublicDomain);
            data.sort((a, b) => a.versionTitle.localeCompare(b.versionTitle));
            setVersions(data);
        });
    }, [sref]);

    return (
      <SidebarModule>
        <SidebarModuleTitle>nav_sidebar.download_text</SidebarModuleTitle>
        <div className="downloadTextModule sans-serif">
        <Dropdown
            name="dlVersionName"
            options={
              versions.map(v => ({
                  value: `${v.versionTitle}/${v.language}`,
                  label: `${Sefaria._v({he: v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle, en: v.versionTitle})} (${Sefaria.translateISOLanguageName(v.actualLanguage)})`
              })).concat( // add merged versions for both primary langs "en" and "he" where applicable. (not yet possible for individual actual languages)
                  versions.map(v => v.language).unique().map(lang => ({
                      value: `merged/${lang}`,
                      label: `${Sefaria._("download_versions.merged_version")} (${Sefaria.translateISOLanguageName(lang)})`,
                  }))
              )
            }
            placeholder={Sefaria._("download_versions.select_version")}
            onChange={handleInputChange}
        />
        <Dropdown
            name="dlVersionFormat"
            options={[
              {value: "txt",       label: Sefaria._("download_versions.text_with_tags")},
              {value: "plain.txt", label: Sefaria._("download_versions.text_without_tags")},
              {value: "csv",       label: "CSV"},
              {value: "json",      label: "JSON"},
            ]}
            placeholder={Sefaria._("download_versions.select_format")}
            onChange={handleInputChange}
        />
        <a
          className={`button fillWidth${isReady ? "" : " disabled"}`}
          onClick={handleClick}
          href={versionDlLink()}
          download
          role="button"
        >
          {Sefaria._("nav_sidebar.download")}
        </a>
      </div>
      </SidebarModule>
    );
};


const PortalAbout = ({title, description, image_uri, image_caption}) => {
    return(
        <SidebarModule>
            <SidebarModuleTitle en={title.en} he={title.he} />
            <div className="portalTopicImageWrapper">
                <ImageWithCaption photoLink={image_uri} caption={image_caption} />
            </div>
            <InterfaceText markdown={{en: description.en, he: description.he}} />
        </SidebarModule>
    )
};


const PortalMobile = ({title, description, android_link, ios_link}) => {
    return(
        <SidebarModule>
            <div className="portalMobile">
                <SidebarModuleTitle en={title.en} he={title.he} />
                {description && <InterfaceText markdown={{en: description.en, he: description.he}} />}
                <AppStoreButton href={ios_link} platform={'ios'} altText='Steinsaltz app on iOS' />
                <AppStoreButton href={android_link} platform={'android'} altText='Steinsaltz app on Android' />
            </div>
        </SidebarModule>
    )
};
const PortalOrganization = ({title, description}) => {
    return(
        <SidebarModule>
                <SidebarModuleTitle en={title.en} he={title.he} />
                {description && <InterfaceText markdown={{en: description.en, he: description.he}} />}
        </SidebarModule>
    )
};


const PortalNewsletter = ({title, description}) => {
    let titleElement = <SidebarModuleTitle en={title.en} he={title.he} />;

    return(
        <SidebarModule>
            {titleElement}
            <InterfaceText markdown={{en: description.en, he: description.he}} />
            <NewsletterSignUpForm
                includeEducatorOption={false}
                emailPlaceholder={{en: "Email Address", he: "כתובת מייל"}}
                subscribe={Sefaria.subscribeSefariaAndSteinsaltzNewsletter}
            />
        </SidebarModule>
    )
};


export {
  NavSidebar,
  SidebarFooter,
  SidebarModules,
  RecentlyViewed,
  ParashahLink,
};
