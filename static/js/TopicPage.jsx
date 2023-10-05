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
  TextPassage,
  IntroducedTextPassage
} from './Story';
import {
    TabView,
    LoadingMessage,
    Link,
    ResponsiveNBox,
    InterfaceText,
    FilterableList,
    ToolTipped,
    SimpleLinkedBlock,
    CategoryHeader,
} from './Misc';


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
    const aAvailLangs = a.order.availableLangs;
    const bAvailLangs = b.order.availableLangs;
    if ((Sefaria.interfaceLang === 'english') &&
      (a.order.curatedPrimacy.en > 0 || b.order.curatedPrimacy.en > 0)) {
      return b.order.curatedPrimacy.en - a.order.curatedPrimacy.en; }
    else if ((Sefaria.interfaceLang === 'hebrew') &&
      (a.order.curatedPrimacy.he > 0 || b.order.curatedPrimacy.he > 0)) {
      return b.order.curatedPrimacy.he - a.order.curatedPrimacy.he;
    }
    if (Sefaria.interfaceLang === 'english' && aAvailLangs.length !== bAvailLangs.length) {
      if (aAvailLangs.indexOf('en') > -1) { return -1; }
      if (bAvailLangs.indexOf('en') > -1) { return 1; }
      return 0;
    }
    else if (a.order.custom_order !== b.order.custom_order) { return b.order.custom_order - a.order.custom_order; }  // custom_order, when present, should trump other data
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

const refRenderWrapper = (toggleSignUpModal, topicData, topicTestVersion) => item => {
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

  const hasPrompts = text.descriptions && text.descriptions[langKey] && text.descriptions[langKey].title;

  // When running a test, topicTestVersion is respected.
  // const Passage = (topicTestVersion && hasPrompts) ? IntroducedTextPassage : TextPassage;
  const Passage = hasPrompts ? IntroducedTextPassage : TextPassage;
  return (
    <Passage
      key={item[0]}
      topic={topicData.slug}
      text={text}
      afterSave={afterSave}
      toggleSignUpModal={toggleSignUpModal}
      bodyTextIsLink= {true}
    />
  );
};


const sheetRenderWrapper = (toggleSignUpModal) => item => (
  <SheetBlock key={item.sheet_id} sheet={item} toggleSignUpModal={toggleSignUpModal}/>
);


const hardcodedTopicImagesMap = {
  'Rosh Hashanah': {'photoLink':'https://museums.cjh.org/web/objects/common/webmedia.php?irn=11469&reftable=ecatalogue&refirn=6640', 
                   'enCaption':'Rosh Hashanah, Arthur Szyk (1894-1951) Tempera and ink on paper. New Canaan, 1948. Collection of Yeshiva University Museum. Gift of Charles Frost', 
                   'heCaption': 'ראש השנה, ארתור שיק, ארה״ב 1948. אוסף ישיבה יוניברסיטי'},

  'Yom Kippur': {'photoLink':'https://www.bl.uk/IllImages/BLCD/big/K900/K90075-77.jpg', 
                 'enCaption':'Micrography of Jonah being swallowed by the fish. Germany, 1300-1500, The British Library', 
                 'heCaption': 'מיקרוגרפיה של יונה בבטן הדג, מתוך ספר יונה ההפטרה של יום כיפור, 1300-1500'},

  'The Four Species': {'photoLink':'https://res.cloudinary.com/the-jewish-museum/image/fetch/q_auto,f_auto/v1/https%3A%2F%2Fthejm.netx.net%2Ffile%2Fasset%2F34234%2Fview%2F52568%2Fview_52568%3Ftoken%3D5d5cdc57-6399-40b5-afb0-93139921700e', 
                       'enCaption':'Etrog container, K B, late 19th century, Germany. The Jewish Museum, Gift of Dr. Harry G. Friedman', 
                       'heCaption': 'תיבת אתרוג, סוף המאה ה19, גרמניה. המוזיאון היהודי בניו יורק, מתנת דר. הארי ג. פרידמן  '},

  'Sukkot': {'photoLink':'https://www.bl.uk/IllImages/BLCD/big/d400/d40054-17a.jpg', 
             'enCaption':'Detail of a painting of a sukkah. Image taken from f. 316v of Forli Siddur. 1383, Italian rite. The British Library', 
             'heCaption': 'פרט ציור של סוכה עם שולחן פרוש ושלוש דמויות. דימוי מתוך סידור פורלי, 1383 איטליה'},

  'Simchat Torah': {'photoLink':'https://upload.wikimedia.org/wikipedia/commons/4/4d/Rosh_Hashanah_greeting_card_%287974345646%29.jpg?20150712114334', 
                    'enCaption':'Rosh Hashanah postcard: Hakafot, Haim Yisroel Goldberg (1888-1943) Publisher: Williamsburg Post Card Co. Germany, ca. 1915 Collection of Yeshiva University Museum', 
                    'heCaption': 'גלויה לראש השנה: הקפות, חיים גולדברג, גרמניה 1915, אוסף ישיבה יוניברסיטי'},

  'Shabbat': {'photoLink':'https://res.cloudinary.com/the-jewish-museum/image/fetch/q_auto,f_auto/v1/https%3A%2F%2Fthejm.netx.net%2Ffile%2Fasset%2F35064%2Fview%2F61838%2Fview_61838%3Ftoken%3D5d5cdc57-6399-40b5-afb0-93139921700e', 
              'enCaption':'Friday Evening, Isidor Kaufmann, Austria c. 1920. The Jewish Museum, Gift of Mr. and Mrs. M. R. Schweitzer', 
              'heCaption': 'שישי בערב, איזידור קאופמן, וינה 1920. המוזיאון היהודי בניו יורק, מתנת  מר וגברת מ.ר. שוויצר'},

};


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
                <InterfaceText markdown={{en: description.en, he: description.he}} />
              </div>
              : null }
            </div>
        );
      });

    const sidebarModules = [
      {type: "Promo"},
      {type: "TrendingTopics"},
      {type: "SponsorADay"},
    ];
    if (topicData.description) {
      sidebarModules.unshift({
        type: "TitledText",
        props: {
          enTitle: "About",
          heTitle: Sefaria._("About"),
          enText: topicData.description.en,
          heText: topicData.description.he
        }
      });
    }

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
        }

    };
    const sponsorship_language = topic_sponsorship_map[topic_slug];
    if (!sponsorship_language) return null;

    return (
        <div className="dedication">
            <InterfaceText text={sponsorship_language}/>
        </div>
    );
}

