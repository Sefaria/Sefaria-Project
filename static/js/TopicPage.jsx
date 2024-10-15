import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import { useIncrementalLoad } from './Hooks';
import { Promotions } from './Promotions';
import { NavSidebar } from './NavSidebar';
import Footer from './Footer';
import {TopicEditor} from './TopicEditor';
import {AdminEditorButton, useEditToggle} from './AdminEditor';
import {
  SheetBlock,
  TopicTextPassage,
} from './Story';
import {
    TabView,
    LoadingMessage,
    Link,
    ResponsiveNBox,
    InterfaceText,
    FilterableList,
    ToolTipped,
    AiInfoTooltip,
    SimpleLinkedBlock,
    CategoryHeader,
    ImageWithCaption,
    EnglishText,
    HebrewText,
    LangSelectInterface,
} from './Misc';
import {ContentText} from "./ContentText";


/*
*** Helper functions
*/


const norm_hebrew_ref = tref => tref.replace(/[׳״]/g, '');


const fetchBulkText = (translationLanguagePreference, inRefs) =>
  Sefaria.getBulkText(
    inRefs.map(x => x.ref),
    true, 500, 600,
    translationLanguagePreference
  ).then(outRefs => {
    for (let tempRef of inRefs) {
      // annotate outRefs with `order` and `dataSources` from `topicRefs`
      if (outRefs[tempRef.ref]) {
        outRefs[tempRef.ref].order = tempRef.order;
        outRefs[tempRef.ref].dataSources = tempRef.dataSources;
        if(tempRef.descriptions) {
            outRefs[tempRef.ref].descriptions = tempRef.descriptions;
        }
      }
    }
    return Object.entries(outRefs);
  }
);


const fetchBulkSheet = inSheets =>
    Sefaria.getBulkSheets(inSheets.map(x => x.ref)).then(outSheets => {
    for (let tempSheet of inSheets) {
      if (outSheets[tempSheet.ref]) {
        outSheets[tempSheet.ref].order = tempSheet.order;
      }
    }
    return Object.values(outSheets);
  }
);


const refFilter = (currFilter, ref) => {
  const n = text => !!text ? text.toLowerCase() : '';
  currFilter = n(currFilter);
  ref[1].categories = Sefaria.refCategories(ref[1].ref).join(" ");
  for (let field of ['en', 'he', 'ref', 'categories']) {
    if (n(ref[1][field]).indexOf(currFilter) > -1) { return true; }
  }
};


const sheetFilter = (currFilter, sheet) => {
  const n = text => !!text ? text.toLowerCase() : '';
  currFilter = n(currFilter);
  for (let field of ['sheet_title', 'publisher_name', 'publisher_position', 'publisher_organization']) {
    if (n(sheet[field]).indexOf(currFilter) > -1) { return true; }
  }
};


const refSort = (currSortOption, a, b) => {
  a = a[1]; b = b[1];
  if (!a.order && !b.order) { return 0; }
  if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
  if (currSortOption === 'Chronological') {
    if (a.order.comp_date === b.order.comp_date) {
      if (a.order.order_id < b.order.order_id) { return -1; }
      if (b.order.order_id < a.order.order_id) { return 1; }
      return 0;
    }
    return a.order.comp_date - b.order.comp_date;
  }
  else {
    if ((Sefaria.interfaceLang === 'english') &&
      (a.order.curatedPrimacy.en > 0 || b.order.curatedPrimacy.en > 0)) {
      return b.order.curatedPrimacy.en - a.order.curatedPrimacy.en; }
    else if ((Sefaria.interfaceLang === 'hebrew') &&
      (a.order.curatedPrimacy.he > 0 || b.order.curatedPrimacy.he > 0)) {
      return b.order.curatedPrimacy.he - a.order.curatedPrimacy.he;
    }
    const aAvailLangs = a.order.availableLangs;
    const bAvailLangs = b.order.availableLangs;
    if (Sefaria.interfaceLang === 'english' && aAvailLangs.length !== bAvailLangs.length) {
      if (aAvailLangs.indexOf('en') > -1) { return -1; }
      if (bAvailLangs.indexOf('en') > -1) { return 1; }
      return 0;
    }
    else if (a.order.pr !== b.order.pr) {
        return b.order.pr - a.order.pr;
    }
    else { return (b.order.numDatasource * b.order.tfidf) - (a.order.numDatasource * a.order.tfidf); }
  }
};


const sheetSort = (currSortOption, a, b) => {
  if (!a.order && !b.order) { return 0; }
  if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
  const aTLangHe = 0 + (a.order.titleLanguage === 'hebrew');
  const bTLangHe = 0 + (b.order.titleLanguage === 'hebrew');
  const aLangHe  = 0 + (a.order.language      === 'hebrew');
  const bLangHe  = 0 + (b.order.language      === 'hebrew');
  if (Sefaria.interfaceLang === 'hebrew' && (aTLangHe ^ bTLangHe || aLangHe ^ bLangHe)) {
    if (aTLangHe ^ bTLangHe && aLangHe ^ bLangHe) { return bTLangHe - aTLangHe; }  // title lang takes precedence over content lang
    return (bTLangHe + bLangHe) - (aTLangHe + aLangHe);
  } else if (Sefaria.interfaceLang === 'english' && (aTLangHe ^ bTLangHe || aLangHe ^ bLangHe)) {
    if (aTLangHe ^ bTLangHe && aLangHe ^ bLangHe) { return aTLangHe - bTLangHe; }  // title lang takes precedence over content lang
    return (aTLangHe + aLangHe) - (bTLangHe + bLangHe);
  }
  if (currSortOption === 'Views') {
    return b.order.views - a.order.views;
  } else if (currSortOption === 'Newest') {
    if (b.order.dateCreated < a.order.dateCreated) { return -1; }
    if (a.order.dateCreated < b.order.dateCreated) { return 1; }
  } else {
    // relevance
    if (b.order.relevance === a.order.relevance) { return b.order.views - a.order.views; }
    return (Math.log(b.order.views) * b.order.relevance) - (Math.log(a.order.views) * a.order.relevance);
  }
};

