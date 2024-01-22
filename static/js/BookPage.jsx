import {
  CloseButton,
  MenuButton,
  DisplaySettingsButton,
  CategoryAttribution,
  CategoryColorLine,
  LoadingMessage,
  TabView,
  InterfaceText,
  EnglishText, HebrewText, LanguageToggleButton,
  AdminToolHeader,
  CategoryChooser,
  TitleVariants,
  CategoryHeader, requestWithCallBack
} from './Misc';
import {ContentText} from "./ContentText";
import {validateMarkdownLinks} from "./AdminEditor";
import React, { useState, useRef }  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import { NavSidebar, Modules } from './NavSidebar';
import DictionarySearch  from './DictionarySearch';
import VersionBlock  from './VersionBlock/VersionBlock';
import ExtendedNotes from './ExtendedNotes';
import Footer  from './Footer';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Component   from 'react-class';
import {ContentLanguageContext} from './context';
import Hebrew from './sefaria/hebrew.js';

import ReactTags from 'react-tag-autocomplete';





class BookPage extends Component {
  // Menu for the Table of Contents for a single text
  constructor(props) {
    super(props);

    this.state = {
      versions: [],
      versionsLoaded: false,
      currentVersion: null,
      currObjectVersions: {en: null, he: null},
      indexDetails: Sefaria.getIndexDetailsFromCache(props.title),
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

    if (this.isBookToc() && !this.props.compare) {
      if(!this.state.versionsLoaded){
        Sefaria.getVersions(this.props.title).then(result => {
          this.onVersionsLoad(Object.values(result).flat());
        })
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
        language:               currentLanguage,
        versionTitle:           currentLanguage == "he" ? d.heVersionTitle : d.versionTitle,
        versionSource:          currentLanguage == "he" ? d.heVersionSource : d.versionSource,
        versionStatus:          currentLanguage == "he" ? d.heVersionStatus : d.versionStatus,
        license:                currentLanguage == "he" ? d.heLicense : d.license,
        sources:                currentLanguage == "he" ? d.heSources : d.sources,
        versionNotes:           currentLanguage == "he" ? d.heVersionNotes : d.versionNotes,
        digitizedBySefaria:     currentLanguage == "he" ? d.heDigitizedBySefaria : d.digitizedBySefaria,
        versionTitleInHebrew: currentLanguage == "he" ? d.heVersionTitleInHebrew : d.VersionTitleInHebrew,
        shortVersionTitle:    currentLanguage == "he" ? d.heShortVersionTitle : d.shortVersionTitle,
        shortVersionTitleInHebrew: currentLanguage == "he" ? d.heShortVersionTitleInHebrew : d.shortVersionTitleInHebrew,
        versionNotesInHebrew: currentLanguage == "he" ? d.heVersionNotesInHebrew : d.VersionNotesInHebrew,
        extendedNotes:        currentLanguage == "he" ? d.heExtendedNotes : d.extendedNotes,
        extendedNotesHebrew:  currentLanguage == "he" ? d.extendedNotesHebrew : d.heExtendedNotesHebrew,
      }
    };
    currentVersion.merged = !!(currentVersion.sources);
    return currentVersion;
  }
  openVersion(version, language) {
    // Selects a version and closes this menu to show it.
    // Calling this functon wihtout parameters resets to default
    this.props.selectVersion(version, language);
    this.props.close();
  }
  isBookToc() {
    return (this.props.mode == "book toc")
  }
  isTextToc() {
    return (this.props.mode == "text toc")
  }
  extendedNotesBack(event){
    return null;
  }
  render() {
    const title     = this.props.title;
    const index     = Sefaria.index(title);
    const heTitle   = index ? index.heTitle : title;
    const category  = this.props.category;
    const isDictionary = this.state.indexDetails && !!this.state.indexDetails.lexiconName;
    const categories = Sefaria.index(this.props.title).categories;
    let currObjectVersions = this.state.currObjectVersions;
    let catUrl;
    if (category == "Commentary") {
      const baseCategory = index.categories[0];
      const commCategory = index.categories.find(x => x === "Commentary" || x.includes(` on ${baseCategory}`)); //this finds commentary categories in Mishnah, Talmud and Tanakh such as "Rishonim on Tanakh"
      const urlCategories = index.categories.slice(0, index.categories.indexOf(commCategory || baseCategory) + 1);
      catUrl = `/texts/${urlCategories.join("/")}`
    } else if (category == "Targum" || category == "Guides") {
      catUrl  = "/texts/" + index.categories.slice(0, index.categories.indexOf(category) + 1).join("/");
    } else if (category == "Talmud") {
      catUrl  = "/texts/" + index.categories.slice(0, index.categories.indexOf("Talmud") + 2).join("/");
    } else {
      catUrl  = "/texts/" + category;
    }

    const readButton = !this.state.indexDetails || this.isTextToc() || this.props.compare ? null :
      Sefaria.lastPlaceForText(title) ?
        <a className="button small readButton" href={"/" + Sefaria.normRef(Sefaria.lastPlaceForText(title).ref)}>
          <InterfaceText>Continue Reading</InterfaceText>
        </a>
        :
        <a className="button small readButton" href={"/" + Sefaria.normRef(this.state.indexDetails["firstSectionRef"])}>
          <InterfaceText>Start Reading</InterfaceText>
        </a>

    const tabs = [{id: "contents", title: {en: "Contents", he: Sefaria._("Contents")}}];
    if (this.isBookToc()){
      tabs.push({id: "versions", title: {en: "Versions", he: Sefaria._("Versions")}});
    }
    const renderTab = t => (
      <div className={classNames({tab: 1, noselect: 1})}>
        <InterfaceText text={t.title} />
        { t.icon ? <img src={t.icon} alt={`${t.title.en} icon`} /> : null }
      </div>
    );

    const sidebarModules = !this.state.indexDetails ? [] :
      [
        this.props.multiPanel ? {type: "AboutText", props: {index: this.state.indexDetails}} : {type: null},
        {type: "Promo"},
        {type: "RelatedTopics", props: { title: this.props.title}},
        !isDictionary ? {type: "DownloadVersions", props:{sref: this.props.title}} : {type: null},
      ];

    const classes = classNames({
      bookPage: 1,
      readerNavMenu: 1,
      fullBookPage: this.isBookToc(),
      narrowPanel: this.props.narrowPanel,
      compare: this.props.compare,
      noLangToggleInHebrew: Sefaria.interfaceLang === 'hebrew'
    });

    var hasTranslation = false;
    for (var v = 0; v < this.state.versions.length; v++ ) {
      if (this.state.versions[v].language == "he") {
        hasTranslation = true;
        break;
      }
    }

    return (
      <div className={classes}>
        <CategoryColorLine category={category} />
        {this.isTextToc() || this.props.compare ?
        <>
          <div className="readerControls">
            <div className="readerControlsInner">
              <div className="leftButtons">
                {this.props.compare ?
                <MenuButton onClick={this.props.onCompareBack} compare={true} />
                : <CloseButton onClick={this.props.close} />}
              </div>
              <div className="readerTextToc readerTextTocHeader">
                {this.props.compare ?
                <div className="readerTextTocBox">
                  <InterfaceText>{title}</InterfaceText>
                </div>
                :
                <div className="readerTextTocBox sans-serif">
                  <InterfaceText>Table of Contents</InterfaceText>
                </div>}
              </div>
              <div className="rightButtons">
                {Sefaria.interfaceLang !== "hebrew" ?
                  <DisplaySettingsButton onClick={this.props.openDisplaySettings} />
                  : <DisplaySettingsButton placeholder={true} />}
              </div>
            </div>
          </div>
        </> : null}

        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner followsContentLang">
              {this.props.compare ? null :
              <div className="tocTop">
                <div className="tocTitle" role="heading" aria-level="1">
                  <div className="tocTitleControls">
                    <CategoryHeader type="books" buttonsToDisplay={["section", "edit"]}
                                    data={title}><ContentText text={{en:title, he:heTitle}}/></CategoryHeader>
                                        {hasTranslation ?
                    <span><img src="/static/img/with_translation.svg" alt="內含藏文翻譯" style={{margin: '0px 10px'}}/></span> : null }
                  </div>
                  { this.props.multiPanel && this.props.toggleLanguage && Sefaria.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
                  <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                </div>

                <a className="tocCategory" href={catUrl}>
                  <ContentText text={{en:category, he:Sefaria.hebrewTerm(category)}}/>
                </a>

                <CategoryAttribution categories={categories} asEdition={true} />

                {this.state.indexDetails && this.state.indexDetails.dedication ?
                  <div className="dedication">
                    <span>
                      <ContentText html={{en:this.state.indexDetails.dedication.en, he:this.state.indexDetails.dedication.he}}/>
                    </span>
                  </div> : null }
              </div>}

              {this.state.indexDetails ?
              <div>
                {readButton}

                {this.props.multiPanel ? null :
                <div className="about">
                  <Modules type={"AboutText"} props={{index: this.state.indexDetails, hideTitle: true}} />
                </div>}

                 <TabView
                  tabs={tabs}
                  currTabName={this.props.tab}
                  setTab={this.props.setTab}
                  renderTab={renderTab}
                  containerClasses={"largeTabs"}>
                   <TextTableOfContents
                        narrowPanel={this.props.narrowPanel}
                        title={this.props.title}
                        close={this.props.close}
                        showBaseText={this.props.showBaseText}
                        currVersions={this.props.currVersions}
                   />
                   <VersionsList
                     currObjectVersions={currObjectVersions}
                     openVersionInReader={this.openVersion}
                     currentRef={this.props.currentRef}
                     viewExtendedNotes={this.props.viewExtendedNotes}
                   />
                 </TabView>


              </div>
                  :
              <LoadingMessage />
              }
            </div>
            {this.isBookToc() && ! this.props.compare ? 
            <NavSidebar modules={sidebarModules} /> : null}
          </div>
          {this.isBookToc() && ! this.props.compare ?
          <Footer /> : null}
        </div>
      </div>
    );
  }
}
BookPage.propTypes = {
  mode:                  PropTypes.string.isRequired,
  title:                 PropTypes.string.isRequired,
  category:              PropTypes.string.isRequired,
  currentRef:            PropTypes.string.isRequired,
  settingsLanguage:      PropTypes.string.isRequired,
  currVersions:          PropTypes.object.isRequired,
  compare:               PropTypes.bool,
  narrowPanel:           PropTypes.bool,
  close:                 PropTypes.func.isRequired,
  showBaseText:          PropTypes.func.isRequired,
  selectVersion:         PropTypes.func,
  viewExtendedNotes:     PropTypes.func,
  onCompareBack:         PropTypes.func,
  backFromExtendedNotes: PropTypes.func,
  extendedNotes:         PropTypes.string,
  extendedNotesHebrew:   PropTypes.string
};


class TextTableOfContents extends Component {
  // The content section of the text table of contents that includes links to text sections,
  // and tabs for alternate structures and commentary.

  constructor(props) {
    super(props);
    this.state = {
      tab: "schema",
      indexDetails: Sefaria.getIndexDetailsFromCache(props.title)
    };
  }
  componentDidMount() {
    this.loadData();
    this.scrollToCurrent();
  }
  loadData(){
    // Ensures data this text is in cache, rerenders after data load if needed
    Sefaria.getIndexDetails(this.props.title).then((data) => {
      this.setState({
        indexDetails: data,
        tab: this.getDefaultActiveTab(data)
       });
      this.scrollToCurrent();
    });
  }
  annotateTorahAltDisplayProperties(altStructSchema){
    for (const node of altStructSchema.nodes) {
      node["displayFixedTitleSubSections"] = true;
    }
  }
  scrollToCurrent(){
    const curr = document.querySelector(".current");
    if(curr){
      Sefaria.util.scrollIntoViewIfNeeded(curr, {block: "center"});
    }
  }
  getDefaultActiveTab(indexDetails){
    return ("default_struct" in indexDetails && indexDetails.default_struct in indexDetails?.alts) ? indexDetails.default_struct : "schema";
  }
  setTab(tab) {
    this.setState({tab: tab});
  }
  handleClick(e) {
    const $a = $(e.target).closest("a");
    if ($a.length && ($a.hasClass("sectionLink") || $a.hasClass("linked"))) {
      let ref = $a.attr("data-ref");
      ref = decodeURIComponent(ref);
      ref = Sefaria.humanRef(ref);
      if(this.props?.close){
        this.props.close();
      }
      this.props.navigatePanel ? this.props.navigatePanel(ref, this.props.currVersions) : this.props.showBaseText(ref, false, this.props.currVersions);
      e.preventDefault();
    }
  }
  render() {
    if(this.state.indexDetails == null){
      return (<LoadingMessage />);
    }
    const isTorah = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"].indexOf(this.props.title) > -1;
    const isDictionary = this.state.indexDetails?.lexiconName;
    const defaultStruct = this.getDefaultActiveTab(this.state.indexDetails);
    const excludedStructs = this.state.indexDetails?.exclude_structs || [];
    const alts = this.state.indexDetails?.alts || {};
    if(isTorah){
      //add a dummy prop (maybe later add to actual db) to indicate the special display case for this alt struct. 
      // Showing both linked title and subsections
      this.annotateTorahAltDisplayProperties(alts["Parasha"])
    }
    let structTabOptions = [];
    if(!excludedStructs.includes("schema")){
      structTabOptions.push({
        name: "schema",
        text: "sectionNames" in this.state.indexDetails?.schema ? this.state.indexDetails.schema.sectionNames[0] : "Contents",
        onPress: this.setTab.bind(null, "schema")
      })
    }
    for (let alt in alts) {
      if (alts.hasOwnProperty(alt) && !excludedStructs.includes(alt)) {
        structTabOptions.push({
          name: alt,
          text: alt,
          onPress: this.setTab.bind(null, alt)
        });
      }
    }
    structTabOptions = structTabOptions.sort(function(a, b) {
      return a.name == defaultStruct ? -1 :
              b.name == defaultStruct ? 1 : 0;
    }.bind(this));
    const showToggle = !(isDictionary || isTorah) && structTabOptions.length > 1;
    const toggleNames = showToggle ? structTabOptions.map(x => x.text) : [];
    const toggle = (showToggle ?
                  <TabbedToggleSet
                    tabOptions={structTabOptions}
                    activeTab={this.state.tab}
                    narrowPanel={this.props.narrowPanel} /> : null);
    
   const dictionarySearch = (isDictionary ?
              <DictionarySearch
              lexiconName={this.state.indexDetails.lexiconName}
              title={this.props.title}
              showBaseText={this.props.showBaseText}
              navigatePanel={this.props.navigatePanel}
              contextSelector=".textTableOfContents"
              currVersions={this.props.currVersions}/> : null);
    let content;
    switch(this.state.tab) {
      case "schema":
        if (isTorah) {
          content = (
            <>
              <SchemaNode
                schema={this.state.indexDetails.schema}
                topToggleTitles={toggleNames}
                addressTypes={this.state.indexDetails.schema.addressTypes}
                refPath={this.props.title}
                topLevel={true}
                topLevelHeader={"Chapters"}
                currentlyVisibleRef={this.props.currentlyVisibleRef}
                currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}
              />
              <div className="torahNavParshiot">
                <SchemaNode
                  schema={alts["Parasha"]}
                  addressTypes={alts["Parasha"]["nodes"][0]["addressTypes"]}
                  refPath={this.props.title}
                  topLevel={true}
                  topLevelHeader={"Torah Portions"}
                  disableSubCollapse={true}
                  currentlyVisibleRef={this.props.currentlyVisibleRef}
                  currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}
                />
              </div>
            </>
          );
        } else {
          content = <SchemaNode
                      schema={this.state.indexDetails.schema}
                      topToggleTitles={toggleNames}
                      addressTypes={this.state.indexDetails.schema.addressTypes}
                      refPath={this.props.title}
                      topLevel={true}
                      currentlyVisibleRef={this.props.currentlyVisibleRef}
                      currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}

          />;
        }
        break;
      default:
        content = <SchemaNode
                    schema={alts[this.state.tab]}
                    addressTypes={this.state.indexDetails.schema.addressTypes}
                    refPath={this.props.title}
                    topLevel={true}
                    currentlyVisibleRef={this.props.currentlyVisibleRef}
                    currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}
                    />;
        break;
    }

    return (
        <div onClick={this.handleClick}>
          <div className="textTableOfContents">
            <div className="tocTools">
              {toggle}
              {dictionarySearch}
            </div>
            <div className="tocContent">
              {content}
            </div>
          </div>
        </div>
    );
  }
}
TextTableOfContents.propTypes = {
    title:           PropTypes.string.isRequired,
    narrowPanel:     PropTypes.bool,
    close:           PropTypes.func,
    showBaseText:    PropTypes.func,
    currVersions:    PropTypes.object
};


