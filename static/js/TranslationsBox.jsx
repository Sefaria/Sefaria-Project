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
    let currentVersionsByActualLangs = Object.values(this.props.currObjectVersions)
          .filter(v => !!v && !this._excludedLangs.includes(v.actualLanguage))
          .reduce((obj, version) => {
            obj[version.actualLanguage] = version;
            return obj;
          }, {});
    for(let v in currentVersionsByActualLangs){
      let ver = currentVersionsByActualLangs[v];
      versionsByLang[v].sort((a, b) => {return a.versionTitle == ver.versionTitle ? -1 : b.versionTitle == ver.versionTitle ? 1 : 0;});
    }
    this.setState({versionLangMap: versionsByLang});
  }

  openVersionInSidebar(versionTitle, versionLanguage) {
    this.props.setConnectionsMode("Translation Open");
    this.props.setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage));
  }
  sortVersionsByActiveLang(prioritize=null){
    const standard_langs = ["en", "he"];
    return Object.keys(this.state.versionLangMap).sort(
      (a, b) => {
        if      (!!prioritize && a === prioritize)                {return -1;}
        else if (!!prioritize && b === prioritize)                {return 1;}
        else if (a === this.props.mainVersionLanguage.slice(0,2)) {return -1;}
        else if (b === this.props.mainVersionLanguage.slice(0,2)) {return  1;}
        else if (a in standard_langs && !(b in standard_langs))   {return -1;}
        else if (b in standard_langs && !(a in standard_langs))   {return  1;}
        else if (a < b)                                           {return -1;}
        else if (b > a)                                           {return  1;}
        else                                                      {return  0;}
      }
    );
  }
  renderModeVersions() {
    if (!this.state.versionLangMap) {
      return (
        <div className="versionsBox">
          <LoadingMessage />
        </div>
      );
    }
    const versionLangs = this.sortVersionsByActiveLang("en");
    const currVersions = {};
    for (let vlang in this.props.currObjectVersions) {
      const tempV = this.props.currObjectVersions[vlang];
      currVersions[vlang] = !!tempV ? tempV.versionTitle : null;
    }
    return (
      <div className="versionsBox">
        {
          versionLangs.map((lang) => (
            <div key={lang}>
              <div className="versionLanguage">{Sefaria._(this.props.translateISOLanguageCode(lang))}<span className="enInHe connectionsCount">{` (${this.state.versionLangMap[lang].length})`}</span></div>
              {
                this.state.versionLangMap[lang].map((v) => (
                  <VersionBlock
                    rendermode="versions-box"
                    sidebarDisplay={true}
                    version={v}
                    currVersions={currVersions}
                    currentRef={this.props.srefs[0]}
                    firstSectionRef={"firstSectionRef" in v ? v.firstSectionRef : null}
                    getLicenseMap={this.props.getLicenseMap}
                    key={v.versionTitle + lang}
                    openVersionInReader={this.props.selectVersion}
                    openVersionInSidebar={this.openVersionInSidebar}
                    viewExtendedNotes={this.props.viewExtendedNotes}
                    isCurrent={(this.props.currObjectVersions.en && this.props.currObjectVersions.en.versionTitle === v.versionTitle && lang == 'en') ||
                              (this.props.currObjectVersions.he && this.props.currObjectVersions.he.versionTitle === v.versionTitle && lang == 'he')}
                  />
                ))
              }
            </div>
          ))
        }
      </div>
    );
  }
  renderModeSelected() {
    // open text in versionslist with current version selected
    let currSelectedVersions = {en: null, he: null};
    if (this.props.vFilter.length) {
      const [vTitle, lang] = Sefaria.deconstructVersionsKey(this.props.vFilter[0]);
      currSelectedVersions = {[lang]: vTitle};
    }
    const onRangeClick = (sref)=>{this.props.onRangeClick(sref, false, currSelectedVersions)};
    return (
      <VersionsTextList
        srefs={this.props.srefs}
        vFilter={this.props.vFilter}
        recentVFilters={this.props.recentVFilters}
        setFilter={this.props.setFilter}
        onRangeClick={onRangeClick}
        setConnectionsMode={this.props.setConnectionsMode}
        onCitationClick={this.props.onCitationClick}
      />
    );
  }
  render() {
    return (this.props.mode === "Translations" ? this.renderModeVersions() : this.renderModeSelected());
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
  translateISOLanguageCode: PropTypes.func.isRequired,
  setConnectionsMode:       PropTypes.func.isRequired,
  setFilter:                PropTypes.func.isRequired,
  selectVersion:            PropTypes.func.isRequired,
  sectionRef:               PropTypes.string.isRequired,
  onRangeClick:             PropTypes.func.isRequired,
  onCitationClick:          PropTypes.func.isRequired,
};


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
    const [vTitle, language] = Sefaria.deconstructVersionsKey(this.props.vFilter[0]);
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
          panelPosition ={this.props.panelPosition}
          sref={Sefaria.humanRef(this.props.srefs)}
          currVersions={{[language]: vTitle}}
          useVersionLanguage={true}
          hideTitle={true}
          numberLabel={0}
          basetext={false}
          onCitationClick={this.props.onCitationClick} />
          <ConnectionButtons>
            <OpenConnectionTabButton srefs={this.props.srefs} openInTabCallback={this.props.onRangeClick}/>
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

export default TranslationsBox;
