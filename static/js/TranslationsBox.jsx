import React  from 'react';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import VersionBlock  from './VersionBlock';
import TextRange  from './TextRange';
import {ConnectionButtons, OpenConnectionTabButton, AddConnectionToSheetButton} from './TextList';
import { LoadingMessage } from './Misc';
import { RecentFilterSet } from './ConnectionFilters';
import Component             from 'react-class';

class TranslationsBox extends Component {
  constructor(props) {
    super(props);
    this._excludedLangs = ["he"];
    this.state = {
      versionLangMap: null,  // object with version languages as keys and array of versions in that lang as values
      currentVersionsByActualLangs: this.convertCurrentLanguages(),
      initialMainVersionLanguage: props.mainVersionLanguage,
    };
  }
  componentDidMount() {
    Sefaria.versions(this.props.sectionRef, true, this._excludedLangs, true).then(this.onVersionsLoad);
  }
  componentDidUpdate(prevProps, prevState) {
    if (prevProps.sectionRef !== this.props.sectionRef) {
      Sefaria.versions(this.props.sectionRef,true, this._excludedLangs, true).then(this.onVersionsLoad);
    }
  }
  onVersionsLoad(versions) {
    //rearrange the current selected versions to be mapped by their real language,
    // then sort the current version to the top of its language list
    let versionsByLang = versions;
    let currentVersionsByActualLangs = this.convertCurrentLanguages();
    for(let [lang,ver] of Object.entries(currentVersionsByActualLangs)){
      versionsByLang[lang].sort((a, b) => {return a.versionTitle == ver.versionTitle ? -1 : b.versionTitle == ver.versionTitle ? 1 : 0;});
    }
    this.setState({versionLangMap: versionsByLang, currentVersionsByActualLangs:currentVersionsByActualLangs});
  }
  convertCurrentLanguages(){
    return Object.values(this.props.currObjectVersions)
          .filter(v => !!v && !this._excludedLangs.includes(v.actualLanguage))
          .reduce((obj, version) => {
            obj[version.actualLanguage] = version;
            return obj;
          }, {});
  }
  openVersionInSidebar(versionTitle, versionLanguage) {
    this.props.setConnectionsMode("Translation Open");
    this.props.setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage));
  }
  render() {
    if (this.props.mode == "Translation Open"){ // A single translation open in the sdiebar
      return (
        <VersionsTextList
          srefs={this.props.srefs}
          vFilter={this.props.vFilter}
          recentVFilters={this.props.recentVFilters}
          setFilter={this.props.setFilter}
          onRangeClick={this.props.onRangeClick}
          setConnectionsMode={this.props.setConnectionsMode}
          onCitationClick={this.props.onCitationClick}
        />
      );
    }else if(this.props.mode == "Translations"){
      return (
        <VersionsBlocksList
          versionsByLanguages={this.state.versionLangMap}
          activeLanguages={Object.keys(this.state.currentVersionsByActualLangs)}
          mainVersionLanguage={this.props.mainVersionLanguage}
          currObjectVersions={this.props.currObjectVersions}
          sortPrioritizeLanugage={"en"}
          currentRef={this.props.srefs[0]}
          getLicenseMap={this.props.getLicenseMap}
          openVersionInReader={this.props.selectVersion}
          openVersionInSidebar={this.openVersionInSidebar}
          viewExtendedNotes={this.props.viewExtendedNotes}
        />
      );
    }
  }
}
TranslationsBox.propTypes = {
  currObjectVersions:       PropTypes.object.isRequired,
  mode:                     PropTypes.oneOf(["Translations", "Translation Open"]),
  mainVersionLanguage:      PropTypes.oneOf(["english", "hebrew"]).isRequired,
  vFilter:                  PropTypes.array,
  recentVFilters:           PropTypes.array,
  srefs:                    PropTypes.array.isRequired,
  getLicenseMap:            PropTypes.func.isRequired,
  setConnectionsMode:       PropTypes.func.isRequired,
  setFilter:                PropTypes.func.isRequired,
  selectVersion:            PropTypes.func.isRequired,
  sectionRef:               PropTypes.string.isRequired,
  onRangeClick:             PropTypes.func.isRequired,
  onCitationClick:          PropTypes.func.isRequired,
};