const TabbedToggleSet = ({tabOptions, activeTab, narrowPanel}) => {
  let options = tabOptions.map(function(option, i) {
    const handleClick = function(e) {
      e.preventDefault();
      option.onPress();
    }.bind(this);

    let classes = classNames({altStructToggle: 1, "sans-serif": 1, active: activeTab === option.name});
    const url = Sefaria.util.replaceUrlParam("tab", option.name);
    return (
      <div className="altStructToggleBox" key={i}>
        <a className={classes} onClick={handleClick} href={url}>
            <InterfaceText>{option.text}</InterfaceText>
        </a>
      </div>
    );
    }.bind(this));

    let rows = [];
    if (narrowPanel) {
      const rowSize = options.length == 4 ? 2 : 3;
      for (let i = 0; i < options.length; i += rowSize) {
        rows.push(options.slice(i, i+rowSize));
      }
    } else {
      rows = [options];
    }

    return (
        <div className="structToggles">
            {rows.map(function(row, i) {
              return (<div className="structTogglesInner" key={i}>{row}</div>);
            })}
        </div>
    );

}
TabbedToggleSet.propTypes = {
  tabOptions:     PropTypes.array.isRequired, // array of object with `name`. `text`, `heText`, `onPress`
  activeTab:      PropTypes.string.isRequired,
  narrowPanel: PropTypes.bool
};


