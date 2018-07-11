const {
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuDisplaySettingsButton,
  CategoryAttribution,
  CategoryColorLine,
  LoadingMessage,
  TwoBox,
}                  = require('./Misc');
const React        = require('react');
const ReactDOM     = require('react-dom');
const $            = require('./sefaria/sefariaJquery');
const Sefaria      = require('./sefaria/sefaria');
const VersionBlock = require('./VersionBlock');
const ExtendedNotes= require('./ExtendedNotes');
const classNames   = require('classnames');
const PropTypes    = require('prop-types');
import Component   from 'react-class';


class ReaderTextTableOfContents extends Component {
  // Menu for the Table of Contents for a single text
  constructor(props) {
    super(props);

    this.state = {
      versions: [],
      versionsLoaded: false,
      currentVersion: null,
      showAllVersions: false,
      versionsDropDownOpen: false,
      dlVersionTitle: null,
      dlVersionLanguage: null,
      dlVersionFormat: null,
      dlReady: false
    };
  }
  componentDidMount() {
    this.loadData();
  }
  componentDidUpdate(prevProps, prevState) {
    if ((this.props.settingsLanguage != prevProps.settingsLanguage)) {
      this.forceUpdate();
    }
  }
  getDataRef() {
    // Returns ref to be used to looking up data
    return Sefaria.sectionRef(this.props.currentRef) || this.props.currentRef;
  }
  getData() {
    // Gets data about this text from cache, which may be null.
    var data = Sefaria.text(this.getDataRef(), {context: 1, enVersion: this.props.currVersions.en, heVersion: this.props.currVersions.he});
    return data;
  }
  loadData() {
    // Ensures data this text is in cache, rerenders after data load if needed
    var details = Sefaria.indexDetails(this.props.title);
    if (!details) {
      Sefaria.indexDetails(this.props.title, () => this.forceUpdate() );
    }
    if (this.isBookToc()) {
      var ref  = this.getDataRef();
      var versions = Sefaria.versions(ref);
      if (!versions) {
        Sefaria.versions(ref, () => this.forceUpdate() );
      }
    } else if (this.isTextToc()) {
      var ref  = this.getDataRef();
      var data = this.getData();
      if (!data) {
        Sefaria.text(
          ref,
          {context: 1, enVersion: this.props.currVersions.en, heVersion: this.props.currVersions.he},
          () => this.forceUpdate());
      }
    }
  }
  getVersionsList() {
    if (this.isTextToc()) {
      var data = this.getData();
      if (!data) { return null; }
      return data.versions;
    } else if (this.isBookToc()) {
      return Sefaria.versions(this.props.title);
    }
  }
  getCurrentVersion() {
    // For now treat bilingual as english. TODO show attribution for 2 versions in bilingual case.
    if (this.isBookToc()) { return null; }
    var d = this.getData();
    if (!d) { return null; }
    var currentLanguage = this.props.settingsLanguage == "he" ? "he" : "en";
    if (currentLanguage == "en" && !d.text.length) {currentLanguage = "he"}
    if (currentLanguage == "he" && !d.he.length) {currentLanguage = "en"}

    var currentVersion = {
      language:               currentLanguage,
      versionTitle:           currentLanguage == "he" ? d.heVersionTitle : d.versionTitle,
      versionSource:          currentLanguage == "he" ? d.heVersionSource : d.versionSource,
      versionStatus:          currentLanguage == "he" ? d.heVersionStatus : d.versionStatus,
      license:                currentLanguage == "he" ? d.heLicense : d.license,
      sources:                currentLanguage == "he" ? d.heSources : d.sources,
      versionNotes:           currentLanguage == "he" ? d.heVersionNotes : d.versionNotes,
      digitizedBySefaria:     currentLanguage == "he" ? d.heDigitizedBySefaria : d.digitizedBySefaria,
      versionTitleInHebrew: currentLanguage == "he" ? d.heVersionTitleInHebrew : d.VersionTitleInHebrew,
      versionNotesInHebrew: currentLanguage == "he" ? d.heVersionNotesInHebrew : d.VersionNotesInHebrew,
      extendedNotes:        currentLanguage == "he" ? d.heExtendedNotes : d.extendedNotes,
      extendedNotesHebrew:  currentLanguage == "he" ? d.extendedNotesHebrew : d.heExtendedNotesHebrew,
    };
    currentVersion.merged = !!(currentVersion.sources);
    return currentVersion;
  }
  handleClick(e) {
    var $a = $(e.target).closest("a");
    if ($a.length && ($a.hasClass("sectionLink") || $a.hasClass("linked"))) {
      var ref = $a.attr("data-ref");
      ref = decodeURIComponent(ref);
      ref = Sefaria.humanRef(ref);
      this.props.close();
      this.props.showBaseText(ref, false, this.props.currVersions);
      e.preventDefault();
    }
  }
  openVersion(version, language) {
    // Selects a version and closes this menu to show it.
    // Calling this functon wihtout parameters resets to default
    this.props.selectVersion(version, language);
    this.props.close();
  }
  toggleVersionsDropDownOpen(event) {
    this.setState({versionsDropDownOpen: !this.state.versionsDropDownOpen});
  }
  onDlVersionSelect(event) {
    var versionTitle, versionLang;
    [versionTitle, versionLang] = event.target.value.split("/");
    this.setState({
      dlVersionTitle: versionTitle,
      dlVersionLanguage: versionLang
    });
  }
  onDlFormatSelect(event) {
    this.setState({dlVersionFormat: event.target.value});
  }
  versionDlLink() {
    return `/download/version/${this.props.title} - ${this.state.dlVersionLanguage} - ${this.state.dlVersionTitle}.${this.state.dlVersionFormat}`;
  }
  recordDownload() {
    Sefaria.track.event("Reader", "Version Download", `${this.props.title} / ${this.state.dlVersionTitle} / ${this.state.dlVersionLanguage} / ${this.state.dlVersionFormat}`);
    return true;
  }
  isBookToc() {
    return (this.props.mode == "book toc")
  }
  isTextToc() {
    return (this.props.mode == "text toc")
  }
  isVersionPublicDomain(v) {
    return !(v.license && v.license.startsWith("Copyright"));
  }
  extendedNotesBack(event){
    return null;
  }
  render() {
    var title     = this.props.title;
    var index     = Sefaria.index(title);
    var heTitle   = index ? index.heTitle : title;
    var category  = this.props.category;
    var catUrl    = "/texts/" + (category == "Commentary" ?
                                  index.categories.slice(0, index.categories.indexOf("Commentary") + 1).join("/")
                                  : category);

    var currentVersionElement = null;
    var defaultVersionString = "Default Version"; // TODO. this var is currently unused. consider removing
    var defaultVersionObject = null; // TODO also unused
    var versionSection = null;
    var downloadSection = null;

    // Text Details
    var details = Sefaria.indexDetails(this.props.title);
    var detailsSection = details ? <TextDetails index={details} narrowPanel={this.props.narrowPanel} /> : null;

    if (this.isTextToc()) {
      var sectionStrings = Sefaria.sectionString(this.props.currentRef);
      var section   = sectionStrings.en.named;
      var heSection = sectionStrings.he.named;
    }

    // Current Version (Text TOC only)
    var cv = this.getCurrentVersion();
    if (cv) {
      if (cv.merged) {
        var uniqueSources = cv.sources.filter(function(item, i, ar){ return ar.indexOf(item) === i; }).join(", ");
        defaultVersionString += " (Merged from " + uniqueSources + ")";
        currentVersionElement = (<div className="versionTitle">Merged from { uniqueSources }</div>);
      } else {
        if (!this.props.version) {
          defaultVersionObject = this.state.versions.find(v => (cv.language == v.language && cv.versionTitle == v.versionTitle));
          defaultVersionString += defaultVersionObject ? " (" + defaultVersionObject.versionTitle + ")" : "";
        }
        currentVersionElement = (<VersionBlock
          title={title}
          version={cv}
          currVersions={this.props.currVersions}
          currentRef={this.props.currentRef}
          showHistory={true}
          getLicenseMap={this.props.getLicenseMap}
          viewExtendedNotes={this.props.viewExtendedNotes}/>);
      }
    }

    // Versions List
    let versions = this.getVersionsList();
    if (versions) {
      const numVersions = versions.reduce((prevVal, elem) => { prevVal[elem.language]++; return prevVal; }, {"en": 0, "he": 0});
      versionSection = (
        <section>
          <h2
            className="versionSectionHeader"
            tabIndex="0"
            role="button"
            aria-pressed={`${this.state.versionsDropDownOpen}`}
            onClick={this.toggleVersionsDropDownOpen}
            onKeyPress={(e) => {e.charCode == 13 ? this.toggleVersionsDropDownOpen(e):null}}>
            <div className="versionSectionSummary versionSectionSummaryHidden" aria-hidden="true">
              <span className="int-en">{`${numVersions["en"]} English, ${numVersions["he"]} Hebrew`}</span>
              <span className="int-he">{`${numVersions["he"]} עברית, ${numVersions["en"]} אנגלית`}</span>
            </div>
            <div className="versionSectionTitle">
              <span className="int-en">Versions</span>
              <span className="int-he">גרסאות</span>
              {(this.state.versionsDropDownOpen) ? <img src="/static/img/arrow-up.png" alt=""/> : <img src="/static/img/arrow-down.png" alt=""/>}
            </div>
            <div className="versionSectionSummary">
              <span className="int-en">{`${numVersions["en"]} English, ${numVersions["he"]} Hebrew`}</span>
              <span className="int-he">{`${numVersions["he"]} עברית, ${numVersions["en"]} אנגלית`}</span>
            </div>
          </h2>
          { this.state.versionsDropDownOpen ?
            <VersionsList
              versionsList={versions}
              currVersions={this.props.currVersions}
              openVersion={this.openVersion}
              title={this.props.title}
              currentRef={this.props.currentRef}
              getLicenseMap={this.props.getLicenseMap}
              viewExtendedNotes={this.props.viewExtendedNotes}
            /> : null
          }
        </section>
      );
    }


    var moderatorSection = Sefaria.is_moderator || Sefaria.is_editor ? (<ModeratorButtons title={title} />) : null;

    // Downloading
    var languageInHebrew = {'en': 'אנגלית', 'he': 'עברית'};
    if (versions) {
      var dlReady = (this.state.dlVersionTitle && this.state.dlVersionFormat && this.state.dlVersionLanguage);
      var dl_versions = [<option key="/" value="0" dir="auto" disabled>{ Sefaria.interfaceLang == "hebrew"? "הגדרות גרסה" : "Version Settings" }</option>];
      var pdVersions = versions.filter(this.isVersionPublicDomain);
      if (cv && cv.merged) {
        var other_lang = cv.language == "he" ? "en" : "he";
        dl_versions = dl_versions.concat([
          <option dir="auto" value={"merged/" + cv.language} key={"merged/" + cv.language} data-lang={cv.language} data-version="merged">
              {Sefaria.interfaceLang == "hebrew" ? "גרסה משולבת נוכחית" + `(${languageInHebrew[cv.language]})` :`Current Merged Version (${cv.language})`}
          </option>,
          <option dir="auto" value={"merged/" + other_lang} key={"merged/" + other_lang} data-lang={other_lang} data-version="merged">
              {Sefaria.interfaceLang == "hebrew" ? `גרסה משולבת` + `(${languageInHebrew[other_lang]})` : `Merged Version (${other_lang})`}
          </option>
        ]);
        dl_versions = dl_versions.concat(pdVersions.map(v =>
          <option dir="auto" value={v.versionTitle + "/" + v.language} key={v.versionTitle + "/" + v.language}>
            {(Sefaria.interfaceLang == "hebrew" && v.versionTitleInHebrew) ? `${v.versionTitleInHebrew} (${languageInHebrew[v.language]})` : `${v.versionTitle} (${v.language})`}
              </option>
        ));
      }
      else if (cv) {
        if (this.isVersionPublicDomain(cv)) {
          dl_versions.push(<option value={cv.versionTitle + "/" + cv.language} key={cv.versionTitle + "/" + cv.language}>
            {Sefaria.interfaceLang == "hebrew" ? "גרסה נוכחית" + `(${languageInHebrew[cv.language]})` :`Current Version (${cv.language})`}
          </option>);
        }
        dl_versions = dl_versions.concat([
          <option dir="auto" value="merged/he" key="merged/he">{Sefaria.interfaceLang == "hebrew" ?"גרסה משולבת (עברית)" :"Merged Version (he)"}</option>,
          <option dir="auto" value="merged/en" key="merged/en">{Sefaria.interfaceLang == "hebrew" ?"גרסה משולבת (אנגלית)" :"Merged Version (en)"}</option>
        ]);
        dl_versions = dl_versions.concat(pdVersions.filter(v => v.language != cv.language || v.versionTitle != cv.versionTitle).map(v =>
          <option dir="auto" value={v.versionTitle + "/" + v.language} key={v.versionTitle + "/" + v.language}>
              {(Sefaria.interfaceLang == "hebrew" && v.versionTitleInHebrew) ? `${v.versionTitleInHebrew} (${languageInHebrew[v.language]})` : `${v.versionTitle} (${v.language})`}
              </option>
        ));
      }
      else {
        dl_versions = dl_versions.concat([
          <option dir="auto" value="merged/he" key="merged/he">{Sefaria.interfaceLang == "hebrew" ?"גרסה משולבת (עברית)" :"Merged Version (he)"}</option>,
          <option dir="auto" value="merged/en" key="merged/en">{Sefaria.interfaceLang == "hebrew" ?"גרסה משולבת (אנגלית)" :"Merged Version (en)"}</option>
        ]);
        dl_versions = dl_versions.concat(pdVersions.map(v =>
          <option dir="auto" value={v.versionTitle + "/" + v.language} key={v.versionTitle + "/" + v.language}>
              {(Sefaria.interfaceLang == "hebrew" && v.versionTitleInHebrew) ? `${v.versionTitleInHebrew} (${languageInHebrew[v.language]})` : `${v.versionTitle} (${v.language})`}
              </option>
        ));
      }
      var downloadButton = <div className="versionDownloadButton">
          <div className="downloadButtonInner">
            <span className="int-en">Download</span>
            <span className="int-he">הורדה</span>
          </div>
        </div>;
      var formatStrings = {
        none: {english: "File Format", hebrew: "סוג הקובץ"},
        txt: {english: "Text (with Tags)", hebrew: "טקסט (עם תיוגים)"},
        plaintxt: {english: "Text (without Tags)", hebrew: "טקסט (ללא תיוגים)"}
      };
      var downloadSection = (
        <div className="dlSection">
          <h2 className="dlSectionTitle">
            <span className="int-en">Download Text</span>
            <span className="int-he">הורדת הטקסט</span>
          </h2>
          <select
            className="dlVersionSelect dlVersionTitleSelect"
            value={(this.state.dlVersionTitle && this.state.dlVersionLanguage) ? this.state.dlVersionTitle + "/" + this.state.dlVersionLanguage : "0"}
            onChange={this.onDlVersionSelect}>
            {dl_versions}
          </select>
          <select className="dlVersionSelect dlVersionFormatSelect" value={this.state.dlVersionFormat || "0"} onChange={this.onDlFormatSelect}>
            <option key="none" value="0" disabled>{ formatStrings.none[Sefaria.interfaceLang] }</option>
            <option key="txt" value="txt" >{ formatStrings.txt[Sefaria.interfaceLang] }</option>
            <option key="plain.txt" value="plain.txt" >{ formatStrings.plaintxt[Sefaria.interfaceLang] }</option>
            <option key="csv" value="csv" >CSV</option>
            <option key="json" value="json" >JSON</option>
          </select>
          {dlReady?<a onClick={this.recordDownload} href={this.versionDlLink()} download>{downloadButton}</a>:downloadButton}
        </div>
      );
    }

    var closeClick = (this.isBookToc()) ? this.props.closePanel : this.props.close;
    var classes = classNames({readerTextTableOfContents:1, readerNavMenu:1, narrowPanel: this.props.narrowPanel, noLangToggleInHebrew: this.props.interfaceLang == 'hebrew'});
    var categories = Sefaria.index(this.props.title).categories;


    return (<div className={classes}>
              <CategoryColorLine category={category} />
              <div className="readerControls">
                <div className="readerControlsInner">
                  <div className="leftButtons">
                    <ReaderNavigationMenuCloseButton onClick={closeClick}/>
                  </div>
                  <div className="readerTextToc readerTextTocHeader">
                    <div className="readerTextTocBox">
                      <span className="int-en">Table of Contents</span>
                      <span className="int-he">תוכן העניינים</span>
                    </div>
                  </div>
                  <div className="rightButtons">
                    {this.props.interfaceLang !== "hebrew" ?
                      <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
                      : <ReaderNavigationMenuDisplaySettingsButton placeholder={true} />}
                  </div>
                </div>
              </div>
              <div className="content">
                {this.props.mode === "extended notes"
                  ? <ExtendedNotes
                    title={this.props.title}
                    currVersions={this.props.currVersions}
                    backFromExtendedNotes={this.props.backFromExtendedNotes}
                  />
                  :<div className="contentInner">
                  <div className="tocTop">
                    <CategoryAttribution categories={categories} />
                    <a className="tocCategory" href={catUrl}>
                      <span className="en">{category}</span>
                      <span className="he">{Sefaria.hebrewTerm(category)}</span>
                    </a>
                    <div className="tocTitle" role="heading" aria-level="1">
                      <span className="en">{title}</span>
                      <span className="he">{heTitle}</span>
                      {moderatorSection}
                    </div>
                    {this.isTextToc()?
                      <div className="currentSection" role="heading" aria-level="2">
                        <span className="en">{section}</span>
                        <span className="he">{heSection}</span>
                      </div>
                    : null}
                    {detailsSection}
                  </div>
                  {this.isTextToc()?
                    <div className="currentVersionBox">
                      {currentVersionElement || (<LoadingMessage />)}
                    </div>
                  : null}
                  {details ?
                  <div onClick={this.handleClick}>
                    <TextTableOfContentsNavigation
                      schema={details.schema}
                      commentatorList={Sefaria.commentaryList(this.props.title)}
                      alts={details.alts}
                      defaultStruct={"default_struct" in details && details.default_struct in details.alts ? details.default_struct : "default"}
                      narrowPanel={this.props.narrowPanel}
                      title={this.props.title}/>

                  </div>
                  : <LoadingMessage />}
                  {versionSection}
                  {downloadSection}
                </div>}
              </div>
            </div>);
  }
}
ReaderTextTableOfContents.propTypes = {
  mode:             PropTypes.string.isRequired,
  title:            PropTypes.string.isRequired,
  category:         PropTypes.string.isRequired,
  currentRef:       PropTypes.string.isRequired,
  settingsLanguage: PropTypes.string.isRequired,
  currVersions:     PropTypes.object.isRequired,
  narrowPanel:      PropTypes.bool,
  close:            PropTypes.func.isRequired,
  openNav:          PropTypes.func.isRequired,
  showBaseText:     PropTypes.func.isRequired,
  getLicenseMap:    PropTypes.func.isRequired,
  selectVersion:    PropTypes.func,
  viewExtendedNotes: PropTypes.func,
  backFromExtendedNotes: PropTypes.func,
  interfaceLang:    PropTypes.string,
  extendedNotes:    PropTypes.string,
  extendedNotesHebrew: PropTypes.string
};


