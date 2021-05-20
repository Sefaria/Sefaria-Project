import {
    Dropdown,
    LoadingMessage,
    LoginPrompt,
    LanguageToggleButton,
    ReaderNavigationMenuCloseButton,
    SheetListing,
    Note,
    FeedbackBox,
    ProfilePic,
    ToolTipped, InterfaceText, ContentText,
} from './Misc';

import {
  MediaList
} from './Media';

import {  CategoryFilter,} from './ConnectionFilters';
import React,{useRef, useState, useEffect} from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import Sefaria from './sefaria/sefaria';
import $ from './sefaria/sefariaJquery';
import TextList from './TextList'
import ConnectionsPanelHeader from './ConnectionsPanelHeader';
import { AddToSourceSheetBox } from './AddToSourceSheet';
import LexiconBox from './LexiconBox';
import AboutBox from './AboutBox';
import TranslationsBox from './TranslationsBox';
import ExtendedNotes from './ExtendedNotes';
import classNames from 'classnames';
import Component             from 'react-class';


class ConnectionsPanel extends Component {
  constructor(props) {
    super(props);
    this._savedHistorySegments = new Set();
    this.state = {
      flashMessage: null,
      currObjectVersions: {en: null, he: null},
      mainVersionLanguage: props.masterPanelLanguage === "bilingual" ? "hebrew" : props.masterPanelLanguage,
      availableTranslations: [],
      linksLoaded: false, // has the list of refs been loaded
      connectionSummaryCollapsed: true,
    };
  }
  toggleTopLevelCollapsed(){
      this.setState({connectionSummaryCollapsed: !this.state.connectionSummaryCollapsed});
  }
  componentDidMount() {
    this._isMounted = true;
    this.loadData();
    this.getCurrentVersions();
    this.debouncedCheckVisibleSegments = Sefaria.util.debounce(this.checkVisibleSegments, 100);
    this.addScrollListener();
  }
  componentWillUnmount() {
    this._isMounted = false;
    this.removeScrollListener();
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadData();
    }
    // Turn on the lexicon when receiving new words if they are less than 3
    // and don't span refs.
    if (this.props.selectedWords &&
        this.props.selectedWords !== prevProps.selectedWords &&
        this.props.selectedWords.match(/[\s:\u0590-\u05ff.]+/) &&
        this.props.selectedWords.split(" ").length < 3 &&
        this.props.srefs.length === 1) {
      this.props.setConnectionsMode("Lexicon");
    }
    // Go back to main sidebar when words are unselected
    if (prevProps.selectedWords && prevProps.mode === "Lexicon" && !this.props.selectedWords && !this.props.selectedNamedEntity) {
      this.props.setConnectionsMode("Resources");
    }

    if (prevProps.currVersions.en     !== this.props.currVersions.en     ||
        prevProps.currVersions.he     !== this.props.currVersions.he     ||
        prevProps.masterPanelLanguage !== this.props.masterPanelLanguage ||
        prevProps.srefs[0]            !== this.props.srefs[0]) {
      this.getCurrentVersions();
    }

