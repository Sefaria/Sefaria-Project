import {
  Ad,
  Dropdown,
  LoadingMessage,
  LoginPrompt,
  LanguageToggleButton,
  CloseButton,
  SheetListing,
  Note,
  FeedbackBox,
  ToolTipped, InterfaceText, EnglishText, HebrewText,
} from './Misc';
import {ContentText} from "./ContentText";
import {
  MediaList
} from './Media';

import { CategoryFilter, TextFilter } from './ConnectionFilters';
import React, { useContext, useState, useEffect } from 'react';
import { ReaderPanelContext } from './context';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import Sefaria from './sefaria/sefaria';
import $ from './sefaria/sefariaJquery';
import SidebarSearch from './SidebarSearch';
import TextList from './TextList'
import ConnectionsPanelHeader from './ConnectionsPanelHeader';
import { AddToSourceSheetBox } from './AddToSourceSheet';
import LexiconBox from './LexiconBox';
import AboutBox from './AboutBox';
import GuideBox from './GuideBox';
import TranslationsBox from './TranslationsBox';
import ExtendedNotes from './ExtendedNotes';
import classNames from 'classnames';
import Component from 'react-class';
import { TextTableOfContents } from "./BookPage";
import { CollectionsModal } from './CollectionsWidget';
import { event } from 'jquery';
import Util from './sefaria/util';
import TopicSearch from "./TopicSearch";
import WebPage from './WebPage'
import { SignUpModalKind } from './sefaria/signupModalContent';
import ToggleSwitch from './common/ToggleSwitch';


