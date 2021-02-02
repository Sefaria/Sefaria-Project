import {
  CategoryAttribution,
  NBox,
  LanguageToggleButton,
} from './Misc';
import React  from 'react';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import NavSidebar from './NavSidebar';
import Footer  from './Footer';
import MobileHeader from './MobileHeader';


// Navigation Menu for a single category of texts (e.g., "Tanakh", "Bavli")
const ReaderNavigationCategoryMenu = ({category, categories, setCategories,
            toggleLanguage, openDisplaySettings, navHome, width, compare, hideNavHeader,
            contentLang, interfaceLang}) => {

    // Show Talmud with Toggles
    const cats  = categories[0] === "Talmud" && categories.length === 1 ?
                        ["Talmud", "Bavli"] : categories;
    const aboutCats = categories[0] === "Talmud" && categories.length === 2 ?
                        ["Talmud"] : categories;
    let catTitle = '', heCatTitle = '';

    if (cats[0] === "Talmud" && cats.length === 2) {
      catTitle   = cats[0];
      heCatTitle = Sefaria.hebrewTerm(cats[0]);
    } else {
      if (category === "Commentary") {
        const onCat = cats.slice(-2)[0];
        catTitle   = onCat + " Commentary";
        heCatTitle = Sefaria.hebrewTerm(onCat) + " " + Sefaria.hebrewTerm("Commentary");  // HEBREW NEEDED
      } else {
        catTitle   = category;
        heCatTitle = Sefaria.hebrewTerm(category);
      }
    }

    const tocObject = Sefaria.tocObjectByCategories(cats);

    const catContents    = Sefaria.tocItemsByCategories(cats);
    const nestLevel      = category === "Commentary" ? 1 : 0;
    const aboutModule = Sefaria._showDescriptionAtTop ? [] : [
      {type: "AboutTextCategory", props: {cats: aboutCats}},
    ];

    const sidebarModules = aboutModule.concat(getSidebarModules(cats));

    const talmudToggle   = <TalmudToggle categories={cats} setCategories={setCategories} />
    const footer         = compare ? null : <Footer />;
    const navMenuClasses = classNames({readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: hideNavHeader, noLangToggleInHebrew: 1, compare: compare});
    const contentClasses = classNames({content: 1, hasFooter: footer != null});
    return (<div className={navMenuClasses}>
              <MobileHeader
                mode={'innerTOC'}
                hideNavHeader={hideNavHeader}
                interfaceLang={interfaceLang}
                category={cats[0]}
                openDisplaySettings={openDisplaySettings}
                navHome={navHome}
                compare={compare}
                catTitle={catTitle}
                heCatTitle={heCatTitle}
              />
              <div className={contentClasses}>
                <div className="sidebarLayout">
                  <div className="contentInner">
                    {hideNavHeader ? 
                    <div className="navTitle">
                      <h1>
                        <span className="en">{catTitle}</span>
                        <span className="he">{heCatTitle}</span>
                      </h1>
                      {talmudToggle}
                      {interfaceLang !== "hebrew"  && Sefaria._siteSettings.TORAH_SPECIFIC ? <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null }
                    </div> : {talmudToggle} }
                    {Sefaria._showDescriptionAtTop ? 
                    <div className="categoryDescription top">
                      <span className="en">{tocObject.enDesc}</span>
                      <span className="he">{tocObject.heDesc}</span>
                    </div> : null}
                    <CategoryAttribution categories={cats} />
                    <ReaderNavigationCategoryMenuContents
                      contents={catContents}
                      categories={cats}
                      width={width}
                      category={category}
                      contentLang={contentLang}
                      nestLevel={nestLevel} />
                  </div>
                  <NavSidebar modules={sidebarModules} />
                </div>
              </div>
            </div>);
};
ReaderNavigationCategoryMenu.propTypes = {
  category:            PropTypes.string.isRequired,
  categories:          PropTypes.array.isRequired,
  setCategories:       PropTypes.func.isRequired,
  toggleLanguage:      PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func.isRequired,
  navHome:             PropTypes.func.isRequired,
  width:               PropTypes.number,
  compare:             PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  contentLang:         PropTypes.string,
  interfaceLang:       PropTypes.string,
};