class SchemaNode extends Component {
  constructor(props) {
    super(props);
    this.state = {
      // Collapse nodes below top level, and those that aren't default or makred includedSections
      collapsed: "nodes" in props.schema && !(props.topLevel || props.disableSubCollapse) ? props.schema.nodes.map(node => !(node.default || node.includeSections)) : []
    };
  }
  toggleCollapse(i) {
    if(this.props.disableSubCollapse) return;
    
    this.state.collapsed[i] = !this.state.collapsed[i];
    this.setState({collapsed: this.state.collapsed});
  }
  render() {
    if (!("nodes" in this.props.schema)) {
      if (this.props.schema.nodeType === "JaggedArrayNode") {
        return (
          <JaggedArrayNode
            schema={this.props.schema}
            topToggleTitles={this.props.topToggleTitles}
            refPath={this.props.refPath}
            topLevel={this.props.topLevel}
            topLevelHeader={this.props.topLevelHeader}
            currentlyVisibleRef={this.props.currentlyVisibleRef}
            currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}
          />
        );
      } else if (this.props.schema.nodeType === "ArrayMapNode") {
        return (
          <ArrayMapNode schema={this.props.schema} currentlyVisibleRef={this.props.currentlyVisibleRef} currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef} />
        );
      } else if (this.props.schema.nodeType === "DictionaryNode") {
        return (
          <DictionaryNode
              schema={this.props.schema}
              currentlyVisibleRef={this.props.currentlyVisibleRef} 
              currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}
          />
        );
      }

    } else { //we do have subcontent
      let content = this.props.schema.nodes.map(function(node, i) {
        let path;
        if (node.nodeType == "ArrayMapNode") {
          //ArrayMapNode content
          path = this.props.refPath + ", " + node.title;
          return <ArrayMapNode schema={node} currentlyVisibleRef={this.props.currentlyVisibleRef}  currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef} key={path}/>;
        } else if ("nodes" in node) {
          // SchemaNode with children (nodes)
          path = this.props.refPath + ", " + node.title;
          return (
            <div className="schema-node-toc" data-ref={path} key={path}>
              <span className={`schema-node-title ${this.state.collapsed[i] ? "collapsed" : "open"} ${this.props.disableSubCollapse ? "fixed" : ""}`}
                    onClick={()=> {this.toggleCollapse(i)}}
                    onKeyPress={(e) => {e.charCode == 13 ? this.toggleCollapse(i):null}}
                    role="heading"
                    aria-level="3"
                    aria-hidden="true" tabIndex={0}>
                <ContentText text={{en: node.title, he: node.heTitle}} />
              </span>
              {!this.state.collapsed[i] ?
              <div className="schema-node-contents">
                <SchemaNode
                  schema={node}
                  refPath={this.props.refPath + ", " + node.title}
                  topToggleTitles={this.props.topToggleTitles}
                  currentlyVisibleRef={this.props.currentlyVisibleRef}
                  currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}/>
              </div>
              : null }
            </div>);
        } else if (node.nodeType == "DictionaryNode") {
          return <DictionaryNode 
              schema={node} 
              currentlyVisibleRef={this.props.currentlyVisibleRef} 
              currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef} 
              key={i}
          />;
        } else if (node.depth == 1 && !node.default) {
          // SchemaNode title that points straight to content
          //we check if this happens to be where the reader is currently at
          path = this.props.refPath + ", " + node.title;
          let currentPlace = path == this.props?.currentlyVisibleSectionRef;
          const linkClasses = classNames({"schema-node-toc": 1, "linked": 1, "current": currentPlace})
          return (
            <a className={linkClasses} href={"/" + Sefaria.normRef(path)} data-ref={path} key={i}>
              <span className="schema-node-title" role="heading" aria-level="3">
                <ContentText text={{en:node.title , he:node.heTitle }}/>
              </span>
            </a>);
        } else {
          // SchemaNode that has a JaggedArray below it
          return (
            <div className="schema-node-toc janode" key={i}>
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
                  topToggleTitles={this.props.topToggleTitles}
                  contentLang={this.props.contentLang}
                  refPath={this.props.refPath + (node.default ? "" : ", " + node.title)}
                  currentlyVisibleRef={this.props.currentlyVisibleRef}
                  currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}
                />
              </div>
              : null }
            </div>);
        }
      }.bind(this));
      let topLevelHeader = this.props.topLevel && this.props.topLevelHeader ? (
        <div className="specialNavSectionHeader">
          <ContentText text={{
            en: this.props.topLevelHeader,
            he: Sefaria.hebrewTranslation(this.props.topLevelHeader)
          }}/>
        </div>
      ) : null;
      return (
          <>
            {topLevelHeader}
            <div className="tocLevel">{content}</div>
          </>

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
    const offset = this.props.schema?.index_offsets_by_depth?.['1'] || 0;
    if ("toc_zoom" in this.props.schema) {
      let zoom = this.props.schema.toc_zoom - 1;
      return (<JaggedArrayNodeSection
                depth={this.props.schema.depth - zoom}
                sectionNames={this.props.schema.sectionNames.slice(0, -zoom)}
                addressTypes={this.props.schema.addressTypes.slice(0, -zoom)}
                contentCounts={this.props.schema.content_counts}
                refPath={this.props.refPath}
                currentlyVisibleRef={this.props.currentlyVisibleRef}
                currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}
                offset={offset}
              />);
    }
    const specialHeaderText = this.props.topLevelHeader || this.props.schema?.sectionNames[0] || "Chapters";
    let topLevelHeader = !this.props.topToggleTitles.includes(specialHeaderText) && (this.props.topLevel && (this.props.schema?.depth <= 2 || this.props.topLevelHeader)) ? (
        <div className="specialNavSectionHeader">
          <ContentText text={{
            en: specialHeaderText,
            he: Sefaria.hebrewTranslation(specialHeaderText)
          }}/>
        </div>
    ) : null;
    return (
        <>
          {topLevelHeader}
          <JaggedArrayNodeSection
                depth={this.props.schema.depth}
                sectionNames={this.props.schema.sectionNames}
                addressTypes={this.props.schema.addressTypes}
                contentCounts={this.props.schema.content_counts}
                refPath={this.props.refPath}
                currentlyVisibleRef={this.props.currentlyVisibleRef}
                currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}
                offset={offset}
          />
        </>
    );
  }
}
JaggedArrayNode.propTypes = {
  schema:      PropTypes.object.isRequired,
  refPath:     PropTypes.string.isRequired,
  topToggleTitles: PropTypes.array
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
      for (let i = 0; i < this.props.contentCounts.length; i++) {
        if (this.contentCountIsEmpty(this.props.contentCounts[i])) { continue; }
        let [enSection, heSection] = Sefaria.getSectionStringByAddressType(this.props.addressTypes[0], i);
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
              refPath={this.props.refPath + ":" + enSection}
              currentlyVisibleRef={this.props.currentlyVisibleRef}
              currentlyVisibleSectionRef={this.props.currentlyVisibleSectionRef}/>
          </div>);
      }
      return ( <div className="tocLevel">{content}</div> );
    }
    let contentCounts = this.props.depth == 1 ? new Array(this.props.contentCounts).fill(1) : this.props.contentCounts;
    let sectionLinks = [];
    for (let i = 0; i < contentCounts.length; i++) {
      if (this.contentCountIsEmpty(contentCounts[i])) { continue; }
      let [section, heSection] = Sefaria.getSectionStringByAddressType(this.props.addressTypes[0], i, this.props.offset);
      let ref  = (this.props.refPath + ":" + section).replace(":", " ") + this.refPathTerminal(contentCounts[i]);
      let currentPlace = ref == this.props?.currentlyVisibleSectionRef || ref == this.props?.currentlyVisibleRef || Sefaria.refContains(this.props?.currentlyVisibleSectionRef, ref); //the second clause is for depth 1 texts
      const linkClasses = classNames({"sectionLink": 1, "current": currentPlace}); 
      let link = (
        <a className={linkClasses} href={"/" + Sefaria.normRef(ref)} data-ref={ref} key={i}>
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
    this.state = {
      collapsed: false
    };
  }
  toggleCollapse() {
    if(this.props.schema.displayFixedTitleSubSections) return;
    this.setState({collapsed: !this.state.collapsed});
  }
  render() {
    const schema = this.props.schema;
    const includeSections = schema?.includeSections ?? true; //either undefined or explicitly true
    if ("refs" in schema && schema.refs.length && includeSections) {
      let skip = 0;
      let sectionLinks = schema.refs.map(function(ref, i) {
        if ('addresses' in schema) {
          i = schema.addresses[i] - 1;
        } else {
          i += schema.offset || 0;
          if ('skipped_addresses' in schema) {
            i += skip;
            while (schema.skipped_addresses.includes(i+1)) {
              skip++;
              i++;
            }
          }
        }
        if (ref === "") {
          return null;
        }
        let [section, heSection] = Sefaria.getSectionStringByAddressType(schema.addressTypes[0], i);
        let currentPlace = ref == this.props?.currentlyVisibleSectionRef  || ref == this.props?.currentlyVisibleRef || Sefaria.refContains(ref, this.props?.currentlyVisibleRef);
        const linkClasses = classNames({"sectionLink": 1, "current": currentPlace}); 
        return (
          <a className={linkClasses} href={"/" + Sefaria.normRef(ref)} data-ref={ref} key={i}>
            <ContentText text={{en:section, he:heSection}}/>
          </a>
        );
      }.bind(this));
      
      let path = this.props.refPath + ", " + schema.title;
      let ref = "wholeRef" in schema ? Sefaria.splitSpanningRefNaive(schema.wholeRef)[0] : null;
      
      return schema.displayFixedTitleSubSections ? (
          <a className="schema-node-toc linked" href={"/" + Sefaria.normRef(ref)} data-ref={ref} key={path}>
            <span className="schema-node-title open fixed"
                  role="heading"
                  aria-level="3"
                  aria-hidden="true" tabIndex={0}>
              <ContentText text={{en: schema.title, he: schema.heTitle}} />
            </span>
            <div className="schema-node-contents">{sectionLinks}</div>
          </a>
      ) : (
          <div className="schema-node-toc" data-ref={path} key={path}>
            <span className={`schema-node-title ${this.state.collapsed ? "collapsed" : "open"}`}
                  onClick={()=> {this.toggleCollapse()}}
                  onKeyPress={(e) => {e.charCode == 13 ? this.toggleCollapse():null}}
                  role="heading"
                  aria-level="3"
                  aria-hidden="true" tabIndex={0}>
              <ContentText text={{en: schema.title, he: schema.heTitle}} />
            </span>
            {!this.state.collapsed ?
            <div className="schema-node-contents">{sectionLinks}</div>
            : null }
          </div>
      );

    } else { //just a single link for an alt struct section
      let currentPlace = this.props?.currentlyVisibleSectionRef && 
          (schema.wholeRef == this.props?.currentlyVisibleRef || (Sefaria.refContains(schema.wholeRef, this.props?.currentlyVisibleRef)));
      const linkClasses = classNames({"schema-node-toc": 1, "linked":1, "current": currentPlace}); 
      return (
        <a className={linkClasses} href={"/" + Sefaria.normRef(schema.wholeRef)} data-ref={schema.wholeRef}>
          <span className="schema-node-title" role="heading" aria-level="3">
            <ContentText text={{en:schema.title, he:schema.heTitle}}/>
          </span>
        </a>);
    }
  }
}
ArrayMapNode.propTypes = {
  schema:      PropTypes.object.isRequired
};