class ConnectionsPanel extends Component {
  constructor(props) {
    super(props);
    this._savedHistorySegments = new Set();
    this.state = {
      flashMessage: null,
      currObjectVersions: { en: null, he: null },
      // mainVersionLanguage: props.masterPanelLanguage === "bilingual" ? "hebrew" : props.masterPanelLanguage,
      availableTranslations: [],
      linksLoaded: false, // has the list of refs been loaded
      connectionSummaryCollapsed: true,
      currentlyVisibleSectionRef: Sefaria.sectionRef(this.props.currentlyVisibleRef),
    };
  }
  toggleTopLevelCollapsed() {
    this.setState({ connectionSummaryCollapsed: !this.state.connectionSummaryCollapsed });
  }
  componentDidMount() {
    this._isMounted = true;
    this.loadData();
    this.setCurrentVersions();
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

    if (!Sefaria.areBothVersionsEqual(prevProps.currVersions, this.props.currVersions) ||
      prevProps.masterPanelLanguage !== this.props.masterPanelLanguage ||
      prevProps.srefs[0] !== this.props.srefs[0]) {
      this.setCurrentVersions();
    }

    if (prevProps.mode !== this.props.mode || prevProps.connectionsCategory !== this.props.connectionsCategory) {
      this.removeScrollListener();

      if(this.isScrollReset()) {
        this.props.setSideScrollPosition(null);
      }

      else if (this.props.scrollPosition && this.isScrollMonitored()) {
        $(".content").scrollTop(this.props.scrollPosition)
            .trigger("scroll");
      }

      this.addScrollListener();
    }
  }
  isScrollMonitored() {
    return ["ConnectionsList", "WebPages", "Sheets"].includes(this.props.mode);
  }
  isScrollReset() {
    return ["Resources"].includes(this.props.mode);
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
    if(this.isScrollMonitored()) {
      this.props.setSideScrollPosition($(event.target).scrollTop());
    }
    else if (this.props.mode === "TextList") {
      this.debouncedCheckVisibleSegments();
    }
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
      !this._isMounted ||
      !this.isSegmentVisible(element) ||
      this.didFilterChange(initialFilter, initialRefs, this.props.filter, this.props.srefs)
    ) { return; }
    const ref = element.getAttribute('data-ref');
    if (this._savedHistorySegments.has(ref)) { return; }
    const parsedRef = Sefaria.parseRef(ref);
    // TODO: add version info once we support that in links
    Sefaria.saveUserHistory({
      ref,
      versions: { en: null, he: null },
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
    return Sefaria.sectionRef(Sefaria.humanRef(this.props.srefs), true) || this.props.srefs;
  }
  loadData() {
    let ref = this.props.srefs[0];
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

    Sefaria.getTranslations(ref).then(versions => this.setState({ availableTranslations: Object.values(versions).flat() })); //for counting translations
    Sefaria.getRef(this.props.currentlyVisibleRef).then(data => { //this does not properly return a sectionRef for a spanning/ranged ref
      const currRef = (typeof data == "string") ? Sefaria.sectionRef(data) : data["sectionRef"]; //this is an annoying consequence of getRef not actually returning a
      // consistent response. Its either the ref from cache or the entire text api response if async.
      this.setState({currentlyVisibleSectionRef: currRef});
    });
  }
  reloadData() {
    this.setState({
      linksLoaded: false,
    });
    Sefaria.clearLinks();
    this.loadData();
  }
  flashMessage(msg) {
    this.setState({ flashMessage: msg });
    setTimeout(function () {
      this.setState({ flashMessage: null });
    }.bind(this), 3000);
  }
  onSave() {
    this.reloadData();
    this.props.setConnectionsMode("Resources");
    this.flashMessage("Success! You've created a new connection.");
  }
  async getData() {
    // Gets data about this text from cache, which may be null.
    const versionPref = Sefaria.versionPreferences.getVersionPref(this.props.srefs[0]);
    return await Sefaria.getTextFromCurrVersions(this.props.srefs[0], this.props.currVersions, this.props.translationLanguagePreference, 1);
  }
  async setCurrentVersions() {
    const data = await this.getData();
    let currentLanguage = this.props.masterPanelLanguage;
    if (currentLanguage === "bilingual") {
      currentLanguage = "hebrew"
    }
    if (!data || data.error) {
      this.setState({
        currObjectVersions: { en: null, he: null },
      });
    }
    const [primary, translation] = Sefaria.getPrimaryAndTranslationFromVersions(data.versions);
    this.setState({
      currObjectVersions: {
        en: ((this.props.masterPanelLanguage !== "hebrew" && !!data.text.length) || (this.props.masterPanelLanguage === "hebrew" && !data.he.length)) ? translation : null,
        he: ((this.props.masterPanelLanguage !== "english" && !!data.he.length) || (this.props.masterPanelLanguage === "english" && !data.text.length)) ? primary : null,
      },
      sectionRef: data.sectionRef,
    });
  }
  checkSrefs(srefs) {
    // Mostly exists for properly displaying Ranging refs in TextList on page loads and on sheets
    if (typeof (srefs) == "object" && srefs.length === 1) {
      srefs = Sefaria.splitRangingRef(srefs[0]);
    }
    if (srefs.length === 1 && (Sefaria.sectionRef(srefs[0]) === srefs[0])) {
      const oref = Sefaria.ref(srefs[0]);
      srefs = Sefaria.makeSegments(oref).map(segment => segment.ref)
    }
    return (srefs)
  }
  openVersionInSidebar(versionTitle, versionLanguage) {
    this.props.setConnectionsMode("Translation Open");
    this.props.setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage));
  }
  render() {
    let content = null;
    if (!this.state.linksLoaded) {
      content = <LoadingMessage />;
    } else if (this.props.mode === "Resources") {
      const summary = Sefaria.linkSummary(this.props.srefs, this.props.nodeRef ? this.props.nodeRef.split(".")[0] : null);
      const showConnectionSummary = summary.length > 0 || Sefaria.hasEssayLinks(this.props.srefs);
      const webpagesLoaded = Sefaria.webpagesLoaded(this.props.srefs);
      const resourcesButtonCounts = {
        sheets: Sefaria.sheets.sheetsTotalCount(this.props.srefs),
        webpages: webpagesLoaded ? Sefaria.webPagesByRef(this.props.srefs).length : null,
        audio: Sefaria.mediaByRef(this.props.srefs).length,
        topics: Sefaria.topicsByRefCount(this.props.srefs) || 0,
        manuscripts: Sefaria.manuscriptsByRef(this.props.srefs).length,
        guides: Sefaria.guidesByRef(this.props.srefs).length,
        translations: this.state.availableTranslations.length, //versions dont come from the related api, so this one looks a bit different than the others.
      }
      const showResourceButtons = Sefaria.is_moderator || Object.values(resourcesButtonCounts).some(elem => elem > 0 || elem === null);
      const toolsButtonsCounts = {
        notes: Sefaria.notesTotalCount(this.props.srefs),
      }
      content = (
        <div>
          {this.state.flashMessage ? <div className="flashMessage sans-serif">{this.state.flashMessage}</div> : null}
          <div className="topToolsButtons">
              <ToolsButton en="About this Text" he="אודות הטקסט" image="about-text.svg" urlConnectionsMode="About" onClick={() => this.props.setConnectionsMode("About")} />
              <ToolsButton en="Table of Contents" he="תוכן העניינים" image="text-navigation.svg" urlConnectionsMode="Navigation" onClick={() => this.props.setConnectionsMode("Navigation")} />
              <ToolsButton en="Search in this Text" he="חיפוש בטקסט" image="compare.svg" urlConnectionsMode="SidebarSearch" onClick={() => this.props.setConnectionsMode("SidebarSearch")} />
              <ToolsButton en="Translations" he="תרגומים" image="translation.svg"  urlConnectionsMode="Translations" onClick={() => this.props.setConnectionsMode("Translations")} count={resourcesButtonCounts.translations} />
              {resourcesButtonCounts?.guides ? <ToolsButton en="Guided Learning" he="מדריך" image="iconmonstr-school-17.svg" highlighted={true} experiment={true} urlConnectionsMode="Guide" onClick={() => this.props.setConnectionsMode("Guide")} /> : null}
            </div>
        
          {showConnectionSummary ?
            <ConnectionsPanelSection title="connection_panel_section.related_texts">
              <ConnectionsSummary
                currObjectVersions={this.state.currObjectVersions}
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
            <ConnectionsPanelSection title={"connection_panel_section.resources"}>
              <ResourcesList
                srefs={this.props.srefs}
                setConnectionsMode={this.props.setConnectionsMode}
                counts={resourcesButtonCounts}
              />
            </ConnectionsPanelSection>
            :
            null
          }
          <ConnectionsPanelSection title={"connection_panel_section.tools"}>
            <ToolsList
              setConnectionsMode={this.props.setConnectionsMode}
              masterPanelMode={this.props.masterPanelMode}
              toggleSignUpModal={this.props.toggleSignUpModal}
              openComparePanel={this.props.multiPanel ? this.props.openComparePanel : null}
              counts={toolsButtonsCounts} />
          </ConnectionsPanelSection>
        </div>
      );

    } else if (this.props.mode === "Navigation") {
      content = (
        <TextTableOfContents
          narrowPanel={this.props.narrowPanel}
          title={this.props.title}
          close={this.props.close}
          currVersions={this.props.currVersions}
          navigatePanel={this.props.navigatePanel}
          currentlyVisibleRef={this.props.currentlyVisibleRef}
          currentlyVisibleSectionRef={this.state.currentlyVisibleSectionRef}
        />
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

    } else if (this.props.mode === "TextList" || this.props.mode === "EssayList") {
      content = (<TextList
        panelPosition={this.props.panelPosition}
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
        closePanel={this.props.closePanel}
        selectedWords={this.props.selectedWords}
        checkVisibleSegments={this.checkVisibleSegments}
        translationLanguagePreference={this.props.translationLanguagePreference}
        filterRef={this.props.filterRef}
      />);

    } else if (this.props.mode === "Add To Sheet") {
      let refForSheet, versionsForSheet, selectedWordsForSheet, nodeRef;
      // add source from connections
      if (this.props.connectionData && this.props.connectionData.hasOwnProperty("addSource") && this.props.connectionData["addSource"] == 'connectionsPanel') {
        refForSheet = this.props.connectionData.hasOwnProperty("connectionRefs") ? this.props.connectionData["connectionRefs"] : this.props.srefs;
        versionsForSheet = this.props.connectionData.hasOwnProperty("versions") ? this.props.connectionData["versions"] : { "en": null, "he": null };
        selectedWordsForSheet = null;
      } else { // add source from sheet itself
        refForSheet = this.props.srefs;
        versionsForSheet = this.state.currObjectVersions;
        selectedWordsForSheet = this.props.selectedWords;
        nodeRef = this.props.nodeRef;
      }
      content = (<div>
        <AddToSourceSheetBox
          srefs={refForSheet}
          currObjectVersions={versionsForSheet} //sidebar doesn't actually do versions
          contentLanguage={this.props.masterPanelLanguage}
          selectedWords={selectedWordsForSheet}
          nodeRef={nodeRef}
          fullPanel={this.props.fullPanel}
          toggleSignUpModal={this.props.toggleSignUpModal}
          setConnectionsMode={this.props.setConnectionsMode} />
      </div>);

    }  else if (this.props.mode === "Notes") {
      content = (<div>
        <AddNoteBox
          srefs={this.props.srefs}
          fullPanel={this.props.fullPanel}
          closePanel={this.props.closePanel}
          onSave={() => this.props.setConnectionsMode("Notes")}
          onCancel={() => this.props.setConnectionsMode("Notes")} />
        {Sefaria._uid ?
          <div>
            <a href="/texts/notes" className="allNotesLink button white transparent bordered fillWidth">
              <span className="int-en">Go to My Notes</span>
              <span className="int-he">הרשומות שלי</span>
            </a>
            <MyNotes
              srefs={this.props.srefs}
              editNote={this.props.editNote} />
          </div> : null}
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
          masterPanelMode={this.props.masterPanelMode}
          contentLang={this.props.contentLang}
          srefs={this.props.srefs}
          interfaceLang={this.props.interfaceLang}
          key={`Topics-${this.props.srefs.join("|")}`}
        />
      );
    } else if (this.props.mode === "WebPages" || this.props.mode === "WebPagesList") {
      content = (<WebPagesList
        srefs={this.props.srefs}
        filter={this.props.mode === "WebPages" ? null : this.props.webPagesFilter}
        setWebPagesFilter={this.props.setWebPagesFilter}
        interfaceLang={this.props.interfaceLang}
        key="WebPages" />);

    } else if (this.props.mode === "Torah Readings") {
      content = (<MediaList
        srefs={this.props.srefs}
        interfaceLang={this.props.interfaceLang}
        key="Media" />);

    } else if (this.props.mode === "LinkerAdmin") {
      content = (<LinkerAdminBox
        srefs={this.props.srefs}
        currentlyVisibleRef={this.props.currentlyVisibleRef}
        connectionData={this.props.connectionData}
        currVersions={this.props.currVersions}
        currObjectVersions={this.state.currObjectVersions}
      />);

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

    } else if (this.props.mode === "About" || this.props.mode === 'Version Open') {
      content = (<AboutBox
        currObjectVersions={this.state.currObjectVersions}
        masterPanelLanguage={this.props.masterPanelLanguage}
        setConnectionsMode={this.props.setConnectionsMode}
        mode={this.props.mode}
        setFilter={this.props.setVersionFilter}
        vFilter={this.props.versionFilter}
        onRangeClick={this.props.onTextClick}
        onCitationClick={this.props.onCitationClick}
        title={this.props.title}
        srefs={this.props.srefs}
        sectionRef={this.state.sectionRef}
        openVersionInReader={this.props.selectVersion}
        viewExtendedNotes={this.props.viewExtendedNotes}
      />);

    } else if (this.props.mode === "Guide") {
      content = (<GuideBox
        masterPanelLanguage={this.props.masterPanelLanguage}
        sref={this.props.srefs[0]}
        setPreviousSettings={this.props.setPreviousSettings}
      />);

    } else if (this.props.mode === "Translations" || this.props.mode === "Translation Open") {
      content = (<TranslationsBox
        key={`Translations`}
        currObjectVersions={this.state.currObjectVersions}
        setConnectionsMode={this.props.setConnectionsMode}
        mode={this.props.mode}
        setFilter={this.props.setVersionFilter}
        vFilter={this.props.versionFilter}
        recentVFilters={this.props.recentVersionFilters}
        srefs={this.props.srefs}
        sectionRef={this.state.sectionRef}
        onRangeClick={this.props.onTextClick}
        openVersionInReader={this.props.selectVersion}
        viewExtendedNotes={this.props.viewExtendedNotes}
        onCitationClick={this.props.onCitationClick}
        translationLanguagePreference={this.props.translationLanguagePreference}
      />);

    } else if (this.props.mode === "extended notes") {
      content = (<ExtendedNotes
        currVersions={this.props.currVersions}
        title={this.props.title} />);
    } else if (this.props.mode === "manuscripts") {
      content = (<ManuscriptImageList
        manuscriptList={Sefaria.manuscriptsByRef(this.props.srefs)}
        interfaceLang={this.props.interfaceLang}
        contentLang={this.props.contentLang}
      />);
    } else if (this.props.mode === "SidebarSearch") {
    content = <SidebarSearch
                title={this.props.title}
                navigatePanel={this.props.navigatePanel}
                sidebarSearchQuery={this.props.sidebarSearchQuery}
                setSidebarSearchQuery={this.props.setSidebarSearchQuery}
                onSidebarSearchClick={this.props.onSidebarSearchClick}
              />
    }

    const marginless = ["Resources", "ConnectionsList", "Advanced Tools", "Share", "WebPages", "Topics", "manuscripts"].indexOf(this.props.mode) !== -1;
    let classes = classNames({ connectionsPanel: 1, textList: 1, marginless: marginless, fullPanel: this.props.fullPanel, singlePanel: !this.props.fullPanel });
    return (
      <div className={classes} key={this.props.mode}>
        {this.props.fullPanel ? null :
          <ConnectionsPanelHeader
            connectionsMode={this.props.mode}
            previousCategory={this.props.connectionsCategory}
            previousMode={this.props.connectionData?.previousMode}
            setConnectionsMode={this.props.setConnectionsMode}
            setConnectionsCategory={this.props.setConnectionsCategory}
            multiPanel={this.props.multiPanel}
            filter={this.props.filter}
            recentFilters={this.props.recentFilters}
            baseRefs={this.props.srefs}
            setFilter={this.props.setFilter}
            closePanel={this.props.closePanel}
            toggleLanguage={this.props.toggleLanguage}
            interfaceLang={this.props.interfaceLang}
            backButtonSettings={this.props.backButtonSettings}
          />}
        <div className="texts content">
          <div className="contentInner">{content}</div>
        </div>
      </div>);

  }
}
ConnectionsPanel.propTypes = {
  srefs: PropTypes.array.isRequired,  // an array of ref strings
  filter: PropTypes.array.isRequired,
  recentFilters: PropTypes.array.isRequired,
  mode: PropTypes.string.isRequired, // "Resources", "ConnectionsList", "TextList" etc., called `connectionsMode` above
  connectionsCategory: PropTypes.string,            // with mode:"ConnectionsList", which category of connections to show
  setFilter: PropTypes.func.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  setConnectionsCategory: PropTypes.func.isRequired,
  editNote: PropTypes.func.isRequired,
  openComparePanel: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  currVersions: PropTypes.object.isRequired,
  selectVersion: PropTypes.func.isRequired,
  noteBeingEdited: PropTypes.object,
  fullPanel: PropTypes.bool,
  multiPanel: PropTypes.bool,
  canEditText: PropTypes.bool,
  onTextClick: PropTypes.func,
  onCitationClick: PropTypes.func,
  openNav: PropTypes.func,
  closePanel: PropTypes.func,
  toggleLanguage: PropTypes.func,
  selectedWords: PropTypes.string,
  selectedNamedEntity: PropTypes.string,
  selectedNamedEntityText: PropTypes.string,
  interfaceLang: PropTypes.string,
  contentLang: PropTypes.string,
  masterPanelLanguage: PropTypes.oneOf(["english", "bilingual", "hebrew"]),
  masterPanelLayout: PropTypes.string,
  masterPanelMode: PropTypes.string,
  versionFilter: PropTypes.array,
  recentVersionFilters: PropTypes.array,
  setVersionFilter: PropTypes.func.isRequired,
  checkIntentTimer: PropTypes.func.isRequired,
  clearSelectedWords: PropTypes.func.isRequired,
  clearNamedEntity: PropTypes.func.isRequired,
  translationLanguagePreference: PropTypes.string,
  scrollPosition: PropTypes.number,
  setSideScrollPosition: PropTypes.func.isRequired,
  setPreviousSettings: PropTypes.func,
  filterRef: PropTypes.string,
  backButtonSettings:      PropTypes.object,
};