const hasPrompts = (description) => {
    /**
     * returns true if description has a title
     * If description is explicitly marked as not published, only return true if user is a moderator
     */
    return description?.title?.length && (Sefaria.is_moderator || description?.published !== false);
}
const adminRefRenderWrapper = (toggleSignUpModal, topicData, topicTestVersion, langPref) => refRenderWrapper(toggleSignUpModal, topicData, topicTestVersion, langPref, true, true, false);
const notableSourcesRefRenderWrapper = (toggleSignUpModal, topicData, topicTestVersion, langPref) => refRenderWrapper(toggleSignUpModal, topicData, topicTestVersion, langPref, false, true, true);
const allSourcesRefRenderWrapper = (toggleSignUpModal, topicData, topicTestVersion, langPref) => refRenderWrapper(toggleSignUpModal, topicData, topicTestVersion, langPref, false, false, true);

const _extractAnalyticsDataFromRef = ref => {
    const title = Sefaria.parseRef(ref).index;
    return {
        item_id: ref,
        content_id: title,
        content_type: Sefaria.index(title).categories.join('|'),
    };
};
const refRenderWrapper = (toggleSignUpModal, topicData, topicTestVersion, langPref, isAdmin, displayDescription, hideLanguageMissingSources) => (item, index) => {
  const text = item[1];
  const topicTitle = topicData && topicData.primaryTitle;
  const langKey = Sefaria.interfaceLang === 'english' ? 'en' : 'he';
  let dataSourceText = '';

  if (!!text.dataSources && Object.values(text.dataSources).length > 0) {
    dataSourceText = `${Sefaria._('This source is connected to ')}"${topicTitle && topicTitle[langKey]}" ${Sefaria._('by')} ${Object.values(text.dataSources).map(d => d[langKey]).join(' & ')}.`;
  }

  const afterSave = (
    <ToolTipped altText={dataSourceText} classes={"saveButton tooltip-toggle three-dots-button"}>
      <img src="/static/img/three-dots.svg" alt={dataSourceText}/>
    </ToolTipped>
  );

  return (
      <div key={item[0]} data-anl-batch={JSON.stringify({
          position: index,
          ai: doesLinkHaveAiContent(langKey, text) ? 'ai' : 'human',
          ..._extractAnalyticsDataFromRef(text.ref),
      })}>
          <TopicTextPassage
              topic={topicData.slug}
              text={text}
              bodyTextIsLink= {true}
              langPref={langPref}
              isAdmin={isAdmin}
              displayDescription={displayDescription}
              hideLanguageMissingSources={hideLanguageMissingSources}
          />
      </div>
  );
};


const sheetRenderWrapper = (toggleSignUpModal) => item => (
  <SheetBlock key={item.sheet_id} sheet={item} toggleSignUpModal={toggleSignUpModal}/>
);


/*
*** Components
*/



const TopicCategory = ({topic, topicTitle, setTopic, setNavTopic, compare, initialWidth,
  openDisplaySettings, openSearch}) => {
    const [topicData, setTopicData] = useState(Sefaria.getTopicFromCache(topic) || {primaryTitle: topicTitle});
    const [subtopics, setSubtopics] = useState(Sefaria.topicTocPage(topic));

    useEffect(() => {
        Sefaria.getTopic(topic).then(setTopicData);
    }, [topic]);

    useEffect(() => {
        setSubtopics(Sefaria.topicTocPage(topic));
    }, [topic]);


    let topicBlocks = subtopics
      .filter(t => t.shouldDisplay !== false)
      .sort(Sefaria.sortTopicsCompareFn)
      .map((t,i) => {
        const { slug, children, description} = t;
        const openTopic = e => {
          e.preventDefault();
          t.children ? setNavTopic(slug, {en, he}) : setTopic(slug, {en, he});
        };
        let {en, he} = t;
        en = en.replace(/^Parashat /, "");
        he = he.replace(/^פרשת /, "");
        return (
            <div className="navBlock">
              <a href={`/topics/${children ? 'category/' : ''}${slug}`}
                 className="navBlockTitle"
                 onClick={openTopic}
                 key={i}>
                <InterfaceText text={{en, he}} />
              </a>
              {description ?
              <div className="navBlockDescription clamped">
                <InterfaceText markdown={{en: description.en, he: description.he}} disallowedMarkdownElements={['a']}/>
              </div>
              : null }
            </div>
        );
      });

    const sidebarModules = [
      {type: "AboutTopics"},
      {type: "Promo"},
      {type: "TrendingTopics"},
      {type: "SponsorADay"},
    ];

    return (
        <div className="readerNavMenu noLangToggleInHebrew">
            <div className="content readerTocTopics">
                <div className="sidebarLayout">
                  <div className="contentInner">
                      <div className="navTitle tight">
                        <CategoryHeader type="topics" data={topicData}>
                            <h1><InterfaceText text={{en: topicTitle.en, he: topicTitle.he}} /></h1>
                        </CategoryHeader>
                      </div>
                      <div className="readerNavCategories">
                        <ResponsiveNBox content={topicBlocks} initialWidth={initialWidth} />
                      </div>
                  </div>
                  <NavSidebar modules={sidebarModules} />
                </div>
                <Footer />
            </div>
        </div>
    );
};