class TextDetails extends Component {
 render() {
    var index = this.props.index;
    var makeDescriptionText = function(compWord, compPlace, compDate, description) {
      var composed = compPlace || compDate ? compWord + [compPlace, compDate].filter(x => !!x).join(" ") : null;
      return [composed, description].filter(x => !!x).join(". ");
    };
    var enDesc = makeDescriptionText("Composed in ", "compPlaceString" in index ? index.compPlaceString.en : null, "compDateString" in index ? index.compDateString.en : null, index.enDesc);
    var heDesc = makeDescriptionText("נוצר/נערך ב", "compPlaceString" in index ? index.compPlaceString.he : null, "compDateString" in index ? index.compDateString.he : null, index.heDesc);

    if (index.categories.length == 2 && index.categories[0] == "Tanakh") {
      // Don't show date/time for Tanakh.
      enDesc = index.enDesc || "";
      heDesc = index.heDesc || "";
    }

    var authors = "authors" in this.props.index ? this.props.index.authors : [];

    if (!authors.length && !enDesc) { return null; }

    var initialWords = this.props.narrowPanel ? 12 : 30;

    return (
      <div className="tocDetails">
        { authors.length ?
          <div className="tocDetail">
              <span className="int-he">
                מחבר: {authors.map(author => <a key={author.en} href={"/person/" + author.en}>{author.he}</a> )}
              </span>
              <span className="int-en">
                Author: {authors.map(author => <a key={author.en} href={"/person/" + author.en}>{author.en}</a> )}
              </span>
          </div>
          : null }
        { !!enDesc ?
          <div className="tocDetail description">
              <div className="int-he">
                <ReadMoreText text={heDesc} initialWords={initialWords} />
              </div>
              <div className="int-en">
                <ReadMoreText text={enDesc} initialWords={initialWords} />
              </div>
          </div>
          : null }
      </div>);
  }
}
TextDetails.propTypes = {
  index:       PropTypes.object.isRequired,
  narrowPanel: PropTypes.bool,
};