const TopicHeader = ({ topic, topicData, topicTitle, multiPanel, isCat, setNavTopic, openDisplaySettings, openSearch }) => {
  const { en, he } = !!topicData && topicData.primaryTitle ? topicData.primaryTitle : {en: "Loading...", he: "טוען..."};
  const isTransliteration = !!topicData ? topicData.primaryTitleIsTransliteration : {en: false, he: false};
  const category = !!topicData ? Sefaria.topicTocCategory(topicData.slug) : null;
  const topicImageKey = topicTitle.en;
  const tpTopImg = topicImageKey in hardcodedTopicImagesMap && !multiPanel ? <TopicImage photoLink={hardcodedTopicImagesMap[topicImageKey].photoLink} enCaption={hardcodedTopicImagesMap[topicImageKey].enCaption} heCaption={hardcodedTopicImagesMap[topicImageKey].heCaption}/> : null;
  return (
    <div>
      
        <div className="navTitle tight">
                <CategoryHeader type="topics" data={topicData} buttonsToDisplay={["source", "edit", "reorder"]}>
                <h1>
                    <InterfaceText text={{en:en, he:he}}/>
                </h1>
                </CategoryHeader>
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
       {topicData?.indexes?.length ?
        <div>
          <div className="sectionTitleText authorIndexTitle"><InterfaceText>Works on Sefaria</InterfaceText></div>
          <div className="authorIndexList">
            {topicData.indexes.map(({text, url}) => <SimpleLinkedBlock key={url} {...text} url={url} classes="authorIndex" />)}
          </div>
        </div>
       : null}
    </div>
);}

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
      key: 'sources',
      fetcher: fetchBulkText.bind(null, translationLanguagePreference),
      sortOptions: ['Relevance', 'Chronological'],
      filterFunc: refFilter,
      sortFunc: refSort,
      renderWrapper: refRenderWrapper,
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
    const [showFilterHeader, setShowFilterHeader] = useState(false);
    const tabDisplayData = useTabDisplayData(translationLanguagePreference, versionPref);

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

    // Set up tabs and register incremental load hooks
    const displayTabs = [];
    let onClickFilterIndex = 2;
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
      if (topicData?.tabs?.[key]) {
        displayTabs.push({
          title: topicData.tabs[key].title,
          id: key,
        });
      }
    }
    if (displayTabs.length) {
      displayTabs.push({
        title: {
          en: "Filter",
          he: Sefaria._("Filter")
        },
        id: 'filter',
        icon: `/static/icons/arrow-${showFilterHeader ? 'up' : 'down'}-bold.svg`,
        justifyright: true
      });
      onClickFilterIndex = displayTabs.length - 1;
    }
    const classStr = classNames({topicPanel: 1, readerNavMenu: 1});
    return <div className={classStr}>
        <div className="content noOverflowX" ref={scrollableElement}>
            <div className="columnLayout">
               <div className="mainColumn storyFeedInner">
                    <TopicHeader topic={topic} topicData={topicData} topicTitle={topicTitle} multiPanel={multiPanel} setNavTopic={setNavTopic} openSearch={openSearch} openDisplaySettings={openDisplaySettings} />
                    {(!topicData.isLoading && displayTabs.length) ?
                       <TabView
                          currTabName={tab}
                          setTab={setTab}
                          tabs={displayTabs}
                          renderTab={t => (
                            <div className={classNames({tab: 1, noselect: 1, filter: t.justifyright, open: t.justifyright && showFilterHeader})}>
                              <InterfaceText text={t.title} />
                              { t.icon ? <img src={t.icon} alt={`${t.title.en} icon`} /> : null }
                            </div>
                          )}
                          containerClasses={"largeTabs"}
                          onClickArray={{[onClickFilterIndex]: ()=>setShowFilterHeader(!showFilterHeader)}}
                        >
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
                                  renderItem={renderWrapper(toggleSignUpModal, topicData, topicTestVersion)}
                                  onSetTopicSort={onSetTopicSort}
                                  topicSort={topicSort}
                                />
                              );
                            })
                          }
                        </TabView>
                    : (topicData.isLoading ? <LoadingMessage /> : null) }
                </div>
                <div className="sideColumn">
                  {topicData ? (
                    <>
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
                      />
                      {!topicData.isLoading && <Promotions/>}
                    </>
                  ) : null}
                </div>
            </div>
            <Footer />
          </div>
      </div>;
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
  return (
    <div className="topicTabContents">
      {!!data ?
        <div className={classes}>
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
  <Link className="relatedTopic" href={`/topics/${isCategory ? 'category/' : ''}${topic}`}
    onClick={onClick.bind(null, topic, topicTitle)} key={topic}
    title={topicTitle.en}
  >
    <InterfaceText text={{en:topicTitle.en, he:topicTitle.he}}/>
  </Link>
);
TopicLink.propTypes = {
  topic: PropTypes.string.isRequired,
  clearAndSetTopic: PropTypes.func.isRequired,
  isTransliteration: PropTypes.object,
};


const TopicSideColumn = ({ slug, links, clearAndSetTopic, parashaData, tref, setNavTopic, timePeriod, properties, topicTitle, multiPanel }) => {
  const category = Sefaria.topicTocCategory(slug);
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
  const topicMetaData = <TopicMetaData timePeriod={timePeriod} properties={properties} topicTitle={topicTitle} multiPanel={multiPanel}/>;
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
                TopicLink({
                  topic:l.topic, topicTitle: l.title,
                  onClick: l.isCategory ? setNavTopic : clearAndSetTopic,
                  isTransliteration: l.titleIsTransliteration,
                  isCategory: l.isCategory
                })
              )
            }
          </TopicSideSection>
        );
      })
    : null
  );
  return (
    <div className={"topicSideColumn"}>
      { readingsComponent }
      { topicMetaData }
      { linksComponent }
    </div>
  )
}
TopicSideColumn.propTypes = {
  topicData: PropTypes.object,
  clearAndSetTopic: PropTypes.func.isRequired,
};


