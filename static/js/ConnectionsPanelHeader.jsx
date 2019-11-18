const {
  LanguageToggleButton,
  ReaderNavigationMenuCloseButton,
}                = require('./Misc');
const {
  RecentFilterSet
}                = require('./ConnectionFilters');
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
    this.previousModes = { // mapping from modes to previous modes
      "Version Open":"Versions",
      "extended notes":"Versions",
      "WebPagesList": "WebPages"
    };
  }
  componentDidMount() {
    this.setMarginForScrollbar();
  }
  setMarginForScrollbar() {
    // Scrollbars take up spacing, causing the centering of ConnectsionPanel to be slightly off center
    // compared to the header. This functions sets appropriate margin to compensate.
    var width      = Sefaria.util.getScrollbarWidth();
    var $container = $(ReactDOM.findDOMNode(this));
    if (this.props.interfaceLang == "hebrew") {
      $container.css({marginRight: 0, marginLeft: width});
    } else {
      $container.css({marginRight: width, marginLeft: 0});
    }
  }
  onClick(e) {
    e.preventDefault();
    const previousMode = this.previousModes[this.props.connectionsMode];
    if (previousMode) {
      this.props.setConnectionsMode(previousMode);
    } else {
      this.props.setConnectionsCategory(this.props.previousCategory);
    }
  }
  render() {
    const previousMode = this.previousModes[this.props.connectionsMode];
    if (this.props.connectionsMode == "Resources") {
      // Top Level Menu
      var title = <div className="connectionsHeaderTitle">
                    {this.props.interfaceLang == "english" ? <div className="int-en">Resources</div> : null }
                    {this.props.interfaceLang == "hebrew" ? <div className="int-he">קישורים וכלים</div> : null }
                  </div>;

    } else if ((this.props.previousCategory && this.props.connectionsMode == "TextList") || previousMode) {
      // In a text list, back to Previous Category
      const prev = previousMode ? previousMode.splitCamelCase() : this.props.previousCategory;
      const prevHe = previousMode ? Sefaria._(prev) : Sefaria._(this.props.previousCategory);
      const url = Sefaria.util.replaceUrlParam("with", prev);
      var title = <a href={url} className="connectionsHeaderTitle active" onClick={this.onClick}>
                    {this.props.interfaceLang == "english" ? <div className="int-en"><i className="fa fa-chevron-left"></i>{this.props.multiPanel ? prev : null }</div> : null }
                    {this.props.interfaceLang == "hebrew" ? <div className="int-he"><i className="fa fa-chevron-right"></i>{this.props.multiPanel ? prevHe : null }</div> : null }
                  </a>;
    } else {
      // Anywhere else, back to Top Level
      var url = Sefaria.util.replaceUrlParam("with", "all");
      var onClick = function(e) {
        e.preventDefault();
        this.props.setConnectionsMode("Resources");
      }.bind(this);
      var title = <a href={url} className="connectionsHeaderTitle active" onClick={onClick}>
                    {this.props.interfaceLang == "english" ? <div className="int-en"><i className="fa fa-chevron-left"></i>Resources</div> : null }
                    {this.props.interfaceLang == "hebrew" ? <div className="int-he"><i className="fa fa-chevron-right"></i>קישורים וכלים</div> : null }
                  </a>;
    }
    if (this.props.multiPanel) {
      var toggleLang = Sefaria.util.getUrlVars()["lang2"] == "en" ? "he" : "en";
      var langUrl = Sefaria.util.replaceUrlParam("lang2", toggleLang);
      var closeUrl = Sefaria.util.removeUrlParam("with");
      return (<div className="connectionsPanelHeader">
                {title}
                <div className="rightButtons">
                  {Sefaria.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
                    <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} url={langUrl} />
                    : null }
                  <ReaderNavigationMenuCloseButton icon="circledX" onClick={this.props.closePanel} url={closeUrl} />
                </div>
              </div>);
    } else {
      var style = !this.props.multiPanel && this.props.connectionsMode == "TextList" ? {"borderTopColor": Sefaria.palette.categoryColor(this.props.previousCategory)} : {}
      var cStyle = !this.props.multiPanel && this.props.connectionsMode == "Resources" ? {"justifyContent": "center"} : style;
      // Modeling the class structure when ConnectionsPanelHeader is created inside ReaderControls in the multiPanel case
      var classes = classNames({readerControls: 1, connectionsHeader: 1, fullPanel: this.props.multiPanel});
      return (<div className={classes} style={style}>
                <div className="readerControlsInner">
                  <div className="readerTextToc">
                    <div className="connectionsPanelHeader" style={cStyle}>
                      {title}
                      {!this.props.multiPanel && this.props.previousCategory && this.props.connectionsMode == "TextList" ?
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
