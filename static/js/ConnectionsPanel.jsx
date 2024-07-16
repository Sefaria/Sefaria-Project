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
  ProfilePic,
  DivineNameReplacer,
  ToolTipped, InterfaceText, EnglishText, HebrewText,
} from './Misc';
import {ContentText} from "./ContentText";
import {
  MediaList
} from './Media';

import { CategoryFilter, TextFilter } from './ConnectionFilters';
import React, { useRef, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import Sefaria from './sefaria/sefaria';
import $ from './sefaria/sefariaJquery';
import AboutSheet from './AboutSheet';
import SidebarSearch from './SidebarSearch';
import TextList from './TextList'
import ConnectionsPanelHeader from './ConnectionsPanelHeader';
import { AddToSourceSheetBox } from './AddToSourceSheet';
import LexiconBox from './LexiconBox';
import AboutBox from './AboutBox';
import TranslationsBox from './TranslationsBox';
import ExtendedNotes from './ExtendedNotes';
import classNames from 'classnames';
import Component from 'react-class';
import { TextTableOfContents } from "./BookPage";
import { CollectionsModal } from './CollectionsWidget';
import { event } from 'jquery';
import TopicSearch from "./TopicSearch";
import WebPage from './WebPage'
import { SignUpModalKind } from './sefaria/signupModalContent';


class ConnectionsPanel extends Component {
  constructor(props) {
    super(props);
    this._savedHistorySegments = new Set();
    this.state = {
      flashMessage: null,
      currObjectVersions: { en: null, he: null },
      mainVersionLanguage: props.masterPanelLanguage === "bilingual" ? "hebrew" : props.masterPanelLanguage,
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

    if (prevProps.currVersions.en !== this.props.currVersions.en ||
      prevProps.currVersions.he !== this.props.currVersions.he ||
      prevProps.masterPanelLanguage !== this.props.masterPanelLanguage ||
      prevProps.srefs[0] !== this.props.srefs[0]) {
      this.getCurrentVersions();
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
  isSheet() {
    return this.props.srefs[0].startsWith("Sheet");
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
    if (!this.isSheet()) {
      Sefaria.getTranslations(ref).then(versions => this.setState({ availableTranslations: Object.values(versions).flat() })); //for counting translations
      Sefaria.getRef(this.props.currentlyVisibleRef).then(data => { //this does not properly return a secionRef for a spanning/ranged ref
        const currRef = (typeof data == "string") ? Sefaria.sectionRef(data) : data["sectionRef"]; //this is an annoying consequence of getRef not actually returning a
        // consistent response. Its either the ref from cache or the entire text api response if async.
        this.setState({currentlyVisibleSectionRef: currRef});
      });
      //this.setState({currentlyVisibleSectionRef: Sefaria.sectionRef(this.props.currentlyVisibleRef)});

    }
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
    this.flashMessage(Sefaria._("Success! You've created a new connection."));
  }
  getData(cb) {
    // Gets data about this text from cache, which may be null.
    const versionPref = Sefaria.versionPreferences.getVersionPref(this.props.srefs[0]);
    return Sefaria.getText(this.props.srefs[0], { context: 1, enVersion: this.props.currVersions.en, heVersion: this.props.currVersions.he, translationLanguagePreference: this.props.translationLanguagePreference, versionPref}).then(cb);
  }
  getVersionFromData(d, lang) {
    //d - data received from this.getData()
    //language - the language of the version
    //console.log(d);
    const currentVersionTitle = (lang === "he") ? d.heVersionTitle : d.versionTitle;
    return {
      ...d.versions.find(v => v.versionTitle === currentVersionTitle && v.language === lang),
      title: d.indexTitle,
      heTitle: d.heIndexTitle,
      sources: lang === "he" ? d.heSources : d.sources,
      merged: lang === "he" ? !!d.heSources : !!d.sources,
    }
  }
  getCurrentVersions() {
    const data = this.getData((data) => {
      let currentLanguage = this.props.masterPanelLanguage;
      if (currentLanguage === "bilingual") {
        currentLanguage = "hebrew"
      }
      if (!data || data.error) {
        this.setState({
          currObjectVersions: { en: null, he: null },
          mainVersionLanguage: currentLanguage,
        });
        return
      }
      if (currentLanguage === "hebrew" && !data.he.length) {
        currentLanguage = "english"
      }
      if (currentLanguage === "english" && !data.text.length) {
        currentLanguage = "hebrew"
      }
      this.setState({
        currObjectVersions: {
          en: ((this.props.masterPanelLanguage !== "hebrew" && !!data.text.length) || (this.props.masterPanelLanguage === "hebrew" && !data.he.length)) ? this.getVersionFromData(data, "en") : null,
          he: ((this.props.masterPanelLanguage !== "english" && !!data.he.length) || (this.props.masterPanelLanguage === "english" && !data.text.length)) ? this.getVersionFromData(data, "he") : null,
        },
        mainVersionLanguage: currentLanguage,
        sectionRef: data.sectionRef,
      });
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
  showSheetNodeConnectionTools(ref, mode) {
    const dontShowModes = ["Share", "Feedback", "Sheets"];
    return ref.indexOf("Sheet") !== -1 && !dontShowModes.includes(mode);
  }
  openVersionInSidebar(versionTitle, versionLanguage) {
    this.props.setConnectionsMode("Translation Open");
    this.props.setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage));
  }
  render() {
    let content = null;
    if (!this.state.linksLoaded) {
      content = <LoadingMessage />;
    } else if (this.showSheetNodeConnectionTools(this.props.srefs, this.props.mode)) {
      content = (<div>
        <SheetNodeConnectionTools
          multiPanel={this.props.multiPanel}
          setConnectionsMode={this.props.setConnectionsMode}
          openComparePanel={this.props.openComparePanel}
          srefs={this.props.srefs}
          nodeRef={this.props.nodeRef}
        />
      </div>);
    } else if (this.props.mode === "Resources") {
      const summary = Sefaria.linkSummary(this.props.srefs, this.props.nodeRef ? this.props.nodeRef.split(".")[0] : null);
      const showConnectionSummary = summary.length > 0 || Sefaria.hasEssayLinks(this.props.srefs);
      const resourcesButtonCounts = {
        sheets: Sefaria.sheets.sheetsTotalCount(this.props.srefs),
        webpages: Sefaria.webPagesByRef(this.props.srefs).length,
        audio: Sefaria.mediaByRef(this.props.srefs).length,
        topics: Sefaria.topicsByRefCount(this.props.srefs) || 0,
        manuscripts: Sefaria.manuscriptsByRef(this.props.srefs).length,
        translations: this.state.availableTranslations.length, //versions dont come from the related api, so this one looks a bit different than the others.
      }
      const showResourceButtons = Sefaria.is_moderator || Object.values(resourcesButtonCounts).some(elem => elem > 0);
      const toolsButtonsCounts = {
        notes: Sefaria.notesTotalCount(this.props.srefs),
      }
      content = (
        <div>
          {this.state.flashMessage ? <div className="flashMessage sans-serif">{this.state.flashMessage}</div> : null}
          {this.props.masterPanelMode === "Sheet" ?
            <AboutSheetButtons
              setConnectionsMode={this.props.setConnectionsMode}
              masterPanelSheetId={this.props.masterPanelSheetId}
            /> :
            <div className="topToolsButtons">
              <ToolsButton en={Sefaria._("About this Text")} he={Sefaria._("About this Text")} image="about-text.svg" urlConnectionsMode="About" onClick={() => this.props.setConnectionsMode("About")} />
              <ToolsButton en={Sefaria._("Table of Contents")} he={Sefaria._("Table of Contents")}image="text-navigation.svg" urlConnectionsMode="Navigation" onClick={() => this.props.setConnectionsMode("Navigation")} />
              <ToolsButton en={Sefaria._("Search in this Text")} he={Sefaria._("Search in this Text")} image="compare.svg" urlConnectionsMode="SidebarSearch" onClick={() => this.props.setConnectionsMode("SidebarSearch")} />
              <ToolsButton en={Sefaria._("Translations")} he={Sefaria._("Translations")} image="translation.svg"  urlConnectionsMode="Translations" onClick={() => this.props.setConnectionsMode("Translations")} count={resourcesButtonCounts.translations} />
            </div>
          }
          {showConnectionSummary ?
            <ConnectionsPanelSection title={Sefaria._("Related Texts")} >
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
            <ConnectionsPanelSection title={"Resources"}>
              {
                //ironically we need the masterpanel mode to be sheet to indicate a sheet is loaded, but the
                // title prop to be something other than "Sheet" to indicate that a real source is being
                // looked at
                (this.props.masterPanelMode === "Sheet" && this.props.title !== "Sheet") ?
                    <>
                      <ToolsButton en={Sefaria._("About this Source")} he={Sefaria._("About this Source")} image="about-text.svg" urlConnectionsMode="About" onClick={() => this.props.setConnectionsMode("About")} />
                      <ToolsButton en={Sefaria._("Translations")}  he={Sefaria._("Translations")}  image="translation.svg" count={resourcesButtonCounts["translations"]} urlConnectionsMode="Translations" onClick={() => this.props.setConnectionsMode("Translations")} />
                    </>
                  :
                  null
              }
              <ResourcesList
                setConnectionsMode={this.props.setConnectionsMode}
                counts={resourcesButtonCounts}
              />
            </ConnectionsPanelSection>
            :
            null
          }
          <ConnectionsPanelSection title={"Tools"}>

            {this.props.masterPanelMode === "Sheet" ? <SheetToolsList
              toggleSignUpModal={this.props.toggleSignUpModal}
              setConnectionsMode={this.props.setConnectionsMode}
              masterPanelSheetId={this.props.masterPanelSheetId} /> : null}
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
        openDisplaySettings={this.props.openDisplaySettings}
        closePanel={this.props.closePanel}
        selectedWords={this.props.selectedWords}
        checkVisibleSegments={this.checkVisibleSegments}
        translationLanguagePreference={this.props.translationLanguagePreference}
      />);

    } else if (this.props.mode === "Sheets") {
      const connectedSheet = this.props.nodeRef ? this.props.nodeRef.split(".")[0] : null;
      content = (<div>
        {this.props.srefs[0].indexOf("Sheet") === -1 ?
          <MySheetsList
            srefs={this.props.srefs}
            connectedSheet={connectedSheet}
            fullPanel={this.props.fullPanel}
            handleSheetClick={this.props.handleSheetClick}
          />
          : null
        }
        {this.props.srefs[0].indexOf("Sheet") === -1 ?
          <PublicSheetsList
            srefs={this.props.srefs}
            connectedSheet={connectedSheet}
            fullPanel={this.props.fullPanel}
            handleSheetClick={this.props.handleSheetClick}
          /> : null
        }
      </div>);
    } else if (this.props.mode === "Add To Sheet") {
      let refForSheet, versionsForSheet, selectedWordsForSheet, nodeRef;
      // add source from connections
      if (this.props.connectionData && this.props.connectionData.hasOwnProperty("addSource") && this.props.connectionData["addSource"] === 'connectionsPanel') {
        refForSheet = this.props.connectionData.hasOwnProperty("connectionRefs") ? this.props.connectionData["connectionRefs"] : this.props.srefs;
        versionsForSheet = this.props.connectionData.hasOwnProperty("versions") ? this.props.connectionData["versions"] : { "en": null, "he": null };
        selectedWordsForSheet = null;
      } else { // add source from sheet itself
        refForSheet = this.props.srefs;
        versionsForSheet = this.props.currVersions;
        selectedWordsForSheet = this.props.selectedWords;
        nodeRef = this.props.nodeRef;
      }
      content = (<div>
        <AddToSourceSheetBox
          srefs={refForSheet}
          currVersions={versionsForSheet} //sidebar doesn't actually do versions
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
            <a href="/my/profile?tab=notes" className="allNotesLink button white transparent bordered fillWidth">
              <span className="int-en">{Sefaria._("Go to My Notes")}</span>
              <span className="int-he">{Sefaria._("Go to My Notes")}</span>
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
        masterPanelSheetId={this.props.masterPanelSheetId}
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
        currObjectVersions={this.state.currObjectVersions}
        masterPanelLanguage={this.props.masterPanelLanguage}
        setConnectionsMode={this.props.setConnectionsMode}
        mode={this.props.mode}
        setFilter={this.props.setVersionFilter}
        title={this.props.title}
        srefs={this.props.srefs}
        sectionRef={this.state.sectionRef}
        openVersionInReader={this.props.selectVersion}
        viewExtendedNotes={this.props.viewExtendedNotes}
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
    } else if (this.props.mode === "AboutSheet") {
      content = <AboutSheet
        masterPanelSheetId={this.props.masterPanelSheetId}
        toggleSignUpModal={this.props.toggleSignUpModal}
      />
    } else if (this.props.mode === "DivineName") {
      content = <DivineNameReplacer
          setDivineNameReplacement={this.props.setDivineNameReplacement}
          divineNameReplacement={this.props.divineNameReplacement}
      />
    } else if (this.props.mode === "SidebarSearch") {
    content = <SidebarSearch
                title={this.props.title}
                navigatePanel={this.props.navigatePanel}
                sidebarSearchQuery={this.props.sidebarSearchQuery}
                setSidebarSearchQuery={this.props.setSidebarSearchQuery}
                onSidebarSearchClick={this.props.onSidebarSearchClick}
              />
    }

    const marginless = ["Resources", "ConnectionsList", "Advanced Tools", "Share", "WebPages", "Topics", "manuscripts"].indexOf(this.props.mode) != -1;
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
            interfaceLang={this.props.interfaceLang} />}
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
  openDisplaySettings: PropTypes.func,
  closePanel: PropTypes.func,
  toggleLanguage: PropTypes.func,
  selectedWords: PropTypes.string,
  selectedNamedEntity: PropTypes.string,
  selectedNamedEntityText: PropTypes.string,
  interfaceLang: PropTypes.string,
  contentLang: PropTypes.string,
  masterPanelLanguage: PropTypes.oneOf(["english", "bilingual", "hebrew"]),
  masterPanelMode: PropTypes.string,
  masterPanelSheetId: PropTypes.number,
  versionFilter: PropTypes.array,
  recentVersionFilters: PropTypes.array,
  setVersionFilter: PropTypes.func.isRequired,
  checkIntentTimer: PropTypes.func.isRequired,
  clearSelectedWords: PropTypes.func.isRequired,
  clearNamedEntity: PropTypes.func.isRequired,
  translationLanguagePreference: PropTypes.string,
  scrollPosition: PropTypes.number,
  setSideScrollPosition: PropTypes.func.isRequired,
};


const ResourcesList = ({ masterPanelMode, setConnectionsMode, counts }) => {
  // A list of Resources in addition to connection
  return (
    <div className="toolButtonsList">
      <ToolsButton en={Sefaria._("Sheets")} he={Sefaria._("Sheets")}image="sheet.svg" count={counts["sheets"]} urlConnectionsMode="Sheets" onClick={() => setConnectionsMode("Sheets")} />
      <ToolsButton en={Sefaria._("Web Pages")} he={Sefaria._("Web Pages")} image="webpages.svg" count={counts["webpages"]} urlConnectionsMode="WebPages" onClick={() => setConnectionsMode("WebPages")} />
      <ToolsButton en={Sefaria._("Topics")} he={Sefaria._("Topics")} image="hashtag-icon.svg" count={counts["topics"]} urlConnectionsMode="Topics" onClick={() => setConnectionsMode("Topics")} alwaysShow={Sefaria.is_moderator} />
      <ToolsButton en={Sefaria._("Manuscripts")} he={Sefaria._("Manuscripts")}  image="manuscripts.svg" count={counts["manuscripts"]} urlConnectionsMode="manuscripts" onClick={() => setConnectionsMode("manuscripts")} />
      <ToolsButton en={Sefaria._("Pecha Readings")} he={Sefaria._("Pecha Readings")} image="torahreadings.svg" count={counts["audio"]} urlConnectionsMode="Torah Readings" onClick={() => setConnectionsMode("Torah Readings")} />
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
      <ToolsButton en={Sefaria._("Add to Sheet")} he={Sefaria._("Add to Sheet")} image="sheetsplus.svg" onClick={() => !Sefaria._uid ? toggleSignUpModal(SignUpModalKind.AddToSheet) : setConnectionsMode("Add To Sheet", { "addSource": "mainPanel" })} />
      {/* <ToolsButton en={Sefaria._("Dictionaries")} he={Sefaria._("Dictionaries")} image="dictionaries.svg" urlConnectionsMode="Lexicon" onClick={() => setConnectionsMode("Lexicon")} /> */}
      {openComparePanel ? <ToolsButton en={Sefaria._("Compare Text")} he={Sefaria._("Compare Text")} image="compare-panel.svg" onClick={openComparePanel} /> : null}
      <ToolsButton en={Sefaria._("Notes")} he={Sefaria._("Notes")} image="notes.svg" alwaysShow={true} count={counts["notes"]} urlConnectionsMode="Notes" onClick={() => !Sefaria._uid ? toggleSignUpModal(SignUpModalKind.Notes) : setConnectionsMode("Notes")} />
      {masterPanelMode !== "Sheet" ? <ToolsButton en={Sefaria._("Share")} he={Sefaria._("Share")} image="share.svg" onClick={() => setConnectionsMode("Share")} /> : null}
      <ToolsButton en={Sefaria._("Feedback")}  he={Sefaria._("Feedback")} image="feedback.svg" onClick={() => setConnectionsMode("Feedback")} />
      <ToolsButton en={Sefaria._("Advanced")} he={Sefaria._("Advanced")} image="advancedtools.svg" onClick={() => setConnectionsMode("Advanced Tools")} />
    </div>
  );
}
ToolsList.propTypes = {
  setConnectionsMode: PropTypes.func.isRequired,
  toggleSignUpModal: PropTypes.func.isRequired,
  counts: PropTypes.object.isRequired,
}

const AboutSheetButtons = ({ setConnectionsMode, masterPanelSheetId }) => {

  const [isOwner, setIsOwner] = useState(false);
  const [showEditButton, setShowEditButton] = useState(false);
  useEffect(() => {
    const sheet = Sefaria.sheets.loadSheetByID(masterPanelSheetId)
    setIsOwner(sheet.owner === Sefaria._uid);
    setShowEditButton(
        !Sefaria._uses_new_editor && Sefaria._uid && (
            sheet.owner === Sefaria._uid ||
            sheet.options.collaboration === "anyone-can-edit" ||
            sheet.options.collaboration === "anyone-can-add"
        )
    )
    console.log(sheet)
  }, []);

  return (<div className="topToolsButtons">
    {isOwner ?
        <ToolsButton en={Sefaria._("Publish Settings")} he={Sefaria._("Publish Settings")} image="about-text.svg" urlConnectionsMode="AboutSheet" onClick={() => setConnectionsMode("AboutSheet")} />
        :
        <ToolsButton en={Sefaria._("About this Sheet")} he={Sefaria._("About this Sheet")}  image="about-text.svg" urlConnectionsMode="AboutSheet" onClick={() => setConnectionsMode("AboutSheet")} />
    }
    {showEditButton  ?
        <ToolsButton en={Sefaria._("Edit")} he={Sefaria._("Edit")} image="note.svg" onClick={() => {
          window.location = `//${window.location.host}/sheets/${masterPanelSheetId}?editor=1`;
        }} />
        : null }

    <ToolsButton en={Sefaria._("Share")} he={Sefaria._("Share")} image="share.svg" onClick={() => setConnectionsMode("Share")} />
  </div>);
}

const SheetToolsList = ({ toggleSignUpModal, masterPanelSheetId, setConnectionsMode }) => {

  // const [isOwner, setIsOwner] = useState(false);
  // const [isPublished, setIsPublished] = useState(false);
  const googleDriveState = {
    export: { en: Sefaria._("Export to Google Docs") , he: Sefaria._("Export to Google Docs")  },
    exporting: {en: Sefaria._("Exporting to Google Docs..."), he: Sefaria._("Exporting to Google Docs..."), greyColor: true},
    exportComplete: { en: Sefaria._("Export Complete"), he: Sefaria._("Export Complete"), secondaryEn: Sefaria._("Open in Google"), secondaryHe: Sefaria._("Open in Google"), greyColor: true}
  }
  const copyState = {
    copy: { en: Sefaria._("Copy"), he: Sefaria._("Copy") },
    copying: { en: Sefaria._("Copying..."), he: Sefaria._("Copying..."), greyColor: true},
    copied: { en: Sefaria._("Sheet Copied"), he: Sefaria._("Sheet Copied"), secondaryHe: Sefaria._("View Copy"), secondaryEn: Sefaria._("View Copy"), greyColor: true },
    error: { en: Sefaria._("Sorry, there was an error."), he: Sefaria._("Sorry, there was an error.") }
  }
  const [copyText, setCopyText] = useState(copyState.copy);
  const urlHashObject = Sefaria.util.parseHash(Sefaria.util.parseUrl(window.location).hash).afterLoading;
  const [googleDriveText, setGoogleDriveText] = urlHashObject === "exportToDrive" ? useState(googleDriveState.exporting) : useState(googleDriveState.export);
  const [googleDriveLink, setGoogleDriveLink] = useState("");
  const [copiedSheetId, setCopiedSheetId] = useState(0);
  const sheet = Sefaria.sheets.loadSheetByID(masterPanelSheetId);
  const [showCollectionsModal, setShowCollectionsModal] = useState(false);

  useEffect(() => {
    if (googleDriveText.en === googleDriveState.exporting.en) {
      history.replaceState("", document.title, window.location.pathname + window.location.search); // remove exportToDrive hash once it's used to trigger export
      $.ajax({
        type: "POST",
        url: "/api/sheets/" + sheet.id + "/export_to_drive",
        success: function (data) {
          if ("error" in data) {
            console.log(data.error.message);
            // Export Failed
          } else {
            // Export succeeded
            setGoogleDriveLink(data.webViewLink);
            setGoogleDriveText(googleDriveState.exportComplete)
          }
        },
        statusCode: {
          401: function () {
            window.location.href = "/gauth?next=" + encodeURIComponent(window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + "#afterLoading=exportToDrive");
          }
        }
      });
    }
  }, [googleDriveText])

  // const toggleCollectionsModal = () => {
  //   if (!Sefaria._uid) {
  //     toggleSignUpModal();
  //   } else {
  //     setShowCollectionsModal(!showCollectionsModal)
  //   }
  // }



  const filterAndSaveCopiedSheetData = (data) => {
    let newSheet = Sefaria.util.clone(data);
    newSheet.status = "unlisted";
    newSheet.title = newSheet.title + " (Copy)";

    if (Sefaria._uid !== newSheet.owner) {
      newSheet.via = newSheet.id;
      newSheet.viaOwner = newSheet.owner;
      newSheet.owner = Sefaria._uid
    }
    delete newSheet.id;
    delete newSheet.ownerName;
    delete newSheet.views;
    delete newSheet.dateCreated;
    delete newSheet.dateModified;
    delete newSheet.displayedCollection;
    delete newSheet.collectionName;
    delete newSheet.collectionImage;
    delete newSheet.likes;
    delete newSheet.promptedToPublish;
    delete newSheet._id;

    const postJSON = JSON.stringify(newSheet);
    $.post("/api/sheets/", { "json": postJSON }, (data) => {
      if (data.id) {
        setCopiedSheetId(data.id);
        setCopyText(copyState.copied);
      } else if ("error" in data) {
        setCopyText(copyState.error);
        console.log(data.error);
      }
    })
  }

  const copySheet = () => {
    if (!Sefaria._uid) {
      toggleSignUpModal(SignUpModalKind.AddToSheet);
    } else if (copyText.en === copyState.copy.en) {
      setCopyText(copyState.copying);
      filterAndSaveCopiedSheetData(sheet);
    } else if (copyText.en === copyState.copied.en) {
      window.location.href = `/sheets/${copiedSheetId}`
      // TODO: open copied sheet
    }
  }

  const googleDriveExport = () => {
    // $("#overlay").show();
    // sjs.alert.message('<span class="int-en">Syncing with Google Docs...</span><span class="int-he">מייצא לגוגל דרייב...</span>');
    if (!Sefaria._uid) {
      toggleSignUpModal();
    }
    else if (googleDriveText.en === googleDriveState.exportComplete.en) {
      Sefaria.util.openInNewTab(googleDriveLink);
    } else {
      Sefaria.track.sheets("Export to Google Docs");
      setGoogleDriveText(googleDriveState.exporting)
    }
  }
  return (<div>
    <ToolsButton en={copyText.en} he={copyText.he} secondaryEn={copyText.secondaryEn} secondaryHe={copyText.secondaryHe} image="copy.png" greyColor={!!copyText.secondaryEn || copyText.greyColor} onClick={() => copySheet()} />
    {/* <ToolsButton en="Add to Collection" he="תרגומים" image="add-to-collection.svg" onClick={() => toggleCollectionsModal()} /> */}
    <ToolsButton en={Sefaria._("Print")}  he={Sefaria._("Print")}  image="print.svg" onClick={() => window.print()} />
    <ToolsButton en={googleDriveText.en} he={googleDriveText.he} greyColor={!!googleDriveText.secondaryEn || googleDriveText.greyColor} secondaryEn={googleDriveText.secondaryEn} secondaryHe={googleDriveText.secondaryHe} image="googledrive.svg" onClick={() => googleDriveExport()} />
    {
      Sefaria._uses_new_editor && Sefaria._uid && (
            sheet.owner === Sefaria._uid ||
            sheet.options.collaboration === "anyone-can-edit"
        ) ?
      <ToolsButton en={Sefaria._("Divine Name")} he={Sefaria._("Divine Name")} image="tools-translate.svg" onClick={() => setConnectionsMode("DivineName")} /> : null}

  </div>
  )
}
class SheetNodeConnectionTools extends Component {
  // A list of Resources in addition to connections
  render() {
    return (<div className="toolButtonsList">
      {this.props.multiPanel ?
        <ToolsButton en={Sefaria._("Other Text")} he={Sefaria._("Other Text")}icon="search" onClick={this.props.openComparePanel} />
        : null}
      <ToolsButton en={Sefaria._("Sheets")} he={Sefaria._("Sheets")} image="sheet.svg" urlConnectionsMode="Sheets" count={this.props.sheetsCount} onClick={() => this.props.setConnectionsMode("Sheets")} />
      <ToolsButton en={Sefaria._("Feedback")} he={Sefaria._("Feedback")} icon="comment" onClick={() => this.props.setConnectionsMode("Feedback")} />
    </div>);
  }
}
SheetNodeConnectionTools.propTypes = {
  multiPanel: PropTypes.bool.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  openComparePanel: PropTypes.func.isRequired,
};


class ConnectionsSummary extends Component {
  // A summary of available connections on `srefs`.
  // If `category` is present, shows a single category, otherwise all categories.
  // If `showBooks`, show specific text counts beneath each category.

  render() {
    const collapsedTopLevelLimit = 4;
    const refs = this.props.srefs;
    const excludedSheet = this.props.nodeRef ? this.props.nodeRef.split(".")[0] : null;
    const oref = Sefaria.ref(refs[0]);
    const isTopLevel = !this.props.category;
    const baseCat = oref ? oref["categories"][0] : null;
    let summary = Sefaria.linkSummary(refs, excludedSheet);
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
          <ToolsButton en={Sefaria._("More")} he={Sefaria._("More")} image="more.svg" onClick={this.props.toggleTopLevelCollapsed} control="interface" typeface="system" />
        );
      } else {
        summaryToggle = (
          <ToolsButton en={Sefaria._("See Less")} he={Sefaria._("See Less")}  image="less.svg" onClick={this.props.toggleTopLevelCollapsed} control="interface" typeface="system" />
        )
      }
    }

    return (
      <div>
        {isTopLevel ? essaySummary : null}
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


class MySheetsList extends Component {
  // List of my sheets for a ref in the Sidebar
  render() {
    const sheets = Sefaria.sheets.userSheetsByRef(this.props.srefs);
    let content = sheets.length ? sheets.filter(sheet => {
      // Don't show sheets as connections to themselves
      return sheet.id !== this.props.connectedSheet;
    }).filter(
      // filters out duplicate sheets by sheet ID number
      (sheet, index, self) =>
        index === self.findIndex((s) => (
          s.id === sheet.id
        ))
    ).map(sheet => {
      return (<SheetListing sheet={sheet} key={sheet.sheetUrl} handleSheetClick={this.props.handleSheetClick} connectedRefs={this.props.srefs} />)
    }, this) : null;
    return content && content.length ? (<div className="sheetList">{content}</div>) : null;
  }
}
MySheetsList.propTypes = {
  srefs: PropTypes.array.isRequired,
  connectedSheet: PropTypes.string,
};


class PublicSheetsList extends Component {
  // List of public sheets for a ref in the sidebar
  render() {
    const sheets = Sefaria.sheets.sheetsByRef(this.props.srefs);
    let content = sheets.length ? sheets.filter(sheet => {
      // My sheets are shown already in MySheetList
      return sheet.owner !== Sefaria._uid && sheet.id !== this.props.connectedSheet;
    }).sort((a, b) => {
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
                                                                         createNewTopicStr={Sefaria.translation(contentLang, "Create a new topic: ")}/>
                                                                         : null}
      {(!topics || !topics.length) ? (
        <div className="webpageList empty">
          <div className="loadingMessage sans-serif">
            <ContentText text={{ en: Sefaria._("No known Topics Here."), he: Sefaria._("No known Topics Here.") }} />
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
    dataSourceText = `${Sefaria._('This topic is connected to ')}"${Sefaria._r(srefs[0])}" ${Sefaria._('by')} ${Object.values(topic.dataSources).map(d => d[langKey]).join(' & ')}.`;
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
          sites[page.siteName] = { name: page.siteName, faviconUrl: page.favicon, count: 1 };
        }
      });
      sites = Object.values(sites).sort(this.webSitesSort);
      content = sites.map(site => {
        return (<div className="website" role="button" tabindex="0" onKeyUp={(event) => event.key==='Enter' && this.setFilter(site.name)} onClick={() => this.setFilter(site.name)} key={site.name}>
          <img className="icon" src={site.faviconUrl} />
          <span className="siteName">{site.name} <span className="connectionsCount">({site.count})</span></span>
        </div>);
      });
    } else {
      webpages = webpages.filter(page => this.props.filter === "all" || page.siteName === this.props.filter);
      content = webpages.map((webpage, i) => {
        return (<WebPage {...webpage} key={i} />);
      });
    }

    if (!content.length) {
      const filterName = this.props.filter !== "all" ? this.props.filter : null;
      const en = Sefaria._("No web pages known") + (filterName ? Sefaria._("from") + filterName : "") + Sefaria._("here");
      const he = Sefaria._("No web pages known") + (filterName ? Sefaria._("from") + filterName : "") + Sefaria._("here");
      return <div className="webpageList empty">
        <LoadingMessage message={en} heMessage={he} />
      </div>;
    }

    const linkerMessage = Sefaria._siteSettings.TORAH_SPECIFIC ?
      <div className="webpagesLinkerMessage sans-serif">
        <InterfaceText>{Sefaria._("Sites that are listed here use the")} </InterfaceText> <a href="/linker"><InterfaceText>{Sefaria._("Sefaria Linker")} </InterfaceText></a>
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

const AdvancedToolsList = ({srefs, canEditText, currVersions, setConnectionsMode, masterPanelLanguage, toggleSignUpModal}) => {
    const editText = canEditText ? function () {
      let refString = srefs[0];
      let currentPath = Sefaria.util.currentPath();
      let currentLangParam;
      const langCode = masterPanelLanguage.slice(0, 2);
      if (currVersions[langCode]) {
        refString += "/" + encodeURIComponent(langCode) + "/" + encodeURIComponent(currVersions[langCode]);
      }
      let path = "/edit/" + refString;
      let nextParam = "?next=" + encodeURIComponent(currentPath);
      path += nextParam;
      //console.log(path);
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

    return (
      <div>
        <ToolsButton en={Sefaria._("Add Translation")} he={Sefaria._("Add Translation")} image="tools-translate.svg" onClick={addTranslation} />
        <ToolsButton en={Sefaria._("Add Connection")} he={Sefaria._("Add Connection")}  image="tools-add-connection.svg" onClick={() => !Sefaria._uid ? toggleSignUpModal(SignUpModalKind.AddConnection) : setConnectionsMode("Add Connection")} />
        {editText ? (<ToolsButton en={Sefaria._("Edit Text")} he={Sefaria._("Edit Text")}image="tools-edit-text.svg" onClick={editText} />) : null}
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
                       count = null, control = "interface", typeface = "system", alwaysShow = false,
                       secondaryHe, secondaryEn, greyColor=false }) => {
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
    iconElem = (<img src={"/static/img/" + image} className="toolsButtonIcon" alt="" />);
  }
  //We only want to generate reloadable urls for states where we actually respond to said url. See ReaderApp.makeHistoryState()- sidebarModes.
  const url = urlConnectionsMode ? Sefaria.util.replaceUrlParam("with", urlConnectionsMode) : null;
  const nameClass = en.camelize();
  const wrapperClasses = classNames({ toolsButton: 1, [nameClass]: 1, [control + "Control"]: 1, [typeface + "Typeface"]: 1, noselect: 1, greyColor: greyColor })
  return (
    count == null || count > 0 || alwaysShow ?
    <div className="toolsButtonContainer">
      <a href={url} className={wrapperClasses} data-name={en} onClick={clickHandler}>
        {iconElem}
        <span className="toolsButtonText">
          {control === "interface" ? <InterfaceText text={{ en: en, he: he }} /> : <ContentText text={{ en: en, he: he }} />}
          {count ? (<span className="connectionsCount">({count})</span>) : null}
        </span>
      </a>
      {secondaryEn && secondaryHe ? <a className="toolsSecondaryButton" onClick={clickHandler}><InterfaceText text={{ en: secondaryEn, he: secondaryHe }} /> <img className="linkArrow" src={`/static/img/${Sefaria.interfaceLang === "hebrew" ? "arrow-left-bold" : "arrow-right-bold"}.svg`} aria-hidden="true"></img></a> : null}
      </div>
      : null
  );
}
ToolsButton.propTypes = {
  en: PropTypes.string.isRequired,
  he: PropTypes.string.isRequired,
  icon: PropTypes.string,
  image: PropTypes.string,
  count: PropTypes.number,
  onClick: PropTypes.func,
  greyColor: PropTypes.bool,
  secondaryEn: PropTypes.string,
  secondaryHe: PropTypes.string
};


class ShareBox extends Component {
  constructor(props) {
    super(props);
    if (this.props.masterPanelSheetId) {
      const sheet = Sefaria.sheets.loadSheetByID(this.props.masterPanelSheetId);
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
    if (this.state.shareValue !== prevState.shareValue) {
      new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(this.props.masterPanelSheetId, sheet => resolve(sheet))).then(updatedSheet => {
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
        <ConnectionsPanelSection title="Share Link">
          <div className="shareInputBox">
            <button tabindex="0" className="shareInputButton" aria-label="Copy Link to Sheet" onClick={this.copySheetLink.bind(this)}><img src="/static/icons/copy.svg" className="copyLinkIcon" aria-hidden="true"></img></button>
            <input tabindex="0" className="shareInput" id="sheetShareLink" value={this.props.url} />
          </div>
          {this.state.sheet && Sefaria._uid === this.state.sheet.owner ?
            <div className="shareSettingsBox">
              <InterfaceText>People with this link can</InterfaceText>
              <select
                className="shareDropdown"
                name="Share"
                onChange={this.updateShareOptions.bind(this)}
                value={this.state.shareValue}>
                <option value="none">{Sefaria._("View", "Sheet Share")}</option>
                <option value="anyone-can-add">{Sefaria._("Add", "Sheet Share")}</option>
                <option value="anyone-can-edit">{Sefaria._("Edit", "Sheet Share")}</option>
              </select>
            </div> : null}
        </ConnectionsPanelSection>
        <ConnectionsPanelSection title="More Options">
          <ToolsButton en= {Sefaria._("Share on Facebook")} he={Sefaria._("Share on Facebook")}icon="facebook-official" onClick={shareFacebook} />
          <ToolsButton en={Sefaria._("Share on Twitter")} he={Sefaria._("Share on Twitter")}  icon="twitter" onClick={shareTwitter} />
          <ToolsButton en={Sefaria._("Share by Email")} he={Sefaria._("Share by Email")} icon="envelope-o" onClick={shareEmail} />
        </ConnectionsPanelSection>
      </div>);
  }
}
ShareBox.propTypes = {
  url: PropTypes.string.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  closePanel: PropTypes.func.isRequired,
  fullPanel: PropTypes.bool,
  masterPanelSheetId: PropTypes.number
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
        alert(Sefaria._("Sorry, there was a problem saving your note."));
      }
    }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
      alert(Sefaria._("Unfortunately, there was an error saving this note. Please try again or try reloading this page."));
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
    alert(Sefaria._("Something went wrong (that's all I know)."));
    if (!confirm(Sefaria._("Are you sure you want to delete this note?"))) { return; }
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
        <textarea className="noteText" placeholder={Sefaria._("Write a note...")} defaultValue={this.props.noteText}></textarea>
        <div className="button fillWidth" onClick={this.saveNote}>
          <span className="int-en">{this.props.noteId ? Sefaria._("Save") : Sefaria._("Add Note")}</span>
          <span className="int-he">{this.props.noteId ? Sefaria._("Save") : Sefaria._("Add Note")}</span>
        </div>
        {this.props.noteId ?
          <div className="button white fillWidth" onClick={this.props.onCancel}>
            <span className="int-en">{ Sefaria._("Cancel")}</span>
            <span className="int-he">{ Sefaria._("Cancel")}</span>
          </div> : null}
        {this.props.noteId ?
          (<div className="deleteNote" onClick={this.deleteNote}>
            <span className="int-en">{ Sefaria._("Delete Note")}</span>
            <span className="int-he">{ Sefaria._("Delete Note")}</span>
          </div>) : null}
      </div>);
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
    const myNotes = myNotesData ? myNotesData.map(function (note) {
      let editNote = function () {
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
    }.bind(this)) : null;

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
    return (<div className="addConnectionBox">

      {this.props.srefs.length === 1 ?
        <div>
          <span className="int-en">{ Sefaria._("Choose a text to connect")}</span>
          <span className="int-he">{ Sefaria._("Choose a text to connect")}</span>

          <div className="button fillWidth" onClick={this.props.openComparePanel}>
            <span className="int-en">{ Sefaria._("Browse")}</span>
            <span className="int-he">{ Sefaria._("Browse")}</span>
          </div>
        </div>
        : null}

      {this.props.srefs.length > 2 ?
        <div>
          <span className="int-en">{ Sefaria._("We currently only understand connections between two texts")}</span>
          <span className="int-he">{ Sefaria._("We currently only understand connections between two texts")}</span>
        </div>
        : null}

      {this.props.srefs.length === 2 ?
        <div>

          <div className="addConnectionSummary">
            <span className="en">{refs[0]}<br />&<br />{refs[1]}</span>
            <span className="he">{heRefs[0]}<br />&<br />{heRefs[1]}</span>
          </div>

          <Dropdown
            name="connectionType"
            options={[
              { value: "", label: Sefaria._("None", "AddConnectionBox") },
              { value: "commentary", label: Sefaria._("Commentary", "AddConnectionBox") },
              { value: "quotation", label: Sefaria._("Quotation", "AddConnectionBox") },
              { value: "midrash", label: Sefaria._("Midrash", "AddConnectionBox") },
              { value: "ein mishpat", label: Sefaria._("Ein Mishpat / Ner Mitsvah", "AddConnectionBox") },
              { value: "mesorat hashas", label: Sefaria._("Mesorat HaShas", "AddConnectionBox") },
              { value: "reference", label: Sefaria._("Reference", "AddConnectionBox") },
              { value: "related", label: Sefaria._("Related Passage", "AddConnectionBox") }
            ]}
            placeholder={Sefaria._("Select Type", "AddConnectionBox")}
            onChange={this.setType} />

          <div className="button fillWidth" onClick={this.addConnection}>
            <span className="int-en">{Sefaria._("Add Connection")} </span>
            <span className="int-he">{Sefaria._("Add Connection")}</span>
          </div>

        </div>
        : null}

    </div>);
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
  return <div className={"manuscript"} >
    <a href={manuscript['image_url']} target="_blank">
      <img className={"manuscriptImage"} src={manuscript["thumbnail_url"]} alt={"Ancient Manuscript"} />
    </a>
    {
      (props.interfaceLang === 'hebrew')
        ? <p className={"hebrew manuscriptCaptionHe"}>{manuscript.manuscript.he_title}</p>
        : <p className={"english manuscriptCaption"}>{manuscript.manuscript.title}</p>
    }
    <div className="meta">
      <InterfaceText>{Sefaria._("Location")} </InterfaceText><span>{manuscript['page_id'].replace(/_/g, ' ')}</span><br />
      {
        manuscript.manuscript[description]
          ? <span>
            <InterfaceText text={{ en: Sefaria._("Courtesy of:"), he: Sefaria._("Courtesy of:") }} />
            <span className={cls}>{manuscript.manuscript[description]}<br /></span>
          </span>
          : ''
      }
      {
        manuscript.manuscript['license']
          ? <div className="manuscriptLicense">
              <InterfaceText>{Sefaria._("License")}</InterfaceText>
              <InterfaceText>:</InterfaceText>
              <a className="manuscriptLicenseLink" href={Sefaria.getLicenseMap()[manuscript.manuscript['license']]} target="_blank">
                {Sefaria._(manuscript.manuscript['license'])}
              </a>
          </div>
          : ''
      }
      <InterfaceText text={{ en: Sefaria._("Source"), he: Sefaria._("Source") }} />
      <a className="versionDetailsLink" href={manuscript.manuscript['source']} target="_blank">
        { Sefaria.util.parseUrl(manuscript.manuscript['source']).host.replace("www.", "") }
      </a>
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


const ConnectionsPanelSection = ({ title, children }) => {
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
