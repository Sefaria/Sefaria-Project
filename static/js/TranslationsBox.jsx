import React  from 'react';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import {VersionsBlocksList, VersionsTextList}  from './VersionBlock';
import Component             from 'react-class';
import {LoadingMessage} from "./Misc";

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


export {TranslationsBox as default};