const createSheetsWithRefURL = (srefs) => {
  const sheetsURL = Sefaria.getModuleURL(Sefaria.VOICES_MODULE);
  const normalizedRef = Sefaria.normRef(srefs);
  window.open(`${sheetsURL.origin}/sheets-with-ref/${normalizedRef}`, '_blank');
}

const ResourcesList = ({ srefs, setConnectionsMode, counts }) => {
  // A list of Resources in addition to connection
  return (
    <div className="toolButtonsList">
      <ToolsButton en="Sheets" he="דפי מקורות" image="sheet.svg" count={counts["sheets"]} urlConnectionsMode="Sheets" onClick={() => createSheetsWithRefURL(srefs)}>
        <ToolsButton.SecondaryIcon icon="open-panel.svg" alt="Opens in new window" />
      </ToolsButton>
      <ToolsButton en="Web Pages" he="דפי אינטרנט" image="webpages.svg" count={counts["webpages"]} urlConnectionsMode="WebPages" onClick={() => setConnectionsMode("WebPages")} />
      <ToolsButton en="Topics" he="נושאים" image="hashtag-icon.svg" count={counts["topics"]} urlConnectionsMode="Topics" onClick={() => setConnectionsMode("Topics")} alwaysShow={Sefaria.is_moderator} />
      <ToolsButton en="Manuscripts" he="כתבי יד" image="manuscripts.svg" count={counts["manuscripts"]} urlConnectionsMode="manuscripts" onClick={() => setConnectionsMode("manuscripts")} />
      <ToolsButton en="Torah Readings" he="קריאה בתורה" image="torahreadings.svg" count={counts["audio"]} urlConnectionsMode="Torah Readings" onClick={() => setConnectionsMode("Torah Readings")} />
    </div>
  );
}
ResourcesList.propTypes = {
  setConnectionsMode: PropTypes.func.isRequired,
  counts: PropTypes.object.isRequired,
}

const ToolsList = ({ setConnectionsMode, toggleSignUpModal, openComparePanel, counts, masterPanelMode }) => {
  // A list of Resources in addition to connection
  return (
    <div className="toolButtonsList">
      <ToolsButton en="Add to Sheet" he="הוספה לדף מקורות" image="sheetsplus.svg" onClick={() => !Sefaria._uid ? toggleSignUpModal(SignUpModalKind.AddToSheet) : setConnectionsMode("Add To Sheet", { "addSource": "mainPanel" })} />
      <ToolsButton en="Dictionaries" he="מילונים" image="dictionaries.svg" urlConnectionsMode="Lexicon" onClick={() => setConnectionsMode("Lexicon")} />
      {openComparePanel ? <ToolsButton en="Compare Text" he="טקסט להשוואה" image="compare-panel.svg" onClick={openComparePanel} /> : null}
      <ToolsButton en="Notes" he="הערות" image="notes.svg" alwaysShow={true} count={counts["notes"]} urlConnectionsMode="Notes" onClick={() => !Sefaria._uid ? toggleSignUpModal(SignUpModalKind.Notes) : setConnectionsMode("Notes")} />
      <ToolsButton en="Share" he="שיתוף" image="share.svg" onClick={() => setConnectionsMode("Share")} />
      <ToolsButton en="Feedback" he="משוב" image="feedback.svg" onClick={() => setConnectionsMode("Feedback")} />
      <ToolsButton en="Advanced" he="כלים מתקדמים" image="advancedtools.svg" onClick={() => setConnectionsMode("Advanced Tools")} />
    </div>
  );
}
ToolsList.propTypes = {
  setConnectionsMode: PropTypes.func.isRequired,
  toggleSignUpModal: PropTypes.func.isRequired,
  counts: PropTypes.object.isRequired,
}

class ConnectionsSummary extends Component {
  // A summary of available connections on `srefs`.
  // If `category` is present, shows a single category, otherwise all categories.
  // If `showBooks`, show specific text counts beneath each category.