class TextTableOfContentsNavigation extends Component {
  // The content section of the text table of contents that includes links to text sections,
  // and tabs for alternate structures and commentary.
  constructor(props) {
    super(props);
    this.shrinkWrap = this.shrinkWrap.bind(this);
    this.state = {
      tab: props.defaultStruct
    };
  }
  componentDidMount() {
    this.shrinkWrap();
    window.addEventListener('resize', this.shrinkWrap);
  }
  componentWillUnmount() {
    window.removeEventListener('resize', this.shrinkWrap);
  }
  componentDidUpdate(prevProps, prevState) {
    if (prevState.tab != this.state.tab &&
        this.state.tab !== "commentary") {
      this.shrinkWrap();
    }
  }
  setTab(tab) {
    this.setState({tab: tab});
  }
  shrinkWrap() {
    // Shrink the width of the container of a grid of inline-line block elements,
    // so that is is tight around its contents thus able to appear centered.
    // As far as I can tell, there's no way to do this in pure CSS.
    // TODO - flexbox should be able to solve this
    var shrink  = function(i, container) {
      var $container = $(container);
      // don't run on complex nodes without sectionlinks
      if ($container.hasClass("schema-node-toc") && !$container.find(".sectionLink").length) { return; }
      var maxWidth   = $container.parent().innerWidth();
      var itemWidth  = $container.find(".sectionLink").outerWidth(true);
      var nItems     = $container.find(".sectionLink").length;

      if (maxWidth / itemWidth > nItems) {
        var width = nItems * itemWidth;
      } else {
        var width = Math.floor(maxWidth / itemWidth) * itemWidth;
      }
      $container.width(width + "px");
    };
    var $root = $(ReactDOM.findDOMNode(this));
    if ($root.find(".tocSection").length) {             // nested simple text
      //$root.find(".tocSection").each(shrink); // Don't bother with these for now
    } else if ($root.find(".schema-node-toc").length) { // complex text or alt struct
      // $root.find(".schema-node-toc, .schema-node-contents").each(shrink);
    } else {
      $root.find(".tocLevel").each(shrink);             // Simple text, no nesting
    }
  }
  render() {
    var options = [{
      name: "default",
      text: "sectionNames" in this.props.schema ? this.props.schema.sectionNames[0] : "Contents",
      heText: "sectionNames" in this.props.schema ? Sefaria.hebrewTerm(this.props.schema.sectionNames[0]) : "תוכן",
      onPress: this.setTab.bind(null, "default")
    }];
    if (this.props.alts) {
      for (var alt in this.props.alts) {
        if (this.props.alts.hasOwnProperty(alt)) {
          options.push({
            name: alt,
            text: alt,
            heText: Sefaria.hebrewTerm(alt),
            onPress: this.setTab.bind(null, alt)
          });
        }
      }
    }
    options = options.sort(function(a, b) {
      return a.name == this.props.defaultStruct ? -1 :
              b.name == this.props.defaultStruct ? 1 : 0;
    }.bind(this));

    if (this.props.commentatorList.length) {
      options.push({
        name: "commentary",
        text: "Commentary",
        heText: "מפרשים",
        onPress: this.setTab.bind(null, "commentary")
      });
    }

    var toggle = <TabbedToggleSet
                    options={options}
                    active={this.state.tab}
                    narrowPanel={this.props.narrowPanel} />;

    debugger;
    switch(this.state.tab) {
      case "default":
        var content = <SchemaNode
                          schema={this.props.schema}
                          addressTypes={this.props.schema.addressTypes}
                          refPath={this.props.title}
                          key="default"/>;
        break;
      case "commentary":
        var content = <CommentatorList
                        commentatorList={this.props.commentatorList}
                        title={this.props.title} />;


        break;
      default:
        var content = <SchemaNode
                          schema={this.props.alts[this.state.tab]}
                          addressTypes={this.props.schema.addressTypes}
                          refPath={this.props.title}
                          key="alt_struct"/>;
        break;
    }

    return (
      <div className="tocContent">
        {toggle}
        {content}
      </div>
    );
  }
}
TextTableOfContentsNavigation.propTypes = {
  schema:          PropTypes.object.isRequired,
  commentatorList: PropTypes.array,
  alts:            PropTypes.object,
  defaultStruct:   PropTypes.string,
  narrowPanel:     PropTypes.bool,
  title:           PropTypes.string.isRequired,
};