class DictionaryNode extends Component {
  getCurrentLetter(){ 
    //we need this so we can tell what letter of the alphabet a user is currently looking at based on the current ref, since the letters arent actually super
    // sections. 
    if(this.props?.currentlyVisibleSectionRef){
      const rf = this.props.currentlyVisibleSectionRef;
      const letterSectionRf = rf.substring(0, rf.lastIndexOf(",") + 3); 
      //get the substring up to the character after the last comma (and the space) thats the letter of the
      // alphabet we are on
      return letterSectionRf;
    }
    return null;
  }
  render() {
    if (this.props.schema.headwordMap) {
      const headerText = this.props.schema.title ? (
        <ContentText text={{en:this.props.schema.title , he:this.props.schema.heTitle }}/>
      ) : (
        <ContentText text={{en: "Browse By Letter", he: 'לפי סדר הא"ב'}}/>);
      const letterSection = this.getCurrentLetter();
      let sectionLinks = this.props.schema.headwordMap.map((m, i) => {
        let letter = m[0];
        let ref = m[1];
        let currentPlace = letterSection ? ref == letterSection : false;
        const linkClasses = classNames({"sectionLink": 1, "current": currentPlace});
        return (
            <a className={linkClasses} href={"/" + Sefaria.normRef(ref)} data-ref={ref} key={i}>
              <ContentText text={{en: letter, he: letter}}/>
            </a>
        );
      });
      return (
          <div className="schema-node-toc">
            <div className="schema-node-contents">
              <div className="specialNavSectionHeader">
                {headerText}
              </div>
              <div className="tocLevel">{sectionLinks}</div>
            </div>
          </div>
      );
    }
  }
}
DictionaryNode.propTypes = {
  schema:      PropTypes.object.isRequired
};