const TopicSponsorship = ({topic_slug}) => {
    // TODO: Store this data somewhere intelligent
    const topic_sponsorship_map = {
        "parashat-bereshit": {
            "en": "Parashat Bereshit, or Genesis, is dedicated to the [Sefaria Pioneers](/pioneers), Sefaria's earliest champions whose immense generosity was essential to the genesis of Sefaria and the digital future of Torah.",
            "he": "פרשת בראשית מוקדשת [לחלוצי ספריא](/pioneers), מי שעודדו ותמכו בנו בראשית דרכנו ושבזכות נדיבותם הרבה עלה באפשרותנו ליצור את העתיד הדיגיטלי של התורה ושאר המקורות."
        },
        "parashat-lech-lecha": {
            "en": "Sponsored by The Rita J. & Stanley H. Kaplan Family Foundation in honor of Scott and Erica Belsky’s wedding anniversary.",
            "he": "נתרם על-ידי קרן משפחת ריטה ג’. וסטנלי ה. קפלן, לכבוד יום הנישואים של סקוט ואריקה בלסקי."
        },
        "parashat-toldot" : {
            "en": "Dedicated by Nancy (née Ackerman) and Alex Warshofsky in gratitude for Jewish learning as their daughter, Avigayil, is called to the Torah as a bat mitzvah, and in loving memory of Freydl Gitl who paved the way in her Jewish life.",
            "he": "מוקדש על-ידי ננסי (שם נעורים: אקרמן) ואלכס ורשופסקי בתודה על לימודי היהדות, לציון עלייתה של בתם אביגיל לתורה לרגל בת המצווה שלה ולזכרה האהוב של פריידי גיטל שסללה את הדרך בחייה היהודיים."
        },
        "parashat-vayigash": {
            "en": "Dedicated by Linda and Leib Koyfman in memory of Dr. Douglas Rosenman, z\"l, beloved father of Hilary Koyfman, and father-in-law of Mo Koyfman.",
            "he": "נתרם על-ידי לינדה ולייב קויפמן לזכר ד\"ר דאגלס רוזנמן ז\"ל, אביה האהוב של הילארי קויפמן וחותנו של מו קויפמן"
        },
        "parashat-achrei-mot": {
            "en": "Dedicated by Kevin Waldman in loving memory of his grandparents, Rose and Morris Waldman, who helped nurture his commitment to Jewish life.",
            "he": "מוקדש על-ידי קווין ולדמן לזכרם האהוב של סביו, רוז ומוריס ולדמן, שעזרו לטפח את מחויבותו לחיים יהודיים."
        },
        "parashat-vaetchanan": {
            "en": "Shabbat Nachamu learning is dedicated in memory of Jerome L. Stern, Yehuda Leib ben David Shmuel, z\"l.",
            "he": "הלימוד לשבת נחמו מוקדש לזכרו של ג'רום ל. שטרן, יהודה לייב בן דוד שמואל ז\"ל."
        },
        "parashat-vzot-haberachah": {
            "en": "Parashat VeZot HaBerakhah is dedicated to the victims of the October 7th, 2023, terrorist attack in Israel.",
            "he": "פרשת ״וזאת הברכה״ מוקדשת לקורבנות מתקפת הטרור והטבח הנורא שאירע ב-7 באוקטובר 2023."
        }

    };
    const sponsorship_language = topic_sponsorship_map[topic_slug];
    if (!sponsorship_language) return null;

    return (
        <div className="dedication">
            <InterfaceText markdown={sponsorship_language}/>
        </div>
    );
}

const isLinkPublished = (lang, link) => link.descriptions?.[lang]?.published !== false;

const doesLinkHaveAiContent = (lang, link) => link.descriptions?.[lang]?.ai_title?.length > 0 && isLinkPublished(lang, link);

const getLinksWithAiContent = (refTopicLinks = []) => {
    const lang = Sefaria.interfaceLang === "english" ? 'en' : 'he';
    return refTopicLinks.filter(link => doesLinkHaveAiContent(lang, link));
};

const getLinksToGenerate = (refTopicLinks = []) => {
    const lang = Sefaria.interfaceLang === "english" ? 'en' : 'he';
    return refTopicLinks.filter(link => {
        return link.descriptions?.[lang]?.ai_context?.length > 0  &&
            !link.descriptions?.[lang]?.prompt;
    });
};
const getLinksToPublish = (refTopicLinks = []) => {
    const lang = Sefaria.interfaceLang === "english" ? 'en' : 'he';
    return refTopicLinks.filter(link => {
        return !isLinkPublished(lang, link);
    });
};

const generatePrompts = async(topicSlug, linksToGenerate) => {
    linksToGenerate.forEach(ref => {
        ref['toTopic'] = topicSlug;
    });
    const payload = {ref_topic_links: linksToGenerate};
    try {
        await Sefaria.apiRequestWithBody(`/api/topics/generate-prompts/${topicSlug}`, {}, payload);
        const refValues = linksToGenerate.map(item => item.ref).join(", ");
        alert("The following prompts are generating: " + refValues);
    } catch (error) {
        console.error("Error occurred:", error);
    }
};

const publishPrompts = async (topicSlug, linksToPublish) => {
    const lang = Sefaria.interfaceLang === "english" ? 'en' : 'he';
    linksToPublish.forEach(ref => {
        ref['toTopic'] = topicSlug;
        ref.descriptions[lang]["published"] = true;
    });
    try {
        const response = await Sefaria.apiRequestWithBody(`/api/ref-topic-links/bulk`, {}, linksToPublish);
        const refValues = response.map(item => item.anchorRef).join(", ");
        const shouldRefresh = confirm("The following prompts have been published: " + refValues + ". Refresh page to see results?");
        if (shouldRefresh) {
            window.location.reload();
        }
    } catch (error) {
        console.error("Error occurred:", error);
    }
};

