import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import { useIncrementalLoad } from './Hooks';
import { Promotions } from './Promotions';
import { NavSidebar } from './NavSidebar';
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
import { TopicTOCCard } from "./common/TopicTOCCard";



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
    // Hydrate inRefs with text from outRefs
    for (let tempRef of inRefs) {
      const outRef = outRefs[tempRef.ref];

      if (outRef) {
        Object.assign(tempRef, outRef);
      }
    }
    return inRefs.map(ref => [ref.ref, ref]);
  });


const fetchBulkSheet = inSheets => {
  const refs = inSheets.map(x => {
    if (isNaN(x.ref)) {
      x.ref = parseInt(x.ref.replace('Sheet ', ''));  // bulk sheets API expects just numbers so we need to remove the "Sheet " string
      return x.ref;
    }
    else {
      return x.ref;
    }
  });
  return Sefaria.getBulkSheets(refs).then(outSheets => {
    for (let tempSheet of inSheets) {
      if (outSheets[tempSheet.ref]) {
        outSheets[tempSheet.ref].order = tempSheet.order;
      }
    }
    return Object.values(outSheets);
  });
}


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
  for (let field of ['sheet_title', 'sheet_summary', 'publisher_name', 'publisher_position', 'publisher_organization']) {
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
        content_type: Sefaria.index(title)?.categories?.join('|'),
    };
};
const refRenderWrapper = (toggleSignUpModal, topicData, topicTestVersion, langPref, isAdmin, displayDescription, hideLanguageMissingSources) => (item, index) => {
  const text = item[1];
  const topicTitle = topicData && topicData.primaryTitle;
  const langKey = Sefaria._getShortInterfaceLang();
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

const TopicCategory = ({topic, topicTitle, setTopic, setNavTopic}) => {
    const [topicData, setTopicData] = useState(Sefaria.getTopicFromCache(topic) || {primaryTitle: topicTitle});
    const [subtopics, setSubtopics] = useState(Sefaria.topicTocPage(topic));

    useEffect(() => {
        Sefaria.getTopic(topic).then(setTopicData);
    }, [topic]);

    useEffect(() => {
        setSubtopics(Sefaria.topicTocPage(topic));
    }, [topic]);

    let topicBlocks = subtopics
      .filter(Sefaria.shouldDisplayInActiveModule)
      .sort(Sefaria.sortTopicsCompareFn)
      .map((topic, i) => <TopicTOCCard topic={topic} setTopic={setTopic} setNavTopic={setNavTopic} key={i}/>);
      
    let sidebarModules = [
      {type: "AboutTopics"},
      {type: "Promo"},
      {type: "TrendingTopics"},
      {type: "SponsorADay"},
    ];
    if (topic === "torah-portions" && Sefaria.interfaceLang === "english") {
        sidebarModules.splice(1, 0, {type: "StudyCompanion"});
    }

    return (
        <div
            className="readerNavMenu noLangToggleInHebrew"
            data-anl-project="topics"
            data-anl-panel_category={getPanelCategory(topic) || "Topic Landing"}
        >
            <div className="content readerTocTopics">
                <div className="sidebarLayout">
                  <div className="contentInner" data-anl-feature_name="Main">
                      <div className="navTitle tight">
                        <CategoryHeader type="topics" data={topicData}>
                            <h1><InterfaceText text={{en: topicTitle.en, he: topicTitle.he}} /></h1>
                        </CategoryHeader>
                      </div>
                    <div className="TOCCardsWrapper table">{topicBlocks}</div>
                  </div>
                  <NavSidebar sidebarModules={sidebarModules} />
                </div>
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
const isLinkReviewed= (lang, link) => link.descriptions?.[lang]?.review_state !== "not reviewed";


const doesLinkHaveAiContent = (lang, link) => link.descriptions?.[lang]?.ai_title?.length > 0 && isLinkPublished(lang, link);

const getLinksWithAiContent = (refTopicLinks = []) => {
    const lang = Sefaria._getShortInterfaceLang();
    return refTopicLinks.filter(link => doesLinkHaveAiContent(lang, link));
};

const getLinksToGenerate = (refTopicLinks = []) => {
    const lang = Sefaria._getShortInterfaceLang();
    return refTopicLinks.filter(link => {
        return link.descriptions?.[lang]?.ai_context?.length > 0  &&
            !link.descriptions?.[lang]?.prompt;
    });
};
const getLinksToPublish = (refTopicLinks = []) => {
    const lang = Sefaria._getShortInterfaceLang();
    return refTopicLinks.filter(link => {
        return !isLinkPublished(lang, link) && isLinkReviewed(lang, link);
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
    const lang = Sefaria._getShortInterfaceLang();
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

const TopicHeader = ({ topic, topicData, topicTitle, multiPanel, isCat, setNavTopic, openSearch, topicImage }) => {
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
            {hasAiContentLinks && Sefaria.activeModule === 'library' && 
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
              <InterfaceText markdown={{en: topicData.description.en, he: topicData.description.he}} disallowedMarkdownElements={['p']}/>
            </div>
       : null}
       {tpTopImg}
       {topicData && topicData.ref &&
           <div>
               <a href={`/${topicData.ref.url}`} data-target-module={Sefaria.LIBRARY_MODULE} className="resourcesLink button blue">
                   <img src="/static/icons/book-icon-black.svg" alt="Book Icon"/>
                   <span className="int-en">{topicData.parasha ? Sefaria._('Read the Portion') : topicData.ref.en}</span>
                   <span className="int-he">{topicData.parasha ? Sefaria._('Read the Portion') : norm_hebrew_ref(topicData.ref.he)}</span>
               </a>
               {Sefaria.interfaceLang === "english" &&
               <a className="resourcesLink button blue studyCompanion"
                  href="https://learn.sefaria.org/weekly-parashah/"
                  target="_blank"
                  data-anl-event="select_promotion:click|view_promotion:scrollIntoView"
                  data-anl-promotion_name="Parashah Email Signup - Parashah Page"
               >
                  <img src="/static/icons/email-newsletter.svg" alt="Sign up for our weekly parashah study companion"/>
                  <InterfaceText>Get the Free Study Companion</InterfaceText>
               </a>}
           </div>}
    </div>
);
}

const AuthorIndexItem = ({
    url, title, description
}) => {
    return (
        <div className="authorIndex">
            <a href={url} data-target-module={Sefaria.LIBRARY_MODULE} className="navBlockTitle">
                <InterfaceText text={title} defaultToInterfaceOnBilingual/>
            </a>
            <div className="navBlockDescription">
        <InterfaceText text={description} defaultToInterfaceOnBilingual />
      </div>
    </div>
  );
};


const useAllPossibleSourceTabs = (translationLanguagePreference) => {
  // all possible tabs that display sources in a topic page
  const getSourceTabData = useCallback(() => [
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
  return getSourceTabData();
};

const PortalNavSideBar = ({portal, entriesToDisplayList}) => {
   const portalModuleTypeMap = {
    "about": "PortalAbout",
    "mobile": "PortalMobile",
    "organization": "PortalOrganization",
    "newsletter": "PortalNewsletter"
    }
    const sidebarModules = [];
    for (let key of entriesToDisplayList) {
        if (!portal[key]) { continue; }
        sidebarModules.push({
            type: portalModuleTypeMap[key],
            props: portal[key],
        });
    }
    return(
        <NavSidebar sidebarModules={sidebarModules} />
    )
};

const getPanelCategory = (slug) => {
    return Sefaria.topicTocCategories(slug)?.map(({slug}) => slug)?.join('|');
}

const getTopicPageAnalyticsData = (slug, langPref) => {
    return {
        project: "topics",
        content_lang: langPref || "bilingual",
        panel_category: getPanelCategory(slug),
    };
};

const TopicPage = ({
  tab, topic, topicTitle, setTopic, setNavTopic, multiPanel,
  toggleSignUpModal, setTab, openSearch, translationLanguagePreference, versionPref,
  topicTestVersion, onSetTopicSort, topicSort
}) => {
    const defaultTopicData = {primaryTitle: topicTitle, tabs: {}, isLoading: true};
    const [topicData, setTopicData] = useState(Sefaria.getTopicFromCache(topic, {with_html: true}) || defaultTopicData);
    const [parashaData, setParashaData] = useState(null);
    const [portal, setPortal] = useState(null);
    const [langPref, setLangPref] = useState(Sefaria.interfaceLang);
    const scrollableElement = useRef();

    const topicImage = topicData.image;
    const clearAndSetTopic = (topic, topicTitle) => {setTopic(topic, topicTitle)};
    const classStr = classNames({topicPanel: 1, readerNavMenu: 1});

    // Initial Topic Data, updates when `topic` changes
    useEffect(() => {
      setTopicData(defaultTopicData); // Ensures topicTitle displays while loading
      const { promise, cancel } = Sefaria.makeCancelable((async () => {
        const d = await Sefaria.getTopic(topic, {with_html: true});
        if (d.parasha) { Sefaria.getParashaNextRead(d.parasha).then(setParashaData); }
        setTopicData(d);
      })());
      promise.catch((error) => { if (!error.isCanceled) { console.log('TopicPage Error', error); } });
      return () => {
        cancel();
        setTopicData(false);
      }
    }, [topic]);

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
                    {!topicData.isLoading && <TopicSideColumn
                        key={topic}
                        slug={topic}
                        linksByType={topicData.links}
                        clearAndSetTopic={clearAndSetTopic}
                        setNavTopic={setNavTopic}
                        parashaData={parashaData}
                        tref={topicData.ref}
                        timePeriod={topicData.timePeriod}
                        properties={topicData.properties}
                        topicTitle={topicTitle}
                        multiPanel={multiPanel}
                        topicImage={topicImage}
                    />}
                    {!topicData.isLoading && <Promotions/>}
                </div>
            );
        }
    }

    return (
        <div
            className={classStr}
            data-anl-batch={JSON.stringify(getTopicPageAnalyticsData(topic, langPref))}
        >
        <div className="content noOverflowX" ref={scrollableElement}>
            <div className="columnLayout">
               <div className="mainColumn storyFeedInner">
                    <TopicHeader topic={topic} topicData={topicData} topicTitle={topicTitle} multiPanel={multiPanel} setNavTopic={setNavTopic} openSearch={openSearch} topicImage={topicImage} />
                    <TopicPageTabView topic={topic} topicData={topicData} tab={tab} setTab={setTab} versionPref={versionPref}
                                      scrollableElement={scrollableElement} translationLanguagePreference={translationLanguagePreference}
                                      onSetTopicSort={onSetTopicSort} topicSort={topicSort} langPref={langPref} setLangPref={setLangPref}
                                      toggleSignUpModal={toggleSignUpModal} topicTestVersion={topicTestVersion}
                    />
                </div>
                {sidebar}
            </div>
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
  navHome:             PropTypes.func,
  toggleSignUpModal:   PropTypes.func,
  topicTestVersion:    PropTypes.string
};

const TopicPageTabView = ({topic, topicData, tab, setTab, translationLanguagePreference, versionPref,
                            scrollableElement, langPref, setLangPref, toggleSignUpModal, topicTestVersion,
                            onSetTopicSort, topicSort}) => {
    /*
    This component is a wrapper for the `TabView` component.  The core logic of this component is in `setupTabsWithSources`.
    `setupTabsWithSources`, based on the `tabs` property in `topicData`, sets up the tabs to display and incrementally 
    loads the data for each tab as the user scrolls down. 
    `setupAdditionalTabs` sets up additional tabs that are not related to sources, such as filter and language toggle.
     */
    const [loadedData, setLoadedData] = useState(topicData ? Object.entries(topicData.tabs).reduce((obj, [key, tabObj]) => { obj[key] = tabObj.loadedData; return obj; }, {}) : {});
    const [refsToFetchByTab, setRefsToFetchByTab] = useState({});
    const [showLangSelectInterface, setShowLangSelectInterface] = useState(false);
    const allPossibleTabsWithSources = useAllPossibleSourceTabs(translationLanguagePreference);
    const [showFilterHeader, setShowFilterHeader] = useState(false);

    const getCurrentLang = (langPref) => {
      if (langPref === "hebrew") {return "source"}
      else if (langPref === "english") {return "translation"}
      else {return "sourcewtrans"}
    }
    const currentLang = getCurrentLang(langPref);

    useEffect(() => {
        for (let [tabKey, tabObj] of Object.entries(topicData.tabs)) {
          const refsWithoutData = tabObj.loadedData ? tabObj.refs.slice(tabObj.loadedData.length) : tabObj.refs;
          if (refsWithoutData.length)  {
            setRefsToFetchByTab(prev => ({...prev, [tabKey]: refsWithoutData}));
          } else {
            setLoadedData(prev => ({...prev, [tabKey]: tabObj.loadedData}));
          }
        }
      return () => {
        setLoadedData({});
        setRefsToFetchByTab({});
      }
    }, [!!topicData.isLoading]);

    const setupTabsWithSources = () => {
      // Set up tabs to display for the given 'topic' page based on all possible tabs with sources (see 'useAllPossibleSourceTabs' where each of the tabs with sources is defined).
      // We register incremental load hooks per tab to load the data for each tab based on scroll position.
      const onIncrementalLoad = (data, key) => setLoadedData(prev => {
        const updatedData = (!prev[key] || data === false) ? data : [...prev[key], ...data];
        if (topicData?.tabs?.[key]) { topicData.tabs[key].loadedData = updatedData; } // Persist loadedData in cache
        return {...prev, [key]: updatedData};
      });
      let displayTabs = [];
      for (let tabObj of allPossibleTabsWithSources) {
        const {key, sortOptions, filterFunc, sortFunc, renderWrapper} = tabObj;
        useIncrementalLoad(
          tabObj.fetcher,
          refsToFetchByTab[key] || false,
          Sefaria._topicPageSize,
          data => onIncrementalLoad(data, key),
          topic
        );
        if (topicData?.tabs?.[key]) {
          displayTabs.push({
            title: topicData.tabs[key].title,
            id: key,
            sortOptions,
            filterFunc,
            sortFunc,
            renderWrapper,
            hasSources: true,
          });
        }
      }
      return displayTabs;
    }

    const setupAdditionalTabs = () => {
      // Setup additional tabs that are not related to sources: such as filter, language toggle, and author works on Sefaria (this last one is only relevant if we're in the library module and the topic is an author)
      // Finally, return 'onClickFilterIndex' and 'onClickLangToggleIndex' to be used by 'TabView' component so that it knows which tab in 'displayTabs'
      // corresponds to the filter and lang toggle
      let onClickFilterIndex = 3;  // filter tab defaults to the 4th tab
      let onClickLangToggleIndex = 2; // lang toggle tab defaults to the 3rd tab
      const indexes = topicData?.indexes;

      if (indexes?.length) {
        displayTabs.push({
          title: {en: "Works on Sefaria", he: Sefaria.translation('hebrew', "Works on Sefaria")},
          id: 'author-works-on-sefaria',
        });
      }
      if (displayTabs.length && tab !== "notable-sources" && tab !== "author-works-on-sefaria") {
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

      if (displayTabs.length && tab !== "author-works-on-sefaria" && Sefaria.activeModule === 'library') {
        displayTabs.push({
          title: {
            en: "A",
            he: Sefaria._("A")
          },
          id: 'langToggle',
          popover: true,
          justifyright: tab === "notable-sources"
        });
        onClickLangToggleIndex = displayTabs.length - 1;
      }
      return [onClickLangToggleIndex, onClickFilterIndex];
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.click();
      }
    }

    const handleLangSelectInterfaceChange = (selection, setLangPref) => {
      if (selection === "source") {setLangPref("hebrew")}
      else if (selection === "translation") {setLangPref("english")}
      else setLangPref("bilingual");
    }

    const onDisplayDataChange = (data, topicData, key) => {
      if (!topicData._refsDisplayedByTab) { topicData._refsDisplayedByTab = {}; }
      topicData._refsDisplayedByTab[key] = data.length;
    }

    let displayTabs = setupTabsWithSources();
    let [onClickLangToggleIndex, onClickFilterIndex] = setupAdditionalTabs();

    const authorIndices = topicData?.indexes?.length && (
                            <div className="authorIndexList">
                              {topicData.indexes.map(({url, title, description}) => <AuthorIndexItem key={url} url={url} title={title} description={description}/>)}
                            </div>
                            );

    const tabsWithSources = displayTabs.map(tabObj => {
                                const { id, sortOptions, filterFunc, sortFunc, renderWrapper, hasSources } = tabObj;
                                if (hasSources) {
                                  return (
                                    <TopicPageTab
                                      key={id}
                                      scrollableElement={scrollableElement}
                                      showFilterHeader={showFilterHeader}
                                      data={loadedData[id]}
                                      sortOptions={sortOptions}
                                      filterFunc={filterFunc}
                                      sortFunc={sortFunc}
                                      onDisplayedDataChange={data => onDisplayDataChange(data, topicData, id)}
                                      initialRenderSize={topicData._refsDisplayedByTab?.[id] || 0}
                                      renderItem={renderWrapper(toggleSignUpModal, topicData, topicTestVersion, langPref)}
                                      onSetTopicSort={onSetTopicSort}
                                      topicSort={topicSort}
                                    />
                                  );
                               }});

    const topicTabView = <TabView
                                  currTabName={tab}
                                  setTab={setTab}
                                  tabs={displayTabs}
                                  renderTab={t => (
                                    <div tabIndex="0" onKeyDown={(e)=>handleKeyDown(e)} className={classNames({tab: 1, noselect: 1, popover: t.popover , filter: t.justifyright, open: t.justifyright && showFilterHeader})}>
                                      <div data-anl-event={t.popover && "lang_toggle_click:click"}><InterfaceText text={t.title} /></div>
                                      { t.icon ? <img src={t.icon} alt={`${t.title.en} icon`} data-anl-event="filter:click" data-anl-text={topicSort}/> : null }
                                      {t.popover && showLangSelectInterface ? <LangSelectInterface defaultVal={currentLang} callback={(result) => handleLangSelectInterfaceChange(result, setLangPref)} closeInterface={()=>{setShowLangSelectInterface(false)}}/> : null}
                                    </div>
                                  )}
                                  containerClasses={"largeTabs"}
                                  onClickArray={{
                                    [onClickFilterIndex]: ()=>setShowFilterHeader(!showFilterHeader),
                                    [onClickLangToggleIndex]: ()=>{setShowLangSelectInterface(!showLangSelectInterface)}
                                  }}>
                          {authorIndices}{tabsWithSources}
                        </TabView>;

    // Currently, there are data inconsistencies in the DB, so we should show LoadingMessage if there are no tabs to display.
    return (!topicData.isLoading && displayTabs.length) ? topicTabView : <LoadingMessage />; 
}

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


const TopicLink = ({topic, topicTitle, onClick, isTransliteration, isCategory, module}) => {
  const prefix = module === Sefaria.SHEETS_MODULE ? "/sheets/" : "/";
  const href = `${prefix}topics/${isCategory ? 'category/' : ''}${topic}`;
  return <div data-anl-event="related_click:click" data-anl-batch={
    JSON.stringify({
      text: topicTitle.en,
      feature_name: "related topic",
    })
  }>
    <Link className="relatedTopic" 
          href={href}
          onClick={onClick.bind(null, topic, topicTitle)} 
          key={topic}
          title={topicTitle.en}
          module={module}>
      <InterfaceText text={{en: topicTitle.en, he: topicTitle.he}}/>
    </Link>
  </div>
}
TopicLink.propTypes = {
  topic: PropTypes.string.isRequired,
  isTransliteration: PropTypes.object,
};


const preprocessLinksByType = (linksByType, slug) => {
  // Helper function for TopicSideColumn component.
  // Each group of links in the sidebar corresponds to a link type.  `linksByType` is an object with the following structure:
  // {
  //   linkType1: {
  //     title: {en: "Link Type 1", he: "סוג קישור 1"},
  //     pluralTitle: {en: "Link Types 1", he: "סוגי קישורים 1"},
  //     links: [link1, link2, ...],
  //     shouldDisplay: boolean,
  //   },
  // This function preprocesses the links to be displayed in the sidebar so that the group of links is only displayed
  // if the link type is supposed to be displayed in the active module and if there are any links to display.
  // Moreover, it preprocesses the links themselves so that they are sorted and filtered according to the active module
  // and the title is pluralized if there are multiple links.
  // If there are no links to display, the sidebar should show the category's subtopics in the sidebar (the subtopics can be derived from the topic TOC).
  // Finally, it sorts the link types by alphabetical order and shows the link type "Related" first.

  const preprocessLinks = (links) => {
    return links.filter(Sefaria.shouldDisplayInActiveModule).slice().sort((a, b) => {
      const shortLang = Sefaria.interfaceLang == 'hebrew' ? 'he' : 'en';
      if (!!a.title[shortLang] !== !!b.title[shortLang]) {
        return (0+!!b.title[shortLang]) - (0+!!a.title[shortLang]);
      }
      if (!a.order && !b.order) { return 0; }
      if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
      return b.order?.tfidf - a.order?.tfidf;
    });
  }

  const getPluralizedTitle = (title, pluralTitle, links) => {
    if (links.length > 1 && pluralTitle) {
      return { en: pluralTitle.en, he: pluralTitle.he };
    }
    return title;
  }

  let arr = [];
  arr = Object.values(linksByType)
      .filter(type => !!type?.shouldDisplay && type.links.some(Sefaria.shouldDisplayInActiveModule))
      .map(type => {
        const links = preprocessLinks(type.links)
        const pluralTitle = getPluralizedTitle(type.title, type.pluralTitle, links);
        return {
          title: type.title,
          pluralTitle: pluralTitle,
          links: links
        }
      });

  if (arr.length === 0) {  
    // if no links, show this category's subtopics in the sidebar (the subtopics can be derived from the topic TOC)
    const category = Sefaria.displayTopicTocCategory(slug);
    let defaultLinks = Sefaria.topicTocPage(category && category.slug).slice(0, 20).map(({slug, en, he}) => ({
      topic: slug,
      title: {en, he},
      isCategory: !category,
    }));
    defaultLinks = preprocessLinks(defaultLinks);
    const title = {
      en: !category ? 'Explore Topics' : category.en,
      he: !category ?  'נושאים כלליים' : category.he,
    };
    arr.push({
      title: title,
      links: preprocessLinks(defaultLinks),
      pluralTitle: title
    });
  }

  arr = arr.slice().sort((a, b) => { // show Related links first, then show by alphabetical order
    const aInd = a.title.en.indexOf('Related');
    const bInd = b.title.en.indexOf('Related');
    if (aInd > -1 && bInd > -1) { return 0; }
    if (aInd > -1) { return -1; }
    if (bInd > -1) { return 1; }
    return a.title.en.localeCompare(b.title.en);
  });

  return arr;
}

const TopicSideColumn = ({ slug, linksByType, clearAndSetTopic, parashaData, tref, setNavTopic, timePeriod, properties, topicTitle, multiPanel, topicImage }) => {
    const LinkToSheetsSearchComponent = () => {
    if (!topicTitle?.en || !topicTitle?.he) {
      // If topicTitle is not set, we cannot generate the search URLs
      console.warn("Topic title is not set, cannot generate search URLs for sheets.");
      return null;
    }
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
  const hasReadings = parashaData && (!Array.isArray(parashaData) || parashaData.length > 0) && tref;
  const readingsComponent = hasReadings ? (
    <ReadingsComponent parashaData={parashaData} tref={tref} />
  ) : null;
  const topicMetaData = <TopicMetaData timePeriod={timePeriod} properties={properties} topicTitle={topicTitle} multiPanel={multiPanel} topicImage={topicImage}/>; 
  const linksByTypeArray = preprocessLinksByType(linksByType, slug);
  const linksComponent = linksByTypeArray.map(({ title, pluralTitle, links }) => {
    const hasMore = links.length > 10;
    return (
      <TopicSideSection key={title.en+title.he} title={pluralTitle} hasMore={hasMore}>
        {
          links.map(l => (
            <TopicLink
              key={l.topic}
              topic={l.topic} topicTitle={l.title}
              onClick={l.isCategory ? setNavTopic : clearAndSetTopic}
              isTransliteration={l.titleIsTransliteration}
              isCategory={l.isCategory}
              module={Sefaria.activeModule}
            />
          ))
        }
      </TopicSideSection>
    );
  });

  return (
    <div className={"topicSideColumn"}>
      { topicMetaData }
      { readingsComponent }
      { linksComponent }
      <LinkToSheetsSearchComponent/>
    </div>
  );
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
            <a href={'/' + tref.url} data-target-module={Sefaria.LIBRARY_MODULE} className="contentText"><InterfaceText text={{en:tref.en, he:norm_hebrew_ref(tref.he)}} /></a>
        </div>
        <div className="aliyot">
        {
            parashaData.parasha?.extraDetails?.aliyot?.map((aliya, index) => {
               let sectionNum = index+1;
               let sectionStr = sectionNum <= 7 ? sectionNum : 'M';
               let heSectionStr = sectionNum <= 7 ? Sefaria.hebrew.encodeHebrewNumeral(sectionNum) : 'מ';
               return (
                  <a className="sectionLink" data-target-module={Sefaria.LIBRARY_MODULE} href={"/" + Sefaria.normRef(aliya)} data-ref={aliya} key={aliya}>
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
                    <a href={'/' + h.url} data-target-module={Sefaria.LIBRARY_MODULE} className="contentText" key={h.url}>
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
