import {
  CategoryColorLine,
  CategoryAttribution,
  TwoOrThreeBox,
  LanguageToggleButton,
} from './Misc';
import React  from 'react';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import Footer  from './Footer';
import MobileHeader from './MobileHeader';
import Component from 'react-class';


const ReaderNavigationCategoryMenu = ({category, categories, setCategories,
            toggleLanguage, openDisplaySettings, navHome, width, compare, hideNavHeader,
            contentLang, interfaceLang}) => {

      // Navigation Menu for a single category of texts (e.g., "Tanakh", "Bavli")

    // Show Talmud with Toggles
    const cats  = categories[0] === "Talmud" && categories.length === 1 ?
                        ["Talmud", "Bavli"] : categories;
    let catTitle = '', heCatTitle = '', toggle = '';

    if (cats[0] === "Talmud" && cats.length <= 2) {
      const setBavli = () => { setCategories(["Talmud", "Bavli"]); };
      const setYerushalmi = ()=> { setCategories(["Talmud", "Yerushalmi"]); };
      const bClasses = classNames({navToggle:1, active: cats[1] === "Bavli"});
      const yClasses = classNames({navToggle:1, active: cats[1] === "Yerushalmi", second: 1});

      toggle =(<div className="navToggles">
                            <span className={bClasses} onClick={setBavli}>
                              <span className="en">Bavli</span>
                              <span className="he">בבלי</span>
                            </span>
                            <span className="navTogglesDivider">|</span>
                            <span className={yClasses} onClick={setYerushalmi}>
                              <span className="en">Yerushalmi</span>
                              <span className="he">ירושלמי</span>
                            </span>
                         </div>);
      catTitle   = (cats.length > 1) ? cats[0] +  " " + cats[1] : cats[0];
      heCatTitle = (cats.length > 1) ? Sefaria.hebrewTerm(cats[0]) + " " + Sefaria.hebrewTerm(cats[1]): Sefaria.hebrewTerm(cats[0]);
    } else {
      toggle = null;
      if (category === "Commentary") {
        const onCat = cats.slice(-2)[0];
        catTitle   = onCat + " Commentary";
        heCatTitle = Sefaria.hebrewTerm(onCat) + " " + Sefaria.hebrewTerm("Commentary");  // HEBREW NEEDED
      } else {
        catTitle   = category;
        heCatTitle = Sefaria.hebrewTerm(category);
      }

    }
    const catContents    = Sefaria.tocItemsByCategories(cats);
    const nestLevel      = category === "Commentary" ? 1 : 0;
    const footer         = compare ? null : <Footer />;
    const navMenuClasses = classNames({readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: hideNavHeader, noLangToggleInHebrew: 1});
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
                <div className="contentInner">
                  {hideNavHeader ? (<h1>
                      {interfaceLang !== "hebrew"  && Sefaria._siteSettings.TORAH_SPECIFIC ? <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null }
                      <span className="en">{catTitle}</span>
                      <span className="he">{heCatTitle}</span>
                    </h1>) : null}
                  {toggle}
                  <CategoryAttribution categories={cats} />
                  <ReaderNavigationCategoryMenuContents
                    contents={catContents}
                    categories={cats}
                    width={width}
                    category={category}
                    contentLang={contentLang}
                    nestLevel={nestLevel} />
                </div>
                {footer}
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


class ReaderNavigationCategoryMenuContents extends Component {
  // Inner content of Category menu (just category title and boxes of texts/subcategories)
  getRenderedTextTitleString(title, heTitle) {
    const whiteList = ['Midrash Mishlei', 'Midrash Tehillim', 'Midrash Tanchuma'];
    const displayCategory = this.props.category;
    const displayHeCategory = Sefaria.hebrewTerm(this.props.category);
    if (whiteList.indexOf(title) === -1) {
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
    }
    return [title, heTitle];
  }
  hebrewContentSort(cats) {
    // Sorts contents of this category by Hebrew Alphabetical
    //console.log(cats);
    const heCats = cats.slice().map(function(item, indx) {
      item.enOrder = indx;
      return item;
    });

    // If all of the cats have a base_text_order, don't resort.
    if (heCats.every(c => !!c.base_text_order))   {
        //heCats.sort((a,b) => a.base_text_order > b.base_text_order ? 1 : -1);
        return heCats;
    }
    heCats.sort(function(a, b) {
      if ("order" in a || "order" in b) {
        const aOrder = "order" in a ? a.order : 9999;
        const bOrder = "order" in b ? b.order : 9999;
        return aOrder > bOrder ? 1 : -1;

      } else if (("category" in a) !== ("category" in b)) {
        return a.enOrder > b.enOrder ? 1 : -1;

      } else if (a.heComplete !== b.heComplete) {
        return a.heComplete ? -1 : 1;

      } else if (a.heTitle && b.heTitle) {
        return a.heTitle > b.heTitle ? 1 : -1;

      }
      return a.enOrder > b.enOrder ? 1 : -1;
    });
    //console.log(heCats)
    return heCats;
  }
  render() {
      const content = [];
      const cats = this.props.categories || [];
      const contents = this.props.contentLang === "hebrew" || Sefaria.interfaceLang === "hebrew" ?
                      this.hebrewContentSort(this.props.contents)
                      : this.props.contents;
      const subcats = ["Mishneh Torah", "Shulchan Arukh", "Tur"];

      for (let i = 0; i < contents.length; i++) {
        const item = contents[i];
        if (item.category) {
          // Category
          const newCats = cats.concat(item.category);

          // Special Case categories which should nest but normally wouldn't given their depth   ["Mishneh Torah", "Shulchan Arukh", "Tur"]
          if (Sefaria.util.inArray(item.category, subcats) > -1 || this.props.nestLevel > 0) {
            // There's just one text in this category, render the text.
            if(item.contents && item.contents.length === 1 && !("category" in item.contents[0])) {
                const chItem = item.contents[0];
                if (chItem.hidden) { continue; }
                const [title, heTitle] = this.getRenderedTextTitleString(chItem.title, chItem.heTitle);
                const url     = "/" + Sefaria.normRef(chItem.firstSection);
                const incomplete = this.props.contentLang === "hebrew" || Sefaria.interfaceLang === "hebrew" ? !chItem.heComplete : !chItem.enComplete;
                const classes = classNames({refLink: 1, blockLink: 1, incomplete: incomplete});

                content.push((<a href={url} className={classes} data-ref={chItem.firstSection} key={"text." + this.props.nestLevel + "." + i}>
                                <span className='en'>{title}</span>
                                <span className='he'>{heTitle}</span>
                              </a>
                              ));

            } else {
              // Create a link to a subcategory
              const url = "/texts/" + newCats.join("/");
              const incomplete = this.props.contentLang === "hebrew" || Sefaria.interfaceLang === "hebrew" ? !item.heComplete : !item.enComplete;
              const classes = classNames({catLink: 1, blockLink: 1, incomplete: incomplete});
              const catsString = newCats.join("|");
              content.push((<a href={url} className={classes} data-cats={catsString} key={"cat." + this.props.nestLevel + "." + catsString}>
                              <span className='en'>{item.category}</span>
                              <span className='he'>{item.heCategory}</span>
                            </a>
                          ));
            }
          } else {
            // Add a Category
            content.push((<div className='category' key={"cat." + this.props.nestLevel + "." + i}>
                            <h3>
                              <span className='en'>{item.category}</span>
                              <span className='he'>{item.heCategory}</span>
                            </h3>
                            <ReaderNavigationCategoryMenuContents
                              contents={item.contents}
                              categories={newCats}
                              width={this.props.width}
                              nestLevel={this.props.nestLevel + 1}
                              category={this.props.category}
                              contentLang={this.props.contentLang} />
                          </div>));
          }
        } else {
          if (item.isGroup) {
            // Add a Group
            const url = "/groups/" + item.name.replace(/\s/g, "-");
            const classes = classNames({groupLink: 1, blockLink: 1});
            content.push((<a href={url}
                            className={classes}
                            data-group={item.name}
                            key={"group." + this.props.nestLevel + "." + item.name}>
                            <span className='en'>{item.title}</span>
                            <span className='he'>{item.heTitle}</span>
                          </a>
                          ));
          } else {
            if (item.hidden) { continue; }

            // Add a Text
            const [title, heTitle] = this.getRenderedTextTitleString(item.title, item.heTitle);
            const lastPlace = Sefaria.lastPlaceForText(item.title);
            const ref =  lastPlace ? lastPlace.ref : item.firstSection;
            const url = "/" + Sefaria.normRef(ref);
            const incomplete = this.props.contentLang === "hebrew" || Sefaria.interfaceLang === "hebrew" ? !item.heComplete : !item.enComplete;
            const classes = classNames({refLink: 1, blockLink: 1, incomplete: incomplete});
            content.push((<a href={url}
                            className={classes}
                            data-ref={ref}
                            key={"text." + this.props.nestLevel + "." + title}>
                            <span className='en'>{title}</span>
                            <span className='he'>{heTitle}</span>
                          </a>
                          ));

          }
        }
      }
      const boxedContent = [];
      let currentRun   = [];
      let i;
      for (i = 0; i < content.length; i++) {
        // Walk through content looking for runs of texts/subcats to group together into a table
        if (content[i].type === "div") { // this is a subcategory
          if (currentRun.length) {
            boxedContent.push((<TwoOrThreeBox content={currentRun} width={this.props.width} key={i} />));
            currentRun = [];
          }
          boxedContent.push(content[i]);
        } else  { // this is a single text
          currentRun.push(content[i]);
        }
      }
      if (currentRun.length) {
        boxedContent.push((<TwoOrThreeBox content={currentRun} width={this.props.width} key={i} />));
      }
      return (<div>{boxedContent}</div>);
  }
}
ReaderNavigationCategoryMenuContents.propTypes = {
  category:   PropTypes.string.isRequired,
  contents:   PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  width:      PropTypes.number,
  nestLevel:  PropTypes.number
};

ReaderNavigationCategoryMenuContents.defaultProps = {
  contents: []
};

export default ReaderNavigationCategoryMenu;