const getTopicHeaderAdminActionButtons = (topicSlug, refTopicLinks) => {
    const linksToGenerate = getLinksToGenerate(refTopicLinks);
    const linksToPublish = getLinksToPublish(refTopicLinks);
    const actionButtons = {};
    if (linksToGenerate.length > 0) {
        actionButtons['generate'] = ["Generate", () => generatePrompts(topicSlug, linksToGenerate)];
    }
    if (linksToPublish.length > 0) {
        actionButtons['publish'] = ["Publish", () => publishPrompts(topicSlug, linksToPublish)];
    }

    return actionButtons;
};

const TopicHeader = ({ topic, topicData, topicTitle, multiPanel, isCat, setNavTopic, openDisplaySettings, openSearch, topicImage }) => {
  const { en, he } = !!topicData && topicData.primaryTitle ? topicData.primaryTitle : {en: "Loading...", he: "טוען..."};
  const category = !!topicData ? Sefaria.displayTopicTocCategory(topicData.slug) : null;
  const tpTopImg = !multiPanel && topicImage ? <TopicImage photoLink={topicImage.image_uri} caption={topicImage.image_caption}/> : null;
  const actionButtons = getTopicHeaderAdminActionButtons(topic, topicData.refs?.about?.refs);
  const hasAiContentLinks = getLinksWithAiContent(topicData.refs?.about?.refs).length != 0;


return (
    <div>
        <div className="navTitle tight">
                <CategoryHeader type="topics" data={topicData} toggleButtonIDs={["source", "edit", "reorder"]} actionButtons={actionButtons}>
                <h1>
                    <InterfaceText text={{en:en, he:he}}/>
                </h1>
                </CategoryHeader>
            {hasAiContentLinks &&
                <AiInfoTooltip/>
            }
        </div>
       {!topicData && !isCat ?<LoadingMessage/> : null}
       {!isCat && category ?
           <div className="topicCategory sectionTitleText">
             <a href={`/topics/category/${category.slug}`} onClick={e=>{ e.preventDefault(); setNavTopic(category.slug, category); }}>
               <InterfaceText text={{en: category.en, he: category.he}}/>
             </a>
           </div>
       : null}
       {topicData && topicData.ref ?
           <TopicSponsorship topic_slug={topicData.slug} />
       : null }
       {topicData && topicData.description ?
           <div className="topicDescription systemText">
              <InterfaceText markdown={{en: topicData.description.en, he: topicData.description.he}}/>
            </div>
       : null}
       {tpTopImg}
       {topicData && topicData.ref ?
         <a href={`/${topicData.ref.url}`} className="resourcesLink button blue">
           <img src="/static/icons/book-icon-black.svg" alt="Book Icon" />
           <span className="int-en">{ topicData.parasha ? Sefaria._('Read the Portion') : topicData.ref.en }</span>
           <span className="int-he">{ topicData.parasha ? Sefaria._('Read the Portion') : norm_hebrew_ref(topicData.ref.he) }</span>
         </a>
       : null}
    </div>
);}

const AuthorIndexItem = ({url, title, description}) => {
  return (
      <div className="authorIndex" >
      <a href={url} className="navBlockTitle">
        <ContentText text={title} defaultToInterfaceOnBilingual />
      </a>
      <div className="navBlockDescription">
        <ContentText text={description} defaultToInterfaceOnBilingual />
      </div>
    </div>
  );
};


const useTabDisplayData = (translationLanguagePreference) => {
  const getTabDisplayData = useCallback(() => [
    {
      key: 'popular-writing-of',
      fetcher: fetchBulkText.bind(null, translationLanguagePreference),
      sortOptions: ['Relevance', 'Chronological'],
      filterFunc: refFilter,
      sortFunc: refSort,
      renderWrapper: refRenderWrapper,
    },
    {
      key: 'admin',
      fetcher: fetchBulkText.bind(null, translationLanguagePreference),
      sortOptions: ['Relevance', 'Chronological'],
      filterFunc: refFilter,
      sortFunc: refSort,
      renderWrapper: adminRefRenderWrapper,
    },
    {
      key: 'notable-sources',
      fetcher: fetchBulkText.bind(null, translationLanguagePreference),
      sortOptions: ['Relevance', 'Chronological'],
      filterFunc: refFilter,
      sortFunc: refSort,
      renderWrapper: notableSourcesRefRenderWrapper,
    },
    {
      key: 'sources',
      fetcher: fetchBulkText.bind(null, translationLanguagePreference),
      sortOptions: ['Relevance', 'Chronological'],
      filterFunc: refFilter,
      sortFunc: refSort,
      renderWrapper: allSourcesRefRenderWrapper,
    },
    {
      key: 'sheets',
      fetcher: fetchBulkSheet,
      sortOptions: ['Relevance', 'Views', 'Newest'],
      filterFunc: sheetFilter,
      sortFunc: sheetSort,
      renderWrapper: sheetRenderWrapper,
    }
  ], [translationLanguagePreference]);
  return getTabDisplayData();
};

const PortalNavSideBar = ({portal, entriesToDisplayList}) => {
   const portalModuleTypeMap = {
    "about": "PortalAbout",
    "mobile": "PortalMobile",
    "organization": "PortalOrganization",
    "newsletter": "PortalNewsletter"
    }
    const modules = [];
    for (let key of entriesToDisplayList) {
        if (!portal[key]) { continue; }
        modules.push({
            type: portalModuleTypeMap[key],
            props: portal[key],
        });
    }
    return(
        <NavSidebar modules={modules} />
    )
};

const getTopicPageAnalyticsData = (slug, langPref) => {
    return {
        project: "topics",
        content_lang: langPref || "bilingual",
        panel_category: Sefaria.topicTocCategories(slug)?.map(({slug}) => slug)?.join('|'),
    };
};