    if (prevProps.mode !== 'TextList' && this.props.mode === 'TextList') {
      this.removeScrollListener();
      this.addScrollListener();
    }
  }
  addScrollListener() {
    this.$scrollView = $(".connectionsPanel .texts");
    if (this.$scrollView[0]) {
      this.$scrollView[0].addEventListener("scroll", this.handleScroll);
    }
  }
  removeScrollListener() {
    if (!!this.$scrollView && this.$scrollView[0]) {
      this.$scrollView[0].removeEventListener("scroll", this.handleScroll);
    }
  }
  handleScroll(event) {
    this.debouncedCheckVisibleSegments();
  }
  checkVisibleSegments() {
    if (!this._isMounted || !this.props.filter || !this.props.filter.length) { return; }
    const initialFilter = this.props.filter;
    const initialRefs = this.props.srefs;
    this.$scrollView.find(".textListTextRangeBox .textRange").each((i, element) => {
      if (!this.isSegmentVisible(element)) { return; }
      const callback = this.onIntentTimer.bind(null, element, initialFilter, initialRefs);
      this.props.checkIntentTimer(null, callback);  // instead of saving timer, we want to have multiple timers running because multiple segments can be on screen
    });
  }
  onIntentTimer(element, initialFilter, initialRefs) {
    if (
      !this._isMounted                ||
      !this.isSegmentVisible(element) ||
      this.didFilterChange(initialFilter, initialRefs, this.props.filter, this.props.srefs)
    ) { return; }
    const ref = element.getAttribute('data-ref');
    if (this._savedHistorySegments.has(ref)) { return; }
    const parsedRef = Sefaria.parseRef(ref);
    // TODO: add version info once we support that in links
    Sefaria.saveUserHistory({
      ref,
      versions: {en: null, he: null},
      book: parsedRef.book,
      language: this.props.contentLang,
      secondary: true,
    });
    this._savedHistorySegments.add(ref);
  }
  isSegmentVisible(segment) {
    const threshold = 100;
    const $segment = $(segment);
    const top = $segment.offset().top - this.$scrollView.offset().top;
    const bottom = $segment.outerHeight() + top;
    return top < this.$scrollView.outerHeight() - threshold && bottom > threshold;
  }
  didFilterChange(prevFilter, prevRefs, nextFilter, nextRefs) {
    if (
      !prevFilter || !nextFilter ||
      !prevFilter.length || !nextFilter.length ||
      prevFilter[0] !== nextFilter[0]
    ) { return true; }
    return !prevRefs.compare(nextRefs);
  }
  sectionRef() {
    return Sefaria.sectionRef(Sefaria.humanRef(this.props.srefs)) || this.props.srefs;
  }
  loadData() {
    let ref = this.sectionRef();
    if (!Sefaria.related(ref)) {
        Sefaria.related(ref, function (data) {
            if (this._isMounted) {
                this.setState({
                  linksLoaded: true,
                });
            }
        }.bind(this));
    }
    else {
        this.setState({
          linksLoaded: true,
        });
    }
    Sefaria.versions(ref, false, ["he"], true).then(versions => this.setState({availableTranslations: versions})); //for counting translations
  }
  reloadData() {
    this.setState({
      linksLoaded: false,
    });
    Sefaria.clearLinks();
    this.loadData();
  }
  flashMessage(msg) {
    this.setState({flashMessage: msg});
    setTimeout(function() {
      this.setState({flashMessage: null});
    }.bind(this), 3000);
  }
  onSave() {
    this.reloadData();
    this.props.setConnectionsMode("Resources");
    this.flashMessage("Success! You've created a new connection.");
  }
  getData(cb) {
    // Gets data about this text from cache, which may be null.
    return Sefaria.getText(this.props.srefs[0], {context: 1, enVersion: this.props.currVersions.en, heVersion: this.props.currVersions.he}).then(cb);
  }
  getVersionFromData(d, lang) {
    //d - data received from this.getData()
    //language - the language of the version
    //console.log(d);
    const currentVersionTitle = (lang == "he") ? d.heVersionTitle : d.versionTitle;
    return {
      ... d.versions.find(v => v.versionTitle == currentVersionTitle && v.language == lang),
      title:                  d.indexTitle,
      heTitle:                d.heIndexTitle,
      sources:                lang == "he" ? d.heSources : d.sources,
      merged:                 lang == "he" ? !!d.heSources : !!d.sources,
    }
  }
  getCurrentVersions() {
      const data = this.getData((data) => {
          let currentLanguage = this.props.masterPanelLanguage;
          if (currentLanguage == "bilingual") {
              currentLanguage = "hebrew"
          }
          if (!data || data.error) {
              this.setState({
                  currObjectVersions: {en: null, he: null},
                  mainVersionLanguage: currentLanguage,
              });
              return
          }
          if (currentLanguage == "hebrew" && !data.he.length) {
              currentLanguage = "english"
          }
          if (currentLanguage == "english" && !data.text.length) {
              currentLanguage = "hebrew"
          }
          this.setState({
              currObjectVersions: {
                  en: (this.props.masterPanelLanguage != "hebrew" && !!data.text.length) ? this.getVersionFromData(data, "en") : null,
                  he: (this.props.masterPanelLanguage != "english" && !!data.he.length) ? this.getVersionFromData(data, "he") : null,
              },
              mainVersionLanguage: currentLanguage,
              sectionRef: data.sectionRef,
          });
      });
  }
  checkSrefs(srefs) {
    // Mostly exists for properly displaying Ranging refs in TextList on page loads and on sheets
    if (typeof(srefs) == "object" && srefs.length == 1) {
      srefs = Sefaria.splitRangingRef(srefs[0]);
    }
    if (srefs.length == 1 && (Sefaria.sectionRef(srefs[0]) == srefs[0])) {
        const oref = Sefaria.ref(srefs[0]);
        srefs = Sefaria.makeSegments(oref).map(segment => segment.ref)
    }
    return(srefs)
  }
  showSheetNodeConnectionTools(ref,mode) {
      var dontShowModes = ["Share","Feedback","Sheets"];
      if (ref.indexOf("Sheet") !== -1 && !dontShowModes.includes(mode) ) {
          return true
      }

      else {
          return false
      }
  }
  openVersionInSidebar(versionTitle, versionLanguage) {
    this.props.setConnectionsMode("Translation Open");
    this.props.setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage));
  }
  render() {
    var content = null;
    if (!this.state.linksLoaded) {
      content = <LoadingMessage />;
    } else if (this.showSheetNodeConnectionTools(this.props.srefs, this.props.mode)) {
      content = (<div>
                    <SheetNodeConnectionTools
                    multiPanel={this.props.multiPanel}
                    setConnectionsMode={this.props.setConnectionsMode}
                    openComparePanel={this.props.openComparePanel}
                    srefs={this.props.srefs}
                    nodeRef = {this.props.nodeRef}
                    />
                 </div>);
    } else if (this.props.mode === "Resources") {
      const showConnectionSummary = Sefaria.linkSummary(this.props.srefs, this.props.nodeRef ? this.props.nodeRef.split(".")[0] : null).length > 0;
      const resourcesButtonCounts = {
        sheets: Sefaria.sheets.sheetsTotalCount(this.props.srefs),
        webpages: Sefaria.webPagesByRef(this.props.srefs).length,
        audio: Sefaria.mediaByRef(this.props.srefs).length,
        topics: Sefaria.topicsByRefCount(this.props.srefs) || 0,
        manuscripts: Sefaria.manuscriptsByRef(this.props.srefs).length,
        translations: this.state.availableTranslations.length, //versions dont come from the related api, so this one looks a bit different than the others.
      }
      const showResourceButtons = Object.values(resourcesButtonCounts).some(elem => elem > 0);
      const toolsButtonsCounts = {
        notes: Sefaria.notesTotalCount(this.props.srefs),
      }
      content = (
          <div>
              { this.state.flashMessage ? <div className="flashMessage sans-serif">{this.state.flashMessage}</div> : null }
              <ToolsButton en="About this Text" he="אודות הטקסט" image="about-text.svg" onClick={() => this.props.setConnectionsMode("About")} />
              {showConnectionSummary ?
                  <ConnectionsPanelSection title="Related Texts">
                      <ConnectionsSummary
                        srefs={this.props.srefs}
                        showBooks={false}
                        multiPanel={this.props.multiPanel}
                        filter={this.props.filter}
                        nodeRef={this.props.nodeRef}
                        contentLang={this.props.contentLang}
                        setFilter={this.props.setFilter}
                        setConnectionsMode={this.props.setConnectionsMode}
                        setConnectionsCategory={this.props.setConnectionsCategory}
                        collapsed={this.state.connectionSummaryCollapsed}
                        toggleTopLevelCollapsed={this.toggleTopLevelCollapsed}
                      />
                  </ConnectionsPanelSection>
                  :
                  null
              }
              {showResourceButtons ?
                  <ConnectionsPanelSection title={"Resources"}>
                    <ResourcesList
                        setConnectionsMode={this.props.setConnectionsMode}
                        counts={resourcesButtonCounts}
                    />
                  </ConnectionsPanelSection>
                  :
                  null
              }
              <ConnectionsPanelSection title={"Tools"}>
                <ToolsList
                    setConnectionsMode={this.props.setConnectionsMode}
                    toggleSignUpModal = {this.props.toggleSignUpModal}
                    openComparePanel={this.props.multiPanel? this.props.openComparePanel : null}
                    counts={toolsButtonsCounts} />
              </ConnectionsPanelSection>
          </div>
      );

    } else if (this.props.mode === "ConnectionsList") {
      content = (<ConnectionsSummary
                    srefs={this.props.srefs}
                    category={this.props.connectionsCategory}
                    showBooks={true}
                    multiPanel={this.props.multiPanel}
                    nodeRef={this.props.nodeRef}
                    contentLang={this.props.contentLang}
                    filter={this.props.filter}
                    setFilter={this.props.setFilter}
                    setConnectionsMode={this.props.setConnectionsMode}
                    setConnectionsCategory={this.props.setConnectionsCategory} />);

    } else if (this.props.mode === "TextList") {
      content = (<TextList
                    panelPosition ={this.props.panelPosition}
                    srefs={this.checkSrefs(this.props.srefs)}
                    filter={this.props.filter}
                    recentFilters={this.props.recentFilters}
                    nodeRef={this.props.nodeRef}
                    fullPanel={this.props.fullPanel}
                    multiPanel={this.props.multiPanel}
                    contentLang={this.props.contentLang}
                    setFilter={this.props.setFilter}
                    setConnectionsMode={this.props.setConnectionsMode}
                    onTextClick={this.props.onTextClick}
                    onCitationClick={this.props.onCitationClick}
                    handleSheetClick={this.props.handleSheetClick}
                    openNav={this.props.openNav}
                    openDisplaySettings={this.props.openDisplaySettings}
                    closePanel={this.props.closePanel}
                    selectedWords={this.props.selectedWords}
                    checkVisibleSegments={this.checkVisibleSegments}
                  />);

    } else if (this.props.mode === "Sheets") {
      var connectedSheet = this.props.nodeRef ? this.props.nodeRef.split(".")[0] : null;
      content = (<div>
                  { this.props.srefs[0].indexOf("Sheet") === -1 ?
                      <MySheetsList
                        srefs={this.props.srefs}
                        connectedSheet = {connectedSheet}
                        fullPanel={this.props.fullPanel}
                        handleSheetClick={this.props.handleSheetClick}
                      />
                      : null
                  }
                  { this.props.srefs[0].indexOf("Sheet") === -1 ?
                      <PublicSheetsList
                        srefs={this.props.srefs}
                        connectedSheet = {connectedSheet}
                        fullPanel={this.props.fullPanel}
                        handleSheetClick={this.props.handleSheetClick}
                      /> : null
                  }
                </div>);
    } else if (this.props.mode == "Add To Sheet"){
        let refForSheet, versionsForSheet, selectedWordsForSheet;
        if (this.props.connectionData && this.props.connectionData.hasOwnProperty("addSource") && this.props.connectionData["addSource"] == 'connectionsPanel'){
            refForSheet = this.props.connectionData.hasOwnProperty("connectionRefs") ? this.props.connectionData["connectionRefs"] : this.props.srefs;
            versionsForSheet = this.props.connectionData.hasOwnProperty("versions") ? this.props.connectionData["versions"] : {"en":null,"he":null};
            selectedWordsForSheet = null;
        }else{
            refForSheet = this.props.srefs;
            versionsForSheet = this.props.currVersions;
            selectedWordsForSheet = this.props.selectedWords;
        }
        content = (<div>
                  <AddToSourceSheetBox
                    srefs={refForSheet}
                    currVersions={versionsForSheet} //sidebar doesn't actually do versions
                    contentLanguage={this.props.masterPanelLanguage}
                    selectedWords={selectedWordsForSheet}
                    nodeRef = {this.props.nodeRef}
                    fullPanel={this.props.fullPanel}
                    toggleSignUpModal = {this.props.toggleSignUpModal}
                    setConnectionsMode={this.props.setConnectionsMode} />
                   </div>);

    } else if (this.props.mode === "Chavruta") {
        const uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const chevrutaURL = `${window.location.host}/chavruta?ref=${window.location.pathname.replace(/\//, '')}&rid=${uuid}`

        content = (<div className="chavruta">
                    <div className="headerText">{Sefaria._("Learn with a Chavruta")}</div>

                    <div className="fakeBrowser">
                      <div className="fakeBrowserHeader">
                        <div className="fakeBrowserButtons">
                          <div className="fakeBrowserButton red"></div>
                          <div className="fakeBrowserButton yellow"></div>
                          <div className="fakeBrowserButton green"></div>
                        </div>
                        <div className="fakeBrowserURLBar">sefaria.org</div>
                      </div>
                      <div className="fakeBrowserMain">
                        <div className="fakeBrowserLeft">
                          <div className="fakeBrowserButtonAvatar"><ProfilePic len={68} url={Sefaria.profile_pic_url} name={Sefaria.full_name} /></div>
                          <div className="fakeBrowserButtonAvatar"><img src="/static/img/anon_user.svg"/></div>
                        </div>
                        <div className="fakeBrowserRight">
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                          <hr/>
                        </div>
                      </div>
                    </div>
                    <p>{Sefaria._("Share this link with your chavruta to start a video call with this text")}</p>
                    <p>
                    <input
                      id="chavrutaURL"
                      type="text"
                      value={chevrutaURL}
                      onFocus={(e) => event.target.select()}
                    />
                    </p>

                    <p>
                    <a className="button fillWidth startChavrutaButton" href={"//"+chevrutaURL}><img src="/static/img/video.svg" />{Sefaria._("Start Call")}</a>
                    </p>
                  </div>);



    } else if (this.props.mode === "Notes") {
      content = (<div>
                  <AddNoteBox
                    srefs={this.props.srefs}
                    fullPanel={this.props.fullPanel}
                    closePanel={this.props.closePanel}
                    onSave={() => this.props.setConnectionsMode("Notes")}
                    onCancel={() => this.props.setConnectionsMode("Notes")} />
                  { Sefaria._uid ?
                  <div>
                    <a href="/my/notes" className="allNotesLink button transparent bordered fillWidth">
                      <span className="int-en">Go to My Notes</span>
                      <span className="int-he">הרשומות שלי</span>
                    </a>
                    <MyNotes
                      srefs={this.props.srefs}
                      editNote={this.props.editNote} />
                  </div> : null }
                </div>);

    } else if (this.props.mode === "Lexicon") {
      content = (<LexiconBox
                    selectedWords={this.props.selectedWords}
                    selectedNamedEntity={this.props.selectedNamedEntity}
                    selectedNamedEntityText={this.props.selectedNamedEntityText}
                    oref={Sefaria.ref(this.props.srefs[0])}
                    srefs={this.props.srefs}
                    onEntryClick={this.props.onTextClick}
                    onCitationClick={this.props.onCitationClick}
                    clearSelectedWords={this.props.clearSelectedWords}
                    clearNamedEntity={this.props.clearNamedEntity}
                    interfaceLang={this.props.interfaceLang} />);

    } else if (this.props.mode === "Topics") {
      content = (
        <TopicList
          contentLang={this.props.contentLang}
          srefs={this.props.srefs}
          interfaceLang={this.props.interfaceLang}
        />
      );
    } else if (this.props.mode === "WebPages" || this.props.mode === "WebPagesList") {
      content = (<WebPagesList
                    srefs={this.props.srefs}
                    filter={this.props.mode == "WebPages" ? null : this.props.webPagesFilter}
                    setWebPagesFilter={this.props.setWebPagesFilter}
                    interfaceLang={this.props.interfaceLang}
                    key="WebPages"/>);

	} else if (this.props.mode === "Torah Readings") {
      content = (<MediaList
					          srefs={this.props.srefs}
                    interfaceLang={this.props.interfaceLang}
                    key="Media"/>);

    } else if (this.props.mode === "Advanced Tools") {
      content = (<AdvancedToolsList
                    srefs={this.props.srefs}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                    canEditText={this.props.canEditText}
                    setConnectionsMode={this.props.setConnectionsMode}
                    currVersions={this.props.currVersions}
                    masterPanelLanguage={this.props.masterPanelLanguage} />);

    } else if (this.props.mode === "Share") {
      content = (<ShareBox
                    url={window.location.href}
                    fullPanel={this.props.fullPanel}
                    closePanel={this.props.closePanel}
                    setConnectionsMode={this.props.setConnectionsMode} />);

    } else if (this.props.mode === "Feedback") {
      content = (<FeedbackBox
                    srefs={this.props.srefs}
                    url={window.location.href}
                    currVersions={this.props.currVersions}
                 />);

    } else if (this.props.mode === "Edit Note") {
      content = (<AddNoteBox
                    srefs={this.props.srefs}
                    noteId={this.props.noteBeingEdited._id}
                    noteText={this.props.noteBeingEdited.text}
                    noteTitle={this.props.noteBeingEdited.title}
                    noteIsPublic={this.props.noteBeingEdited.isPublic}
                    fullPanel={this.props.fullPanel}
                    closePanel={this.props.closePanel}
                    onSave={() => this.props.setConnectionsMode("Notes")}
                    onCancel={() => this.props.setConnectionsMode("Notes")}
                    onDelete={() => this.props.setConnectionsMode("Notes")} />);

    } else if (this.props.mode === "Add Connection") {
      content = <AddConnectionBox
                    srefs={this.props.allOpenRefs}
                    openComparePanel={this.props.openComparePanel}
                    onSave={this.onSave}
                    onCancel={() => this.props.setConnectionsMode("Resources")} />

    } else if (this.props.mode === "Login") {
      content = (<LoginPrompt fullPanel={this.props.fullPanel} />);

    } else if (this.props.mode === "About") {
      content = (<AboutBox
                  key={`About-${Object.values(this.state.currObjectVersions).map((v) => v?.versionTitle ?? "").join("|")}`}
                  currObjectVersions={this.state.currObjectVersions}
                  mainVersionLanguage={this.state.mainVersionLanguage}
                  setConnectionsMode={this.props.setConnectionsMode}
                  mode={this.props.mode}
                  setFilter={this.props.setVersionFilter}
                  title={this.props.title}
                  srefs={this.props.srefs}
                  sectionRef={this.state.sectionRef}
                  getLicenseMap={this.props.getLicenseMap}
                  openVersionInReader={this.props.selectVersion}
                  viewExtendedNotes={this.props.viewExtendedNotes}/>);

    } else if (this.props.mode === "Translations" || this.props.mode === "Translation Open") {
      content = (<TranslationsBox
                  key={`Translations`}
                  currObjectVersions={this.state.currObjectVersions}
                  mainVersionLanguage={this.state.mainVersionLanguage}
                  setConnectionsMode={this.props.setConnectionsMode}
                  mode={this.props.mode}
                  setFilter={this.props.setVersionFilter}
                  vFilter={this.props.versionFilter}
                  recentVFilters={this.props.recentVersionFilters}
                  getLicenseMap={this.props.getLicenseMap}
                  srefs={this.props.srefs}
                  sectionRef={this.state.sectionRef}
                  onRangeClick={this.props.onTextClick}
                  openVersionInReader={this.props.selectVersion}
                  viewExtendedNotes={this.props.viewExtendedNotes}
                  onCitationClick={this.props.onCitationClick} />);

    } else if (this.props.mode === "extended notes") {
      content = (<ExtendedNotes
                  currVersions={this.props.currVersions}
                  title={this.props.title}/>);
    } else if (this.props.mode === "manuscripts") {
      content = (<ManuscriptImageList
        manuscriptList={Sefaria.manuscriptsByRef(this.props.srefs)}
        interfaceLang={this.props.interfaceLang}
        contentLang={this.props.contentLang}
      />);
    }

    var marginless = ["Resources", "ConnectionsList", "Advanced Tools", "Share", "WebPages", "Topics", "manuscripts"].indexOf(this.props.mode) != -1;
    var classes = classNames({connectionsPanel: 1, textList: 1, marginless: marginless, fullPanel: this.props.fullPanel, singlePanel: !this.props.fullPanel});
    return (
      <div className={classes} key={this.props.mode}>
        { this.props.fullPanel ? null :
          <ConnectionsPanelHeader
            connectionsMode={this.props.mode}
            previousCategory={this.props.connectionsCategory}
            setConnectionsMode={this.props.setConnectionsMode}
            setConnectionsCategory={this.props.setConnectionsCategory}
            multiPanel={this.props.multiPanel}
            filter={this.props.filter}
            recentFilters={this.props.recentFilters}
            baseRefs={this.props.srefs}
            setFilter={this.props.setFilter}
            closePanel={this.props.closePanel}
            toggleLanguage={this.props.toggleLanguage}
            interfaceLang={this.props.interfaceLang}/> }
        <div className="texts">
          <div className="contentInner">{content}</div>
        </div>
      </div>);

  }
}
ConnectionsPanel.propTypes = {
  srefs:                   PropTypes.array.isRequired,  // an array of ref strings
  filter:                  PropTypes.array.isRequired,
  recentFilters:           PropTypes.array.isRequired,
  mode:                    PropTypes.string.isRequired, // "Resources", "ConnectionsList", "TextList" etc., called `connectionsMode` above
  connectionsCategory:     PropTypes.string,            // with mode:"ConnectionsList", which category of connections to show
  setFilter:               PropTypes.func.isRequired,
  setConnectionsMode:      PropTypes.func.isRequired,
  setConnectionsCategory:  PropTypes.func.isRequired,
  editNote:                PropTypes.func.isRequired,
  openComparePanel:        PropTypes.func.isRequired,
  title:                   PropTypes.string.isRequired,
  currVersions:            PropTypes.object.isRequired,
  selectVersion:           PropTypes.func.isRequired,
  noteBeingEdited:         PropTypes.object,
  fullPanel:               PropTypes.bool,
  multiPanel:              PropTypes.bool,
  canEditText:             PropTypes.bool,
  onTextClick:             PropTypes.func,
  onCitationClick:         PropTypes.func,
  openNav:                 PropTypes.func,
  openDisplaySettings:     PropTypes.func,
  closePanel:              PropTypes.func,
  toggleLanguage:          PropTypes.func,
  selectedWords:           PropTypes.string,
  selectedNamedEntity:     PropTypes.string,
  selectedNamedEntityText: PropTypes.string,
  interfaceLang:           PropTypes.string,
  contentLang:             PropTypes.string,
  getLicenseMap:           PropTypes.func.isRequired,
  masterPanelLanguage:     PropTypes.oneOf(["english", "bilingual", "hebrew"]),
  versionFilter:           PropTypes.array,
  recentVersionFilters:    PropTypes.array,
  setVersionFilter:        PropTypes.func.isRequired,
  checkIntentTimer:        PropTypes.func.isRequired,
  clearSelectedWords:      PropTypes.func.isRequired,
  clearNamedEntity:        PropTypes.func.isRequired,
};