// Inner content of Category menu (just category title and boxes of texts/subcategories)
const ReaderNavigationCategoryMenuContents = ({category, contents, categories, contentLang, width, nestLevel}) =>  {
  const content = [];
  const cats = categories || [];
  const showInHebrew = contentLang === "hebrew" || Sefaria.interfaceLang === "hebrew";
  const sortedContents = showInHebrew ? hebrewContentSort(contents) : contents;

  for (const item of sortedContents) {

    if (item.category) {
      // Category
      const newCats = cats.concat(item.category);

      // Special Case categories which should nest but normally wouldn't given their depth   ["Mishneh Torah", "Shulchan Arukh", "Tur"]
      if (item.isPrimary || nestLevel > 0) {

        // There's just one text in this category, render the text.
        if(item.contents && item.contents.length === 1 && !("category" in item.contents[0])) {
            const chItem = item.contents[0];
            if (chItem.hidden) { continue; }
            content.push((
                <TextMenuItem item={chItem} category={category} showInHebrew={showInHebrew} nestLevel={nestLevel}/>
            ));

        // Create a link to a subcategory
        } else {
          content.push((
              <MenuItem
                href        = {"/texts/" + newCats.join("/")}
                incomplete  = {showInHebrew ? !item.heComplete : !item.enComplete}
                cats        = {newCats}
                title       = {item.category}
                heTitle     = {item.heCategory}
              />
          ));
        }

      // Add a nested subcategory
      } else {
        content.push((<div className='category' key={"cat." + nestLevel + "." + item.category}>
                        <h2>
                          <span className='en'>{item.category}</span>
                          <span className='he'>{item.heCategory}</span>
                        </h2>
                        {item.enShortDesc || item.heShortDesc ? 
                        <div className="categoryDescription">
                          <span className='en'>{item.enShortDesc}</span>
                          <span className='he'>{item.heShortDesc}</span>
                        </div> : null }
                        <ReaderNavigationCategoryMenuContents
                          contents      = {item.contents}
                          categories    = {newCats}
                          width         = {width}
                          nestLevel     = {nestLevel + 1}
                          category      = {item.category}
                          contentLang   = {contentLang} />
                      </div>));
      }

    // Add a Collection
    } else if (item.isCollection) {
        content.push((
            <MenuItem
                href        = {"/collections/" + item.slug}
                nestLevel   = {nestLevel}
                title       = {item.title}
                heTitle     = {item.heTitle}
            />
        ));

    // Skip hidden texts
    } else if (item.hidden) {
        continue;

    // Add a Text
    } else {
        content.push((
            <TextMenuItem item={item} category={category} showInHebrew={showInHebrew} nestLevel={nestLevel}/>
        ));
    }
  }

  const boxedContent = [];
  let currentRun   = [];
  let i;
  for (i = 0; i < content.length; i++) {
    // Walk through content looking for runs of texts/subcats to group together into a table
    if (content[i].type === "div") { // this is a subcategory
      if (currentRun.length) {
        boxedContent.push((<NBox content={currentRun} n={2} key={i} />));
        currentRun = [];
      }
      boxedContent.push(content[i]);
    } else  { // this is a single text
      currentRun.push(content[i]);
    }
  }
  if (currentRun.length) {
    boxedContent.push((<NBox content={currentRun} n={2} key={i} />));
  }
  return (<div>{boxedContent}</div>);

};
ReaderNavigationCategoryMenuContents.propTypes = {
  category:    PropTypes.string.isRequired,
  contents:    PropTypes.array.isRequired,
  categories:  PropTypes.array.isRequired,
  contentLang: PropTypes.string,
  width:       PropTypes.number,
  nestLevel:   PropTypes.number
};
ReaderNavigationCategoryMenuContents.defaultProps = {
  contents: []
};


const MenuItem = ({href, dref, nestLevel, title, heTitle, cats, incomplete, enDesc, heDesc}) => {
  const keytype  = !!cats ? "cat" : "text";
  const classes = classNames({ navBlockTitle: 1, incomplete: incomplete});
  return (
    <div className="navBlock">
      <a href={href}
        className   = {classes}
        data-ref    = {dref ? dref : null}
        data-cats   = {cats ? cats.join("|") : null}
        key         = {keytype + "." + nestLevel + "." + title}
      >
        <span className='en'>{title}</span>
        <span className='he'>{heTitle}</span>
      </a>
      {enDesc || heDesc ? 
      <div className="navBlockDescription">
        <span className='en'>{enDesc}</span>
        <span className='he'>{heDesc}</span>
      </div> : null }
    </div>
  );
};