const TopicPage = ({
  tab, topic, topicTitle, setTopic, setNavTopic, openTopics, multiPanel, showBaseText, navHome,
  toggleSignUpModal, openDisplaySettings, setTab, openSearch, translationLanguagePreference, versionPref,
  topicTestVersion, onSetTopicSort, topicSort
}) => {
    const defaultTopicData = {primaryTitle: topicTitle, tabs: {}, isLoading: true};
    const [topicData, setTopicData] = useState(Sefaria.getTopicFromCache(topic, {with_html: true}) || defaultTopicData);
    const [loadedData, setLoadedData] = useState(topicData ? Object.entries(topicData.tabs).reduce((obj, [key, tabObj]) => { obj[key] = tabObj.loadedData; return obj; }, {}) : {});
    const [refsToFetchByTab, setRefsToFetchByTab] = useState({});
    const [parashaData, setParashaData] = useState(null);
    const [langPref, setLangPref] = useState(Sefaria.interfaceLang);
    const [showFilterHeader, setShowFilterHeader] = useState(false);
    const [showLangSelectInterface, setShowLangSelectInterface] = useState(false);
    const [portal, setPortal] = useState(null);
    const tabDisplayData = useTabDisplayData(translationLanguagePreference, versionPref);
    const topicImage = topicData.image;

    const scrollableElement = useRef();
    const clearAndSetTopic = (topic, topicTitle) => {setTopic(topic, topicTitle)};

    // Initial Topic Data, updates when `topic` changes
    useEffect(() => {
      setTopicData(defaultTopicData); // Ensures topicTitle displays while loading
      const { promise, cancel } = Sefaria.makeCancelable((async () => {
        const d = await Sefaria.getTopic(topic, {with_html: true});
        if (d.parasha) { Sefaria.getParashaNextRead(d.parasha).then(setParashaData); }
        setTopicData(d);
        // Data remaining to fetch that was not already in the cache
        for (let [tabKey, tabObj] of Object.entries(d.tabs)) {
          const refsWithoutData = tabObj.loadedData ? tabObj.refs.slice(tabObj.loadedData.length) : tabObj.refs;
          if (refsWithoutData.length)  {
            setRefsToFetchByTab(prev => ({...prev, [tabKey]: refsWithoutData}));
          } else {
            setLoadedData(prev => ({...prev, [tabKey]: tabObj.loadedData}));
          }
        }
      })());
      promise.catch((error) => { if (!error.isCanceled) { console.log('TopicPage Error', error); } });
      return () => {
        cancel();
        setTopicData(false);
        setLoadedData({});
        setRefsToFetchByTab({});
      }
    }, [topic]);

    useEffect( ()=> {
    // hack to redirect to temporary sheet content on topics page for those topics that only have sheet content.
      if (document.querySelector('.filter-content') && !document.querySelector('.filter-content').firstChild) {
        const interfaceIsHe = Sefaria.interfaceLang === "hebrew"
        const topicPath = interfaceIsHe ? topicTitle.he : topicTitle.en;
        const redirectUrl = `${document.location.origin}/search?q=${topicPath}&tab=sheet&tvar=1&tsort=relevance&stopics_${interfaceIsHe ? "he": "en"}Filters=${topicPath}&svar=1&ssort=relevance`
        window.location.replace(redirectUrl);
      }
    },[loadedData])

    // Set up tabs and register incremental load hooks
    const displayTabs = [];
    let onClickFilterIndex = 3;
    let onClickLangToggleIndex = 2;
    let authorWorksAdded = false;

    for (let tabObj of tabDisplayData) {
      const { key } = tabObj;
      useIncrementalLoad(
        tabObj.fetcher,
        refsToFetchByTab[key] || false,
        Sefaria._topicPageSize,
        data => setLoadedData(prev => {
          const updatedData = (!prev[key] || data === false) ? data : [...prev[key], ...data];
          if (topicData?.tabs?.[key]) { topicData.tabs[key].loadedData = updatedData; } // Persist loadedData in cache
          return {...prev, [key]: updatedData};
        }),
        topic
      );


      if (topicData?.indexes?.length && !authorWorksAdded) {
        displayTabs.push({
          title: {en: "Works on Sefaria", he: Sefaria.translation('hebrew', "Works on Sefaria")},
          id: 'author-works-on-sefaria',
        });
        authorWorksAdded = true
      }

      if (topicData?.tabs?.[key]) {
        displayTabs.push({
          title: topicData.tabs[key].title,
          id: key,
        });
      }
    }
    if (displayTabs.length && tab!="notable-sources") {
      displayTabs.push({
        title: {
          en: "",
          he: ""
        },
        id: 'filter',
        icon: `/static/icons/filter.svg`,
        justifyright: true
      });
      onClickFilterIndex = displayTabs.length - 1;
    }

    if (displayTabs.length) {
      displayTabs.push({
        title: {
          en: "A",
          he: Sefaria._("A")
        },
        id: 'langToggle',
        popover: true,
        justifyright: tab==="notable-sources"
      });
      onClickLangToggleIndex = displayTabs.length - 1;
    }



    const classStr = classNames({topicPanel: 1, readerNavMenu: 1});
    let sidebar = null;
    if (topicData) {
        if (topicData.portal_slug) {
            Sefaria.getPortal(topicData.portal_slug).then(setPortal);
            if (portal) {
                sidebar = <PortalNavSideBar portal={portal} entriesToDisplayList={["about", "mobile", "organization", "newsletter"]}/>
            }
        } else {
           sidebar = (
               <div className="sideColumn" data-anl-panel_type="topics" data-anl-panel_number={0}>
                    <TopicSideColumn
                        key={topic}
                        slug={topic}
                        links={topicData.links}
                        clearAndSetTopic={clearAndSetTopic}
                        setNavTopic={setNavTopic}
                        parashaData={parashaData}
                        tref={topicData.ref}
                        timePeriod={topicData.timePeriod}
                        properties={topicData.properties}
                        topicTitle={topicTitle}
                        multiPanel={multiPanel}
                        topicImage={topicImage}
                    />
                    {!topicData.isLoading && <Promotions/>}
                </div>
            );
        }
    }

    const handleLangSelectInterfaceChange = (selection) => {
      if (selection === "source") {setLangPref("hebrew")}
      else if (selection === "translation") {setLangPref("english")}
      else setLangPref(null);
    }

    const getCurrentLang = () => {
      if (langPref === "hebrew") {return "source"}
      else if (langPref === "english") {return "translation"}
      else {return "sourcewtrans"}
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.click();
      }
    }

    const currentLang = getCurrentLang()

    return (
        <div
            className={classStr}
            data-anl-batch={JSON.stringify(getTopicPageAnalyticsData(topic, langPref))}
        >
        <div className="content noOverflowX" ref={scrollableElement}>
            <div className="columnLayout">
               <div className="mainColumn storyFeedInner">
                    <TopicHeader topic={topic} topicData={topicData} topicTitle={topicTitle} multiPanel={multiPanel} setNavTopic={setNavTopic} openSearch={openSearch} openDisplaySettings={openDisplaySettings} topicImage={topicImage} />
                    {(!topicData.isLoading && displayTabs.length) ?
                       <TabView
                          currTabName={tab}
                          setTab={setTab}
                          tabs={displayTabs}
                          renderTab={t => (
                            <div tabIndex="0" onKeyDown={(e)=>handleKeyDown(e)} className={classNames({tab: 1, noselect: 1, popover: t.popover , filter: t.justifyright, open: t.justifyright && showFilterHeader})}>
                              <div data-anl-event={t.popover && "lang_toggle_click:click"}><InterfaceText text={t.title} /></div>
                              { t.icon ? <img src={t.icon} alt={`${t.title.en} icon`} data-anl-event="filter:click" data-anl-text={topicSort}/> : null }
                              {t.popover && showLangSelectInterface ? <LangSelectInterface defaultVal={currentLang} callback={(result) => handleLangSelectInterfaceChange(result)} closeInterface={()=>{setShowLangSelectInterface(false)}}/> : null}
                            </div>
                          )}
                          containerClasses={"largeTabs"}
                          onClickArray={{
                            [onClickFilterIndex]: ()=>setShowFilterHeader(!showFilterHeader),
                            [onClickLangToggleIndex]: ()=>{setShowLangSelectInterface(!showLangSelectInterface)}
                          }}
                        >

                        {topicData?.indexes?.length ? (
                          <div className="authorIndexList">
                            {topicData.indexes.map(({url, title, description}) => <AuthorIndexItem key={url} url={url} title={title} description={description}/>)}
                          </div>
                          ) : null }

                          {
                            tabDisplayData.map(tabObj => {
                              const { key, sortOptions, filterFunc, sortFunc, renderWrapper } = tabObj;
                              const displayTab = displayTabs.find(x => x.id === key);
                              if (!displayTab) { return null; }
                              return (
                                <TopicPageTab
                                  key={key}
                                  scrollableElement={scrollableElement}
                                  showFilterHeader={showFilterHeader}
                                  data={loadedData[key]}
                                  sortOptions={sortOptions}
                                  filterFunc={filterFunc}
                                  sortFunc={sortFunc}
                                  onDisplayedDataChange={data => {
                                    if (!topicData._refsDisplayedByTab) { topicData._refsDisplayedByTab = {}; }
                                    topicData._refsDisplayedByTab[key] = data.length;
                                  }}
                                  initialRenderSize={(topicData._refsDisplayedByTab && topicData._refsDisplayedByTab[key]) || 0}
                                  renderItem={renderWrapper(toggleSignUpModal, topicData, topicTestVersion, langPref)}
                                  onSetTopicSort={onSetTopicSort}
                                  topicSort={topicSort}
                                />
                              );
                            })
                          }
                        </TabView>
                    : (topicData.isLoading ? <LoadingMessage /> : null) }
                </div>
                {sidebar}
            </div>
            <Footer />
          </div>
        </div>
    );
};
TopicPage.propTypes = {
  tab:                 PropTypes.string,
  topic:               PropTypes.string.isRequired,
  setTopic:            PropTypes.func.isRequired,
  setNavTopic:         PropTypes.func.isRequired,
  openTopics:          PropTypes.func.isRequired,
  setTab:              PropTypes.func.isRequired,
  multiPanel:          PropTypes.bool,
  showBaseText:        PropTypes.func,
  navHome:             PropTypes.func,
  openDisplaySettings: PropTypes.func,
  toggleSignUpModal:   PropTypes.func,
  topicTestVersion:    PropTypes.string
};