const ResourcesList = ({setConnectionsMode, counts}) => {
  // A list of Resources in addition to connection
    return (
        <div className="resourcesList">
            <ToolsButton en="Translations" he="תרגומים" image="translation.svg" count={counts["translations"]} onClick={() => setConnectionsMode("Translations")} />
            <ToolsButton en="Sheets" he="דפי מקורות" image="sheet.svg" count={counts["sheets"]} onClick={() => setConnectionsMode("Sheets")} />
            <ToolsButton en="Web Pages" he="דפי אינטרנט" image="webpages.svg" count={counts["webpages"]} onClick={() => setConnectionsMode("WebPages")} />
            <ToolsButton en="Topics" he="נושאים" image="hashtag-icon.svg" count={counts["topics"]}  onClick={() => setConnectionsMode("Topics")} />
            <ToolsButton en="Manuscripts" he="כתבי יד" image="manuscripts.svg" count={counts["manuscripts"]}  onClick={() => setConnectionsMode("manuscripts")}/>
            <ToolsButton en="Torah Readings" he="קריאה בתורה" image="torahreadings.svg" count={counts["audio"]} onClick={() => setConnectionsMode("Torah Readings")} />
        </div>
    );
}
ResourcesList.propTypes = {
  setConnectionsMode: PropTypes.func.isRequired,
  counts:        PropTypes.object.isRequired,
}