const TextMenuItem = ({item, category, showInHebrew, nestLevel}) => {
  const [title, heTitle] = getRenderedTextTitleString(item.title, item.heTitle, category);
  const lastPlace = Sefaria.lastPlaceForText(item.title);
  const ref =  lastPlace ? lastPlace.ref : item.firstSection;
  return (
    <MenuItem
      href        = {"/" + Sefaria.normRef(ref)}
      incomplete  = {showInHebrew ? !item.heComplete : !item.enComplete}
      dref        = {ref}
      nestLevel   = {nestLevel}
      title       = {title}
      heTitle     = {heTitle}
      enDesc      = {item.enShortDesc}
      heDesc      = {item.heShortDesc}
    />
  );
};


const TalmudToggle = ({categories, setCategories}) => {
    if ( categories.length !== 2 || categories[0] !== "Talmud") {
        return null;
    }

    const setBavli = () => { setCategories(["Talmud", "Bavli"]); };
    const setYerushalmi = () => { setCategories(["Talmud", "Yerushalmi"]); };
    const bClasses = classNames({navToggle: 1, active: categories[1] === "Bavli"});
    const yClasses = classNames({navToggle: 1, active: categories[1] === "Yerushalmi", second: 1});

    return (<div className="navToggles">
                <span className={bClasses} onClick={setBavli}>
                  <span className="en">Bavli</span>
                  <span className="he">בבלי</span>
                </span>
                <span className={yClasses} onClick={setYerushalmi}>
                  <span className="en">Yerushalmi</span>
                  <span className="he">ירושלמי</span>
                </span>
    </div>);
};


const getRenderedTextTitleString = (title, heTitle, category) => {

    const whiteList = ['Imrei Yosher on Ruth', 'Duties of the Heart (abridged)'];  // ['Midrash Mishlei', 'Midrash Tehillim', 'Midrash Tanchuma', 'Midrash Aggadah'];
    if (whiteList.indexOf(title) > -1) {
        return [title, heTitle];
    }

    const displayCategory = category;
    const displayHeCategory = Sefaria.hebrewTerm(category);
    const replaceTitles = {
        "en": ['Jerusalem Talmud', displayCategory],
        "he": ['תלמוד ירושלמי', displayHeCategory]
    };
    const replaceOther = {
        "en" : [", ", "; ", " on ", " to ", " of "],
        "he" : [", ", " על "]
    };

    //this will replace a category name at the beginning of the title string and any connector strings (0 or 1) that follow.
    const titleRe = new RegExp(`^(${replaceTitles['en'].join("|")})(${replaceOther['en'].join("|")})?`);
    const heTitleRe = new RegExp(`^(${replaceTitles['he'].join("|")})(${replaceOther['he'].join("|")})?`);
    title   = title === displayCategory ? title : title.replace(titleRe, "");
    heTitle = heTitle === displayHeCategory ? heTitle : heTitle.replace(heTitleRe, "");

    return [title, heTitle];
};


const hebrewContentSort = (enCats) => {
    // Sorts contents of this category by Hebrew Alphabetical
    //console.log(cats);
    const heCats = enCats.slice().map(function(item, indx) {
      item.enOrder = indx;
      return item;
    });

    // If all of the cats have a base_text_order, don't re-sort.
    if (heCats.every(c => !!c.base_text_order))   {
        return heCats;
    }
    heCats.sort(function(a, b) {
      if ("order" in a || "order" in b) {
        const aOrder = "order" in a ? a.order : 9999;
        const bOrder = "order" in b ? b.order : 9999;
        return aOrder > bOrder ? 1 : -1;

      } else if (("category" in a) !== ("category" in b)) {
        return a.enOrder > b.enOrder ? 1 : -1;

      //} else if (a.heComplete !== b.heComplete) {
      //  return a.heComplete ? -1 : 1;

      } else if (a.heTitle && b.heTitle) {
        return a.heTitle > b.heTitle ? 1 : -1;

      }
      return a.enOrder > b.enOrder ? 1 : -1;
    });
    //console.log(heCats)
    return heCats;
  };


const getSidebarModules = (categories) => {
  const path = categories.join("|");

  const modules = {
    "Tanakh": [
      {type: "WeeklyTorahPortion"},
      {type: "PopularTexts", props: {texts: ["Genesis", "Psalms", "Isaiah", "Job", "Proverbs"]}}
    ],
    "Talmud|Bavli": [
      {type: "DafYomi"},
      {type: "PopularTexts", props: {texts: ["Sanhedrin", "Bava Metzia", "Shabbat", "Berakhot", "Kiddushin"]}}      
    ]
  };

  const customModules = path in modules ? modules[path] : [];

  const defaultModules = [
    {type: "SponsorADay"}
  ]; 

  return customModules.concat(defaultModules);

};


export default ReaderNavigationCategoryMenu;
