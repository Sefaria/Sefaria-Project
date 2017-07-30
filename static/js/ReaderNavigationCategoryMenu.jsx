const {
  CategoryColorLine,
  CategoryAttribution,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  TwoOrThreeBox,
  LanguageToggleButton,
}                = require('./Misc');
const React      = require('react');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const Sefaria    = require('./sefaria/sefaria');
const Footer     = require('./Footer');
import Component from 'react-class';


class ReaderNavigationCategoryMenu extends Component {
  // Navigation Menu for a single category of texts (e.g., "Tanakh", "Bavli")
  render() {
    var footer = this.props.compare ? null :
                    (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                      <Footer />
                    </footer> );
    // Show Talmud with Toggles
    var categories  = this.props.categories[0] === "Talmud" && this.props.categories.length == 1 ?
                        ["Talmud", "Bavli"] : this.props.categories;

    if (categories[0] === "Talmud" && categories.length <= 2) {
      var setBavli = function() {
        this.props.setCategories(["Talmud", "Bavli"]);
      }.bind(this);
      var setYerushalmi = function() {
        this.props.setCategories(["Talmud", "Yerushalmi"]);
      }.bind(this);
      var bClasses = classNames({navToggle:1, active: categories[1] === "Bavli"});
      var yClasses = classNames({navToggle:1, active: categories[1] === "Yerushalmi", second: 1});

      var toggle =(<div className="navToggles">
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
      var catTitle = (categories.length > 1) ? categories[0] +  " " + categories[1] : categories[0];
      var heCatTitle = (categories.length > 1) ? Sefaria.hebrewTerm(categories[0]) + " " + Sefaria.hebrewTerm(categories[1]): categories[0];
    } else {
      var toggle = null;
      var catTitle = this.props.category;
      var heCatTitle = Sefaria.hebrewTerm(this.props.category);
    }
    var catContents    = Sefaria.tocItemsByCategories(categories);
    var navMenuClasses = classNames({readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader});
    var navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    var contentClasses = classNames({content: 1, hasFooter: footer != null});
    return (<div className={navMenuClasses}>
              <div className={navTopClasses}>
                <CategoryColorLine category={categories[0]} />
                {this.props.hideNavHeader ? null : (<ReaderNavigationMenuMenuButton onClick={this.props.navHome} compare={this.props.compare} />)}
                {this.props.hideNavHeader ? null : (<ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />)}
                {this.props.hideNavHeader ? null : (<h2>
                  <span className="en">{catTitle}</span>
                  <span className="he">{heCatTitle}</span>
                </h2>)}
              </div>
              <div className={contentClasses}>
                <div className="contentInner">
                  {this.props.hideNavHeader ? (<h1>
                      <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} />
                      <span className="en">{catTitle}</span>
                      <span className="he">{heCatTitle}</span>
                    </h1>) : null}
                  {toggle}
                  <CategoryAttribution categories={categories} />
                  <ReaderNavigationCategoryMenuContents contents={catContents} categories={categories} width={this.props.width} category={this.props.category} nestLevel={0} />
                </div>
                {footer}
              </div>
            </div>);
  }
}
ReaderNavigationCategoryMenu.propTypes = {
  category:            PropTypes.string.isRequired,
  categories:          PropTypes.array.isRequired,
  closeNav:            PropTypes.func.isRequired,
  setCategories:       PropTypes.func.isRequired,
  toggleLanguage:      PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func.isRequired,
  navHome:             PropTypes.func.isRequired,
  width:               PropTypes.number,
  compare:             PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  interfaceLang:       PropTypes.string
};


class ReaderNavigationCategoryMenuContents extends Component {
  // Inner content of Category menu (just category title and boxes of)
  getRenderedTextTitleString(title, heTitle){
    var whiteList = ['Midrash Mishlei', 'Midrash Tehillim', 'Midrash Tanchuma'];
    var displayCategory = this.props.category;
    var displayHeCategory = Sefaria.hebrewTerm(this.props.category);
    if (whiteList.indexOf(title) == -1){
      var replaceTitles = {
        "en": ['Jerusalem Talmud', displayCategory],
        "he": ['תלמוד ירושלמי', displayHeCategory]
      };
      var replaceOther = {
        "en" : [", ", " on ", " to ", " of "],
        "he" : [", ", " על "]
      };
      //this will replace a category name at the beginning of the title string and any connector strings (0 or 1) that follow.
      var titleRe = new RegExp(`^(${replaceTitles['en'].join("|")})(${replaceOther['en'].join("|")})?`);
      var heTitleRe = new RegExp(`^(${replaceTitles['he'].join("|")})(${replaceOther['he'].join("|")})?`);
      title   = title == displayCategory ? title : title.replace(titleRe, "");
      heTitle = heTitle == displayHeCategory ? heTitle : heTitle.replace(heTitleRe, "");
    }
    return [title, heTitle];
  }
  render() {
      var content = [];
      var cats = this.props.categories || [];
      for (var i = 0; i < this.props.contents.length; i++) {
        var item = this.props.contents[i];
        if (item.category) {
          // Category
          var newCats = cats.concat(item.category);
          // Special Case categories which should nest but normally wouldn't given their depth
          var subcats = ["Mishneh Torah", "Shulchan Arukh", "Maharal"];
          if (Sefaria.util.inArray(item.category, subcats) > -1 || this.props.nestLevel > 0) {
            if(item.contents.length == 1 && !("category" in item.contents[0])){
                var chItem = item.contents[0];
                var [title, heTitle] = this.getRenderedTextTitleString(chItem.title, chItem.heTitle);
                var url     = "/" + Sefaria.normRef(chItem.firstSection);
                content.push((<a href={url} className={'refLink blockLink sparse' + chItem.sparseness} data-ref={chItem.firstSection} key={"text." + this.props.nestLevel + "." + i}>
                                <span className='en'>{title}</span>
                                <span className='he'>{heTitle}</span>
                              </a>
                              ));
            } else {
              // Create a link to a subcategory
              url = "/texts/" + newCats.join("/");
              content.push((<a href={url} className="catLink" data-cats={newCats.join("|")} key={"cat." + this.props.nestLevel + "." + i}>
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
                            <ReaderNavigationCategoryMenuContents contents={item.contents} categories={newCats} width={this.props.width} nestLevel={this.props.nestLevel + 1} category={this.props.category}  />
                          </div>));
          }
        } else {
          // Add a Text
          var [title, heTitle] = this.getRenderedTextTitleString(item.title, item.heTitle);
          var ref = Sefaria.recentRefForText(item.title) || item.firstSection;
          var url = "/" + Sefaria.normRef(ref);
          content.push((<a href={url} className={'refLink blockLink sparse' + item.sparseness} data-ref={ref} key={"text." + this.props.nestLevel + "." + i}>
                          <span className='en'>{title}</span>
                          <span className='he'>{heTitle}</span>
                        </a>
                        ));
        }
      }
      var boxedContent = [];
      var currentRun   = [];
      for (var i = 0; i < content.length; i++) {
        // Walk through content looking for runs of texts/subcats to group together into a table
        if (content[i].type == "div") { // this is a subcategory
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


module.exports = ReaderNavigationCategoryMenu;