const ToolsList = ({setConnectionsMode, toggleSignUpModal, openComparePanel, counts}) => {
  // A list of Resources in addition to connection
    return (
        <div className="resourcesList">
              <ToolsButton en="Add to Sheet" he="הוספה לדף מקורות" image="sheetsplus.svg" onClick={() => !Sefaria._uid ? toggleSignUpModal() : setConnectionsMode("Add To Sheet", {"addSource": "mainPanel"})} />
              <ToolsButton en="Dictionaries" he="מילונים" image="dictionaries.svg" onClick={() => setConnectionsMode("Lexicon")} />
              {openComparePanel ? <ToolsButton en="Compare Text" he="טקסט להשוואה" image="compare-panel.svg" onClick={openComparePanel} /> : null }
              <ToolsButton en="Notes" he="הערות" image="notes.svg" onClick={() => !Sefaria._uid ? toggleSignUpModal() : setConnectionsMode("Notes")} />
              <ToolsButton en="Chavruta" he="חברותא" image="chavruta.svg" onClick={() => !Sefaria._uid ? toggleSignUpModal() : setConnectionsMode("Chavruta")} />
              <ToolsButton en="Share" he="שיתוף" image="share.svg" onClick={() => setConnectionsMode("Share")} />
              <ToolsButton en="Feedback" he="משוב" image="feedback.svg" onClick={() => setConnectionsMode("Feedback")} />
              <ToolsButton en="Advanced" he="כלים מתקדמים" image="advancedtools.svg" onClick={() => setConnectionsMode("Advanced Tools")} />
        </div>
    );
}
ToolsList.propTypes = {
    setConnectionsMode: PropTypes.func.isRequired,
    toggleSignUpModal:  PropTypes.func.isRequired,
    counts:        PropTypes.object.isRequired,
}