class TabbedToggleSet extends Component {
  render() {
    var options = this.props.options.map(function(option, i) {

      var handleClick = function(e) {
        e.preventDefault();
        option.onPress();
      }.bind(this);

      var classes = classNames({altStructToggle: 1, active: this.props.active === option.name});
      var url = Sefaria.util.replaceUrlParam("tab", option.name);
      return (
        <div className="altStructToggleBox" key={i}>
          <a className={classes} onClick={handleClick} href={url}>
              <span className="int-he">{option.heText}</span>
              <span className="int-en">{option.text}</span>
          </a>
        </div>
      );
    }.bind(this));

    if (this.props.narrowPanel) {
      var rows = [];
      var rowSize = options.length == 4 ? 2 : 3;
      for (var i = 0; i < options.length; i += rowSize) {
        rows.push(options.slice(i, i+rowSize));
      }
    } else {
      var rows = [options];
    }

    return (<div className="structToggles">
              {rows.map(function(row, i) {
                return (<div className="structTogglesInner" key={i}>{row}</div>);
              })}
            </div>);
  }
}
TabbedToggleSet.propTypes = {
  options:     PropTypes.array.isRequired, // array of object with `name`. `text`, `heText`, `onPress`
  active:      PropTypes.string.isRequired,
  narrowPanel: PropTypes.bool
};


