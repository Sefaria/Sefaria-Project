import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import VersionBlock, {VersionsBlocksList} from './VersionBlock';
import Component             from 'react-class';
import {ContentText, InterfaceText} from "./Misc";
import { Modules } from './NavSidebar';


class AboutBox extends Component {
  constructor(props) {
    super(props);
    this._includeOtherVersionsLangs = ["he"];
    this.state = {
      versionLangMap: null,
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
    for(let [lang,ver] of Object.entries(currentVersionsByActualLangs)){
      if (this._includeOtherVersionsLangs.includes(lang)){ //remove current version if its "he"
        versionsByLang[lang] = versionsByLang[lang].filter((v) => v.versionTitle != ver.versionTitle);
      }
    }
    this.setState({versionLangMap: versionsByLang, currentVersionsByActualLangs:currentVersionsByActualLangs});
  }
  openVersionInSidebar(versionTitle, versionLanguage) {
    this.props.setConnectionsMode("Translation Open", {previousMode: "About"});
    this.props.setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage));
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

    const category = Sefaria.index(this.state?.details?.title)?.primary_category;
    const isDictionary = d?.lexiconName;
    const sourceVersion = this.state.currentVersionsByActualLangs?.he;
    const translationVersions = Object.entries(this.state.currentVersionsByActualLangs).filter(([lang, version]) => lang != "he").map(([lang, version])=> version);
    const multiple_translations = translationVersions?.length > 1;
    const no_source_versions = multiple_translations || translationVersions?.length == 1 && !sourceVersion;
    const sourceVersionSectionTitle = {en: "Current Version", he:"מהדורה נוכחית"};
    const translationVersionsSectionTitle = multiple_translations ? {en: "Current Translations", he:"תרגומים נוכחיים"} : {en: "Current Translation", he:"תרגום נוכחי"};
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
      // use compPlaceString and compDateString if available. then use compPlace o/w use pubPlace o/w nothing
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
      } else if (d.compDate) {
        if (d.errorMargin !== 0) {
          //I don't think there are any texts which are mixed BCE/CE
          const lowerDate = Math.abs(d.compDate - d.errorMargin);
          const upperDate = Math.abs(d.compDate - d.errorMargin);
          dateTextEn = `(c.${lowerDate} - c.${upperDate} ${d.compDate < 0 ? "BCE" : "CE"})`;
          dateTextHe = `(${lowerDate} - ${upperDate} ${d.compDate < 0 ? 'לפנה"ס בקירוב' : 'לספירה בקירוב'})`;
        } else {
          dateTextEn = `(${Math.abs(d.compDate)} ${d.compDate < 0 ? "BCE" : "CE"})`;
          dateTextHe = `(${Math.abs(d.compDate)} ${d.compDate < 0 ? 'לפנה"ס בקירוב' : 'לספירה בקירוב'})`;
        }
      } else if (d.pubDate) {
        dateTextEn = `(${Math.abs(d.pubDate)} ${d.pubDate < 0 ? "BCE" : "CE"})`;
        dateTextHe = `(${Math.abs(d.pubDate)} ${d.pubDate < 0 ? 'לפנה"ס בקירוב' : 'לספירה בקירוב'})`;
      }
      const bookPageUrl = "/" + Sefaria.normRef(d.title);
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
            <InterfaceText markdown={{en: d?.enDesc, he: d?.heDesc}}/>
          </div>

          { !!placeTextEn || !!dateTextEn ?
            <div className="aboutComposed">
              <span className="en">{`Composed: ${!!placeTextEn ? placeTextEn : ""} ${!!dateTextEn ? dateTextEn : ""}`}</span>
              <span className="he">{`נוצר/נערך: ${!!placeTextHe ? placeTextHe : ""} ${!!dateTextHe ? dateTextHe : ""}`}</span>
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
      (!!translationVersions?.length ?
      <div className="currVersionSection">
        <h2 className="aboutHeader">
          <InterfaceText text={translationVersionsSectionTitle} />
        </h2>
          {
              translationVersions.map((ve) => (
                  <VersionBlock
                  key={`${ve.versionTitle}|${ve.actualLanguage}`}
                  rendermode="about-box"
                  sidebarDisplay = {true}
                  version={ve}
                  currObjectVersions={this.props.currObjectVersions}
                  currentRef={this.props.srefs[0]}
                  firstSectionRef={"firstSectionRef" in ve ? ve.firstSectionRef : null}
                  viewExtendedNotes={this.props.viewExtendedNotes}
                   />
              ))
          }
      </div> : null );
    const alternateSectionHe =
      (this.state.versionLangMap?.he?.length > 0 ?
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
        <Modules type={"RelatedTopics"} props={{title: this.props.title}} />
        { !isDictionary ? <Modules type={"DownloadVersions"} props={{sref: this.props.title}} /> : null}
      </section>
    );
  }
}
AboutBox.propTypes = {
  currObjectVersions:  PropTypes.object.isRequired,
  masterPanelLanguage: PropTypes.oneOf(["english", "hebrew", "bilingual"]),
  title:               PropTypes.string.isRequired,
  srefs:               PropTypes.array.isRequired,
};


export default AboutBox;