class SheetNodeConnectionTools extends Component {
  // A list of Resources in addition to connections
  render() {
    return (<div className="resourcesList">
              {this.props.multiPanel ?
                <ToolsButton en="Other Text" he="טקסט נוסף" icon="search" onClick={this.props.openComparePanel} />
              : null }
                <ToolsButton en="Sheets" he="דפי מקורות" image="sheet.svg" count={this.props.sheetsCount} onClick={() => this.props.setConnectionsMode("Sheets")} />
                <ToolsButton en="Feedback" he="משוב" icon="comment" onClick={() => this.props.setConnectionsMode("Feedback")} />
            </div>);
  }
}
SheetNodeConnectionTools.propTypes = {
  multiPanel:         PropTypes.bool.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  openComparePanel:   PropTypes.func.isRequired,
};


class ConnectionsSummary extends Component {
  // A summary of available connections on `srefs`.
  // If `category` is present, shows a single category, otherwise all categories.
  // If `showBooks`, show specific text counts beneath each category.

  render() {
    const collapsedTopLevelLimit = 4;
    const refs          = this.props.srefs;
    const excludedSheet = this.props.nodeRef ? this.props.nodeRef.split(".")[0] : null;
    const oref          = Sefaria.ref(refs[0]);
    const isTopLevel    = !this.props.category;
    const baseCat       = oref ? oref["categories"][0] : null;
    let summary       = Sefaria.linkSummary(refs, excludedSheet);

    if (!summary) { return null; }

    if (this.props.category === "Commentary" ) {
      // Show Quoting Commentary together with Commentary
      summary = summary.filter(cat => (cat.category.indexOf("Commentary") !== -1));
      const order = ["Commentary", "Quoting Commentary"];
      summary.sort((a, b) => {
        const ia = order.indexOf(a.category);
        const ib = order.indexOf(b.category);
        return ia - ib;
      });

    } else if (this.props.category) {
      // Single Category Summary
      summary = summary.filter(function(cat) { return cat.category === this.props.category; }.bind(this));
      if (summary.length === 0) {
        summary = [{category: this.props.category, books: [], count: 0, hasEnglish: false}];
      }

    } else if (isTopLevel) {
      // Hide Quoting Commentary from the top level view
      let topSummary = summary.filter(cat => (cat.category.indexOf("Commentary") < 1));
      // But include Quoting Commentary counts and english mark in top level Commentary section
      let subCommentaryCats = summary.filter(cat => (cat.category.indexOf("Commentary") > 1));
      if (subCommentaryCats.length && summary[0].category !== "Commentary") {
        // handle case of having Modern/Quoting Commentary, but no Commentary
         topSummary = [{category: "Commentary", count: 0, books: [], hasEnglish: false}].concat(topSummary);
      } else if (subCommentaryCats.length && summary[0].category === "Commentary") {
        // If Commentary object is present and we have sub commentary counts to add, replace the object
        // so we can add to the count without changing the underlying object.
         topSummary = [{category: "Commentary", count: summary[0].count, books: [], hasEnglish: summary[0].hasEnglish}].concat(topSummary.slice(1))
      }
      subCommentaryCats.map(cat => {
        topSummary[0].count += cat.count;
        topSummary[0].hasEnglish = cat.hasEnglish || summary[0].hasEnglish;
      });

      summary = topSummary;
    }

    let connectionsSummary = summary.map(function(cat, i) {

      const books = this.props.contentLang === "hebrew"
                    ? cat.books.concat().sort(Sefaria.linkSummaryBookSortHebrew.bind(null, baseCat))
                    : cat.books;
      return (
        <CategoryFilter
          srefs={this.props.srefs}
          category={cat.category}
          heCategory={Sefaria.hebrewTerm(cat.category)}
          showBooks={this.props.showBooks}
          count={cat.count}
          books={books}
          hasEnglish={cat.hasEnglish}
          filter={this.props.filter}
          updateRecent={true}
          setFilter={this.props.setFilter}
          setConnectionsCategory={this.props.setConnectionsCategory}
          on={Sefaria.util.inArray(cat.category, this.props.filter) !== -1}
          key={cat.category} />
      );
    }.bind(this));

    let summaryToggle = null;
    if(isTopLevel && connectionsSummary.length > collapsedTopLevelLimit){
        if(this.props.collapsed){
            connectionsSummary = connectionsSummary.slice(0, collapsedTopLevelLimit) //get the first x items
            summaryToggle = (
                <ToolsButton en="More" he="עוד" image="more.svg" onClick={this.props.toggleTopLevelCollapsed} control="interface" typeface="system" />
            );
        }else{
            summaryToggle = (
                <ToolsButton en="See Less" he="פחות" image="less.svg" onClick={this.props.toggleTopLevelCollapsed} control="interface" typeface="system" />
            )
        }
    }

    return (
        <div>
            {connectionsSummary}
            {summaryToggle}
        </div>
    );
   }
}
ConnectionsSummary.propTypes = {
  srefs:                   PropTypes.array.isRequired, // an array of ref strings
  category:                PropTypes.string, // if present show connections for category, if null show category summary
  filter:                  PropTypes.array,
  fullPanel:               PropTypes.bool,
  multiPanel:              PropTypes.bool,
  contentLang:             PropTypes.string,
  showBooks:               PropTypes.bool,
  setConnectionsMode:      PropTypes.func,
  setFilter:               PropTypes.func,
  setConnectionsCategory:  PropTypes.func.isRequired,
};


class MySheetsList extends Component {
  // List of my sheets for a ref in the Sidebar
  render() {
    var sheets = Sefaria.sheets.userSheetsByRef(this.props.srefs);
    var content = sheets.length ? sheets.filter(sheet => {
      // Don't show sheets as connections to themselves
      return sheet.id !== this.props.connectedSheet;
    }).map(sheet => {
      return (<SheetListing sheet={sheet} key={sheet.sheetUrl} handleSheetClick={this.props.handleSheetClick} connectedRefs={this.props.srefs} />)
    }, this) : null;
    return content && content.length ? (<div className="sheetList">{content}</div>) : null;
  }
}
MySheetsList.propTypes = {
  srefs:          PropTypes.array.isRequired,
  connectedSheet: PropTypes.string,
};


class PublicSheetsList extends Component {
  // List of public sheets for a ref in the sidebar
  render() {
    var sheets = Sefaria.sheets.sheetsByRef(this.props.srefs);
    var content = sheets.length ? sheets.filter(sheet => {
      // My sheets are shown already in MySheetList
      return sheet.owner !== Sefaria._uid && sheet.id !== this.props.connectedSheet;
    }).sort((a,b ) => {
      // First sort by language / interface language
      let aHe, bHe;
      [aHe, bHe] = [a.title, b.title].map(Sefaria.hebrew.isHebrew);
      if (aHe !== bHe) { return (bHe ? -1 : 1) * (Sefaria.interfaceLang === "hebrew" ? -1 : 1); }
      // Then by number of views
      return b.views - a.views;
    }).map(sheet => {
      return (<SheetListing sheet={sheet} key={sheet.sheetUrl} handleSheetClick={this.props.handleSheetClick} connectedRefs={this.props.srefs} />)
    }, this) : null;
    return content && content.length ? (<div className="sheetList">{content}</div>) : null;
  }
}
PublicSheetsList.propTypes = {
  srefs: PropTypes.array.isRequired,
  connectedSheet: PropTypes.string,
};