class SchemaNode extends Component {
  constructor(props) {
    super(props);
    this.state = {
      // Collapse everything except default nodes to start.
      collapsed: "nodes" in props.schema ? props.schema.nodes.map(function(node) { return !(node.default || node.includeSections) }) : []
    };
  }
  toggleCollapse(i) {
    this.state.collapsed[i] = !this.state.collapsed[i];
    this.setState({collapsed: this.state.collapsed});
  }
  render() {
    debugger;
    if (!("nodes" in this.props.schema)) {
      if (this.props.schema.nodeType === "JaggedArrayNode") {
        return (
          <JaggedArrayNode
            schema={this.props.schema}
            refPath={this.props.refPath} />
        );
      } else if (this.props.schema.nodeType === "ArrayMapNode") {
        return (
          <ArrayMapNode schema={this.props.schema} />
        );
      } else if (this.props.schema.nodeType === "ArrayMapNode") {
        return (
          <DictionaryNode schema={this.props.schema} />
        );
      }

    } else {
      var content = this.props.schema.nodes.map(function(node, i) {
        if ("nodes" in node || ("refs" in node && node.refs.length)) {
          // SchemaNode with children (nodes) or ArrayMapNode with depth (refs)
          var path = this.props.refPath + ", " + node.title;
          return (
            <div className="schema-node-toc" data-ref={path} key={i}>
              <span className="schema-node-title" onClick={this.toggleCollapse.bind(null, i)} onKeyPress={function(e) {e.charCode == 13 ? this.toggleCollapse(i):null}.bind(this)} role="heading" aria-level="3" aria-hidden="true" tabIndex={0}>
                <span className="he">{node.heTitle} <i className={"schema-node-control fa fa-angle-" + (this.state.collapsed[i] ? "left" : "down")}></i></span>
                <span className="en">{node.title} <i className={"schema-node-control fa fa-angle-" + (this.state.collapsed[i] ? "right" : "down")}></i></span>
              </span>
              {!this.state.collapsed[i] ?
              <div className="schema-node-contents">
                <SchemaNode
                  schema={node}
                  refPath={this.props.refPath + ", " + node.title} />
              </div>
              : null }
            </div>);
        } else if (node.nodeType == "ArrayMapNode") {
          // ArrayMapNode with only wholeRef
          return <ArrayMapNode schema={node} key={i} />;
        } else if (node.depth == 1 && !node.default) {
          // SchemaNode title that points straight to content
          var path = this.props.refPath + ", " + node.title;
          return (
            <a className="schema-node-toc linked" href={Sefaria.normRef(path)} data-ref={path} key={i}>
              <span className="schema-node-title" role="heading" aria-level="3">
                <span className="he">{node.heTitle}</span>
                <span className="en">{node.title}</span>
              </span>
            </a>);
        } else {
          // SchemaNode that has a JaggedArray below it
          return (
            <div className="schema-node-toc" key={i}>
              { !node.default ?
              <span className="schema-node-title" onClick={this.toggleCollapse.bind(null, i)} role="heading" aria-level="3" tabIndex={0} onKeyPress={function(e) {e.charCode == 13 ? this.toggleCollapse(i):null}.bind(this)} >
                <span className="he">{node.heTitle} <i className={"schema-node-control fa fa-angle-" + (this.state.collapsed[i] ? "left" : "down")}></i></span>
                <span className="en">{node.title} <i className={"schema-node-control fa fa-angle-" + (this.state.collapsed[i] ? "right" : "down")}></i></span>
              </span>
              : null }
              { !this.state.collapsed[i] ?
              <div className="schema-node-contents">
                <JaggedArrayNode
                  schema={node}
                  contentLang={this.props.contentLang}
                  refPath={this.props.refPath + (node.default ? "" : ", " + node.title)} />
              </div>
              : null }
            </div>);
        }
      }.bind(this));
      return (
        <div className="tocLevel">{content}</div>
      );
    }
  }
}
SchemaNode.propTypes = {
  schema:      PropTypes.object.isRequired,
  refPath:     PropTypes.string.isRequired
};