  render() {
    const collapsedTopLevelLimit = 4;
    const refs = this.props.srefs;
    const oref = Sefaria.ref(refs[0]);
    const isTopLevel = !this.props.category;
    const baseCat = oref ? oref["categories"][0] : null;
    let summary = Sefaria.linkSummary(refs);
    let essaySummary = [];

    if (!summary) { return null; }

    if (this.props.category === "Commentary") {
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
      summary = summary.filter(function (cat) { return cat.category === this.props.category; }.bind(this));
      if (summary.length === 0) {
        summary = [{ category: this.props.category, books: [], count: 0, hasEnglish: false }];
      }

    } else if (isTopLevel) {
      // Hide Quoting Commentary from the top level view
      let topSummary = summary.filter(cat => (cat.category.indexOf("Commentary") < 1));
      // But include Quoting Commentary counts and english mark in top level Commentary section
      let subCommentaryCats = summary.filter(cat => (cat.category.indexOf("Commentary") > 1));
      if (subCommentaryCats.length && summary[0].category !== "Commentary") {
        // handle case of having Modern/Quoting Commentary, but no Commentary
        topSummary = [{ category: "Commentary", count: 0, books: [], hasEnglish: false }].concat(topSummary);
      } else if (subCommentaryCats.length && summary[0].category === "Commentary") {
        // If Commentary object is present and we have sub commentary counts to add, replace the object
        // so we can add to the count without changing the underlying object.
        topSummary = [{ category: "Commentary", count: summary[0].count, books: [], hasEnglish: summary[0].hasEnglish }].concat(topSummary.slice(1))
      }
      subCommentaryCats.map(cat => {
        topSummary[0].count += cat.count;
        topSummary[0].hasEnglish = cat.hasEnglish || summary[0].hasEnglish;
      });

      summary = topSummary;
      let essayLinks = this.props.currObjectVersions ? Sefaria.essayLinks(refs, this.props.currObjectVersions) : [];
      if (essayLinks.length > 0) {
        essayLinks.forEach(function (link, i) {
          const essayTextFilter = <TextFilter
              setConnectionsMode={this.props.setConnectionsMode}
              srefs={this.props.srefs}
              key={i}
              book={link.index_title}
              heBook={link.heTitle}
              hasEnglish={link.sourceHasEn}
              category={link.category}
              updateRecent={true}
              setFilter={this.props.setFilter}
              hideCounts={true}
              enDisplayText={link.displayedText["en"]}
              heDisplayText={link.displayedText["he"]}
              filterSuffix={"Essay"}
              on={false}/>;
          essaySummary.push(essayTextFilter);
        }.bind(this));
        essaySummary = <div className={"essayGroup"}>{essaySummary}</div>;
      }
    }
    let connectionsSummary = summary.map(function (cat, i) {
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
    if (isTopLevel && connectionsSummary.length > collapsedTopLevelLimit) {
      if (this.props.collapsed) {
        connectionsSummary = connectionsSummary.slice(0, collapsedTopLevelLimit) //get the first x items
        summaryToggle = (
          <ToolsButton en="More" he="עוד" image="more.svg" onClick={this.props.toggleTopLevelCollapsed} control="interface" typeface="system" />
        );
      } else {
        summaryToggle = (
          <ToolsButton en="See Less" he="פחות" image="less.svg" onClick={this.props.toggleTopLevelCollapsed} control="interface" typeface="system" />
        )
      }
    }

    return (
      <div>
        {isTopLevel && essaySummary}
        {connectionsSummary}
        {summaryToggle}
      </div>
    );
  }
}
ConnectionsSummary.propTypes = {
  srefs: PropTypes.array.isRequired, // an array of ref strings
  category: PropTypes.string, // if present show connections for category, if null show category summary
  filter: PropTypes.array,
  fullPanel: PropTypes.bool,
  multiPanel: PropTypes.bool,
  contentLang: PropTypes.string,
  showBooks: PropTypes.bool,
  setConnectionsMode: PropTypes.func,
  setFilter: PropTypes.func,
  setConnectionsCategory: PropTypes.func.isRequired,
  currObjectVersions: PropTypes.object
};

const TopicList = ({ masterPanelMode, srefs, interfaceLang, contentLang }) => {
  // segment ref topicList can be undefined even if loaded
  // but section ref topicList is null when loading and array when loaded
  const [topics, setTopics] = useState(Sefaria.topicsByRef(srefs));
  const updateTopics = function() {
    setTopics(Sefaria.topicsByRef(srefs));
  }
  return (
    <div className={`topicList ${contentLang === 'hebrew' ? 'topicsHe' : 'topicsEn'}`}>
      {Sefaria.is_moderator && masterPanelMode === "Text" ? <TopicSearch contentLang={contentLang} contextSelector=".topicList"
                                                                         srefs={srefs}
                                                                         update={updateTopics}
                                                                         createNewTopicStr={Sefaria.translation(contentLang, "connections_panel.create_a_new_topic")}/>
                                                                         : null}
      {(!topics || !topics.length) ? (
        <div className="webpageList empty">
          <div className="loadingMessage sans-serif">
            <ContentText text={{ en: "No known Topics Here.", he: "אין קשרים ידועים." }} />
          </div>
        </div>
      ) : topics.map(
          (topic, i) => (
          <TopicListItem
            key={topic.topic}
            id={i}
            topic={topic}
            interfaceLang={interfaceLang}
            srefs={srefs}
          />
        )
      )}
    </div>
  );
}

const TopicListItem = ({ id, topic, interfaceLang, srefs }) => {
  let dataSourceText = '';
  const langKey = interfaceLang === 'english' ? 'en' : 'he';
  if (!!topic.dataSources && Object.values(topic.dataSources).length > 0) {
    dataSourceText = `${Sefaria._("common.this_topic_is_connected_to")}"${Sefaria._r(srefs[0])}" ${Sefaria._("common.by")} ${Object.values(topic.dataSources).map(d => d[langKey]).join(' & ')}.`;
  }
  return (
      <a href={`/topics/${topic.topic}`} className="topicButton" target="_blank" id={`topicItem-${id}`}>
      <span className="topicButtonTitle">
        <span className="contentText">
          <span className="en">{topic.title.en}</span>
          <span className="he">{topic.title.he}</span>
        </span>
        <ToolTipped altText={dataSourceText} classes={"saveButton tooltip-toggle three-dots-button"}>
          <img src="/static/img/three-dots.svg" alt={dataSourceText} />
        </ToolTipped>
      </span>
      {
        topic.description && (topic.description.en || topic.description.he) ? (

          <span className="smallText">
            <ContentText markdown={{en: topic.description.en, he: topic.description.he}} />
          </span>
        ) : null
      }
    </a>
  );
}

class WebPagesList extends Component {
  // List of web pages for a ref in the sidebar
  constructor(props) {
    super(props);
    this.state = {
      isLoading: false,
      loadError: null,
    };
  }
  componentDidMount() {
    this._isMounted = true;
    this.loadWebpages(this.props.srefs);
  }
  componentDidUpdate(prevProps) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadWebpages(this.props.srefs);
    }
  }
  componentWillUnmount() {
    this._isMounted = false;
  }
  setFilter(filter) {
    this.props.setWebPagesFilter(filter);
  }
  loadWebpages(srefs) {
    if (!srefs || !srefs.length) { return; }
    let refsForFetch = srefs;
    if (srefs.length === 1 && Sefaria.sectionRef(srefs[0], true) === srefs[0]) {
      const oref = Sefaria.ref(srefs[0]);
      if (oref) {
        refsForFetch = Sefaria.makeSegments(oref).map(segment => segment.ref);
      }
    }
    const expandedRefs = refsForFetch.reduce((accumulator, ref) => accumulator.concat(Sefaria.splitRangingRef(ref)), []);
    const refsToLoad = Array.from(new Set(expandedRefs)).filter(ref => !Sefaria.webpagesLoaded(ref));
    if (!refsToLoad.length) {
      if (this._isMounted) {
        this.setState({ isLoading: false, loadError: null });
      }
      return;
    }
    this.setState({ isLoading: true, loadError: null });
    const loadPromises = refsToLoad.map(ref => Sefaria.webpagesApi(ref));
    Promise.all(loadPromises)
      .then(results => {
        if (!this._isMounted) { return; }
        const errorResult = results.find(result => result && result.error);
        if (errorResult) {
          this.setState({ isLoading: false, loadError: errorResult.error });
          return;
        }
        this.setState({ isLoading: false });
      })
      .catch(() => {
        if (!this._isMounted) { return; }
        this.setState({ isLoading: false, loadError: "Unable to load web pages." });
      });
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

    if (this.state.isLoading && !webpages.length) {
      return <div className="webpageList empty">
        <LoadingMessage message="Loading web pages..." heMessage="טוען דפי אינטרנט..." />
      </div>;
    }
    if (this.state.loadError && !webpages.length) {
      return <div className="webpageList empty">
        <LoadingMessage message={this.state.loadError} heMessage="לא ניתן לטעון דפי אינטרנט." />
      </div>;
    }

    if (!this.props.filter) {
      let sites = {};
      webpages.map(page => {
        if (page.siteName in sites) {
          sites[page.siteName].count++;
        } else {
          sites[page.siteName] = { name: page.siteName, faviconUrl: page.favicon, count: 1 };
        }
      });
      sites = Object.values(sites).sort(this.webSitesSort);
      content = sites.map(site => {
        return (
          <div className="website" role="button" tabIndex="0" onKeyDown={(e) => Util.handleKeyboardClick(e, () => this.setFilter(site.name))} onClick={() => this.setFilter(site.name)} key={site.name}>
            <img className="icon" src={site.faviconUrl} alt={Sefaria._("common.website_icon")} />
            <span className="siteName">{site.name} <span className="connectionsCount">({site.count})</span></span>
          </div>
        );
      });
    } else {
      webpages = webpages.filter(page => this.props.filter == "all" || page.siteName == this.props.filter);
      content = webpages.map((webpage, i) => {
        return (<WebPage {...webpage} key={i} />);
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
        <InterfaceText>connections_panel.sites_that_are_listed_here_use_the</InterfaceText> <a href="/linker"><InterfaceText>connections_panel.sefaria_linker</InterfaceText></a>
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

const LINKER_PART_COLORS = {
  NAMED: "#dbeafe",
  NUMBERED: "#dcfce7",
  DH: "#fef3c7",
  RANGE: "#fce7f3",
  RANGE_SYMBOL: "#ede9fe",
  IBID: "#e0f2fe",
  RELATIVE: "#ffedd5",
  NON_CTS: "#f3f4f6",
};

// Parts injected from context (rather than the citation text itself) are these RawRefPart subclasses.
const CONTEXT_PART_CLASSES = ["ContextPart", "TermContext", "SectionContext"];
const CONTEXT_TYPE_LABELS = {
  CURRENT_BOOK: "curr. book",
  IBID: "ibid",
};

const LinkerPartChip = ({part, contextType}) => {
  const contextLabel = contextType && CONTEXT_PART_CLASSES.includes(part.class)
    ? (CONTEXT_TYPE_LABELS[contextType] || contextType)
    : null;
  return (
    <span className="linkerAdminPartChip" style={{backgroundColor: LINKER_PART_COLORS[part.type] || "#f3f4f6"}}>
      <span className="linkerAdminPartText">{part.text}</span>
      <span className="linkerAdminPartType">{part.type}</span>
      {contextLabel ? <span className="linkerAdminPartContext">from {contextLabel}</span> : null}
    </span>
  );
};

LinkerPartChip.propTypes = {
  part: PropTypes.object.isRequired,
  contextType: PropTypes.string,
};

// All citation spans sharing this span's charRange. For an unambiguous citation that's just the
// one span; for an ambiguous citation it's every option the linker considered (the disambiguator
// keeps one and marks the rest llm_ambiguous_option_valid === false). Falls back to [span] when the
// output map isn't populated (e.g. selection came from a URL param rather than a debug-mode click).
const getLinkerAdminOptions = (span) => {
  if (!span) { return []; }
  const sourceRef = span.refContext || span.sourceRef;
  const lang = span.language || span.lang;
  const charRange = Array.isArray(span.charRange) ? span.charRange.join("-") : span.charRange;
  const options = Sefaria._linkerOutputMap?.[`${sourceRef}|${lang}|${charRange}`];
  const citationOptions = (options || []).filter(s => s.type === "citation");
  if (!citationOptions.length) { return [span]; }
  // Push disambiguator-rejected options to the bottom; stable within each group.
  return citationOptions
    .map((option, i) => ({option, i}))
    .sort((a, b) => (a.option.llm_ambiguous_option_valid === false ? 1 : 0) - (b.option.llm_ambiguous_option_valid === false ? 1 : 0))
    .map(({option}) => option);
};

const linkerPartsFromSpan = (span) => (span?.inputRefParts || []).flatMap((text, i) => {
  const type = span.inputRefPartTypes?.[i];
  if (type === "RANGE") {
    // Flatten a ranged part back into its NUMBERED sections + "-" + NUMBERED toSections so the
    // server's RawRef._group_ranged_parts can reconstruct the RangedRawRefParts. Mirrors the range
    // branch in Sefaria._getLinkerTestStringForParts.
    const sections = span.inputRangeSections || [];
    const toSections = span.inputRangeToSections || [];
    return [
      ...sections.map(t => ({text: t, type: "NUMBERED"})),
      {text: "-", type: "RANGE_SYMBOL"},
      ...toSections.map(t => ({text: t, type: "NUMBERED"})),
    ];
  }
  return [{text, type}];
}).filter(part => part.text && part.type);

// Total number of ref parts matched across a parsing's Ref Part / Node Pairings — used to rank
// the "Options considered" list (a resolution that consumed more parts is a stronger match).
const matchedPartCount = (parsing) => (parsing.pairings || []).reduce((n, pairing) => n + (pairing.parts?.length || 0), 0);

const LinkerPairings = ({pairings, contextType}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="linkerAdminPairings">
      <button className="linkerAdminDisclosure" onClick={() => setOpen(!open)} aria-expanded={open}>
        <img
          src="/static/icons/chevron-down.svg"
          className={classNames("linkerAdminDisclosureChevron", {open})}
          alt=""
          aria-hidden={true}
        />
        Ref Part / Node Pairings
      </button>
      {open ? pairings.map((pairing, i) => {
        const pairingRef = pairing.ref || pairing.node?.ref;
        return (
          <div className="linkerAdminPairing" key={i}>
            <div>{pairing.parts.map((part, j) => <LinkerPartChip key={j} part={part} contextType={contextType} />)}</div>
            <div className="linkerAdminNode">
              {pairingRef
                ? <a className="linkerAdminRefValue" href={`/${Sefaria.normRef(pairingRef)}`} target="_blank">{pairingRef}</a>
                : (pairing.node?.key || "No node")}
            </div>
          </div>
        );
      }) : null}
    </div>
  );
};

LinkerPairings.propTypes = {
  pairings: PropTypes.array.isRequired,
  contextType: PropTypes.string,
};

const LinkerAdminBox = ({srefs, currentlyVisibleRef, connectionData, currVersions, currObjectVersions}) => {
  const selectedCitationData = connectionData || Sefaria._linkerAdminSelectedCitation;
  const linkerDebugOn = Sefaria._debug_mode === "linker";
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [rerunStatus, setRerunStatus] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testStringCopied, setTestStringCopied] = useState(false);
  const [selectedSpan, setSelectedSpan] = useState(selectedCitationData?.linkerAdminSpan || null);
  // Fall back to the ref currently visible in the reader (updates as you scroll) rather than the
  // panel's static srefs, so "Current Ref" tracks the reader when no citation is selected.
  const rerunRef = selectedSpan?.refContext || selectedSpan?.sourceRef || currentlyVisibleRef || srefs?.[0];
  const selectedSpanLang = selectedSpan?.language || selectedSpan?.lang;
  // Every ref the linker found for this citation. One entry for an unambiguous citation, several
  // (stacked) for an ambiguous one. Each option carries its own disambiguated ref (if any), so the
  // Disambiguator arrow is drawn per-option — only on the option the disambiguator actually resolved.
  const spanOptions = getLinkerAdminOptions(selectedSpan);
  // CRRD test string (paste into linker_test.py). Only citation spans carry ref parts.
  const testStringCrrd = selectedSpan?.inputRefParts ? Sefaria._getLinkerTestString(selectedSpan) : null;
  const visibleRerunVersions = selectedSpan?.versionTitle && selectedSpanLang ? [{
    lang: selectedSpanLang,
    versionTitle: selectedSpan.versionTitle,
  }] : ["he", "en"].map(lang => ({
    lang,
    versionTitle: currVersions?.[lang]?.versionTitle || currObjectVersions?.[lang]?.versionTitle,
  })).filter(version => version.versionTitle);

  const parseSpan = async (span) => {
    if (!span) {
      setError("No linker debug citation found. Click a resolved citation in the text (in linker debug mode) to select it.");
      return;
    }
    setBusy(true);
    setParsing(true);
    setError(null);
    setMessage(null);
    try {
      const parts = linkerPartsFromSpan(span);
      // span.contextRef is the ref the ORIGINAL live resolution actually matched against — for an
      // ibid-sourced citation that's the ibid target, not the citation's home segment. Feeding it in
      // as the resolver's book_context_ref would make the fresh parse label that same match
      // "curr. book" (RefResolver always tags book_context_ref matches CURRENT_BOOK), even though the
      // live resolution used ibid. Send the true home segment as contextRef, and carry the original
      // ibid target (if any) as prevRefs so a genuinely ibid-sourced match can still resolve — and be
      // labeled — as ibid here too.
      const homeRef = span.refContext || span.sourceRef || null;
      const prevRefs = span.contextType === "IBID" && span.contextRef ? [span.contextRef] : [];
      const result = await Sefaria.apiRequestWithBody("/_api/linker-admin/citation/parse", null, {
        parts,
        lang: span.language || span.lang || (Sefaria.hebrew.isHebrew(parts.map(part => part.text).join(" ")) ? "he" : "en"),
        contextRef: homeRef,
        prevRefs,
      }, "POST");
      setParsed(result);
      setSelectedSpan(span);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setParsing(false);
    }
  };

  const openLinkerEditor = () => {
    window.open("/linker-editor", "_blank", "noopener");
  };

  useEffect(() => {
    if (selectedCitationData?.linkerAdminSpan) {
      setSelectedSpan(selectedCitationData.linkerAdminSpan);
      parseSpan(selectedCitationData.linkerAdminSpan);
    }
  }, [selectedCitationData?.linkerAdminSpan]);

  useEffect(() => {
    // A citation selection should only pin "Rerun Linker" (and the other selectedSpan-driven
    // actions) to its own segment while that segment is still on screen. Without this, scrolling
    // away from a selected citation without clicking a new one leaves selectedSpan stale, so
    // rerunRef keeps silently targeting the OLD segment instead of the one currently visible.
    if (selectedSpan?.sourceRef && currentlyVisibleRef && selectedSpan.sourceRef !== currentlyVisibleRef) {
      setSelectedSpan(null);
      setParsed(null);
    }
  }, [currentlyVisibleRef]);

  // Restyle the citation's <a class="mutc"> element(s) already rendered in the reader so a
  // delete/recreate is visible immediately, without waiting for a reload to refetch linker_output.
  // Scoped the same way TextRange's own click handler resolves a citation: by the segment's
  // data-ref, the .contentSpan language, and the span's data-range.
  const LINKER_DEBUG_STATUS_CLASSES = ["spanSucceeded", "spanFailed", "spanAmbiguous", "spanDisambiguated", "spanDeleted"];
  const debugStatusClassForSpan = (span) => {
    if (span.failed) { return "spanFailed"; }
    if (span.llm_resolved_ref_non_segment || span.llm_resolved_ref_ambiguous) { return "spanDisambiguated"; }
    if (span.ambiguous) { return "spanAmbiguous"; }
    return "spanSucceeded";
  };
  const restyleLinkerCitationInReader = (span, deleted) => {
    const sourceRef = span.refContext || span.sourceRef;
    const lang = span.language || span.lang;
    const charRange = Array.isArray(span.charRange) ? span.charRange.join("-") : span.charRange;
    if (!sourceRef || !lang || !charRange) { return; }
    document.querySelectorAll(`a.mutc[data-range="${CSS.escape(charRange)}"]`).forEach(el => {
      const contentSpan = el.closest(".contentSpan");
      // Start from the parent, not el itself: the <a class="mutc"> carries its own data-ref
      // (the citation's target ref), which would otherwise shadow the ancestor segment's data-ref.
      const container = el.parentElement?.closest("[data-ref]");
      if (!contentSpan?.classList.contains(lang) || container?.getAttribute("data-ref") !== sourceRef) { return; }
      LINKER_DEBUG_STATUS_CLASSES.forEach(cls => el.classList.remove(cls));
      el.classList.add(deleted ? "spanDeleted" : debugStatusClassForSpan(span));
    });
  };

  const toggleDeleted = async () => {
    if (!selectedSpan) { return; }
    const deleted = !!selectedSpan.deleted;
    if (!deleted && !window.confirm(
      "This will permanently delete this link and prevent it from being recreated, even when the linker is re-run.\n\n" +
      "The link will remain visible in grey in linker debug mode, and can be recreated from there."
    )) { return; }
    const payload = {
      ref: selectedSpan.refContext || selectedSpan.sourceRef,
      versionTitle: selectedSpan.versionTitle,
      lang: selectedSpan.language || selectedSpan.lang,
      text: selectedSpan.text,
      charRange: selectedSpan.charRange,
      targetRef: selectedSpan.ref,
    };
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await Sefaria.apiRequestWithBody(`/_api/linker-admin/citation/${deleted ? "recreate" : "delete"}`, null, payload, "POST");
      setSelectedSpan({...selectedSpan, deleted: !deleted});
      if (result.marked) {
        restyleLinkerCitationInReader(selectedSpan, !deleted);
      }
      if (!deleted && result.marked && !result.linkDeleted) {
        // The citation is hidden, but no linker-generated Link was found to remove alongside it
        // (e.g. it was superseded by a more precise, non-auto-generated link). Surface that so the
        // admin doesn't assume the underlying connection is gone.
        setMessage("Citation hidden, but no linker-generated link was found to delete. The connection may still exist if it wasn't created by the linker.");
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const rerunLinker = async () => {
    if (!rerunRef || !visibleRerunVersions.length) { return; }
    setBusy(true);
    setError(null);
    setMessage(null);
    setRerunStatus(`Queueing linker rerun: ${rerunRef}`);
    try {
      const tasks = await Promise.all(visibleRerunVersions.map(version => Sefaria.apiRequestWithBody("/_api/linker-admin/segment/rerun", null, {
          ref: rerunRef,
          lang: version.lang,
          versionTitle: version.versionTitle,
        }, "POST")));
      setRerunStatus(`Waiting for linker rerun: ${rerunRef}`);
      await Promise.all(tasks.map(task => pollLinkerRerunTask(task.task_id || task.taskId)));
      setMessage(`Completed linker rerun: ${rerunRef}`);
      setRerunStatus(null);
      alert(`Completed linker rerun: ${rerunRef}`);
      window.location.reload();
    } catch (e) {
      setError(e.message || String(e));
      setRerunStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const pollLinkerRerunTask = async (taskId) => {
    if (!taskId) { throw new Error("Missing linker rerun task id"); }
    return Sefaria.pollTask(taskId, {
      interval: 1000,
      onProgress: (meta) => setRerunStatus(`Waiting for linker rerun: ${rerunRef}${meta?.step || meta?.state ? ` (${meta.step || meta.state})` : ""}`),
    });
  };

  const addRefDatasetExample = async () => {
    const version = visibleRerunVersions[0];
    if (!rerunRef || !version) { return; }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await Sefaria.apiRequestWithBody("/_api/linker-admin/dataset/ref", null, {
        ref: rerunRef,
        lang: version.lang,
        versionTitle: version.versionTitle,
      }, "POST");
      setMessage(`Saved Ref dataset example (${result.numEntities} labels): ${rerunRef}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const addRefPartDatasetExample = async () => {
    if (!selectedSpan) { return; }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await Sefaria.apiRequestWithBody("/_api/linker-admin/dataset/ref-part", null, {
        ref: selectedSpan.refContext || selectedSpan.sourceRef,
        lang: selectedSpan.language || selectedSpan.lang,
        versionTitle: selectedSpan.versionTitle,
        charRange: selectedSpan.charRange,
      }, "POST");
      setMessage(`Saved Ref Part dataset example (${result.numEntities} labels): ${selectedSpan.text}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyTestString = () => {
    if (!testStringCrrd) { return; }
    const input = document.getElementById("linkerAdminTestString");
    if (input) {
      input.select();
      input.setSelectionRange(0, 99999); // for mobile devices
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(testStringCrrd);
    } else { // fallback if navigator.clipboard is unavailable
      document.execCommand('copy');
    }
    setTestStringCopied(true);
    setTimeout(() => setTestStringCopied(false), 2000);
  };

  const toggleLinkerDebugMode = () => {
    const url = new URL(window.location.href);
    Sefaria.util.setLinkerAdminUrlParams(url.searchParams, {debug: !linkerDebugOn});
    window.location.href = url.toString();
  };

  // error, rerunStatus, and message are never set simultaneously (each setter call clears the
  // others first), so they collapse into a single status line with one of three visual treatments.
  // `parsing` (the citation/parse call backing ref-part loading) takes priority since it's the
  // most time-sensitive: it should replace whatever status was showing the instant a new parse starts.
  const statusKind = parsing ? "pending" : error ? "error" : rerunStatus ? "pending" : message ? "success" : null;
  const statusText = parsing ? "Loading ref parts…" : (error || rerunStatus || message);

  return (
    <div className="linkerAdminBox sans-serif">
      <div className="linkerAdminToggle">
        <label htmlFor="linker-admin-debug-mode" id="linker-admin-debug-mode-label">Linker debug mode</label>
        <ToggleSwitch
          name="linker-admin-debug-mode"
          isChecked={linkerDebugOn}
          onChange={toggleLinkerDebugMode}
        />
      </div>
      {rerunRef ? <div className="linkerAdminCurrentRef">Current Ref: {rerunRef}</div> : null}
      <div className="linkerAdminCitationActions">
        <button className={classNames("button", "small", {disabled: busy || !rerunRef || !visibleRerunVersions.length})} disabled={busy || !rerunRef || !visibleRerunVersions.length} onClick={rerunLinker}>
          Re-run linker
        </button>
        <button className={classNames("button", "small", {disabled: !selectedSpan?.ref || busy, linkerAdminDanger: !selectedSpan?.deleted && selectedSpan?.ref && !busy})} disabled={!selectedSpan?.ref || busy} onClick={toggleDeleted}>
          {selectedSpan?.deleted ? "Recreate Link" : "Delete Link"}
        </button>
        <button className="button small" onClick={openLinkerEditor}>
          Linker editor
        </button>
        <button className={classNames("button", "small", {disabled: busy || !selectedSpan})} disabled={busy || !selectedSpan} onClick={() => parseSpan(selectedSpan)}>
          Re-parse
        </button>
      </div>
      <div className="linkerAdminCitationActions">
        <button className={classNames("button", "small", {disabled: busy || !rerunRef || !visibleRerunVersions.length})} disabled={busy || !rerunRef || !visibleRerunVersions.length} onClick={addRefDatasetExample}>
          + Ref Dataset
        </button>
        <button className={classNames("button", "small", {disabled: busy || !selectedSpan})} disabled={busy || !selectedSpan} onClick={addRefPartDatasetExample}>
          + Ref Part Dataset
        </button>
      </div>
      {statusText ? (
        <div className={classNames("linkerAdminStatusLine", `linkerAdminStatusLine--${statusKind}`)}>
          {statusText}
        </div>
      ) : null}
      {selectedSpan ? (
        <div className="linkerAdminSelectedSpan">
          <div className="linkerAdminSectionTitle">
            {spanOptions.some(option => option.llm_resolved_ref_non_segment || option.llm_resolved_ref_ambiguous)
              ? "Linker Resolution (Disambiguated)"
              : (spanOptions.length > 1 || selectedSpan.ambiguous)
                ? "Linker Resolutions (Ambiguous)"
                : "Linker Resolution"}
          </div>
          {selectedSpan.text ? <div className="linkerAdminSpanText">&ldquo;{selectedSpan.text}&rdquo;</div> : null}
          <div className="linkerAdminOptions">
            {spanOptions.map((option, i) => {
              const optionDisambiguatedRef = option.llm_resolved_ref_non_segment || option.llm_resolved_ref_ambiguous;
              const rejected = option.llm_ambiguous_option_valid === false;
              return (
                <div className={classNames("linkerAdminRefFlow", {rejected})} key={i}>
                  <div className="linkerAdminRefItem">
                    <span className="linkerAdminRefTag">Linker</span>
                    {option.ref
                      ? <a className="linkerAdminRefValue" href={`/${Sefaria.normRef(option.ref)}`} target="_blank">{option.ref}</a>
                      : <span className="linkerAdminRefValue">No Ref</span>}
                  </div>
                  {optionDisambiguatedRef ? (
                    <React.Fragment>
                      <span className="linkerAdminRefArrow">→</span>
                      <div className="linkerAdminRefItem disambiguated">
                        <span className="linkerAdminRefTag">Disambiguator</span>
                        <a className="linkerAdminRefValue" href={`/${Sefaria.normRef(optionDisambiguatedRef)}`} target="_blank">{optionDisambiguatedRef}</a>
                      </div>
                    </React.Fragment>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {parsed?.input?.parts?.length ? (
        <div className="linkerAdminSection">
          <div className="linkerAdminSectionTitle">Ref Parts</div>
          <div className="linkerAdminParts">
            {parsed.input.parts.map((part, i) => <LinkerPartChip key={i} part={part} />)}
          </div>
        </div>
      ) : null}
      {parsed?.parsings?.length ? (
        <div className="linkerAdminSection">
          <div className="linkerAdminSectionTitle">Options considered</div>
          <div className="linkerAdminParsingList">
            {parsed.parsings
              .map((parsing, i) => ({parsing, i}))
              // Valid (green) parsings first; within each group, options that matched more ref
              // parts come first. Stable sort preserves original order on ties.
              .sort((a, b) => (a.parsing.valid === b.parsing.valid)
                ? (matchedPartCount(b.parsing) - matchedPartCount(a.parsing))
                : (a.parsing.valid ? -1 : 1))
              .map(({parsing, i}) => (
                // Key includes the citation text so switching to a new citation remounts each parsing
                // (and its LinkerPairings disclosure), resetting it to the collapsed state.
                <div className={classNames("linkerAdminParsing", {valid: parsing.valid, invalid: !parsing.valid})} key={`${parsed?.input?.text || ""}-${i}`}>
                  <div className="linkerAdminParsingRef">{parsing.ref || "No Ref"}</div>
                  {!parsing.valid ? <div className="linkerAdminInvalidReason">{parsing.disqualificationReason}</div> : null}
                  <LinkerPairings pairings={parsing.pairings || []} contextType={parsing.contextType} />
                </div>
              ))}
          </div>
        </div>
      ) : null}
      {testStringCrrd ? (
        <div className="linkerAdminSection">
          <div className="linkerAdminSectionTitle">CRRD Test String</div>
          <div className="linkerAdminTestStringBox" onClick={copyTestString} title="Click to copy">
            <input
              id="linkerAdminTestString"
              className="linkerAdminTestStringInput"
              type="text"
              readOnly
              value={testStringCrrd}
            />
            <img src="/static/icons/copy.svg" className="linkerAdminCopyIcon" aria-hidden="true" alt="" />
          </div>
          {testStringCopied ? <div className="linkerAdminMessage">Copied to clipboard</div> : null}
        </div>
      ) : null}
    </div>
  );
};

LinkerAdminBox.propTypes = {
  srefs: PropTypes.array.isRequired,
  currentlyVisibleRef: PropTypes.string,
  connectionData: PropTypes.object,
  currVersions: PropTypes.object,
  currObjectVersions: PropTypes.object,
};

const AdvancedToolsList = ({srefs, canEditText, currVersions, setConnectionsMode, masterPanelLanguage, toggleSignUpModal}) => {
    const {textsData} = useContext(ReaderPanelContext);
    const editText = canEditText && textsData ? function () {
      const isTranslation = masterPanelLanguage === 'english';
      const versionType = isTranslation ? 'translation' : 'primary';
      const langCode = textsData[`${versionType}Direction`] === 'ltr' ? 'en': 'he';
      const versionTitle = isTranslation ? textsData.versionTitle : textsData.heVersionTitle;
      const refString = `${srefs[0]}/${encodeURIComponent(langCode)}/${encodeURIComponent(versionTitle)}`;

      let path = "/edit/" + refString;
      let currentPath = Sefaria.util.currentPath();
      let nextParam = "?next=" + encodeURIComponent(currentPath);
      path += nextParam;
      Sefaria.track.event("Tools", "Edit Text Click", refString,
        { hitCallback: () => window.location = path }
      );
    } : null;

    const addTranslation = function () {
      if (!Sefaria._uid) { toggleSignUpModal(SignUpModalKind.AddTranslation) }
      else {
        let nextParam = "?next=" + Sefaria.util.currentPath();
        Sefaria.track.event("Tools", "Add Translation Click", srefs[0],
          { hitCallback: () => { window.location = "/translate/" + srefs[0] + nextParam } }
        );
      }
    };
    const openLinkerAdminTools = function () {
      const url = new URL(window.location.href);
      Sefaria.util.setLinkerAdminUrlParams(url.searchParams);
      if (Sefaria._debug_mode === "linker") {
        // Debug mode is already active server-side, so there's nothing a reload would add —
        // just switch the sidebar into LinkerAdmin mode in place.
        history.replaceState(history.state, document.title, url.pathname + url.search + url.hash);
        setConnectionsMode("LinkerAdmin");
      } else {
        window.location.href = url.toString();
      }
    };

    return (
      <div>
        <ToolsButton en="Add Translation" he="הוספת תרגום" image="tools-translate.svg" onClick={addTranslation} />
        <ToolsButton en="Add Connection" he="הוספת קישור לטקסט אחר" image="tools-add-connection.svg" onClick={() => !Sefaria._uid ? toggleSignUpModal(SignUpModalKind.AddConnection) : setConnectionsMode("Add Connection")} />
        {editText ? (<ToolsButton en="Edit Text" he="עריכת טקסט" image="tools-edit-text.svg" onClick={editText} />) : null}
        {Sefaria.is_moderator ? (<ToolsButton en="Linker Admin Tools" he="כלי ניהול לינקר" icon="wrench" onClick={openLinkerAdminTools} />) : null}
      </div>
    );
}
AdvancedToolsList.propTypes = {
  srefs:                PropTypes.array.isRequired,  // an array of ref strings
  canEditText:          PropTypes.bool,
  currVersions:         PropTypes.object,
  setConnectionsMode:   PropTypes.func.isRequired,
  masterPanelLanguage:  PropTypes.oneOf(["english", "hebrew", "bilingual"]),
  toggleSignUpModal:    PropTypes.func,
};


const ToolsButton = ({ en, he, onClick, urlConnectionsMode = null, icon, image,
                       count, control = "interface", typeface = "system", alwaysShow = false,
                       greyColor=false, highlighted=false, experiment=false,
                       children }) => {
  const clickHandler = (e) => {
    e.preventDefault();
    gtag("event", "feature_clicked", {name: `tools_button_${en}`})
    onClick();
  }
  let iconElem = null;
  if (icon) {
    let iconName = "fa-" + icon;
    let classes = { fa: 1, toolsButtonIcon: 1 };
    classes[iconName] = 1;
    iconElem = (<i className={classNames(classes)} />)
  } else if (image) {
    iconElem = (<img src={"/static/img/" + image} className="toolsButtonIcon" alt={en} />);
  }
  //We only want to generate reloadable urls for states where we actually respond to said url. See ReaderApp.makeHistoryState()- sidebarModes.
  const url = urlConnectionsMode ? Sefaria.util.replaceUrlParam("with", urlConnectionsMode) : null;
  const isLink = !!url;
  const nameClass = en.camelize();
  const wrapperClasses = classNames({ toolsButton: 1, [nameClass]: 1, [control + "Control"]: 1, [typeface + "Typeface"]: 1, noselect: 1, greyColor: greyColor })
  return (
    count == null || count > 0 || alwaysShow ?
    <div className={classNames({toolsButtonContainer: 1, highlighted: highlighted})}>
      <a
        href={isLink ? url : undefined}
        className={wrapperClasses}
        data-name={en}
        onClick={clickHandler}
        role={isLink ? undefined : "button"}
        tabIndex={0}
        onKeyDown={(e) => Util.handleKeyboardClick(e, clickHandler)}
      >
        {iconElem}
        <span className="toolsButtonText">
          {control === "interface" ? <InterfaceText text={{ en: en, he: he }} /> : <ContentText text={{ en: en, he: he }} />}
          {count > 0 && (<span className="connectionsCount">({count})</span>)}
          {experiment && <span className="experimentLabel">Experiment</span>}
        </span>
        {children}
      </a>
      </div>
      : null
  );
}

ToolsButton.SecondaryIcon = ({ icon, alt }) => (
  <img src={`/static/icons/${icon}`} className="toolsButtonSecondaryIcon" alt={alt} />
);

ToolsButton.SecondaryIcon.propTypes = {
  icon: PropTypes.string.isRequired,
  alt: PropTypes.string.isRequired
};

ToolsButton.propTypes = {
  en: PropTypes.string.isRequired,
  he: PropTypes.string.isRequired,
  icon: PropTypes.string,
  image: PropTypes.string,
  count: PropTypes.number,
  onClick: PropTypes.func,
  greyColor: PropTypes.bool,
  highlighted: PropTypes.bool,
  experiment: PropTypes.bool,
  children: PropTypes.node
};

class ShareBox extends Component {
  constructor(props) {
    super(props);
    if (this.props.sheetID) {
      const sheet = Sefaria.sheets.loadSheetByID(this.props.sheetID);
      this.state = {
        sheet: sheet,
        shareValue: sheet.options.collaboration ? sheet.options.collaboration : "none"
      }
    }
    else {
      this.state = {
        sheet: null,
        shareValue: null
      }
    }

  }
  componentDidUpdate(prevProps, prevState) {
    if (this.state.shareValue != prevState.shareValue) {
      new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(this.props.sheetID, sheet => resolve(sheet))).then(updatedSheet => {
        updatedSheet.options.collaboration = this.state.shareValue;
        updatedSheet.lastModified = updatedSheet.dateModified
        delete updatedSheet._id;
        delete updatedSheet.error;
        const postJSON = JSON.stringify(updatedSheet);
        this.postSheet(postJSON)
      })
    }
  }
  focusInput() {
    $(ReactDOM.findDOMNode(this)).find("input").select();
  }

  postSheet(postJSON) {
    $.post("/api/sheets/", { "json": postJSON }, (data) => {
      if (data.id) {
        console.log('saved...')
        Sefaria.sheets._loadSheetByID[data.id] = data;
      } else {
        console.log(data);
      }
    })
  }
  updateShareOptions(event) {
    this.setState({ shareValue: event.target.value });
  }
  copySheetLink() {
    const copyText = document.getElementById("sheetShareLink");
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices

    if (!navigator.clipboard) { // fallback if navigator.clipboard does not work
      document.execCommand('copy');
    } else {
      navigator.clipboard.writeText(copyText.value);
    }
  }
  render() {
    const url = this.props.url;

    const shareFacebook = function () {
      Sefaria.util.openInNewTab("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url));
    };
    const shareTwitter = function () {
      Sefaria.util.openInNewTab("https://twitter.com/share?url=" + encodeURIComponent(url));
    };
    const shareEmail = function () {
      Sefaria.util.openInNewTab("mailto:?&subject=Text on Sefaria&body=" + url);
    };
    const classes = classNames({ textList: 1, fullPanel: this.props.fullPanel });
    return (
      <div>
        <ConnectionsPanelSection title="connection_panel_section.share_link">
          <div className="shareInputBox">
            <button className="shareInputButton" aria-label="Copy Link to Sheet" onClick={this.copySheetLink.bind(this)}><img src="/static/icons/copy.svg" className="copyLinkIcon" aria-hidden="true"></img></button>
            <input className="shareInput" id="sheetShareLink" value={this.props.url} aria-label="Shareable link"/>
          </div>
        </ConnectionsPanelSection>
        <ConnectionsPanelSection title="connection_panel_section.more_options">
          <ToolsButton en="Share on Facebook" he="פייסבוק" icon="facebook-official" onClick={shareFacebook} />
          <ToolsButton en="Share on X" he="X" icon="X" onClick={shareTwitter} />
          <ToolsButton en="Share by Email" he="אימייל" icon="envelope-o" onClick={shareEmail} />
        </ConnectionsPanelSection>
      </div>);
  }
}
ShareBox.propTypes = {
  url: PropTypes.string.isRequired,
  fullPanel: PropTypes.bool,
  sheetID: PropTypes.number
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
    const text = $(ReactDOM.findDOMNode(this)).find(".noteText").val();
    if (!text) { return; }
    let note = {
      text: text,
      refs: this.props.srefs,
      type: "note",
      public: !this.state.isPrivate
    };

    if (this.props.noteId) { note._id = this.props.noteId; }
    const postData = { json: JSON.stringify(note) };
    const url = "/api/notes/";
    $.post(url, postData, function (data) {
      if (data.error) {
        alert(data.error);
      } else if (data) {
        if (this.props.noteId) {
          Sefaria.clearPrivateNotes(data);
        } else {
          Sefaria.addPrivateNote(data);
        }
        Sefaria.track.event("Tools", "Note Save " + ((this.state.isPrivate) ? "Private" : "Public"), this.props.srefs.join("/"));
        $(ReactDOM.findDOMNode(this)).find(".noteText").val("");
        this.props.onSave();
      } else {
        alert(Sefaria._("connections_panel.sorry_there_was_a_problem_saving_your_note"));
      }
    }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
      alert(Sefaria._("connections_panel.unfortunately_there_was_an_error_saving_this_note"));
    });
    this.setState({ saving: true });
  }
  setPrivate() {
    this.setState({ isPrivate: true });
  }
  setPublic() {
    this.setState({ isPrivate: false });
  }
  deleteNote() {
    if (!confirm(Sefaria._("common.are_you_sure_you_want_to_delete_this"))) { return; }
    Sefaria.deleteNote(this.props.noteId).then(this.props.onDelete);
  }
  render() {
    if (!Sefaria._uid) {
      return (<div className="addNoteBox"><LoginPrompt /></div>);
    }
    //const privateClasses = classNames({ notePrivateButton: 1, active: this.state.isPrivate });
    //const publicClasses = classNames({ notePublicButton: 1, active: !this.state.isPrivate });
    return (
      <div className="addNoteBox">
        <textarea className="noteText" placeholder={Sefaria._("connections_panel.write_a_note")} defaultValue={this.props.noteText}></textarea>
        <div
          className="button fillWidth"
          role="button"
          tabIndex="0"
          aria-label={Sefaria._(this.props.noteId ? "common.save" : "Add Note")}
          onClick={this.saveNote}
          onKeyDown={(e) => Util.handleKeyboardClick(e, this.saveNote)}
        >
          <span className="int-en">{this.props.noteId ? "Save" : "Add Note"}</span>
          <span className="int-he">{this.props.noteId ? "שמירה" : "הוספת הערה"}</span>
        </div>
        {this.props.noteId ?
          <div
            className="button white fillWidth"
            role="button"
            tabIndex="0"
            aria-label={Sefaria._("common.cancel")}
            onClick={this.props.onCancel}
            onKeyDown={(e) => Util.handleKeyboardClick(e, this.props.onCancel)}
          >
            <span className="int-en">Cancel</span>
            <span className="int-he">בטל</span>
          </div> : null}
        {this.props.noteId ?
          (<div className="deleteNote" role="button" tabIndex="0" aria-label={Sefaria._("Delete Note")} onClick={this.deleteNote} onKeyDown={(e) => Util.handleKeyboardClick(e, this.deleteNote)}>
            <span className="int-en">Delete Note</span>
            <span className="int-he">מחיקת הערה</span>
          </div>) : null}
      </div>
    );

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
  srefs: PropTypes.array.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onDelete: PropTypes.func,
  noteId: PropTypes.string,
  noteText: PropTypes.string,
  noteTitle: PropTypes.string,
  noteIsPublic: PropTypes.bool
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
    const myNotesData = Sefaria.privateNotes(this.props.srefs);
    const myNotes = myNotesData ? myNotesData.map((note) => {
      const editNote = () => {
        this.props.editNote(note);
      };
      return (<Note
        text={note.text}
        isPrivate={!note.public}
        isMyNote={true}
        ownerName={note.ownerName}
        ownerProfileUrl={note.ownerProfileUrl}
        ownerImageUrl={note.ownerImageUrl}
        editNote={editNote}
        key={note._id} />);
    }) : null;

    return myNotes ? (
      <div className="noteList myNoteList">
        {myNotes}
      </div>) : null;
  }
}
MyNotes.propTypes = {
  srefs: PropTypes.array.isRequired,
  editNote: PropTypes.func.isRequired,
}


class PublicNotes extends Component {
  // List of Publc notes a ref or range or refs.
  render() {
    const notes = Sefaria.notes(this.props.srefs);
    const content = notes ? notes.filter(function (note) {
      // Exlude my notes, shown already in MyNotes.
      return note.owner !== Sefaria._uid;
    }).map(function (note) {
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
    let heRefs = refs.map(ref => {
      let oRef = Sefaria.ref(ref);
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
    this.setState({ heRefs: this.getHeRefs(this.state.refs) });
  }
  setType(event) {
    this.setState({ type: event.target.value });
  }
  addConnection() {
    let connection = {
      refs: this.props.srefs,
      type: this.state.type,
    };
    let postData = { json: JSON.stringify(connection) };
    const url = "/api/links/";
    $.post(url, postData, function (data) {
      if (data.error) {
        alert(data.error);
      } else {
        Sefaria.track.event("Tools", "Add Connection", this.props.srefs.join("/"));
        Sefaria.clearLinks();
        this.props.onSave();
      }
    }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
      alert("Unfortunately, there was an error saving this connection. Please try again or try reloading this page.");
    });
    this.setState({ saving: true });
  }
  render() {
    const refs = this.state.refs;
    const heRefs = this.state.heRefs;
    return (
      <div className="addConnectionBox">
        {this.props.srefs.length == 1 ?
          <div>
            <span className="int-en">Choose a text to connect.</span>
            <span className="int-he">בחר טקסט לקישור</span>

            <div 
              className="button fillWidth" 
              role="button"
              tabIndex="0"
              onClick={this.props.openComparePanel}
              onKeyDown={(e) => Util.handleKeyboardClick(e, this.props.openComparePanel)}
            >
              <span className="int-en">Browse</span>
              <span className="int-he">סייר</span>
            </div>
          </div>
          : null}
        {this.props.srefs.length > 2 ?
          <div>
            <span className="int-en">We currently only understand connections between two texts.</span>
            <span className="int-he">ניתן לקשר רק בין 2 טקסטים</span>
          </div>
          : null}
        {this.props.srefs.length == 2 ?
          <div>

            <div className="addConnectionSummary">
              <span className="en">{refs[0]}<br />&<br />{refs[1]}</span>
              <span className="he">{heRefs[0]}<br />&<br />{heRefs[1]}</span>
            </div>

            <Dropdown
              name="connectionType"
              options={[
                { value: "", label: Sefaria._("add_connection_box.none") },
                { value: "commentary", label: Sefaria._("add_connection_box.commentary") },
                { value: "quotation", label: Sefaria._("add_connection_box.quotation") },
                { value: "midrash", label: Sefaria._("add_connection_box.midrash") },
                { value: "ein mishpat", label: Sefaria._("add_connection_box.ein_mishpat_ner_mitsvah") },
                { value: "mesorat hashas", label: Sefaria._("add_connection_box.mesorat_hashas") },
                { value: "reference", label: Sefaria._("add_connection_box.reference") },
                { value: "related", label: Sefaria._("add_connection_box.related_passage") }
              ]}
              placeholder={Sefaria._("add_connection_box.select_type")}
              onChange={this.setType} />

            <div className="button fillWidth" onClick={this.addConnection}>
              <span className="int-en">Add Connection</span>
              <span className="int-he">הוסף קישור</span>
            </div>

          </div>
          : null}
      </div>
    );
  }
}
AddConnectionBox.propTypes = {
  srefs: PropTypes.array.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
}

function ManuscriptImageList(props) {
  const content = props.manuscriptList.map(x => <ManuscriptImage
    manuscript={x}
    interfaceLang={props.interfaceLang}
    contentLang={props.contentLang}
    key={`${x['manuscript_slug']}-${x['page_id']}`}
  />);
  return <div className={"manuscriptList"}>{content}</div>
}

function ManuscriptImage(props) {
  let manuscript = props.manuscript;
  const [cls, description] = props.interfaceLang === 'hebrew'
    ? ['int-he', 'he_description'] : ['int-en', 'description'];
  return (
    <div className={"manuscript"} >
      <a href={manuscript['image_url']} target="_blank">
        <img className={"manuscriptImage"} src={manuscript["thumbnail_url"]} alt={"Ancient Manuscript"} />
      </a>
      {
        (props.interfaceLang === 'hebrew')
          ? <p className={"hebrew manuscriptCaptionHe"}>{manuscript.manuscript.he_title}</p>
          : <p className={"english manuscriptCaption"}>{manuscript.manuscript.title}</p>
      }
      <div className="meta">
        <InterfaceText>connections_panel.location</InterfaceText><span>{manuscript['page_id'].replace(/_/g, ' ')}</span><br />
        {
          manuscript.manuscript[description]
            ? <span>
              <InterfaceText text={{ en: 'Courtesy of: ', he: 'הודות ל' }} />
              <span className={cls}>{manuscript.manuscript[description]}<br /></span>
            </span>
            : ''
        }
        {
          manuscript.manuscript['license']
            ? <div className="manuscriptLicense">
                <InterfaceText>common.license</InterfaceText>
                <InterfaceText>:</InterfaceText>
                <a className="manuscriptLicenseLink" href={Sefaria.getLicenseMap()[manuscript.manuscript['license']]} target="_blank">
                  {Sefaria.translateLicense(manuscript.manuscript['license'])}
                </a>
            </div>
            : ''
        }
        <InterfaceText text={{ en: 'Source: ', he: 'מקור: ' }} />
        <a className="versionDetailsLink" href={manuscript.manuscript['source']} target="_blank">
          { Sefaria.util.parseUrl(manuscript.manuscript['source']).host.replace("www.", "") }
        </a>
      </div>


    </div>
  );
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


const ConnectionsPanelSection = ({ title, children }) => {
  return (
    <>
      <div className="connectionPanelSectionHeader sans-serif">
        <span className="connectionPanelSectionHeaderInner">
          <InterfaceText>{title}</InterfaceText>
        </span>
      </div>
      {children}
    </>
  );
}

export {
  ConnectionsPanel,
  ConnectionsPanelHeader,
  ToolsButton,
  ShareBox
};