const TopicList = ({ srefs, interfaceLang, contentLang }) => {
  // segment ref topicList can be undefined even if loaded
  // but section ref topicList is null when loading and array when loaded
  const sectionRef = Sefaria.getRefFromCache(srefs[0]).sectionRef;
  const topics = Sefaria.topicsByRef(srefs)
  return (
    <div className={`topicList ${contentLang === 'hebrew' ? 'topicsHe' : 'topicsEn'}`}>
      {
        Sefaria.topicsByRef(sectionRef) === null ? (
          <div className="webpageList empty">
            <LoadingMessage />
          </div>
        ) : (!topics || !topics.length) ? (
          <div className="webpageList empty">
            <LoadingMessage
              message={"No topics known here."}
              heMessage={"אין נושאים ידועים."}
            />
          </div>
        ) : topics.map(
          topic => (
            <TopicListItem
              key={topic.topic}
              topic={topic}
              interfaceLang={interfaceLang}
              srefs={srefs}
            />
          )
        )
      }
    </div>
  );
}

const TopicListItem = ({ topic, interfaceLang, srefs }) => {
  let dataSourceText = '';
  const langKey = interfaceLang === 'english' ? 'en' : 'he';
  if (!!topic.dataSources && Object.values(topic.dataSources).length > 0) {
    dataSourceText = `${Sefaria._('This topic is connected to ')}"${Sefaria._r(srefs[0])}" ${Sefaria._('by')} ${Object.values(topic.dataSources).map(d => d[langKey]).join(' & ')}.`;
  }
  return (
    <a href={`/topics/${topic.topic}`} className="toolsButton topicButton" target="_blank">
      <span className="topicButtonTitle">
        <span className="contentText">
          <span className="en">{topic.title.en}</span>
          <span className="he">{topic.title.he}</span>
        </span>
        <ToolTipped altText={dataSourceText} classes={"saveButton tooltip-toggle three-dots-button"}>
          <img src="/static/img/three-dots.svg" alt={dataSourceText}/>
        </ToolTipped>
      </span>
      {
        topic.description && (topic.description.en || topic.description.he) ? (
          <span className="smallText">
            <span className="en">{topic.description.en}</span>
            <span className="he">{topic.description.he}</span>
          </span>
        ) : null
      }
    </a>
  );
}

class WebPagesList extends Component {
  // List of web pages for a ref in the sidebar
  setFilter(filter) {
    this.props.setWebPagesFilter(filter);
  }
  webSitesSort(a, b) {
    // First sort by site language / interface language
    let aHe, bHe;
    [aHe, bHe] = [a.name, b.name].map(Sefaria.hebrew.isHebrew);
    if (aHe !== bHe) { return (bHe ? -1 : 1) * (Sefaria.interfaceLang === "hebrew" ? -1 : 1); }
    // Then by number of pages
    return b.count - a.count;
  }
  render() {
    let webpages = Sefaria.webPagesByRef(this.props.srefs)
    let content = [];

    if (!this.props.filter) {
      let sites = {};
      webpages.map(page => {
        if (page.siteName in sites) {
          sites[page.siteName].count++;
        } else {
          sites[page.siteName] = {name: page.siteName, faviconUrl: page.faviconUrl, count: 1};
        }
      });
      sites = Object.values(sites).sort(this.webSitesSort);
      content = sites.map(site => {
        return (<div className="website toolsButton" onClick={()=>this.setFilter(site.name)} key={site.name}>
          <img className="icon" src={site.faviconUrl} />
          <span className="siteName toolsButtonText">{site.name} <span className="connectionsCount">({site.count})</span></span>
        </div>);
      });
    } else {
      webpages = webpages.filter(page => this.props.filter == "all" || page.siteName == this.props.filter);
      content = webpages.map(webpage => {
        return (<div className={"webpage" + (webpage.isHebrew ? " hebrew" : "")} key={webpage.url}>
          <img className="icon" src={webpage.faviconUrl} />
          <a className="title" href={webpage.url} target="_blank">{webpage.title}</a>
          <div className="domain">{webpage.domain}</div>
          {webpage.description ? <div className="description">{webpage.description}</div> : null}
          <div className="stats">
            <span className="int-en">Citing: {webpage.anchorRef}</span>
            <span className="int-he">מצטט: {Sefaria._r(webpage.anchorRef)}</span>
          </div>
        </div>)
      });
    }

    if (!content.length) {
      const filterName = this.props.filter !== "all" ? this.props.filter : null;
      const en = "No web pages known" + (filterName ? " from " + filterName : "") + " here.";
      const he = "אין דפי אינטרנט ידועים" + (filterName ? " מ" + filterName : "") + ".";
      return <div className="webpageList empty">
                  <LoadingMessage message={en} heMessage={he} />
                </div>;
    }

    const linkerMessage = Sefaria._siteSettings.TORAH_SPECIFIC ?
              <div className="webpagesLinkerMessage sans-serif">
                <span className="int-en">Sites that are listed here use the <a href="/linker">Sefaria Linker</a>.</span>
                <span className="int-he">אתרים המפורטים כאן משתמשים <a href="/linker">במרשתת ההפניות</a>.</span>
              </div> : null;

    return <div className="webpageList">
              {content}
              {linkerMessage}
            </div>;

  }
}
WebPagesList.propTypes = {
  srefs: PropTypes.array.isRequired,
};

class AdvancedToolsList extends Component {
  render() {
    var editText  = this.props.canEditText ? function() {
        var refString = this.props.srefs[0];
        var currentPath = Sefaria.util.currentPath();
        var currentLangParam;
        const langCode = this.props.masterPanelLanguage.slice(0,2);
        if (this.props.currVersions[langCode]) {
          refString += "/" + encodeURIComponent(langCode) + "/" + encodeURIComponent(this.props.currVersions[langCode]);
        }
        var path = "/edit/" + refString;
        var nextParam = "?next=" + encodeURIComponent(currentPath);
        path += nextParam;
        //console.log(path);
        Sefaria.track.event("Tools", "Edit Text Click", refString,
          {hitCallback: () =>  window.location = path}
        );
    }.bind(this) : null;

    var addTranslation = function() {
      if (!Sefaria._uid) { this.props.toggleSignUpModal() }

      else {
          var nextParam = "?next=" + Sefaria.util.currentPath();
          Sefaria.track.event("Tools", "Add Translation Click", this.props.srefs[0],
              {hitCallback: () => {window.location = "/translate/" + this.props.srefs[0] + nextParam}}
          );
      }
    }.bind(this);

    return (
      <div>
        <ToolsButton en="Add Translation" he="הוספת תרגום" image="tools-translate.svg" onClick={addTranslation} />
        <ToolsButton en="Add Connection" he="הוספת קישור לטקסט אחר" image="tools-add-connection.svg" onClick={() => !Sefaria._uid  ? this.props.toggleSignUpModal() : this.props.setConnectionsMode("Add Connection")} />
        { editText ? (<ToolsButton en="Edit Text" he="עריכת טקסט" image="tools-edit-text.svg" onClick={editText} />) : null }
      </div>);
  }
}
AdvancedToolsList.propTypes = {
  srefs:               PropTypes.array.isRequired,  // an array of ref strings
  canEditText:         PropTypes.bool,
  currVersions:        PropTypes.object,
  setConnectionsMode:  PropTypes.func.isRequired,
  masterPanelLanguage: PropTypes.oneOf(["english", "hebrew", "bilingual"]),
};


