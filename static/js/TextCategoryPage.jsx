import React, { useContext, useState }  from 'react';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import { ContentLanguageContext } from './context';
import { NavSidebar } from './NavSidebar';
import Footer  from './Footer';
import ComparePanelHeader from './ComparePanelHeader';
import {
  CategoryAttribution,
  CategoryColorLine,
  ResponsiveNBox,
  LanguageToggleButton,
  InterfaceText,
  CategoryHeader
} from './Misc';
import {ContentText} from "./ContentText";


// Navigation Menu for a single category of texts (e.g., "Tanakh", "Bavli")
const TextCategoryPage = ({category, categories, setCategories, toggleLanguage,
  openDisplaySettings, onCompareBack, openTextTOC, multiPanel, initialWidth, compare }) => {
  const contentLang = useContext(ContentLanguageContext).language;
  // Show Talmud with Toggles
  const cats  = categories[0] === "Talmud" && categories.length === 1 ?
                      ["Talmud", "Bavli"]
                      : (categories[0] === "Tosefta" && categories.length === 1) ?
                      ["Tosefta", "Vilna Edition"]
                      : categories;
  const aboutCats = categories[0] === "Talmud" && categories.length === 2 ?
                      ["Talmud"] : categories;
  
  let catTitle = '', heCatTitle = '';

  if ((cats[0] === "Talmud" || cats[0] === "Tosefta") && cats.length === 2) {
    category   = cats[0]; 
    catTitle   = cats[0];
    heCatTitle = Sefaria.hebrewTerm(cats[0]);
  } else {
    if (category === "Commentary") {
      const onCat = cats.slice(-2)[0];
      catTitle   = onCat + " Commentary";
      heCatTitle = Sefaria.hebrewTerm(onCat) + " " + Sefaria.hebrewTerm("Commentary");
    } else {
      catTitle   = category;
      heCatTitle = Sefaria.hebrewTerm(category);
    }
  }

  const tocObject = Sefaria.tocObjectByCategories(cats);
  const catContents = Sefaria.tocItemsByCategories(cats);
  const nestLevel   = category === "Commentary" ? 1 : 0;
  const aboutModule = [
    multiPanel ? {type: "AboutTextCategory", props: {cats: aboutCats}} : {type: null},
  ];

  const sidebarModules = aboutModule.concat(getSidebarModules(cats));
  const categoryToggle = (<SubCategoryToggle categories={cats} setCategories={setCategories} />);
  const title = compare ? categoryToggle :
    <div className="navTitle">
        <CategoryHeader data={cats} type="cats">
            <h1>
            <ContentText text={{en: catTitle, he: heCatTitle}} defaultToInterfaceOnBilingual={true} />
            </h1>
        </CategoryHeader>
      {categoryToggle}
      {multiPanel && Sefaria.interfaceLang !== "hebrew"  && Sefaria._siteSettings.TORAH_SPECIFIC ? 
      <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null }
    </div>;

  const comparePanelHeader = compare ? (
    <ComparePanelHeader
      category={cats[0]}
      openDisplaySettings={openDisplaySettings}
      onBack={() => setCategories(aboutCats.slice(0, -1))}
      catTitle={catTitle}
      heCatTitle={heCatTitle} />
  ) : null;

  const footer         = compare ? null : <Footer />;
  const navMenuClasses = classNames({readerNavCategoryMenu: 1, readerNavMenu: 1, noLangToggleInHebrew: 1, compare: compare});
  return (
    <div className={navMenuClasses}>
      <CategoryColorLine category={categories[0]} />
      { comparePanelHeader }
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner followsContentLang">
            { title }
            {!multiPanel ? 
            <div className="categoryDescription top sans-serif">
              <ContentText text={{en: tocObject.enDesc, he: tocObject.heDesc}} defaultToInterfaceOnBilingual={true} />
            </div> : null}
            <CategoryAttribution categories={cats} asEdition={true} />
            <TextCategoryContents
              contents={catContents}
              categories={cats}
              category={category}
              setCategories={setCategories}
              openTextTOC={openTextTOC}
              initialWidth={initialWidth}
              nestLevel={nestLevel} />
          </div>
          {!compare ? <NavSidebar modules={sidebarModules} /> : null}
        </div>
        {footer}
      </div>
    </div>
  );
};
TextCategoryPage.propTypes = {
  category:            PropTypes.string.isRequired,
  categories:          PropTypes.array.isRequired,
  setCategories:       PropTypes.func.isRequired,
  toggleLanguage:      PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func.isRequired,
  initialWidth:        PropTypes.number,
  compare:             PropTypes.bool,
};