const TopicSideSection = ({ title, children, hasMore }) => {
  const [showMore, setShowMore] = useState(false);
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
          <div className="sideColumnMore sans-serif" onClick={() => setShowMore(!showMore)}>
            <InterfaceText>{ showMore ? "Less" : "More" }</InterfaceText>
          </div>
        )
        : null
      }
    </div>
  );
}

const TopicImage = ({photoLink, enCaption, heCaption }) => {
  
  return (
    <div class="topicImage">
        <img class="topicPhoto" src={photoLink}/>
        <div class="topicImageCaption"> 
          <InterfaceText text={{en:enCaption, he:heCaption}}  />
        </div>
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


const TopicMetaData = ({ topicTitle, timePeriod, multiPanel, properties={} }) => {
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
            return (
              <SimpleLinkedBlock
                key={url} en={propObj.title + (urlExists ? "" : " (Hebrew)")} he={Sefaria._(propObj.title) + (urlExists ? "" : ` (${Sefaria._("English")})`)}
                url={url} aclasses={"systemText topicMetaData"} openInNewTab
              />
            );
          })
        }
      </TopicSideSection>
  ) : null;
  const topicImageKey = topicTitle.en;
  const tpSidebarImg = topicImageKey in hardcodedTopicImagesMap && multiPanel ? <TopicImage photoLink={hardcodedTopicImagesMap[topicImageKey].photoLink} enCaption={hardcodedTopicImagesMap[topicImageKey].enCaption} heCaption={hardcodedTopicImagesMap[topicImageKey].heCaption}/> : null;
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
  refSort
}