const ToolsButton = ({en, he, icon, image, count=null, onClick, control="interface", typeface="system"}) => {
    const clickHandler = (e) => {
        e.preventDefault();
        onClick();
    }
    let iconElem = null;
    if (icon) {
      let iconName = "fa-" + icon;
      let classes = {fa: 1, toolsButtonIcon: 1};
      classes[iconName] = 1;
      iconElem = (<i className={classNames(classes)} />)
    } else if (image) {
      iconElem = (<img src={"/static/img/" + image} className="toolsButtonIcon" alt="" />);
    }
    const url = Sefaria.util.replaceUrlParam("with", en);
    const nameClass = en.camelize();
    const wrapperClasses = classNames({toolsButton: 1,[nameClass]:1, [control+"Control"]: 1, [typeface+"Typeface"]: 1, noselect: 1})
    return (
      count == null || count > 0 ?
      <a href={url} className={wrapperClasses} data-name={en} onClick={clickHandler}>
        {iconElem}
        <span className="toolsButtonText">
            {control == "interface" ? <InterfaceText text={{en: en , he: he }} /> : <ContentText text={{en: en , he: he }}/>}
            {count ? (<span className="connectionsCount">({count})</span>) : null}
        </span>
      </a> : null
    );
}
ToolsButton.propTypes = {
  en:      PropTypes.string.isRequired,
  he:      PropTypes.string.isRequired,
  icon:    PropTypes.string,
  image:   PropTypes.string,
  count:   PropTypes.number,
  onClick: PropTypes.func,
};


class ShareBox extends Component {
  componentDidMount() {
    this.focusInput();
  }
  componentDidUpdate() {
    this.focusInput();
  }
  focusInput() {
    $(ReactDOM.findDOMNode(this)).find("input").select();
  }
  render() {
    var url = this.props.url;

    var shareFacebook = function() {
      Sefaria.util.openInNewTab("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url));
    };
    var shareTwitter = function() {
      Sefaria.util.openInNewTab("https://twitter.com/share?url=" + encodeURIComponent(url));
    };
    var shareEmail = function() {
      Sefaria.util.openInNewTab("mailto:?&subject=Text on Sefaria&body=" + url);
    };
    var classes = classNames({textList: 1, fullPanel: this.props.fullPanel});
    return (
      <div>
        <div className="shareInputBox">
          <input className="shareInput" value={this.props.url} />
        </div>
        <ToolsButton en="Facebook" he="פייסבוק" icon="facebook-official" onClick={shareFacebook} />
        <ToolsButton en="Twitter" he="טוויטר" icon="twitter" onClick={shareTwitter} />
        <ToolsButton en="Email" he="אימייל" icon="envelope-o" onClick={shareEmail} />
      </div>);
  }
}
ShareBox.propTypes = {
  url:                PropTypes.string.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  closePanel:         PropTypes.func.isRequired,
  fullPanel:          PropTypes.bool
};


class AddNoteBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isPrivate: !props.noteIsPublic,
      saving: false
    };
  }
  componentDidMount() {
    this.focusNoteText();
  }
  focusNoteText() {
    $(ReactDOM.findDOMNode(this)).find(".noteText").focus();
  }
  saveNote() {
    console.log(this.props)
      var text = $(ReactDOM.findDOMNode(this)).find(".noteText").val();
    if (!text) { return; }
    var note = {
      text: text,
      refs: this.props.srefs,
      type:  "note",
      public: !this.state.isPrivate
    };
   console.log(note)

    if (this.props.noteId) { note._id = this.props.noteId; }
    var postData = { json: JSON.stringify(note) };
    var url = "/api/notes/";
    $.post(url, postData, function(data) {
      if (data.error) {
        alert(data.error);
      } else if (data) {
        if (this.props.noteId) {
          Sefaria.clearPrivateNotes(data);
        } else {
          Sefaria.addPrivateNote(data);
        }
        Sefaria.track.event("Tools", "Note Save " + ((this.state.isPrivate)?"Private":"Public"), this.props.srefs.join("/"));
        $(ReactDOM.findDOMNode(this)).find(".noteText").val("");
        this.props.onSave();
      } else {
        alert(Sefaria._("Sorry, there was a problem saving your note."));
      }
    }.bind(this)).fail( function(xhr, textStatus, errorThrown) {
      alert(Sefaria._("Unfortunately, there was an error saving this note. Please try again or try reloading this page."));
    });
    this.setState({saving: true});
  }
  setPrivate() {
    this.setState({isPrivate: true});
  }
  setPublic() {
    this.setState({isPrivate: false});
  }
  deleteNote() {
          alert(Sefaria._("Something went wrong (that's all I know)."));
    if (!confirm(Sefaria._("Are you sure you want to delete this note?"))) { return; }
    Sefaria.deleteNote(this.props.noteId).then(this.props.onDelete);
  }
  render() {
    if (!Sefaria._uid) {
      return (<div className="addNoteBox"><LoginPrompt /></div>);
    }
    var privateClasses = classNames({notePrivateButton: 1, active: this.state.isPrivate});
    var publicClasses  = classNames({notePublicButton: 1, active: !this.state.isPrivate});
    return (
      <div className="addNoteBox">
        <textarea className="noteText" placeholder={Sefaria._("Write a note...")} defaultValue={this.props.noteText}></textarea>
        <div className="button fillWidth" onClick={this.saveNote}>
          <span className="int-en">{this.props.noteId ? "Save" : "Add Note"}</span>
          <span className="int-he">{this.props.noteId ? "שמירה": "הוספת הערה"}</span>
        </div>
        {this.props.noteId ?
          <div className="button white fillWidth" onClick={this.props.onCancel}>
            <span className="int-en">Cancel</span>
            <span className="int-he">בטל</span>
          </div> : null }
        {this.props.noteId ?
          (<div className="deleteNote" onClick={this.deleteNote}>
            <span className="int-en">Delete Note</span>
            <span className="int-he">מחיקת הערה</span>
           </div>): null }
      </div>);

    /* Leaving out public / private toggle until public notes are reintroduced
    <div className="noteSharingToggle">
      <div className={privateClasses} onClick={this.setPrivate}>
        <span className="int-en"><i className="fa fa-lock"></i> Private</span>
        <span className="int-he"><i className="fa fa-lock"></i>רשומה פרטית</span>
      </div>
      <div className={publicClasses} onClick={this.setPublic}>
        <span className="int-en">Public</span>
        <span className="int-he">רשומה כללית</span>
      </div>
    </div>
    */
  }
}
AddNoteBox.propTypes = {
  srefs:          PropTypes.array.isRequired,
  onSave:         PropTypes.func.isRequired,
  onCancel:       PropTypes.func.isRequired,
  onDelete:       PropTypes.func,
  noteId:         PropTypes.string,
  noteText:       PropTypes.string,
  noteTitle:      PropTypes.string,
  noteIsPublic:   PropTypes.bool
};


class MyNotes extends Component {
  componentDidMount() {
    this.loadNotes();
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadNotes();
    }
  }
  loadNotes() {
    // Rerender this component when privateNotes arrive.
    Sefaria.privateNotes(this.props.srefs, this.rerender);
  }
  rerender() {
    this.forceUpdate();
  }
  render() {
    var myNotesData = Sefaria.privateNotes(this.props.srefs);
    var myNotes = myNotesData ? myNotesData.map(function(note) {
      var editNote = function() {
        this.props.editNote(note);
      }.bind(this);
      return (<Note
                text={note.text}
                isPrivate={!note.public}
                isMyNote={true}
                ownerName={note.ownerName}
                ownerProfileUrl={note.ownerProfileUrl}
                ownerImageUrl={note.ownerImageUrl}
                editNote={editNote}
                key={note._id} />);
    }.bind(this)) : null ;

    return myNotes ? (
      <div className="noteList myNoteList">
        {myNotes}
      </div>) : null;
  }
}
MyNotes.propTypes = {
  srefs:    PropTypes.array.isRequired,
  editNote: PropTypes.func.isRequired,
}