class JaggedArrayNode extends Component {
  render() {
    if ("toc_zoom" in this.props.schema) {
      var zoom = this.props.schema.toc_zoom - 1;
      return (<JaggedArrayNodeSection
                depth={this.props.schema.depth - zoom}
                sectionNames={this.props.schema.sectionNames.slice(0, -zoom)}
                addressTypes={this.props.schema.addressTypes.slice(0, -zoom)}
                contentCounts={this.props.schema.content_counts}
                refPath={this.props.refPath} />);
    }
    return (<JaggedArrayNodeSection
              depth={this.props.schema.depth}
              sectionNames={this.props.schema.sectionNames}
              addressTypes={this.props.schema.addressTypes}
              contentCounts={this.props.schema.content_counts}
              refPath={this.props.refPath} />);
  }
}
JaggedArrayNode.propTypes = {
  schema:      PropTypes.object.isRequired,
  refPath:     PropTypes.string.isRequired
};


class JaggedArrayNodeSection extends Component {
  contentCountIsEmpty(count) {
    // Returns true if count is zero or is an an array (of arrays) of zeros.
    if (typeof count == "number") { return count == 0; }
    var innerCounts = count.map(this.contentCountIsEmpty);
    return innerCounts.unique().compare([true]);
  }
  refPathTerminal(count) {
    // Returns a string to be added to the end of a section link depending on a content count
    // Used in cases of "zoomed" JaggedArrays, where `contentCounts` is deeper than `depth` so that zoomed section
    // links still point to section level.
    if (typeof count == "number") { return ""; }
    var terminal = ":";
    for (var i = 0; i < count.length; i++) {
      if (count[i]) {
        terminal += (i+1) + this.refPathTerminal(count[i]);
        break;
      }
    }
    return terminal;
  }
  render() {
    if (this.props.depth > 2) {
      var content = [];
      for (var i = 0; i < this.props.contentCounts.length; i++) {
        if (this.contentCountIsEmpty(this.props.contentCounts[i])) { continue; }
        if (this.props.addressTypes[0] === "Talmud") {
          var enSection = Sefaria.hebrew.intToDaf(i);
          var heSection = Sefaria.hebrew.encodeHebrewDaf(enSection);
        } else if (this.props.addressTypes[0] === "Year") {
          var enSection = i + 1241;
          var heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
          heSection = heSection.slice(0,-1) + '"' + heSection.slice(-1)
        }
        else {
          var enSection = i+1;
          var heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
        }
        content.push(
          <div className="tocSection" key={i}>
            <div className="sectionName">
              <span className="he">{Sefaria.hebrewTerm(this.props.sectionNames[0]) + " " +heSection}</span>
              <span className="en">{this.props.sectionNames[0] + " " + enSection}</span>
            </div>
            <JaggedArrayNodeSection
              depth={this.props.depth - 1}
              sectionNames={this.props.sectionNames.slice(1)}
              addressTypes={this.props.addressTypes.slice(1)}
              contentCounts={this.props.contentCounts[i]}
              refPath={this.props.refPath + ":" + enSection} />
          </div>);
      }
      return ( <div className="tocLevel">{content}</div> );
    }
    var contentCounts = this.props.depth == 1 ? new Array(this.props.contentCounts).fill(1) : this.props.contentCounts;
    var sectionLinks = [];
    for (var i = 0; i < contentCounts.length; i++) {
      if (this.contentCountIsEmpty(contentCounts[i])) { continue; }
      if (this.props.addressTypes[0] === "Talmud") {
          var section = Sefaria.hebrew.intToDaf(i);
          var heSection = Sefaria.hebrew.encodeHebrewDaf(section);
        } else if (this.props.addressTypes[0] === "Year") {
          var section = i + 1241;
          var heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
          heSection = heSection.slice(0,-1) + '"' + heSection.slice(-1)
        }
        else {
          var section = i+1;
          var heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
        }
      var ref  = (this.props.refPath + ":" + section).replace(":", " ") + this.refPathTerminal(contentCounts[i]);
      var link = (
        <a className="sectionLink" href={Sefaria.normRef(ref)} data-ref={ref} key={i}>
          <span className="he">{heSection}</span>
          <span className="en">{section}</span>
        </a>
      );
      sectionLinks.push(link);
    }
    return (
      <div className="tocLevel">{sectionLinks}</div>
    );
  }
}
JaggedArrayNodeSection.propTypes = {
  depth:           PropTypes.number.isRequired,
  sectionNames:    PropTypes.array.isRequired,
  addressTypes:    PropTypes.array.isRequired,
  contentCounts:   PropTypes.oneOfType([
                      PropTypes.array,
                      PropTypes.number
                    ]),
  refPath:         PropTypes.string.isRequired,
};