// Recursive content of text category listing (including category title and lists of texts/subcategories)
const TextCategoryContents = ({category, contents, categories, setCategories, openTextTOC, initialWidth, nestLevel}) => {
  const content = [];
  const cats = categories || [];
  const contentLang = useContext(ContentLanguageContext).language;
  const sortedContents = contentLang === "hebrew" ? hebrewContentSort(contents) : contents;

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
          const onClick = e => {
            if (openTextTOC) {
              e.preventDefault();
              openTextTOC(chItem.title);
            }
          };
          content.push(
            <TextMenuItem
              item={chItem}
              categories={categories}
              onClick={onClick}
              nestLevel={nestLevel} />
          );

        // Create a link to a subcategory
        } else {
          content.push((
            <MenuItem
              href        = {"/texts/" + newCats.join("/")}
              onClick     = {(e) => {e.preventDefault(); setCategories(newCats)}}
              cats        = {newCats}
              title       = {item.category}
              heTitle     = {item.heCategory}
              enDesc      = {item.enShortDesc}
              heDesc      = {item.heShortDesc}
            />
          ));
        }

      // Add a nested subcategory
      } else {
        let shortDesc = contentLang === "hebrew" ? item.heShortDesc : item.enShortDesc;
        const hasDesc  = !!shortDesc;
        const longDesc = hasDesc && shortDesc.split(" ").length > 5;
        shortDesc = hasDesc && !longDesc ? `(${shortDesc})` : shortDesc;
        content.push(
          <div className='category' key={"cat." + nestLevel + "." + item.category}>
            <CategoryHeader data={newCats} type="cats">
                 <h2>
                 <ContentText text={{en: item.category, he: item.heCategory}} defaultToInterfaceOnBilingual={true} />
                 {hasDesc && !longDesc ?
                 <span className="categoryDescription">
                   <ContentText text={{en: shortDesc, he: shortDesc}} defaultToInterfaceOnBilingual={true} />
                 </span> : null }
               </h2>
            </CategoryHeader>
            {hasDesc && longDesc ?
              <div className="categoryDescription long sans-serif">
                <ContentText text={{en: shortDesc, he: shortDesc}} defaultToInterfaceOnBilingual={true} />
              </div> : null }
            <TextCategoryContents
              contents      = {item.contents}
              categories    = {newCats}
              category      = {item.category}
              setCategories = {setCategories}
              openTextTOC   = {openTextTOC}
              initialWidth  = {initialWidth}
              nestLevel     = {nestLevel + 1}
            />
          </div>
        );
      }

    // Add a Collection
    } else if (item.isCollection) {
        content.push(
          <MenuItem
            href        = {"/collections/" + item.slug}
            nestLevel   = {nestLevel}
            title       = {item.title}
            heTitle     = {item.heTitle}
            enDesc      = {item.enShortDesc}
            heDesc      = {item.heShortDesc} />
        );

    // Skip hidden texts
    } else if (item.hidden) {
        continue;

    // Add a Text
    } else {
        const onClick = e => {
          if (openTextTOC) {
            e.preventDefault();
            openTextTOC(item.title);
          }
        };
        content.push((
          <TextMenuItem 
            item={item}
            categories={categories}
            onClick={onClick}
            nestLevel={nestLevel} />
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
        boxedContent.push((<ResponsiveNBox content={currentRun} intialWidth={initialWidth} key={i} />));
        currentRun = [];
      }
      boxedContent.push(content[i]);
    } else  { // this is a single text
      currentRun.push(content[i]);
    }
  }
  if (currentRun.length) {
    boxedContent.push((<ResponsiveNBox content={currentRun} initialWidth={initialWidth} key={i} />));
  }
  return (<div>{boxedContent}</div>);

};
TextCategoryContents.propTypes = {
  category:     PropTypes.string.isRequired,
  contents:     PropTypes.array.isRequired,
  categories:   PropTypes.array.isRequired,
  initialWidth: PropTypes.number,
  nestLevel:    PropTypes.number
};
TextCategoryContents.defaultProps = {
  contents: []
};


const MenuItem = ({href, nestLevel, title, heTitle, cats, onClick, enDesc, heDesc}) => {
  const keytype  = !!cats ? "cat" : "text";
  const classes = classNames({ navBlockTitle: 1 });
  return (
    <div className="navBlock">
      <a href={href}
        className   = {classes}
        onClick     = {onClick}
        data-cat    = {cats ? cats.slice(-1) : null} // This is only used for Selenium test, would like to get rid of it
        key         = {keytype + "." + nestLevel + "." + title}
      >
        <ContentText text={{en: title, he: heTitle}} />
      </a>
      {enDesc || heDesc ? 
      <div className="navBlockDescription">
        <ContentText text={{en: enDesc, he: heDesc}} />
      </div> : null }
    </div>
  );
};


const TextMenuItem = ({item, categories, nestLevel, onClick}) => {
  const [title, heTitle] = getRenderedTextTitleString(item.title, item.heTitle, categories);
  return (
    <MenuItem
      href        = {"/" + Sefaria.normRef(item.title)}
      onClick     = {onClick}
      nestLevel   = {nestLevel}
      title       = {title}
      heTitle     = {heTitle}
      enDesc      = {item.enShortDesc}
      heDesc      = {item.heShortDesc}
    />
  );
};