class VersionsList extends Component {
  componentDidMount() {
    Sefaria.getVersions(this.props.currentRef).then((result) => {
          this.onVersionsLoad(Object.values(result).flat());
        });
  }
  onVersionsLoad(versions){
    versions.sort(
      (a, b) => {
        if      (a.priority > b.priority)                {return -1;}
        else if (a.priority < b.priority)                {return 1;}
        else if (a.versionTitle < b.versionTitle)        {return -1;}
        else if (a.versionTitle > b.versionTitle)        {return  1;}
        else                                             {return  0;}
      }
    );
    this.setState({versions: versions});
  }
  render() {
    if (!this?.state?.versions) {
        return (
          <div className="versionsBox">
            <LoadingMessage />
          </div>
        );
    }
    let versions = this.state.versions;
    let vblocks = versions.map(v =>
      <VersionBlock
        rendermode="book-page"
        version={v}
        currObjectVersions={this.props.currObjectVersions}
        currentRef={this.props.currentRef}
        firstSectionRef={"firstSectionRef" in v ? v.firstSectionRef : null}
        openVersionInReader={this.props.openVersionInReader}
        viewExtendedNotes={this.props.viewExtendedNotes}
        key={v.versionTitle + "/" + v.language}/>
     );
    return (
      <div className="versionsBox">
        {vblocks}
      </div>
    );
  }
}
VersionsList.propTypes = {
  currentRef:                PropTypes.string,
  currObjectVersions:        PropTypes.object,
  openVersionInReader:       PropTypes.func,
  viewExtendedNotes:         PropTypes.func,
};