class ArrayMapNode extends Component {
  constructor(props) {
    super(props);
  }
  render() {
    if ("refs" in this.props.schema && this.props.schema.refs.length) {
      var sectionLinks = this.props.schema.refs.map(function(ref, i) {
        i += this.props.schema.offset || 0;
        if (this.props.schema.addressTypes[0] === "Talmud") {
          var section = Sefaria.hebrew.intToDaf(i);
          var heSection = Sefaria.hebrew.encodeHebrewDaf(section);
        } else if (this.props.schema.addressTypes[0] === "Year") {
          var section = i + 1241;
          var heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
          heSection = heSection.slice(0,-1) + '"' + heSection.slice(-1)
        }
        else {
          var section = i+1;
          var heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
        }
        return (
          <a className="sectionLink" href={Sefaria.normRef(ref)} data-ref={ref} key={i}>
            <span className="he">{heSection}</span>
            <span className="en">{section}</span>
          </a>
        );
      }.bind(this));

      return (<div>{sectionLinks}</div>);

    } else {
      return (
        <a className="schema-node-toc linked" href={Sefaria.normRef(this.props.schema.wholeRef)} data-ref={this.props.schema.wholeRef}>
          <span className="schema-node-title" role="heading" aria-level="3">
            <span className="he">{this.props.schema.heTitle} <i className="schema-node-control fa fa-angle-left"></i></span>
            <span className="en">{this.props.schema.title} <i className="schema-node-control fa fa-angle-right"></i></span>
          </span>
        </a>);
    }
  }
}
ArrayMapNode.propTypes = {
  schema:      PropTypes.object.isRequired
};


class DictionaryNode extends Component {
  render() {
    return (<strong>Magic!</strong>);
  }
}
DictionaryNode.propTypes = {
  schema:      PropTypes.object.isRequired,
};

class CommentatorList extends Component {
  render() {
    var content = this.props.commentatorList.map(function(commentator, i) {
      var ref = commentator.refs_to_base_texts[this.props.title];
      return (<a className="refLink linked" href={Sefaria.normRef(ref)} data-ref={ref} key={i}>
                <span className="he">{commentator.heCollectiveTitle}</span>
                <span className="en">{commentator.collectiveTitle}</span>
            </a>);
    }.bind(this));

    return (<TwoBox content={content} />);
  }
}
CommentatorList.propTypes = {
  commentatorList: PropTypes.array.isRequired,
  title:           PropTypes.string.isRequired,
};


class VersionsList extends Component {
  render() {
    var versions = this.props.versionsList;
    var [heVersionBlocks, enVersionBlocks] = ["he","en"].map(lang =>
     versions.filter(v => v.language == lang).map(v =>
      <VersionBlock
        title={this.props.title}
        version={v}
        currVersions={this.props.currVersions}
        currentRef={this.props.currentRef || this.props.title}
        firstSectionRef={"firstSectionRef" in v ? v.firstSectionRef : null}
        openVersionInReader={this.props.openVersion}
        viewExtendedNotes={this.props.viewExtendedNotes}
        key={v.versionTitle + "/" + v.language}
        getLicenseMap={this.props.getLicenseMap}/>
     )
    );

    return (
      <div className="versionBlocks">
        {(!!heVersionBlocks.length) ?
          <div className="versionLanguageBlock">
            <div className="versionLanguageHeader">
              <span className="int-en">Hebrew Versions</span><span className="int-he">בעברית</span>
            </div>
            <div>{heVersionBlocks}</div>
          </div> : null}
        {(!!enVersionBlocks.length) ?
          <div className="versionLanguageBlock">
            <div className="versionLanguageHeader">
              <span className="int-en">English Versions</span><span className="int-he">באנגלית</span>
            </div>
            <div>{enVersionBlocks}</div>
          </div>: null}
      </div>);
  }
}
VersionsList.propTypes = {
  currVersions: PropTypes.object.isRequired,
  versionsList:      PropTypes.array.isRequired,
  openVersion:       PropTypes.func.isRequired,
  title:             PropTypes.string.isRequired,
  currentRef:        PropTypes.string,
  viewExtendedNotes: PropTypes.func,
  getLicenseMap:     PropTypes.func.isRequired,
};