class PublicNotes extends Component {
  // List of Publc notes a ref or range or refs.
  render() {
    var notes   = Sefaria.notes(this.props.srefs);
    var content = notes ? notes.filter(function(note) {
      // Exlude my notes, shown already in MyNotes.
      return note.owner !== Sefaria._uid;
    }).map(function(note) {
      return (<Note
                text={note.text}
                ownerName={note.ownerName}
                ownerProfileUrl={note.ownerProfileUrl}
                ownerImageUrl={note.ownerImageUrl}
                isPrivate={false}
                key={note._id} />)
    }) : null;

    return content && content.length ? (<div className="noteList publicNoteList">{content}</div>) : null;
  }
}
PublicNotes.propTypes = {
  srefs: PropTypes.array.isRequired,
};


class AddConnectionBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      refs: this.props.srefs,
      heRefs: this.getHeRefs(this.props.srefs),
      type: "",
    };
  }
  componentWillReceiveProps(nextProps) {
    if (!this.props.srefs.compare(nextProps.srefs)) {
      this.setState({
        refs: nextProps.srefs,
        heRefs: this.getHeRefs(nextProps.srefs),
      })
    }
  }
  getHeRefs(refs) {
    var heRefs = refs.map( ref =>  {
      var oRef = Sefaria.ref(ref);
      if (!oRef) {
        // If a range was selected, the ref cache may not have a Hebrew ref for us, so ask the API
        Sefaria.getRef(ref).then(this.setHeRefs);
        return "...";
      }
      return oRef.heRef;
    });
    return heRefs;
  }
  setHeRefs() {
    this.setState({heRefs: this.getHeRefs(this.state.refs)});
  }
  setType(type) {
    this.setState({type: type});
  }
  addConnection() {
    var connection = {
      refs: this.props.srefs,
      type: this.state.type,
    };
    var postData = { json: JSON.stringify(connection) };
    var url = "/api/links/";
    $.post(url, postData, function(data) {
      if (data.error) {
        alert(data.error);
      } else {
        Sefaria.track.event("Tools", "Add Connection", this.props.srefs.join("/"));
        Sefaria.clearLinks();
        this.props.onSave();
      }
    }.bind(this)).fail( function(xhr, textStatus, errorThrown) {
      alert("Unfortunately, there was an error saving this connection. Please try again or try reloading this page.");
    });
    this.setState({saving: true});
  }
  render() {
    var refs = this.state.refs;
    var heRefs = this.state.heRefs;
    return (<div className="addConnectionBox">

            { this.props.srefs.length == 1 ?
              <div>
                <span className="int-en">Choose a text to connect.</span>
                <span className="int-he">בחר טקסט לקישור</span>

                <div className="button fillWidth" onClick={this.props.openComparePanel}>
                  <span className="int-en">Browse</span>
                  <span className="int-he">סייר</span>
                </div>
              </div>
              : null }

            { this.props.srefs.length > 2 ?
              <div>
                <span className="int-en">We currently only understand connections between two texts.</span>
                <span className="int-he">ניתן לקשר רק בין 2 טקסטים</span>
              </div>
              : null }

            { this.props.srefs.length == 2 ?
              <div>

                <div className="addConnectionSummary">
                  <span className="en">{ refs[0] }<br/>&<br/>{ refs[1]}</span>
                  <span className="he">{ heRefs[0] }<br/>&<br/>{ heRefs[1] }</span>
                </div>

                <Dropdown
                  options={[
                            {value: "",               label: Sefaria._("None", "AddConnectionBox")},
                            {value: "commentary",     label: Sefaria._("Commentary", "AddConnectionBox")},
                            {value: "quotation",      label: Sefaria._("Quotation", "AddConnectionBox")},
                            {value: "midrash",        label: Sefaria._("Midrash", "AddConnectionBox")},
                            {value: "ein mishpat",    label: Sefaria._("Ein Mishpat / Ner Mitsvah", "AddConnectionBox")},
                            {value: "mesorat hashas", label: Sefaria._("Mesorat HaShas", "AddConnectionBox")},
                            {value: "reference",      label: Sefaria._("Reference", "AddConnectionBox")},
                            {value: "related",        label: Sefaria._("Related Passage", "AddConnectionBox")}
                          ]}
                  placeholder={Sefaria._("Select Type", "AddConnectionBox")}
                  onSelect={this.setType} />

                <div className="button fillWidth" onClick={this.addConnection}>
                  <span className="int-en">Add Connection</span>
                  <span className="int-he">הוסף קישור</span>
                </div>

              </div>
              : null }

          </div>);
  }
}
AddConnectionBox.propTypes = {
  srefs:    PropTypes.array.isRequired,
  onSave:   PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
}

function ManuscriptImageList(props) {
  const content = props.manuscriptList.map(x => <ManuscriptImage
    manuscript={x}
    interfaceLang={props.interfaceLang}
    contentLang={props.contentLang}
    key={`${x['manuscript_slug']}-${x['page_id']}`}
  /> );
  return <div className={"manuscriptList"}>{content}</div>
}

function ManuscriptImage(props) {
  let manuscript = props.manuscript;
  const [cls, description] = props.interfaceLang === 'hebrew'
    ? ['int-he', 'he_description']  : ['int-en', 'description'];
  return <div className={"manuscript"} >
    <a href={manuscript['image_url']} target="_blank">
      <img className={"manuscriptImage"} src={manuscript["thumbnail_url"]} alt={"Ancient Manuscript"}/>
    </a>
    {
      (props.interfaceLang === 'hebrew')
        ? <p className={"hebrew manuscriptCaptionHe"}>{manuscript.manuscript.he_title}</p>
        : <p className={"english manuscriptCaption"}>{manuscript.manuscript.title}</p>
    }
      <div className="meta">
        <InterfaceText>Location: </InterfaceText><span>{manuscript['page_id'].replace(/_/g, ' ')}</span><br/>
        {
          manuscript.manuscript[description]
            ? <span>
                <InterfaceText text={{en:'Courtesy of: ', he:'הודות ל'}} />
                <span className={cls}>{manuscript.manuscript[description]}<br/></span>
              </span>
            : ''
        }
        <InterfaceText text={{en:'Source: ', he:'מקור: '}}/>
        <a href={manuscript.manuscript['source']} target="_blank">{manuscript.manuscript['source'].replace("https://", "")}</a>
      </div>


  </div>
}

ManuscriptImage.propTypes = {
  manuscript: PropTypes.object.isRequired,
  interfaceLang: PropTypes.string.isRequired,
  contentLang: PropTypes.string.isRequired,
};

ManuscriptImageList.propTypes = {
  manuscriptList: PropTypes.array.isRequired,
  interfaceLang: PropTypes.string.isRequired,
  contentLang: PropTypes.string.isRequired,
};


const ConnectionsPanelSection = ({title, children}) => {
    return (
        <>
            <div className="connectionPanelSectionHeader sans-serif">
                <span className="connectionPanelSectionHeaderInner">
                    <InterfaceText context="ConnectionPanelSection">{title}</InterfaceText>
                </span>
            </div>
            {children}
        </>
    );
}

export {
  ConnectionsPanel,
  ConnectionsPanelHeader,
};