class VersionsBlocksList extends Component{
  sortVersionsByActiveLang(prioritize=null){
    //sorts the languages of the available versions
    const standard_langs = ["en", "he"];
    const activeLanguages = this.props.activeLanguages
    return Object.keys(this.props.versionsByLanguages).sort(
      (a, b) => {
        if      (!!prioritize && a === prioritize)                {return -1;}
        else if (!!prioritize && b === prioritize)                {return 1;}
        else if (a in standard_langs && !(b in standard_langs))   {return -1;}
        else if (b in standard_langs && !(a in standard_langs))   {return  1;}
        else if (this.props.activeLanguages.includes(a))          {return -1;}
        else if (this.props.activeLanguages.includes(b))          {return  1;}
        else if (a < b)                                           {return -1;}
        else if (b < a)                                           {return  1;}
        else                                                      {return  0;}
      }
    );
  }
  render(){
      if (!this.props.versionsByLanguages) {
        return (
          <div className="versionsBox">
            <LoadingMessage />
          </div>
        );
      }
      const sortedLanguages = this.sortVersionsByActiveLang(this.props.sortPrioritizeLanugage)
      const currVersions = {};
      for (let [vlang, version] of Object.entries(this.props.currObjectVersions)) {
        currVersions[vlang] = !!version ? version.versionTitle : null;
      }
      return (
        <div className="versionsBox">
          {
            sortedLanguages.map((lang) => (
              <div key={lang}>
                <div className="versionLanguage">{Sefaria._(Sefaria.translateISOLanguageCode(lang))}<span className="enInHe connectionsCount">{` (${this.props.versionsByLanguages[lang].length})`}</span></div>
                {
                  this.props.versionsByLanguages[lang].map((v) => (
                    <VersionBlock
                      rendermode="versions-box"
                      sidebarDisplay={true}
                      version={v}
                      currVersions={currVersions}
                      currentRef={this.props.currentRef}
                      firstSectionRef={"firstSectionRef" in v ? v.firstSectionRef : null}
                      getLicenseMap={this.props.getLicenseMap}
                      key={v.versionTitle + lang}
                      openVersionInReader={this.props.openVersionInReader}
                      openVersionInSidebar={this.props.openVersionInSidebar}
                      viewExtendedNotes={this.props.viewExtendedNotes}
                      isCurrent={this.props.activeLanguages.includes(v.actualLanguage) && Object.values(currVersions).includes(v.versionTitle)}
                    />
                  ))
                }
              </div>
            ))
          }
        </div>
      );
    }
}
VersionsBlocksList.propTypes={

}


class VersionsTextList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loaded: false,
    };
  }
  componentDidMount() {
    this.preloadText(this.props.vFilter);
  }
  componentWillReceiveProps(nextProps) {
    this.preloadText(nextProps.vFilter);
  }
  preloadText(filter) {
    if (filter.length) {
      this.setState({loaded: false});
      const sectionRef = this.getSectionRef();
      const [vTitle, language] = Sefaria.deconstructVersionsKey(filter[0]);
      let enVersion = null, heVersion = null;
      if (language === "en") { enVersion = vTitle; }
      else                   { heVersion = vTitle; }
      Sefaria.getText(sectionRef, {enVersion, heVersion}).then(() => {this.setState({loaded: true})});
    }
  }
  getSectionRef() {
    const ref = this.props.srefs[0]; // TODO account for selections spanning sections
    const sectionRef = Sefaria.sectionRef(ref) || ref;
    return sectionRef;
  }
  render() {
    let currSelectedVersions = {en: null, he: null};
    const [vTitle, language] = Sefaria.deconstructVersionsKey(this.props.vFilter[0]);
    currSelectedVersions = {[language]: vTitle};
    const onRangeClick = (sref) => {this.props.onRangeClick(sref, false, currSelectedVersions)};
    return !this.state.loaded || !this.props.vFilter.length ?
      (<LoadingMessage />) :
      (<div className="versionsTextList">
        <RecentFilterSet
          srefs={this.props.srefs}
          asHeader={false}
          filter={this.props.vFilter}
          recentFilters={this.props.recentVFilters}
          setFilter={this.props.setFilter}/>
        <TextRange
          sref={Sefaria.humanRef(this.props.srefs)}
          currVersions={currSelectedVersions}
          useVersionLanguage={true}
          hideTitle={true}
          numberLabel={0}
          basetext={false}
          onCitationClick={this.props.onCitationClick} />
          <ConnectionButtons>
            <OpenConnectionTabButton srefs={this.props.srefs} openInTabCallback={onRangeClick}/>
            <AddConnectionToSheetButton srefs={this.props.srefs} versions={{[language]: vTitle}} addToSheetCallback={this.props.setConnectionsMode}/>
          </ConnectionButtons>
      </div>);
  }
}
VersionsTextList.propTypes = {
  srefs:           PropTypes.array,
  vFilter:         PropTypes.array,
  recentVFilters:  PropTypes.array,
  setFilter:       PropTypes.func.isRequired,
  onRangeClick:    PropTypes.func.isRequired,
  onCitationClick: PropTypes.func.isRequired,
};

export {TranslationsBox as default, VersionsBlocksList};