class ModeratorButtons extends Component {
  constructor(props) {
    super(props);

    this.state = {
      expanded: false,
      message: null,
    }
  }
  expand() {
    this.setState({expanded: true});
  }
  editIndex() {
    window.location = "/edit/textinfo/" + this.props.title;
  }
  addSection() {
    window.location = "/add/" + this.props.title;
  }
  deleteIndex() {
    var title = this.props.title;

    var confirm = prompt("Are you sure you want to delete this text version? Doing so will completely delete this text from Sefaria, including all existing versions and links. This action CANNOT be undone. Type DELETE to confirm.", "");
    if (confirm !== "DELETE") {
      alert("Delete canceled.");
      return;
    }

    var url = "/api/index/" + title;
    $.ajax({
      url: url,
      type: "DELETE",
      success: function(data) {
        if ("error" in data) {
          alert(data.error)
        } else {
          alert("Text Deleted.");
          window.location = "/";
        }
      }
    }).fail(function() {
      alert("Something went wrong. Sorry!");
    });
    this.setState({message: "Deleting text (this may time a while)..."});
  }
  render() {
    if (!this.state.expanded) {
      return (<div className="moderatorSectionExpand" onClick={this.expand}>
                <i className="fa fa-cog"></i>
              </div>);
    }
    var editTextInfo = <div className="button white" onClick={this.editIndex}>
                          <span><i className="fa fa-info-circle"></i> Edit Text Info</span>
                        </div>;
    var addSection   = <div className="button white" onClick={this.addSection}>
                          <span><i className="fa fa-plus-circle"></i> Add Section</span>
                        </div>;
    var deleteText   = <div className="button white" onClick={this.deleteIndex}>
                          <span><i className="fa fa-exclamation-triangle"></i> Delete {this.props.title}</span>
                        </div>
    var textButtons = (<span className="moderatorTextButtons">
                          {Sefaria.is_moderator ? editTextInfo : null}
                          {Sefaria.is_moderator || Sefaria.is_editor ? addSection : null}
                          {Sefaria.is_moderator ? deleteText : null}
                        </span>);
    var message = this.state.message ? (<div className="moderatorSectionMessage">{this.state.message}</div>) : null;
    return (<div className="moderatorSection">
              {textButtons}
              {message}
            </div>);
  }
}
ModeratorButtons.propTypes = {
  title: PropTypes.string.isRequired,
};


class ReadMoreText extends Component {
  constructor(props) {
    super(props);
    this.state = {expanded: props.text.split(" ").length < props.initialWords};
  }
  render() {
    var text = this.state.expanded ? this.props.text : this.props.text.split(" ").slice(0, this.props.initialWords).join (" ") + "...";
    return <div className="readMoreText">
      {text}
      {this.state.expanded ? null :
        <span className="readMoreLink" onClick={() => this.setState({expanded: true})}>
          <span className="int-en">Read More ›</span>
          <span className="int-he">קרא עוד ›</span>
        </span>
      }
    </div>
  }
}
ReadMoreText.propTypes = {
  text: PropTypes.string.isRequired,
  initialWords: PropTypes.number,
};
ReadMoreText.defaultProps = {
  initialWords: 30
};

// class ExtendedNotes extends Component {
//   constructor(props) {
//     super(props);
//     this.state = {'notesLanguage': Sefaria.interfaceLang, 'extendedNotes': '', 'langToggle': false};
//   }
//   getVersionData(versionList){
//     const versionTitle = this.props.currVersions['en'] ? this.props.currVersions['en'] : this.props.currVersions['he'];
//     const thisVersion = versionList.filter(x=>x.versionTitle===versionTitle)[0];
//     let extendedNotes = {'english': thisVersion.extendedNotes, 'hebrew': thisVersion.extendedNotesHebrew};
//
//     if (extendedNotes.english && extendedNotes.hebrew){
//       this.setState({'extendedNotes': extendedNotes, 'langToggle': true});
//     }
//     else if (extendedNotes.english && !extendedNotes.hebrew) {
//       this.setState({'extendedNotes': extendedNotes, 'notesLanguage': 'english'});
//     }
//     else if (extendedNotes.hebrew && !extendedNotes.english) {
//       this.setState({'extendedNotes': extendedNotes, 'notesLanguage': 'hebrew'});
//     }
//     else{
//       this.props.backFromExtendedNotes();
//     }
//   }
//   componentDidMount() {
//     // use Sefaria.versions(ref, cb), where cb will invoke setState
//     Sefaria.versions(this.props.title, this.getVersionData);
//   }
//   goBack(event) {
//     event.preventDefault();
//     this.props.backFromExtendedNotes();
//   }
//   changeLanguage(event) {
//     event.preventDefault();
//     if (this.state.notesLanguage==='english') {
//       this.setState({'notesLanguage': 'hebrew'});
//     }
//     else {
//       this.setState({'notesLanguage': 'english'});
//     }
//   }
//   render() {
//     let notes = '';
//     if (this.state.extendedNotes) {
//       notes = this.state.extendedNotes[this.state.notesLanguage];
//       if (this.state.notesLanguage==='hebrew' && !notes){
//         notes = 'לא קיימים רשימות מורחבות בשפה העברית עבור גרסה זו';
//       }
//       else if (this.state.notesLanguage==='english' && !notes){
//         notes = 'Extended notes in English do not exist for this version';
//       }
//     }
//       return <div className="extendedNotes">
//         <a onClick={this.goBack} href={`${this.props.title}`}>
//           {Sefaria.interfaceLang==="hebrew" ? "חזור" : "Back"}
//         </a>
//         {this.state.extendedNotes
//           ? <div className="extendedNotesText" dangerouslySetInnerHTML={ {__html: notes} }></div>
//         : <LoadingMessage/>}
//         {this.state.langToggle ? <a onClick={this.changeLanguage} href={`${this.props.title}`}>
//           {this.state.notesLanguage==='english' ? 'עברית' : 'English'}
//         </a> : ''}
//       </div>
//   }
// }


module.exports = ReaderTextTableOfContents;
