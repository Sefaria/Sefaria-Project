import React  from 'react';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import {VersionsBlocksList}  from './VersionBlock/VersionBlock';
import Component             from 'react-class';
import {EnglishText, HebrewText, InterfaceText, LoadingMessage} from "./Misc";
import {RecentFilterSet} from "./ConnectionFilters";
import TextRange from "./TextRange";
import {AddConnectionToSheetButton, ConnectionButtons, OpenConnectionTabButton} from "./TextList";

class TranslationsBox extends Component {
  constructor(props) {
    super(props);
    this._excludedLangs = ["he"];
    this.state = {
      versionLangMap: null,  // object with version languages as keys and array of versions in that lang as values
      currentVersionsByActualLangs: Sefaria.transformVersionObjectsToByActualLanguageKeys(this.props.currObjectVersions),
    };
  }
  componentDidMount() {
    if(!this.isSheet()) {
      Sefaria.getAllTranslationsWithText(this.props.srefs[0]).then(this.onVersionsLoad);
    }
  }
  componentDidUpdate(prevProps, prevState) {
    if (!this.isSheet() && prevProps.srefs[0] !== this.props.srefs[0]) {
      Sefaria.getAllTranslationsWithText(this.props.srefs[0]).then(this.onVersionsLoad);
    }
  }
  onVersionsLoad(versions) {
    //rearrange the current selected versions to be mapped by their real language,
    // then sort the current version to the top of its language list
    let versionsByLang = versions;
    let currentVersionsByActualLangs = Sefaria.transformVersionObjectsToByActualLanguageKeys(this.props.currObjectVersions);
    for(let [lang,ver] of Object.entries(currentVersionsByActualLangs)){
      if (!this._excludedLangs.includes(lang)) {
        versionsByLang[lang].sort((a, b) => {
          return a.versionTitle === ver.versionTitle ? -1 : b.versionTitle === ver.versionTitle ? 1 : 0;
        });
      }
    }
    this.setState({versionLangMap: versionsByLang, currentVersionsByActualLangs:currentVersionsByActualLangs});
  }
  openVersionInSidebar(versionTitle, versionLanguage) {
    this.props.setConnectionsMode("Translation Open");
    this.props.setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage));
  }
  isSheet(){
    return this.props.srefs[0].startsWith("Sheet");
  }
  render() {
    if (this.isSheet()) {
      return (
          <div className="versionsBox">
            <LoadingMessage message="There are no Translations for this sheet source" heMessage="למקור זה אין תרגומים"/>
          </div>
      );
    }
    if (this.props.mode === "Translation Open") { // A single translation open in the sidebar
      return (
        <VersionsTextList
          srefs={this.props.srefs}
          vFilter={this.props.vFilter}
          recentVFilters={this.props.recentVFilters}
          setFilter={this.props.setFilter}
          onRangeClick={this.props.onRangeClick}
          setConnectionsMode={this.props.setConnectionsMode}
          onCitationClick={this.props.onCitationClick}
          translationLanguagePreference={this.props.translationLanguagePreference}
        />
      );
    }else if(this.props.mode === "Translations"){
      if (!this.state.versionLangMap) {
        return (
          <div className="versionsBox">
            <LoadingMessage />
          </div>
        );
      }
      return (
          <>
            <TranslationsHeader />
            <VersionsBlocksList
                versionsByLanguages={this.state.versionLangMap}
                currObjectVersions={this.props.currObjectVersions}
                sortPrioritizeLanugage={"en"}
                currentRef={this.props.srefs[0]}
                openVersionInReader={this.props.openVersionInReader}
                openVersionInSidebar={this.openVersionInSidebar}
                viewExtendedNotes={this.props.viewExtendedNotes}
                inTranslationBox={true}
                showNotes={false}
                srefs={this.props.srefs}
                onRangeClick={this.props.onRangeClick}
            />
          </>
      );
    }
  }
}
TranslationsBox.propTypes = {
  currObjectVersions:       PropTypes.object.isRequired,
  mode:                     PropTypes.oneOf(["Translations", "Translation Open"]),
  vFilter:                  PropTypes.array,
  recentVFilters:           PropTypes.array,
  srefs:                    PropTypes.array.isRequired,
  setConnectionsMode:       PropTypes.func.isRequired,
  setFilter:                PropTypes.func.isRequired,
  openVersionInReader:      PropTypes.func.isRequired,
  sectionRef:               PropTypes.string.isRequired,
  onRangeClick:             PropTypes.func.isRequired,
  onCitationClick:          PropTypes.func.isRequired,
  translationLanguagePreference: PropTypes.string,
  inTranslationBox:            PropTypes.bool,
};


const TranslationsHeader = () => (
  <div className="translationsHeader">
    <h3>
      <InterfaceText>Translations</InterfaceText>
    </h3>
    <div className="translationsDesc sans-serif">
      <InterfaceText>
        <EnglishText>Pecha acquires translations to enrich your learning experience. Preview or choose a different translation below.</EnglishText>
        <HebrewText>ספריא עושה מאמצים להוסיף תרגומים שונים לספרים כדי להעשיר את חווית הלמידה שלכם. כאן ניתן להחליף לתרגום אחר או לראות תצוגה מקדימה שלו לצד הטקסט הנוכחי.</HebrewText>
      </InterfaceText>
      <a href="/sheets/511573" target="_blank" className="inTextLink">
        <InterfaceText>
          <EnglishText>Learn more ›</EnglishText>
          <HebrewText>למידע נוסף ›</HebrewText>
        </InterfaceText>
      </a>
    </div>
  </div>
);


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
    const currSelectedVersions = {[language]: vTitle};
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
          onCitationClick={this.props.onCitationClick}
          translationLanguagePreference={this.props.translationLanguagePreference}
        />
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
  translationLanguagePreference: PropTypes.string,
};


export {TranslationsBox as default};