const TopicPageTab = ({
  data, renderItem, classes, sortOptions, sortFunc, filterFunc, showFilterHeader,
  scrollableElement, onDisplayedDataChange, initialRenderSize, onSetTopicSort, topicSort
}) => {
  useEffect(()=>{
    const details = document.querySelector(".story.topicPassageStory details");
    if (details) {
      details.setAttribute("open", "");
    }
  },[data])

  return (
    <div className="topicTabContents">
      {!!data ?
        <div className={classes} data-anl-feature_name="source_filter">
          <FilterableList
            pageSize={20}
            scrollableElement={scrollableElement}
            showFilterHeader={showFilterHeader}
            filterFunc={filterFunc}
            sortFunc={sortFunc}
            renderItem={renderItem}
            renderEmptyList={()=>null}
            renderHeader={()=>null}
            sortOptions={sortOptions}
            onDisplayedDataChange={onDisplayedDataChange}
            initialRenderSize={initialRenderSize}
            onSetSort={onSetTopicSort}
            externalSortOption={topicSort}
            data={data}
          />
        </div> : <LoadingMessage />
      }
    </div>
  );
}


const TopicLink = ({topic, topicTitle, onClick, isTransliteration, isCategory}) => (
    <div data-anl-event="related_click:click" data-anl-batch={
        JSON.stringify({
            text: topicTitle.en,
            feature_name: "related topic",
        })
    }>
        <Link className="relatedTopic" href={`/topics/${isCategory ? 'category/' : ''}${topic}`}
              onClick={onClick.bind(null, topic, topicTitle)} key={topic}
              title={topicTitle.en}
        >
            <InterfaceText text={{en:topicTitle.en, he:topicTitle.he}}/>
        </Link>
    </div>
);
TopicLink.propTypes = {
  topic: PropTypes.string.isRequired,
  isTransliteration: PropTypes.object,
};