const SubCategoryToggle = ({categories, setCategories}) => {
    const toggleEnableMap = {
      "Talmud": {
          categoryPathDepth: 2,
          subCategories: ["Bavli", "Yerushalmi"],
          subCategoriesDisplay: [{en: "Babylonian", he: "בבלי"}, {en: "Jerusalem", he: "ירושלמי"}]
      },
      "Tosefta": {
          categoryPathDepth: 2,
          subCategories: ["Vilna Edition", "Lieberman Edition"],
          subCategoriesDisplay: [{en: "Vilna", he: "דפוס וילנא"}, {en: "Lieberman", he: "מהדורת ליברמן"}]
      },
    };
    if (!categories.length || !(categories[0] in toggleEnableMap) || categories.length !== toggleEnableMap[categories[0]]["categoryPathDepth"]) {
        return null;
    }
    let options = toggleEnableMap[categories[0]]["subCategories"].map((element, index) => {
        let oClasses = classNames({navToggle: 1, active: categories[1] === element});
        let toggleFunc = () => setCategories([categories[0], element]); //this may need some adjustment if there ever was another toggle not at dpeth 2
        return(
            <span className={oClasses} onClick={toggleFunc}>
              <ContentText text={toggleEnableMap[categories[0]]["subCategoriesDisplay"][index]} />
            </span>
        )
    });
    return (
      <div className="navToggles">
          {options}
      </div>
    );
};


const getRenderedTextTitleString = (title, heTitle, categories) => {
    if (title === "Pesach Haggadah") {
        return ["Pesach Haggadah Ashkenaz", "הגדה של פסח אשכנז"]
    }

    // Don't remove category strings at the beginning of these titles
    const whiteList = ['Imrei Yosher on Ruth', 'Duties of the Heart (abridged)', 'Midrash Mishlei',
        'Midrash Tehillim', 'Midrash Tanchuma', 'Midrash Aggadah', 'Pesach Haggadah Edot Hamizrah',
        "Baal HaSulam's Preface to Zohar", "Baal HaSulam's Introduction to Zohar", 'Zohar Chadash',
        'Midrash Shmuel', 'Midrash Tannaim on Deuteronomy'];
    if (whiteList.indexOf(title) > -1 || categories.slice(-1)[0] === "Siddur") {
        return [title, heTitle];
    }

    const replaceTitles = {
        "en": ['Jerusalem Talmud', 'Tosefta Kifshutah'].concat(categories),
        "he": ['תלמוד ירושלמי', 'תוספתא כפשוטה'].concat(categories.map(Sefaria.hebrewTerm))
    };
    const replaceOther = {
        "en" : [", ", "; ", " on ", " to ", " of "],
        "he" : [", ", " על "]
    };
    const replaceSuffixes = {
        "en" : [" (Lieberman)"],
        "he" : [" (ליברמן)"]
    };

    //this will replace a category name at the beginning of the title string and any connector strings (0 or 1) that follow.
    const titleRe = new RegExp(`^(${replaceTitles['en'].join("|")})(${replaceOther['en'].join("|")})?`);
    const heTitleRe = new RegExp(`^(${replaceTitles['he'].join("|")})(${replaceOther['he'].join("|")})?`);
    title   = categories.indexOf(title) > -1 ? title : title.replace(titleRe, "");
    const heCategories = categories.map(c => Sefaria.hebrewTerm(c));
    heTitle = heCategories.indexOf(heTitle) > -1 ? heTitle : heTitle.replace(heTitleRe, "");

    //couldnt get this to work in one regex (eliminating both prefix stuff above and the suffix stuff below),
    // any engineer seeing this feel free to try and streamline
    const suffixTitleRe = new  RegExp(`(${replaceSuffixes['en'].join("|").replace(/[()]/g, '\\$&')})$`);
    const suffixHeTitleRe = new  RegExp(`(${replaceSuffixes['he'].join("|").replace(/[()]/g, '\\$&')})$`);
    title   = title.replace(suffixTitleRe, "");
    heTitle = heTitle.replace(suffixHeTitleRe, "");

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
          //positive order first, then no order, negative order last
        const aOrder = "order" in a ? -1/a.order : 0;
        const bOrder = "order" in b ? -1/b.order : 0;
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
    ],
    "Talmud|Bavli": [
      {type: "DafYomi"},
    ]
  };

  const customModules = path in modules ? modules[path] : [];

  const defaultModules = [
    {type: "Promo"},
    {type: "Visualizations", props: {categories}},
    {type: "SupportSefaria"},
  ]; 

  return customModules.concat(defaultModules);
};


export default TextCategoryPage;