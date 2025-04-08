import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import VersionBlock, {VersionsBlocksList} from './VersionBlock/VersionBlock';
import Component             from 'react-class';
import {InterfaceText, LoadingMessage} from "./Misc";
import {ContentText} from "./ContentText";
import {VersionsTextList} from "./VersionsTextList";
import { SidebarModules } from './NavSidebar';


class AboutBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      versionLangMap: {},
      currentVersionsByActualLangs: Sefaria.transformVersionObjectsToByActualLanguageKeys(this.props.currObjectVersions),
      details: Sefaria.getIndexDetailsFromCache(props.title),
    }
  }
  setTextMetaData() {
    if (this.props.title == "Sheet") {
      const sheetID = (Sefaria.sheets.extractIdFromSheetRef(this.props.srefs));
      if (!Sefaria.sheets.loadSheetByID(sheetID)) {
          Sefaria.sheets.loadSheetByID(sheetID, function (data) {
              this.setState({ details: data });
          }.bind(this));
      }
      else {
          this.setState({
            details: Sefaria.sheets.loadSheetByID(sheetID),
          });
      }
    }else {
      Sefaria.getIndexDetails(this.props.title).then(data => {
        this.setState({details: data});
      });
    }
  }
  componentDidMount() {
      this.setTextMetaData();
      Sefaria.getSourceVersions(this.props.sectionRef).then(this.onVersionsLoad);
  }
  componentDidUpdate(prevProps, prevState) {
      if (prevProps.title !== this.props.title ||
          prevProps.masterPanelLanguage !== this.props.masterPanelLanguage ||
          !Sefaria.util.object_equals(prevProps.currObjectVersions, this.props.currObjectVersions)
      ) {
          this.setState({details: null});
          this.setTextMetaData();
          Sefaria.getSourceVersions(this.props.sectionRef).then(this.onVersionsLoad);
      }
  }
  onVersionsLoad(versions) {
    //rearrange the current selected versions to be mapped by their real language,
    // then sort the current version to the top of its language list
    let versionsByLang = versions;
    let currentVersionsByActualLangs = Sefaria.transformVersionObjectsToByActualLanguageKeys(this.props.currObjectVersions);
    for (let [lang,ver] of Object.entries(currentVersionsByActualLangs)){
      if (versionsByLang[lang]){
        versionsByLang[lang] = versionsByLang[lang].filter((v) => v.versionTitle != ver.versionTitle);
      }
    }
    this.setState({versionLangMap: versionsByLang, currentVersionsByActualLangs:currentVersionsByActualLangs});
  }
  openVersionInSidebar(versionTitle, versionLanguage) {
    this.props.setConnectionsMode("Version Open", {previousMode: "About"});
    this.props.setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage), 'About');
  }
  isSheet(){
    return this.props.srefs[0].startsWith("Sheet");
  }
  render() {
    const d = this.state.details;
    let detailsSection = null;
    if (this.isSheet()) {
      if (d) {
          detailSection = (<div className="detailsSection">
                  <h2 className="aboutHeader">
                      <span className="int-en">About This Text</span>
                      <span className="int-he">אודות ספר זה</span>
                  </h2>
                  <div className="aboutTitle">
                      {d.title.stripHtml()}
                  </div>
                  <div className="aboutSubtitle">
                      By: <a href={d.ownerProfileUrl}>{d.ownerName}</a>
                  </div>
                  <div className="aboutDesc">
                      <span dangerouslySetInnerHTML={ {__html: d.summary} } />
                  </div>
              </div>
          )
      }
      return <section className="aboutBox">{detailSection}</section>;
    }

    if (!Object.keys(this.state.versionLangMap).length) {
        return (
          <div className="versionsBox">
            <LoadingMessage />
          </div>
        );
    }

    if (this.props.mode === "Version Open") {
      return (
        <VersionsTextList
            srefs={this.props.srefs}
            vFilter={this.props.vFilter}
            recentVFilters={this.props.vFilter}
            setFilter={this.props.setFilter.bind(null, 'About')}
            onRangeClick={this.props.onRangeClick}
            setConnectionsMode={this.props.setConnectionsMode}
            onCitationClick={this.props.onCitationClick}
            versionLangMap={this.state.versionLangMap}
        />
      );
    }

    const category = Sefaria.index(this.state?.details?.title)?.primary_category;
    const isDictionary = d?.lexiconName;
    const sourceVersion = this.props.currObjectVersions.he;
    const translationVersion = this.props.currObjectVersions?.en;
    const no_source_versions = !sourceVersion;
    const sourceVersionSectionTitle = {en: "Current Version", he:"מהדורה נוכחית"};
    const translationVersionSectionTitle = {en: "Current Translation", he:"תרגום נוכחי"};
    const alternateVersionsSectionTitle = no_source_versions ? {en: "Source Versions", he:"מהדורות בשפת המקור"} : {en: "Alternate Source Versions", he:"מהדורות נוספות בשפת המקור"}

    let detailSection = null;
    if (d) {
      let authorsElems = {};
      if (d.authors && d.authors.length) {
        for (let lang of ['en', 'he']) {
          const authorArray = d.authors.filter((elem) => !!elem[lang]);
          authorsElems[lang] = authorArray.map((author, iauthor) => <span>{iauthor > 0 ? ", " : ""}<a key={author.slug} href={`/topics/${author.slug}`}>{author[lang]}</a></span> );
        }
      }
      let placeTextEn, placeTextHe;
      if (d.compPlaceString) {
        placeTextEn = d.compPlaceString.en;
        placeTextHe = d.compPlaceString.he;
      } else if (d.compPlace){
        placeTextEn = d.compPlace;
        placeTextHe = d.compPlace;
      } else if (d.pubPlace) {
        placeTextEn = d.pubPlace;
        placeTextHe = d.pubPlace;
      }

      let dateTextEn, dateTextHe;
      if (d.compDateString) {
        dateTextEn = d.compDateString.en;
        dateTextHe = d.compDateString.he
      } else if (d.pubDateString) {
        dateTextEn = d.pubDateString.en;
        dateTextHe = d.pubDateString.he;
      }
      const bookPageUrl = "/" + Sefaria.normRef(d.title);  //comment for the sake of commit
      detailSection = (
        <div className="detailsSection sans-serif">
          <h2 className="aboutHeader">
            <InterfaceText>About This Text</InterfaceText>
          </h2>
          <a href={bookPageUrl} className="aboutTitle serif">
            <ContentText text={{en: d.title, he:d.heTitle}}/>
          </a>
          <span className="tocCategory">
              <ContentText text={{en:category, he:Sefaria.hebrewTerm(category)}}/>
          </span>
          { authorsElems?.en?.length ?
            <div className="aboutAuthor">
              <span className="aboutAuthorInner">
                  <span className="authorLabel">
                      <ContentText text={{en:"Author:", he: "מחבר:"}} />
                  </span>
                  <span className="authorName">
                      <ContentText text={authorsElems} />
                  </span>
              </span>
            </div> : null
          }
          <div className="aboutDesc">
            <ContentText markdown={{en: d?.enDesc, he: d?.heDesc || d?.heShortDesc}}/>
          </div>

          { !!placeTextEn || !!dateTextEn ?
            <div className="aboutComposed">
                <ContentText text={{
                    en: `Composed: ${placeTextEn ? placeTextEn : ""} ${dateTextEn ? dateTextEn : ""}`,
                    he: `נוצר/נערך: ${placeTextHe ? placeTextHe : ""} ${dateTextHe ? dateTextHe : ""}`
                }}/>
            </div> : null
          }
        </div>
      );
    }
    const versionSectionHe =
      (!!sourceVersion ?
      <div className="currVersionSection">
        <h2 className="aboutHeader">
            <InterfaceText text={sourceVersionSectionTitle} />
        </h2>
        <VersionBlock
          key={`${sourceVersion.versionTitle}|${sourceVersion.actualLanguage}`}
          rendermode="about-box"
          sidebarDisplay = {true}
          version={sourceVersion}
          currObjectVersions={this.props.currObjectVersions}
          currentRef={this.props.srefs[0]}
          firstSectionRef={"firstSectionRef" in sourceVersion ? sourceVersion.firstSectionRef : null}
          />
      </div>
      : null );
    const versionSectionEn =
      (!!translationVersion?.versionTitle ?
      <div className="currVersionSection">
        <h2 className="aboutHeader">
          <InterfaceText text={translationVersionSectionTitle} />
        </h2>
          <VersionBlock
              key={`${translationVersion.versionTitle}|${translationVersion.actualLanguage}`}
              rendermode="about-box"
              sidebarDisplay = {true}
              version={translationVersion}
              currObjectVersions={this.props.currObjectVersions}
              currentRef={this.props.srefs[0]}
              firstSectionRef={"firstSectionRef" in translationVersion ? translationVersion.firstSectionRef : null}
              viewExtendedNotes={this.props.viewExtendedNotes}
           />
      </div> : null );
    const alternateSectionHe =
      (Object.values(this.state.versionLangMap).some(array => array?.length) ?
          <div className="alternateVersionsSection">
            <h2 className="aboutHeader">
              <InterfaceText text={alternateVersionsSectionTitle} />
            </h2>
            <VersionsBlocksList key={`versions-${Object.values(this.props.currObjectVersions).map((v) => v?.versionTitle ?? "").join("|")}`}
              versionsByLanguages={this.state.versionLangMap}
              currObjectVersions={this.props.currObjectVersions}
              showLanguageHeaders={false}
              currentRef={this.props.srefs[0]}
              openVersionInReader={this.props.openVersionInReader}
              openVersionInSidebar={this.openVersionInSidebar}
              viewExtendedNotes={this.props.viewExtendedNotes}
            />
      </div> : null );

    return (
      <section className="aboutBox">
        {detailSection}
        { this.props.masterPanelLanguage === "english" ?
          (<div>{versionSectionEn}{versionSectionHe}{alternateSectionHe}</div>) :
          (<div>{versionSectionHe}{versionSectionEn}{alternateSectionHe}</div>)
        }
        <SidebarModules type={"RelatedTopics"} props={{title: this.props.title}} />
        { !isDictionary ? <SidebarModules type={"DownloadVersions"} props={{sref: this.props.title}} /> : null}
      </section>
    );
  }
}
AboutBox.propTypes = {
  currObjectVersions:  PropTypes.object.isRequired,
  masterPanelLanguage: PropTypes.oneOf(["english", "hebrew", "bilingual"]),
  title:               PropTypes.string.isRequired,
  srefs:               PropTypes.array.isRequired,
  vFilter:             PropTypes.array,
  onRangeClick:        PropTypes.func,
  onCitationClick:     PropTypes.func,
};


export default AboutBox;