const SectionTypesBox = function({sections, canEdit, updateParent}) {
  const box = useRef(null);
  const add = function() {
    updateParent(sections.concat("")); //tell parent new values
  }
  const remove = function(i) {
    updateParent(sections.slice(0, i+1)); //tell parent new values
  }
  const updateSelfAndParent = function() {
    let newSections = Array.from(box.current.children).map(item => item.value);
    updateParent(newSections);
  }

  return <div id="sBox" ref={box}>
            {sections.map(function(section, i) {
              if (i === 0) {
                return <input onChange={updateSelfAndParent} className={'sectionType'} defaultValue={section}/>;
              }
              else if (canEdit) {
                return <span><input onChange={updateSelfAndParent} className={'sectionType'} defaultValue={section}/><span className="remove" onClick={(i) => remove(i)}>X</span></span>;
              }
              else {
                return <input onChange={updateSelfAndParent} className={'sectionType'} defaultValue={section}/>;
              }
            })}
            {canEdit ? <span className="add" onClick={add}>Add Section</span> : null}
          </div>
}



const EditTextInfo = function({initTitle, close}) {
  const index = useRef(null);
  index.current = Sefaria.getIndexDetailsFromCache(initTitle);
  const oldTitle = index.current.title; //save original title, in case english title gets edited
  const [enTitle, setEnTitle] = useState(index.current.title);
  const [heTitle, setHeTitle] = useState(index.current.heTitle);
  const [titleVariants, setTitleVariants] = useState(index.current.titleVariants.map((item, i) =>({["name"]: item, ["id"]: i})));
  const [heTitleVariants, setHeTitleVariants] = useState(index.current.heTitleVariants.map((item, i) =>({["name"]: item, ["id"]: i})));
  const [categories, setCategories] = useState(index.current.categories);
  const [savingStatus, setSavingStatus] = useState(false);
  const [sections, setSections] = useState(index.current.sectionNames);
  const [enDesc, setEnDesc] = useState(index.current?.enDesc || "");
  const [enShortDesc, setEnShortDesc] = useState(index.current?.enShortDesc || "");
  const [heDesc, setHeDesc] = useState(index.current?.heDesc || "");
  const [heShortDesc, setHeShortDesc] = useState(index.current?.heShortDesc || "");
  const [authors, setAuthors] = useState(index.current.authors?.map((item, i) =>({["name"]: item.en, ["slug"]: item.slug, ["id"]: i})) || []);
  const [pubDate, setPubDate] = useState(index.current?.pubDate);
  const [pubPlace, setPubPlace] = useState(index.current?.pubPlaceString?.en);
  const [hePubPlace, setHePubPlace] = useState(index.current?.pubPlaceString?.he);
  const [compPlace, setCompPlace] = useState(index.current?.compPlaceString?.en);
  const [heCompPlace, setHeCompPlace] = useState(index.current?.compPlaceString?.he);
  const getYearAsStr = (init) => {
    if (typeof init === 'undefined' || init.length === 0) {
      return "";
    } else if (init.length === 2) {
      return `${init[0]}-${init[1]}`;
    }
    else if (init.length === 1) {
      return `${init[0]}`;
    }
  }
  const [compDate, setCompDate] = useState(index.current?.compDate);
  const initCompDate = getYearAsStr(index.current?.compDate);  //init comp date to display
  const initPubDate = getYearAsStr(index.current?.pubDate);


  const toggleInProgress = function() {
    setSavingStatus(savingStatus => !savingStatus);
  }
  const validate = async function () {
    if (!enTitle) {
      alert("Please give a text title or commentator name.");
      return false;
    }

    if (!heTitle && Sefaria._siteSettings.TORAH_SPECIFIC) {
      alert("Please give a Hebrew text title.");
      return false;
    }

    if (/[.\-\\\/]/.test(enTitle)) {
      alert('Text titles may not contain periods, hyphens or slashes.');
      return false;
    }

    if (/[0-9]/.test(enTitle)) {
      alert('Text titles may not contain numbers. This form is for general information about a text as a whole, not specific citations.');
      return false;
    }

    if (categories.length === 0) {
      alert("Please choose a text category.");
      return false;
    }

    for (let i = 0; i < categories.length; i++) {
      if (/[.\-\\\/]/.test(categories[i])) {
        alert('Categories may not contain periods, hyphens or slashes.');
        return false;
      }
    }
    if (Hebrew.containsHebrew(enTitle)) {
      alert("Please enter a primary title in English. Use the Hebrew Title field to specify a title in Hebrew.");
      return false;
    }
    for (const x of [enDesc, heDesc]) {
      const valid_tags = await validateMarkdownLinks(x);
      if (!valid_tags) {
        return false;
      }
    }
    return true;
  }
  const validateCompDate = (newValue, setter) => {
    let pattern = /(-?\d+)(-?)(-?\d*)/;
    let result = newValue.match(pattern);
    if (!result) {
      setter([]);
    }
    else if (result[2] === "-") {
      const start = Number.parseInt(result[1]);
      const end = Number.parseInt(result[3]);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        alert("Year must be an integer or range of integers.");
      }
      else if (end <= start) {
        alert(`Invalid date format ${start} to ${end}`);
      }
      else {
        setter([start, end]);
      }
    }
    else {
      const year = Number.parseInt(newValue);
      if (Number.isNaN(year)) {
        alert("Year must be an integer or range of integers.");
      }
      else {
        setter([year]);
      }
    }
  }
  const save = function() {
    const enTitleVariantNames = titleVariants.map(i => i.name);
    const heTitleVariantNames = heTitleVariants.map(i => i.name);
    const authorSlugs = authors.map(i => i.slug);
    let postIndex = {title: enTitle, authors: authorSlugs, titleVariants: enTitleVariantNames, heTitleVariants: heTitleVariantNames,
                    heTitle, categories, enDesc, enShortDesc, heDesc, heShortDesc, pubPlace, compPlace, hePubPlace, heCompPlace
                    }
    if (sections && sections.length > 0) {
      postIndex.sectionNames = sections;
    }
    if (enTitle !== oldTitle) {
      postIndex.oldTitle = oldTitle;
    }
    if (getYearAsStr(pubDate) !== initPubDate) {
      postIndex.pubDate = pubDate;
    }
    if (getYearAsStr(compDate) !== initCompDate) {
      postIndex.compDate = compDate;
    }
    let postJSON = JSON.stringify(postIndex);
    let title = enTitle.replace(/ /g, "_");
    let url = "/api/v2/raw/index/" + title;
    if ("oldTitle" in index.current) {
      url += "?update=1";
    }
    toggleInProgress();
    $.post(url,  {"json": postJSON}, function(data) {
      if (data.error) {
        toggleInProgress();
        alert(data.error);
      } else {
        alert("Text information saved.");
        window.location.href = "/admin/reset/"+index.current.title;
      }
      }).fail( function(xhr, textStatus, errorThrown) {
        alert("Unfortunately, there may have been an error saving this text information.");
        window.location.href = "/admin/reset/"+index.current.title;  // often this occurs when save occurs successfully but there is simply a timeout on cauldron so try resetting it
      });
  };
  const validateThenSave = async function () {
    const valid = await validate();
    if (valid) {
      save();
    }
  }
  const addAuthor = function (newAuthor) {
    const lowerCaseName = newAuthor.name.toLowerCase();
    Sefaria._ApiPromise(Sefaria.apiHost + "/api/topic/completion/" + newAuthor.name).then(d => {
      const matches = d[1].filter((t) => t.type === 'AuthorTopic');
      const exactMatch = matches.find((t) => t.title.toLowerCase() === lowerCaseName);
      if (!exactMatch) {
        const closestMatches = matches.map((t) => t.title);
        const closestMatchMsg = matches.length > 0 ? `The closest match(es) found were: ${closestMatches.join(', ')}` : "";
        alert(`Invalid author.  Make sure it is listed under the 'Authors' category in the Topic Table of Contents. ${closestMatchMsg}`);
      } else {
        const newAuthor = [{"id": authors.length, "name": exactMatch.title, "slug": exactMatch.key}];
        setAuthors([].concat(authors, newAuthor));
      }
    });
  }

  const removeAuthor = function (authorIDtoRemove) {
    let newAuthors = authors.filter(author => author.id !== authorIDtoRemove);
    setAuthors(newAuthors);
  }
  const deleteObj = () => {
    setSavingStatus(true);
    const url = `/api/v2/index/${enTitle}`;
    requestWithCallBack({url, type: "DELETE", redirect: () => window.location.href = `/texts`});
  }
  return (
      <div className="editTextInfo">
      <div className="static">
        <div className="inner">
          {savingStatus ? <div className="collectionsWidget">Saving text information...<br/><br/>(processing title changes may take some time)</div> : null}
          <div id="newIndex">
            <AdminToolHeader title={"Index Editor"} close={close} validate={validateThenSave}/>
            <div className="section">
                <label><InterfaceText>Text Title</InterfaceText></label>
              <input type="text" id="textTitle" onChange={(e) => setEnTitle(e.target.value)} defaultValue={enTitle}/>
            </div>
            {Sefaria._siteSettings.TORAH_SPECIFIC ?
                <div className="section">
                <label><InterfaceText>Hebrew Title</InterfaceText></label>
                <input id="textTitle" type="text" onChange={(e) => setHeTitle(e.target.value)} defaultValue={heTitle}/>
                </div> : null}

            <div className="section">
                <label><InterfaceText>English Description</InterfaceText></label>
              <textarea className="default" onChange={(e) => setEnDesc(e.target.value)} defaultValue={enDesc}/>
            </div>
            <div className="section">
                <label><InterfaceText>Short English Description</InterfaceText></label>
              <textarea className="default" onChange={(e) => setEnShortDesc(e.target.value)} defaultValue={enShortDesc}/>
            </div>
            {Sefaria._siteSettings.TORAH_SPECIFIC ?
              <div className="section">
                  <label><InterfaceText>Hebrew Description</InterfaceText></label>
                <textarea className="default" onChange={(e) => setHeDesc(e.target.value)} defaultValue={heDesc}/>
              </div> : null}
            {Sefaria._siteSettings.TORAH_SPECIFIC ?
              <div className="section">
                  <label><InterfaceText>Short Hebrew Description</InterfaceText></label>
                <textarea className="default" onChange={(e) => setHeShortDesc(e.target.value)} defaultValue={heShortDesc}/>
              </div> : null}

            <div className="section">
              <label><InterfaceText>Category</InterfaceText></label>
              <CategoryChooser update={setCategories} categories={categories}/>
            </div>

            <div className="section">
              <div><InterfaceText>Authors</InterfaceText></div><label><span className="optional"><InterfaceText>Optional</InterfaceText></span></label>
              <TitleVariants titles={authors} options={{'onTitleAddition': addAuthor, 'onTitleDelete': removeAuthor}}/>
            </div>
            <div className="section">
              <div><InterfaceText>Alternate English Titles</InterfaceText></div><label><span className="optional"><InterfaceText>Optional</InterfaceText></span></label>

              <TitleVariants update={setTitleVariants} titles={titleVariants}/>
            </div>

            {Sefaria._siteSettings.TORAH_SPECIFIC ?
                <div className="section">
                  <div><InterfaceText>Alternate Hebrew Titles</InterfaceText></div><label><span className="optional"><InterfaceText>Optional</InterfaceText></span></label>
                  <TitleVariants update={setHeTitleVariants} titles={heTitleVariants}/>
                </div> : null}
            <div className="section">
              <div><InterfaceText>Completion Year</InterfaceText></div><label><span className="optional"><InterfaceText>Optional.  Provide a range if there is an error margin or the work was completed over the course of many years such as 1797-1800 or -900--200 (to denote 900 BCE to 200 BCE).</InterfaceText></span></label>
              <br/><input id="compDate" onBlur={(e) => validateCompDate(e.target.value, setCompDate)} defaultValue={initCompDate}/>
            </div>
            <div className="section">
              <div><InterfaceText>Place of Composition</InterfaceText></div>
              <label><span className="optional"><InterfaceText>Optional</InterfaceText></span></label>
              <input id="compPlace" onChange={(e) => setCompPlace(e.target.value)} defaultValue={compPlace}/>
            </div>
            {Sefaria._siteSettings.TORAH_SPECIFIC &&
                <div className="section">
                  <div><InterfaceText>Hebrew Place of Composition</InterfaceText></div><label>
                  <span className="optional"><InterfaceText>Optional</InterfaceText></span></label>
                  <input id="heCompPlace" onChange={(e) => setHeCompPlace(e.target.value)} defaultValue={heCompPlace}/>
                </div>}
            <div className="section">
              <div><InterfaceText>Publication Year</InterfaceText></div><label><span className="optional"><InterfaceText>Optional.  Provide a range if there is an error margin or the work was completed over the course of many years such as 1797-1800 or -900--200 (to denote 900 BCE to 200 BCE).</InterfaceText></span></label>
              <input id="pubDate" onBlur={(e) => validateCompDate(e.target.value, setPubDate)} defaultValue={initPubDate}/>
            </div>
            <div className="section">
              <div><InterfaceText>Place of Publication</InterfaceText></div><label><span className="optional"><InterfaceText>Optional</InterfaceText></span></label>
              <input id="pubPlace" onChange={(e) => setPubPlace(e.target.value)} defaultValue={pubPlace}/>
            </div>
            {Sefaria._siteSettings.TORAH_SPECIFIC &&
                <div className="section">
                  <div><InterfaceText>Hebrew Place of Publication</InterfaceText></div>
                  <label><span className="optional"><InterfaceText>Optional</InterfaceText></span></label>
                  <input id="hePubPlace" onChange={(e) => setHePubPlace(e.target.value)} defaultValue={hePubPlace}/>
                </div>}
            {index.current.hasOwnProperty("sectionNames") ?
              <div className="section">
                <div><label><InterfaceText>Text Structure</InterfaceText></label></div>
                <SectionTypesBox updateParent={setSections} sections={sections} canEdit={index.current === {}}/>
              </div> : null}
            <div onClick={deleteObj} id="deleteTopic" className="button small deleteTopic" tabIndex="0" role="button">
                <InterfaceText>Delete</InterfaceText>
            </div>
          </div>
        </div>
      </div>
      </div>
  );
}





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


/*
  TODO what happened to ExtendedNotes?

  {this.props.mode === "extended notes" ?
  <ExtendedNotes
    title={this.props.title}
    currVersions={this.props.currVersions}
    backFromExtendedNotes={this.props.backFromExtendedNotes}
  />
  : null }
*/



export {BookPage as default, TextTableOfContents, EditTextInfo};