import {InterfaceText, EnglishText, HebrewText, LanguageToggleButton, CloseButton } from "./Misc";
import {RecentFilterSet} from "./ConnectionFilters";
import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Component      from 'react-class';


class ConnectionsPanelHeader extends Component {
  constructor(props) {
    super(props);
    this.previousModes = {
        // mapping from modes to previous modes
        "Translation Open":"Translations",
        "extended notes":"Translations",
        "WebPagesList": "WebPages"
    };
  }
  componentDidMount() {
    this.setMarginForScrollbar();
  }
  getPreviousMode() {
      return !!this.props.previousMode ? this.props.previousMode : this.previousModes[this.props.connectionsMode];
  }
  setMarginForScrollbar() {
    // Scrollbars take up spacing, causing the centering of ConnectsionPanel to be slightly off center
    // compared to the header. This functions sets appropriate margin to compensate.
    const width      = Sefaria.util.getScrollbarWidth();
    const $container = $(ReactDOM.findDOMNode(this));
    if (this.props.interfaceLang === "hebrew") {
      $container.css({marginRight: 0, marginLeft: width});
    } else {
      $container.css({marginRight: width, marginLeft: 0});
    }
  }
  onClick(e) {
    e.preventDefault();
    const previousMode = this.getPreviousMode();
    if (previousMode) {
      this.props.setConnectionsMode(previousMode);
    } else {
      this.props.setConnectionsCategory(this.props.previousCategory);
    }
  }
  render() {
      /** TODO: fix for interfacetext */
    const previousMode = this.getPreviousMode();
    let title;
    if (this.props.connectionsMode === "Resources") {
      // Top Level Menu
      title = <div className="connectionsHeaderTitle sans-serif">
                    <InterfaceText text={{en: Sefaria._("Resources") , he: Sefaria._("Resources") }} />
                  </div>;

    } else if ((this.props.previousCategory && this.props.connectionsMode === "TextList") || previousMode) {
      // In a text list, back to Previous Category
      const prev = previousMode ? previousMode.splitCamelCase() : this.props.previousCategory;
      const prevHe = previousMode ? Sefaria._(prev) : Sefaria._(this.props.previousCategory);
      const url = Sefaria.util.replaceUrlParam("with", prev);
      title = <a href={url} className="connectionsHeaderTitle sans-serif active" onClick={this.onClick}>
                    <InterfaceText>
                        <EnglishText>
                            <i className="fa fa-chevron-left"></i>
                            {this.props.multiPanel ? prev : null }
                        </EnglishText>
                        <HebrewText>
                            <i className="fa fa-chevron-right"></i>
                            {this.props.multiPanel ? prevHe : null }
                        </HebrewText>
                    </InterfaceText>
                  </a>;
    } else {
      // Anywhere else, back to Top Level
      const url = Sefaria.util.replaceUrlParam("with", "all");
      const onClick = function(e) {
        e.preventDefault();
        this.props.setConnectionsMode("Resources");
      }.bind(this);
      title = <a href={url} className="connectionsHeaderTitle sans-serif active" onClick={onClick}>
                    <InterfaceText>
                        <EnglishText>
                            <i className="fa fa-chevron-left"></i>
                            { Sefaria._("Resources") }
                        </EnglishText>
                        <HebrewText>
                            <i className="fa fa-chevron-right"></i>
                            { Sefaria._("Resources")}
                        </HebrewText>
                    </InterfaceText>
                  </a>;
    }
    if (this.props.multiPanel) {
      const toggleLang = Sefaria.util.getUrlVars()["lang2"] === "en" ? "he" : "en";
      const langUrl = Sefaria.util.replaceUrlParam("lang2", toggleLang);
      const closeUrl = Sefaria.util.removeUrlParam("with");
      return (<div className="connectionsPanelHeader">
                {title}
                <div className="rightButtons">
                  {Sefaria.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
                    <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} url={langUrl} />
                    : null }
                  <CloseButton icon="circledX" onClick={this.props.closePanel} url={closeUrl} />
                </div>
              </div>);
    } else {
      const style = !this.props.multiPanel && this.props.connectionsMode === "TextList" ? {"borderTopColor": Sefaria.palette.categoryColor(this.props.previousCategory)} : {}
      const cStyle = !this.props.multiPanel && this.props.connectionsMode === "Resources" ? {"justifyContent": "center"} : style;
      // Modeling the class structure when ConnectionsPanelHeader is created inside ReaderControls in the multiPanel case
      let classes = classNames({readerControls: 1, connectionsHeader: 1, fullPanel: this.props.multiPanel});
      return (<div className={classes} style={style}>
                <div className="readerControlsInner">
                  <div className="readerTextToc">
                    <div className="connectionsPanelHeader" style={cStyle}>
                      {title}
                      {!this.props.multiPanel && this.props.previousCategory && this.props.connectionsMode === "TextList" ?
                      <RecentFilterSet
                        srefs={this.props.baseRefs}
                        asHeader={true}
                        filter={this.props.filter}
                        recentFilters={this.props.recentFilters}
                        textCategory={this.props.previousCategory}
                        setFilter={this.props.setFilter} />
                        : null }
                    </div>
                  </div>
                </div>
        </div>);
    }
  }
}
ConnectionsPanelHeader.propTypes = {
    connectionsMode:        PropTypes.string.isRequired, // "Resources", "ConnectionsList", "TextList" etc
    previousCategory:       PropTypes.string,
    multiPanel:             PropTypes.bool,
    filter:                 PropTypes.array,
    recentFilters:          PropTypes.array,
    baseRefs:               PropTypes.array,
    setFilter:              PropTypes.func,
    setConnectionsMode:     PropTypes.func.isRequired,
    setConnectionsCategory: PropTypes.func.isRequired,
    closePanel:             PropTypes.func.isRequired,
    toggleLanguage:         PropTypes.func,
    interfaceLang:          PropTypes.string.isRequired
};


export default ConnectionsPanelHeader;