const TopicSideColumn = ({ slug, links, clearAndSetTopic, parashaData, tref, setNavTopic, timePeriod, properties, topicTitle, multiPanel, topicImage }) => {
  const category = Sefaria.displayTopicTocCategory(slug);
  const linkTypeArray = links ? Object.values(links).filter(linkType => !!linkType && linkType.shouldDisplay && linkType.links.filter(l => l.shouldDisplay !== false).length > 0) : [];
  if (linkTypeArray.length === 0) {
    linkTypeArray.push({
      title: {
        en: !category ? 'Explore Topics' : category.en,
        he: !category ?  'נושאים כלליים' : category.he,
      },
      links: Sefaria.topicTocPage(category && category.slug).slice(0, 20).map(({slug, en, he}) => ({
        topic: slug,
        title: {en, he},
        isCategory: !category,
      })),
    })
  }
  const hasReadings = parashaData && (!Array.isArray(parashaData) || parashaData.length > 0) && tref;
  const readingsComponent = hasReadings ? (
    <ReadingsComponent parashaData={parashaData} tref={tref} />
  ) : null;
  const topicMetaData = <TopicMetaData timePeriod={timePeriod} properties={properties} topicTitle={topicTitle} multiPanel={multiPanel} topicImage={topicImage}/>;
  const linksComponent = (
    links ?
        linkTypeArray.sort((a, b) => {
        const aInd = a.title.en.indexOf('Related');
        const bInd = b.title.en.indexOf('Related');
        if (aInd > -1 && bInd > -1) { return 0; }
        if (aInd > -1) { return -1; }
        if (bInd > -1) { return 1; }
        //alphabetical by en just to keep order consistent
        return a.title.en.localeCompare(b.title.en);
      })
      .map(({ title, pluralTitle, links }) => {
        const linksToDisplay = links.filter(l => l.shouldDisplay !== false);
        const hasPlural = linksToDisplay.length > 1 && pluralTitle;
        const pluralizedTitle = {
          en: hasPlural ? pluralTitle.en : title.en,
          he: hasPlural ? pluralTitle.he : title.he,
        };
        const hasMore = linksToDisplay.length > 10;
        return (
          <TopicSideSection key={title.en+title.he} title={pluralizedTitle} hasMore={hasMore}>
            {
              linksToDisplay
              .sort((a, b) => {
                const shortLang = Sefaria.interfaceLang == 'hebrew' ? 'he' : 'en';
                if (!!a.title[shortLang] !== !!b.title[shortLang]) {
                  return (0+!!b.title[shortLang]) - (0+!!a.title[shortLang]);
                }
                if (!a.order && !b.order) { return 0; }
                if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
                return b.order.tfidf - a.order.tfidf;
              })
              .map(l =>
                  (<TopicLink
                      key={l.topic}
                      topic={l.topic} topicTitle={l.title}
                      onClick={l.isCategory ? setNavTopic : clearAndSetTopic}
                      isTransliteration={l.titleIsTransliteration}
                      isCategory={l.isCategory}
                  />)
              )
            }
          </TopicSideSection>
        );
      })
    : null
  );


  const LinkToSheetsSearchComponent = () => {

    let searchUrlEn = `/search?q=${topicTitle.en}&tab=sheet&tvar=1&tsort=relevance&stopics_enFilters=${topicTitle.en}&svar=1&ssort=relevance`;
    let searchUrlHe = `/search?q=${topicTitle.he}&tab=sheet&tvar=1&tsort=relevance&stopics_heFilters=${topicTitle.he}&svar=1&ssort=relevance`;
      return (
        <TopicSideSection title={{ en: "Sheets", he: "דפי מקורות" }}>
          <InterfaceText>
            <EnglishText>
              <a href={searchUrlEn}>Related Sheets</a>
            </EnglishText>
            <HebrewText>
              <a href={searchUrlHe}>דפי מקורות קשורים</a>
            </HebrewText>
          </InterfaceText>
        </TopicSideSection>
      );
    };


  return (
    <div className={"topicSideColumn"}>
      { readingsComponent }
      { topicMetaData }
      { linksComponent }
      <LinkToSheetsSearchComponent/>
    </div>
  )
}
TopicSideColumn.propTypes = {
  topicData: PropTypes.object,
  clearAndSetTopic: PropTypes.func.isRequired,
};


