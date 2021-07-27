import {
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuDisplaySettingsButton,
  CategoryAttribution,
  CategoryColorLine,
  LoadingMessage,
  NBox,
  InterfaceText,
  ContentText, EnglishText, HebrewText,
} from './Misc';
import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import DictionarySearch  from './DictionarySearch';
import VersionBlock  from './VersionBlock';
import ExtendedNotes from './ExtendedNotes';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Component   from 'react-class';
import {ContentLanguageContext} from './context';


class ReaderTextTableOfContents extends Component {
  // Menu for the Table of Contents for a single text
  constructor(props) {
    super(props);

    this.state = {
      versions: [],
      versionsLoaded: false,
      currentVersion: null,
      currObjectVersions: {en: null, he: null},
      showAllVersions: false,
      indexDetails: null,
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
    return Sefaria.text(this.getDataRef(), {context: 1, enVersion: this.props.currVersions.en, heVersion: this.props.currVersions.he});
  }
  loadData() {
    // Ensures data this text is in cache, rerenders after data load if needed
    Sefaria.getIndexDetails(this.props.title).then(data => this.setState({indexDetails: data}));
    if (this.isBookToc()) {
      if(!this.state.versionsLoaded){
        Sefaria.versions(this.props.title, false, null, false).then(this.onVersionsLoad);
      }
    } else if (this.isTextToc()) {
      let ref  = this.getDataRef();
      if(!this.state.versionsLoaded){
        Sefaria.versions(ref, false, null, false).then(this.onVersionsLoad);
      }
      let data = this.getData();
      if (!data) {
        Sefaria.text(
          ref,
          {context: 1, enVersion: this.props.currVersions.en, heVersion: this.props.currVersions.he},
          () => this.forceUpdate());
      }
    }
  }
  onVersionsLoad(versions){
    this.setState({versions: versions, currObjectVersions: this.makeFullCurrentVersionsObjects(versions), versionsLoaded: true})
  }
  makeFullCurrentVersionsObjects(versions){
    //build full versions of current object versions
    let currObjectVersions = {en: null, he: null};
    for(let [lang,ver] of Object.entries(this.props.currVersions)){
      if(!!ver){
        let fullVer = versions.find(version => version.versionTitle == ver && version.language == lang);
        currObjectVersions[lang] = fullVer ? fullVer : null;
      }
    }
    return currObjectVersions;
  }
  getVersionsList() {
     return this.state.versions;
  }
  getCurrentVersion() {
    // For now treat bilingual as english. TODO show attribution for 2 versions in bilingual case.
    if (this.isBookToc()) { return null; }
    let d = this.getData();
    if (!d) { return null; }
    let currentLanguage = this.props.settingsLanguage == "he" ? "he" : "en";
    if (currentLanguage == "en" && !d.text.length) {currentLanguage = "he"}
    if (currentLanguage == "he" && !d.he.length) {currentLanguage = "en"}
    let currObjectVersions;
    if(this.state.versions.length){
      currObjectVersions = this.state.currObjectVersions;
    }else{
      currObjectVersions = this.makeFullCurrentVersionsObjects(d.versions);
    }
    let currentVersion = {
      ... currObjectVersions[currentLanguage],
      ...{
        sources: currentLanguage == "he" ? d.heSources : d.sources,
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
      }
    };
    currentVersion.merged = !!(currentVersion.sources);
    return currentVersion;
  }
  handleClick(e) {
    const $a = $(e.target).closest("a");
    if ($a.length && ($a.hasClass("sectionLink") || $a.hasClass("linked"))) {
      let ref = $a.attr("data-ref");
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
    let versionTitle, versionLang;
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
    const title     = this.props.title;
    const index     = Sefaria.index(title);
    const heTitle   = index ? index.heTitle : title;
    const category  = this.props.category;
    let catUrl;
    if (category == "Commentary") {
      catUrl  = "/texts/" + index.categories.slice(0, index.categories.indexOf("Commentary") + 1).join("/");
    } else if (category == "Targum") {
      catUrl  = "/texts/" + index.categories.slice(0, index.categories.indexOf("Targum") + 1).join("/");
    } else {
      catUrl  = "/texts/" + category;
    }
    let currObjectVersions = this.state.currObjectVersions;

    let currentVersionElement = null;
    let defaultVersionString = "Default Version"; // TODO. this var is currently unused. consider removing
    let defaultVersionObject = null; // TODO also unused
    let versionSection = null;
    let downloadSection = null;

    // Text Details
    let detailsSection = this.state.indexDetails ? <TextDetails index={this.state.indexDetails} narrowPanel={this.props.narrowPanel} /> : null;
    let isDictionary = this.state.indexDetails && !!this.state.indexDetails.lexiconName;

    let section, heSection;
    if (this.isTextToc()) {
      let sectionStrings = Sefaria.sectionString(this.props.currentRef);
      section   = sectionStrings.en.named;
      heSection = sectionStrings.he.named;
    }

    // Current Version (Text TOC only)
    let cv = this.getCurrentVersion();
    if (cv) {
      if (cv.merged) {
        let uniqueSources = cv.sources.filter(function(item, i, ar){ return ar.indexOf(item) === i; }).join(", ");
        defaultVersionString += " (Merged from " + uniqueSources + ")";
        currentVersionElement = (<div className="versionTitle">Merged from { uniqueSources }</div>);
      } else {
        if (!this.props.version) {
          defaultVersionObject = this.state.versions.find(v => (cv.language == v.language && cv.versionTitle == v.versionTitle));
          defaultVersionString += defaultVersionObject ? " (" + defaultVersionObject.versionTitle + ")" : "";
        }
        currentVersionElement = (<VersionBlock
          rendermode="toc-open-version"
          title={title}
          version={cv}
          currObjectVersions={currObjectVersions}
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
            <div className="versionSectionSummary versionSectionSummaryHidden sans-serif" aria-hidden="true">
              {Sefaria._siteSettings.TORAH_SPECIFIC ?
              <span>
                <InterfaceText>
                  <EnglishText>{`${numVersions["en"]} English, ${numVersions["he"]} Hebrew`}</EnglishText>
                  <HebrewText>{`${numVersions["he"]} עברית, ${numVersions["en"]} אנגלית`}</HebrewText>
                </InterfaceText>
              </span> :
              <span>
                  <span>{`${numVersions["en"]}`}</span>
              </span>
              }
            </div>
            <div className="versionSectionTitle sans-serif">
              <InterfaceText text={{en:"Versions", he:"גרסאות" }}/>
              {(this.state.versionsDropDownOpen) ? <img src="/static/img/arrow-up.png" alt=""/> : <img src="/static/img/arrow-down.png" alt=""/>}
            </div>
            <div className="versionSectionSummary sans-serif">
              {Sefaria._siteSettings.TORAH_SPECIFIC ?
              <span>
                <InterfaceText>
                  <EnglishText>{`${numVersions["en"]} English, ${numVersions["he"]} Hebrew`}</EnglishText>
                  <HebrewText>{`${numVersions["he"]} עברית, ${numVersions["en"]} אנגלית`}</HebrewText>
                </InterfaceText>
              </span> :
              <span>
                <span>{`${numVersions["en"]}`}</span>
              </span> }
            </div>
          </h2>
          { this.state.versionsDropDownOpen ?
            <VersionsList
              versionsList={versions}
              currObjectVersions={currObjectVersions}
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


    const moderatorSection = Sefaria.is_moderator || Sefaria.is_editor ? (<ModeratorButtons title={title} />) : null;

    // Downloading
    const languageInHebrew = {'en': 'אנגלית', 'he': 'עברית'};
    if (versions) {
      let dlReady = (this.state.dlVersionTitle && this.state.dlVersionFormat && this.state.dlVersionLanguage);
      let dl_versions = [<option key="/" value="0" dir="auto" disabled>{ Sefaria.interfaceLang == "hebrew"? "הגדרות גרסה" : "Version Settings" }</option>];
      let pdVersions = versions.filter(this.isVersionPublicDomain);
      let addMergedFor = pdVersions.map(v => v.language).unique(); // Only show merged option for languages we have
      if (cv) {
        if (cv.merged) {
          // Add option for current merged Version
          dl_versions = dl_versions.concat([
            <option dir="auto" value={"merged/" + cv.language} key={"merged/" + cv.language} data-lang={cv.language}>
                {Sefaria.interfaceLang == "hebrew" ? "גרסה משולבת נוכחית" + `(${languageInHebrew[cv.language]})` :`Current Merged Version (${cv.language})`}
            </option>]);
          addMergedFor = addMergedFor.filter(lang => lang !== cv.language); // Don't add option for this merged language again
        } else {
          // Add Option for current non-merged version
          if (this.isVersionPublicDomain(cv)) {
            let versionTitleInHebrew = cv.versionTitleInHebrew || cv.versionTitle;
            dl_versions.push(
            <option value={cv.versionTitle + "/" + cv.language} key={cv.versionTitle + "/" + cv.language}>
              {Sefaria.interfaceLang == "hebrew" ? `${versionTitleInHebrew} (גרסה נוכחית, ${languageInHebrew[cv.language]})` : `${cv.versionTitle} (Current Version, ${cv.language})`}
            </option>);
          }
        }
        pdVersions = pdVersions.filter(v => v.language != cv.language || v.versionTitle != cv.versionTitle); // Don't show current version again
      }
      dl_versions = dl_versions.concat(pdVersions.map(v =>
        <option dir="auto" value={v.versionTitle + "/" + v.language} key={v.versionTitle + "/" + v.language}>
            {(Sefaria.interfaceLang == "hebrew" && v.versionTitleInHebrew) ? `${v.versionTitleInHebrew} (${languageInHebrew[v.language]})` : `${v.versionTitle} (${v.language})`}
        </option>
      ));
      dl_versions = dl_versions.concat(addMergedFor.map(lang =>
        <option dir="auto" value={`merged/${lang}`} key={`merged/${lang}`}>
          {Sefaria.interfaceLang == "hebrew" ? `גרסה משולבת (${languageInHebrew[lang]})` : `Merged Version (${lang})`}
        </option>,
      ));

      let downloadButton = <div className="versionDownloadButton">
          <div className="downloadButtonInner">
            <InterfaceText>Download</InterfaceText>
          </div>
        </div>;
      const formatStrings = {
        none: {english: "File Format", hebrew: "סוג הקובץ"},
        txt: {english: "Text (with Tags)", hebrew: "טקסט (עם תיוגים)"},
        plaintxt: {english: "Text (without Tags)", hebrew: "טקסט (ללא תיוגים)"}
      };
      downloadSection = (
        <div className="dlSection sans-serif">
          <h2 className="dlSectionTitle">
            <InterfaceText>Download Text</InterfaceText>
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

    const closeClick = (this.isBookToc()) ? this.props.closePanel : this.props.close;
    let classes = classNames({readerTextTableOfContents:1, readerNavMenu:1, narrowPanel: this.props.narrowPanel, noLangToggleInHebrew: this.props.interfaceLang == 'hebrew'});
    const categories = Sefaria.index(this.props.title).categories;


    return (<div className={classes}>
              <CategoryColorLine category={category} />
              <div className="readerControls">
                <div className="readerControlsInner">
                  <div className="leftButtons">
                    <ReaderNavigationMenuCloseButton onClick={closeClick}/>
                  </div>
                  <div className="readerTextToc readerTextTocHeader">
                    <div className="readerTextTocBox sans-serif">
                      <InterfaceText>Table of Contents</InterfaceText>
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
                    <a className="tocCategory" href={catUrl}>
                      <ContentText text={{en:category, he:Sefaria.hebrewTerm(category)}}/>
                    </a>
                    <div className="tocTitle" role="heading" aria-level="1">
                      <ContentText text={{en:title, he:heTitle}}/>
                      {moderatorSection}
                    </div>
                    {this.isTextToc()?
                      <div className="currentSection" role="heading" aria-level="2">
                        <ContentText text={{en:section, he:heSection}}/>
                      </div>
                    : null}
                    <CategoryAttribution categories={categories} />
                    {this.state.indexDetails && this.state.indexDetails.dedication ?
                        <div className="dedication">
                          <span>
                            <ContentText html={{en:this.state.indexDetails.dedication.en, he:this.state.indexDetails.dedication.he}}/>
                          </span>
                        </div> : ""}
                    {detailsSection}
                  </div>
                  {this.isTextToc()?
                    <div className="currentVersionBox">
                      {currentVersionElement || (<LoadingMessage />)}
                    </div>
                  : null}
                  {this.state.indexDetails ?
                  <div>
                    { isDictionary ? <DictionarySearch
                        lexiconName={this.state.indexDetails.lexiconName}
                        title={this.props.title}
                        interfaceLang={this.props.interfaceLang}
                        showBaseText={this.props.showBaseText}
                        contextSelector=".readerTextTableOfContents"
                        currVersions={this.props.currVersions}/> : ""}
                    <div onClick={this.handleClick}>
                      <TextTableOfContentsNavigation
                        schema={this.state.indexDetails.schema}
                        isDictionary={isDictionary}
                        commentatorList={Sefaria.commentaryList(this.props.title)}
                        alts={this.state.indexDetails.alts}
                        defaultStruct={"default_struct" in this.state.indexDetails && this.state.indexDetails.default_struct in this.state.indexDetails.alts ? this.state.indexDetails.default_struct : "default"}
                        narrowPanel={this.props.narrowPanel}
                        title={this.props.title}/>
                    </div>
                  </div>
                  : <LoadingMessage />}
                  {versionSection}
                  {isDictionary ? null : downloadSection}
                </div>}
              </div>
            </div>
    );
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
   /** todo fix interfacetext */
    const index = this.props.index;
    const makeDescriptionText = function(compWord, compPlace, compDate, description) {
      let composed = compPlace || compDate ? compWord + [compPlace, compDate].filter(x => !!x).join(" ") : null;
      return [composed, description].filter(x => !!x).join(". ");
    };
    let enDesc = makeDescriptionText("Composed in ", "compPlaceString" in index ? index.compPlaceString.en : null, "compDateString" in index ? index.compDateString.en : null, index.enDesc);
    let heDesc = makeDescriptionText("נוצר/נערך ב", "compPlaceString" in index ? index.compPlaceString.he : null, "compDateString" in index ? index.compDateString.he : null, index.heDesc);

    if (index.categories.length == 2 && index.categories[0] == "Tanakh") {
      // Don't show date/time for Tanakh.
      enDesc = index.enDesc || "";
      heDesc = index.heDesc || "";
    }

    let authors = "authors" in this.props.index ? this.props.index.authors : [];

    if (!authors.length && !enDesc) { return null; }

    let initialWords = this.props.narrowPanel ? 12 : 30;

    return (
      <div className="tocDetails">
        { authors.length ?
          <div className="tocDetail">
            <InterfaceText>
              <HebrewText>
                מחבר: {authors.map(author => <a key={author.slug} href={"/topics/" + author.slug}>{author.he}</a> )}
              </HebrewText>
              <EnglishText>
                Author: {authors.map(author => <a key={author.slug} href={"/topics/" + author.slug}>{author.en}</a> )}
              </EnglishText>
            </InterfaceText>
          </div>
          : null }
        { !!enDesc ?
          <div className="tocDetail description">
            <InterfaceText>
              <EnglishText>
                <ReadMoreText text={enDesc} initialWords={initialWords} />
              </EnglishText>
              <HebrewText>
                <ReadMoreText text={heDesc} initialWords={initialWords} />
              </HebrewText>
            </InterfaceText>
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
    const shrink  = function(i, container) {
      const $container = $(container);
      // don't run on complex nodes without sectionlinks
      if ($container.hasClass("schema-node-toc") && !$container.find(".sectionLink").length) { return; }
      let maxWidth   = $container.parent().innerWidth();
      let itemWidth  = $container.find(".sectionLink").outerWidth(true);
      let nItems     = $container.find(".sectionLink").length;
      let width;
      if (maxWidth / itemWidth > nItems) {
        width = nItems * itemWidth;
      } else {
        width = Math.floor(maxWidth / itemWidth) * itemWidth;
      }
      $container.width(width + "px");
    };
    const $root = $(ReactDOM.findDOMNode(this));
    if ($root.find(".tocSection").length) {             // nested simple text
      //$root.find(".tocSection").each(shrink); // Don't bother with these for now
    } else if ($root.find(".schema-node-toc").length) { // complex text or alt struct
      // $root.find(".schema-node-toc, .schema-node-contents").each(shrink);
    } else {
      $root.find(".tocLevel").each(shrink);             // Simple text, no nesting
    }
  }
  render() {
    let options = [{
      name: "default",
      text: "sectionNames" in this.props.schema ? this.props.schema.sectionNames[0] : "Contents",
      heText: "sectionNames" in this.props.schema ? Sefaria.hebrewTerm(this.props.schema.sectionNames[0]) : "תוכן",
      onPress: this.setTab.bind(null, "default")
    }];
    if (this.props.alts) {
      for (let alt in this.props.alts) {
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
    let content;
    let toggle = (this.props.isDictionary ? "" :
                  <TabbedToggleSet
                    options={options}
                    active={this.state.tab}
                    narrowPanel={this.props.narrowPanel} />);

    switch(this.state.tab) {
      case "default":
        content = <SchemaNode
                          schema={this.props.schema}
                          addressTypes={this.props.schema.addressTypes}
                          refPath={this.props.title}
                          key="default"/>;
        break;
      case "commentary":
        content = <CommentatorList
                        commentatorList={this.props.commentatorList}
                        title={this.props.title} />;


        break;
      default:
        content = <SchemaNode
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
  isDictionary:    PropTypes.bool,
  title:           PropTypes.string.isRequired,
};


class TabbedToggleSet extends Component {
  render() {
    let options = this.props.options.map(function(option, i) {

      const handleClick = function(e) {
        e.preventDefault();
        option.onPress();
      }.bind(this);

      var classes = classNames({altStructToggle: 1, "sans-serif": 1, active: this.props.active === option.name});
      var url = Sefaria.util.replaceUrlParam("tab", option.name);
      return (
        <div className="altStructToggleBox" key={i}>
          <a className={classes} onClick={handleClick} href={url}>
              <InterfaceText text={{en:option.text, he:option.heText}} />
          </a>
        </div>
      );
    }.bind(this));

    let rows = [];
    if (this.props.narrowPanel) {
      let rowSize = options.length == 4 ? 2 : 3;
      for (let i = 0; i < options.length; i += rowSize) {
        rows.push(options.slice(i, i+rowSize));
      }
    } else {
      rows = [options];
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
      } else if (this.props.schema.nodeType === "DictionaryNode") {
        return (
          <DictionaryNode schema={this.props.schema} />
        );
      }

    } else {
      let content = this.props.schema.nodes.map(function(node, i) {
        let path;
        if ("nodes" in node || ("refs" in node && node.refs.length)) {
          // SchemaNode with children (nodes) or ArrayMapNode with depth (refs)
          path = this.props.refPath + ", " + node.title;
          return (
            <div className="schema-node-toc" data-ref={path} key={i}>
              <span className={`schema-node-title ${this.state.collapsed[i] ? "collapsed" : "open"}`}
                    onClick={this.toggleCollapse.bind(null, i)}
                    onKeyPress={function(e) {e.charCode == 13 ? this.toggleCollapse(i):null}.bind(this)}
                    role="heading"
                    aria-level="3"
                    aria-hidden="true" tabIndex={0}>
                <ContentText text={{en: node.title, he: node.heTitle}} />
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
          return <ArrayMapNode schema={node} key={i}/>;
        } else if (node.nodeType == "DictionaryNode") {
          return <DictionaryNode schema={node} key={i}/>;
        } else if (node.depth == 1 && !node.default) {
          // SchemaNode title that points straight to content
          path = this.props.refPath + ", " + node.title;
          return (
            <a className="schema-node-toc linked" href={Sefaria.normRef(path)} data-ref={path} key={i}>
              <span className="schema-node-title" role="heading" aria-level="3">
                <ContentText text={{en:node.title , he:node.heTitle }}/>
              </span>
            </a>);
        } else {
          // SchemaNode that has a JaggedArray below it
          return (
            <div className="schema-node-toc" key={i}>
              { !node.default ?
              <span className={`schema-node-title ${this.state.collapsed[i] ? "collapsed" : "open"}`}
                    role="heading" aria-level="3" tabIndex={0}
                    onClick={this.toggleCollapse.bind(null, i)}
                    onKeyPress={function(e) {e.charCode == 13 ? this.toggleCollapse(i):null}.bind(this)} >
                <ContentText text={{en: node.title, he: node.heTitle}} />
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
      let zoom = this.props.schema.toc_zoom - 1;
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
    let innerCounts = count.map(this.contentCountIsEmpty);
    return innerCounts.unique().compare([true]);
  }
  refPathTerminal(count) {
    // Returns a string to be added to the end of a section link depending on a content count
    // Used in cases of "zoomed" JaggedArrays, where `contentCounts` is deeper than `depth` so that zoomed section
    // links still point to section level.
    if (typeof count == "number") { return ""; }
    let terminal = ":";
    for (let i = 0; i < count.length; i++) {
      if (count[i]) {
        terminal += (i+1) + this.refPathTerminal(count[i]);
        break;
      }
    }
    return terminal;
  }
  render() {
    if (this.props.depth > 2) {
      let content = [];
      let enSection, heSection;
      for (let i = 0; i < this.props.contentCounts.length; i++) {
        if (this.contentCountIsEmpty(this.props.contentCounts[i])) { continue; }
        if (this.props.addressTypes[0] === "Talmud") {
          enSection = Sefaria.hebrew.intToDaf(i);
          heSection = Sefaria.hebrew.encodeHebrewDaf(enSection);
        } else if (this.props.addressTypes[0] === "Year") {
          enSection = i + 1241;
          heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
          heSection = heSection.slice(0,-1) + '"' + heSection.slice(-1)
        }
        else {
          enSection = i+1;
          heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
        }
        content.push(
          <div className="tocSection" key={i}>
            <div className="sectionName">
              <ContentText text={{ en:this.props.sectionNames[0] + " " + enSection , he: Sefaria.hebrewTerm(this.props.sectionNames[0]) + " " +heSection}}/>
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
    let contentCounts = this.props.depth == 1 ? new Array(this.props.contentCounts).fill(1) : this.props.contentCounts;
    let sectionLinks = [];
    let section, heSection;
    for (let i = 0; i < contentCounts.length; i++) {
      if (this.contentCountIsEmpty(contentCounts[i])) { continue; }
      if (this.props.addressTypes[0] === "Talmud") {
          section = Sefaria.hebrew.intToDaf(i);
          heSection = Sefaria.hebrew.encodeHebrewDaf(section);
        } else if (this.props.addressTypes[0] === "Year") {
          section = i + 1241;
          heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
          heSection = heSection.slice(0,-1) + '"' + heSection.slice(-1)
        }
        else {
          section = i+1;
          heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
        }
      let ref  = (this.props.refPath + ":" + section).replace(":", " ") + this.refPathTerminal(contentCounts[i]);
      let link = (
        <a className="sectionLink" href={Sefaria.normRef(ref)} data-ref={ref} key={i}>
          <ContentText text={{en:section, he:heSection}}/>
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
      let section, heSection;
      let sectionLinks = this.props.schema.refs.map(function(ref, i) {
        i += this.props.schema.offset || 0;
        if (ref === "") {
          return null;
        }
        if (this.props.schema.addressTypes[0] === "Talmud") {
          section = Sefaria.hebrew.intToDaf(i);
          heSection = Sefaria.hebrew.encodeHebrewDaf(section);
        } else if (this.props.schema.addressTypes[0] === "Folio") {
          section = Sefaria.hebrew.intToFolio(i);
          heSection = Sefaria.hebrew.encodeHebrewFolio(section);
        } else {
          section = i+1;
          heSection = Sefaria.hebrew.encodeHebrewNumeral(i+1);
        }
        return (
          <a className="sectionLink" href={Sefaria.normRef(ref)} data-ref={ref} key={i}>
            <ContentText text={{en:section, he:heSection}}/>
          </a>
        );
      }.bind(this));

      return (<div>{sectionLinks}</div>);

    } else {
      return (
        <a className="schema-node-toc linked" href={Sefaria.normRef(this.props.schema.wholeRef)} data-ref={this.props.schema.wholeRef}>
          <span className="schema-node-title" role="heading" aria-level="3">
            <ContentText text={{en:this.props.schema.title, he:this.props.schema.heTitle}}/>
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
    if (this.props.schema.headwordMap) {
      let sectionLinks = this.props.schema.headwordMap.map(function(m,i) {
      let letter = m[0];
      let ref = m[1];
      return (
          <a className="sectionLink" href={Sefaria.normRef(ref)} data-ref={ref} key={i}>
            <ContentText text={{en:letter, he:letter}} />
          </a>
        );
      });
      return (<div className="schema-node-toc"><div className="schema-node-contents"><div className="tocLevel">{sectionLinks}</div></div></div>);
    }
  }
}
DictionaryNode.propTypes = {
  schema:      PropTypes.object.isRequired
};

class CommentatorList extends Component {
  render() {
    let content = this.props.commentatorList.map(function(commentator, i) {
      let ref = commentator.refs_to_base_texts[this.props.title];
      return (<a className="refLink linked" href={Sefaria.normRef(ref)} data-ref={ref} key={i}>
                <ContentText text={{en:commentator.collectiveTitle, he:commentator.heCollectiveTitle}}/>
            </a>);
    }.bind(this));

    return (<NBox n={2} content={content} />);
  }
}
CommentatorList.propTypes = {
  commentatorList: PropTypes.array.isRequired,
  title:           PropTypes.string.isRequired,
};


class VersionsList extends Component {
  render() {
    let versions = this.props.versionsList;
    let [heVersionBlocks, enVersionBlocks] = ["he","en"].map(lang =>
     versions.filter(v => v.language == lang).map(v =>
      <VersionBlock
        rendermode="version-list"
        title={this.props.title}
        version={v}
        currObjectVersions={this.props.currObjectVersions}
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
          <div className="versionLanguageBlock sans-serif">
            <div className="versionLanguageHeader">
              <InterfaceText>Hebrew Versions</InterfaceText>
            </div>
            <div>{heVersionBlocks}</div>
          </div> : null}
        {(!!enVersionBlocks.length) ?
          <div className="versionLanguageBlock sans-serif">
            <div className="versionLanguageHeader">
              <InterfaceText>English Versions</InterfaceText>
            </div>
            <div>{enVersionBlocks}</div>
          </div>: null}
      </div>);
  }
}
VersionsList.propTypes = {
  currObjectVersions: PropTypes.object.isRequired,
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
    const title = this.props.title;

    const confirm = prompt("Are you sure you want to delete this text version? Doing so will completely delete this text from Sefaria, including all existing versions, translations and links. This action CANNOT be undone. Type DELETE to confirm.", "");
    if (confirm !== "DELETE") {
      alert("Delete canceled.");
      return;
    }

    const url = "/api/index/" + title;
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
    let editTextInfo = <div className="button white" onClick={this.editIndex}>
                          <span><i className="fa fa-info-circle"></i> Edit Text Info</span>
                        </div>;
    let addSection   = <div className="button white" onClick={this.addSection}>
                          <span><i className="fa fa-plus-circle"></i> Add Section</span>
                        </div>;
    let deleteText   = <div className="button white" onClick={this.deleteIndex}>
                          <span><i className="fa fa-exclamation-triangle"></i> Delete {this.props.title}</span>
                        </div>
    let textButtons = (<span className="moderatorTextButtons">
                          {Sefaria.is_moderator ? editTextInfo : null}
                          {Sefaria.is_moderator || Sefaria.is_editor ? addSection : null}
                          {Sefaria.is_moderator ? deleteText : null}
                        </span>);
    let message = this.state.message ? (<div className="moderatorSectionMessage">{this.state.message}</div>) : null;
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
    /** todo fix interfacetext */
    let text = this.state.expanded ? this.props.text : this.props.text.split(" ").slice(0, this.props.initialWords).join (" ") + "...";
    return <div className="readMoreText">
      {text}
      {this.state.expanded ? null :
        <span className="readMoreLink" onClick={() => this.setState({expanded: true})}>
          <InterfaceText>
            <EnglishText className="int-en">Read More ›</EnglishText>
            <HebrewText className="int-he">קרא עוד ›</HebrewText>
          </InterfaceText>

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




export default ReaderTextTableOfContents;