const TopicSideSection = ({ title, children, hasMore }) => {
  const [showMore, setShowMore] = useState(false);
  const moreText = showMore ? "Less" : "More";
  return (
    <div key={title.en} className="link-section">
      <h2>
        <span className="int-en">{title.en}</span>
        <span className="int-he">{title.he}</span>
      </h2>
      <div className="sideList">
        { React.Children.toArray(children).slice(0, showMore ? undefined : 10) }
      </div>
      {
        hasMore ?
        (
          <div
              className="sideColumnMore sans-serif"
              onClick={() => setShowMore(!showMore)}
              data-anl-event="related_click:click"
              data-anl-batch={JSON.stringify({
                  text: moreText,
                  feature_name: "more",
              })}
          >
            <InterfaceText>{ moreText }</InterfaceText>
          </div>
        )
        : null
      }
    </div>
  );
}

const TopicImage = ({photoLink, caption }) => {

  return (
    <div className="topicImage">
      <ImageWithCaption photoLink={photoLink} caption={caption} />
    </div>);
}


const ReadingsComponent = ({ parashaData, tref }) => (
  <div className="readings link-section">
    <h2>
      <InterfaceText text={{en:"Readings", he:"פרשיות והפטרות"}}  />
    </h2>
    <span className="smallText parasha-date">
      <InterfaceText text={{en:Sefaria.util.localeDate(parashaData.date), he:Sefaria.util.localeDate(parashaData.date)}} />
      <InterfaceText text={{en:Sefaria.util.hebrewCalendarDateStr(parashaData.date), he:Sefaria.util.hebrewCalendarDateStr(parashaData.date)}} />
    </span>
    <div className="parasha">
        <div className="sectionTitleText"><InterfaceText text={{en:"Torah", he:"תורה"}} /></div>
        <div className="navSidebarLink ref serif">
            <img src="/static/icons/book.svg" className="navSidebarIcon" alt="book icon" />
            <a href={'/' + tref.url} className="contentText"><InterfaceText text={{en:tref.en, he:norm_hebrew_ref(tref.he)}} /></a>
        </div>
        <div className="aliyot">
        {
            parashaData.parasha?.extraDetails?.aliyot?.map((aliya, index) => {
               let sectionNum = index+1;
               let sectionStr = sectionNum <= 7 ? sectionNum : 'M';
               let heSectionStr = sectionNum <= 7 ? Sefaria.hebrew.encodeHebrewNumeral(sectionNum) : 'מ';
               return (
                  <a className="sectionLink" href={"/" + Sefaria.normRef(aliya)} data-ref={aliya} key={aliya}>
                    <InterfaceText text={{en:sectionStr, he:heSectionStr}}/>
                  </a>
                );
            }) ?? null
        }
        </div>
    </div>
    <div className="haftarah">
        <div className="sectionTitleText"><InterfaceText text={{en:"Haftarah", he:"הפטרה"}}/></div>
        {parashaData.haftarah ?
            <div className="haftarot">
            {
              parashaData.haftarah.map(h => (
                <div className="navSidebarLink ref serif">
                    <img src="/static/icons/book.svg" className="navSidebarIcon" alt="book icon" />
                    <a href={'/' + h.url} className="contentText" key={h.url}>
                      <InterfaceText text={{en:h.displayValue.en, he:norm_hebrew_ref(h.displayValue.he)}} />
                    </a>
                </div>
              ))
            }
            </div> : ""}
    </div>
  </div>
);

const propKeys = [
  {en: 'enWikiLink', he: 'heWikiLink', title: 'Wikipedia'},
  {en: 'jeLink', he: 'jeLink', title: 'Jewish Encyclopedia'},
  {en: 'enNliLink', he: 'heNliLink', title: 'National Library of Israel'},
];


const TopicMetaData = ({ topicTitle, timePeriod, multiPanel, topicImage, properties={} }) => {
  const tpSection = !!timePeriod ? (
    <TopicSideSection title={{en: "Lived", he: "תקופת פעילות"}}>
      <div className="systemText topicMetaData"><InterfaceText text={timePeriod.name} /></div>
      <div className="systemText topicMetaData"><InterfaceText text={timePeriod.yearRange} /></div>
    </TopicSideSection>
  ) : null;
  const propValues = propKeys.map(keyObj => ({
    url: {
      en: (properties[keyObj.en] || {})['value'],
      he: (properties[keyObj.he] || {})['value'],
    },
    title: keyObj.title,
  }));
  const hasProps = propValues.reduce((accum, curr) => accum || curr.url.en || curr.url.he, false);
  const propsSection = hasProps ? (
      <TopicSideSection title={{en: "Learn More", he: "לקריאה נוספת"}}>
        {
          propValues.map(propObj => {
            let url, urlExists = true;
            if (Sefaria.interfaceLang === 'hebrew') {
              if (!propObj.url.he) { urlExists = false; }
              url = propObj.url.he || propObj.url.en;
            } else {
              if (!propObj.url.en) { urlExists = false; }
              url = propObj.url.en || propObj.url.he;
            }
            if (!url) { return null; }
            const en_text = propObj.title + (urlExists ? "" : " (Hebrew)");
            const he_text = Sefaria._(propObj.title) + (urlExists ? "" : ` (${Sefaria._("English")})`);
            return (
                <div
                    key={url}
                    data-anl-event="related_click:click"
                    data-anl-batch={JSON.stringify({
                        text: en_text,
                        feature_name: "description link learn more",
                    })}
                >
                    <SimpleLinkedBlock
                        en={en_text} he={he_text}
                        url={url} aclasses={"systemText topicMetaData"} openInNewTab
                    />
                </div>
            );
          })
        }
      </TopicSideSection>
  ) : null;

  const tpSidebarImg = multiPanel && topicImage ? <TopicImage photoLink={topicImage.image_uri} caption={topicImage.image_caption}/> : null;
  return (
    <>
      {tpSidebarImg}
      { tpSection }
      { propsSection }
    </>
  );
};


export {
  TopicPage,
  TopicCategory,
  refSort,
  TopicImage
}
