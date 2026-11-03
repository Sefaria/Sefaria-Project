import {InterfaceText, EnglishText, HebrewText, LanguageToggleButton, CloseButton} from "./Misc";
import {RecentFilterSet} from "./ConnectionFilters";
import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import {CONNECTION_MODE_STRING_IDS} from './constants';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Component      from 'react-class';
import Util from "./sefaria/util";


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

  // Mobile sheet: dragging the header resizes the panel to any height; dragging or flicking it to the bottom closes it.
  onPointerDown(e) {
    if (e.button !== 0) { return; }
    const panel = e.currentTarget.closest(".textList");
    this.drag = {panel, x: e.clientX, y: e.clientY, h: panel.offsetHeight, height: panel.style.height, t: e.timeStamp, v: 0, active: false};
  }
  onPointerMove(e) {
    const d = this.drag;
    if (!d) { return; }
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.clientX - d.x)) { return; }
      d.active = true;
      d.panel.style.transition = "none";
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const h = Math.max(0, Math.min(window.innerHeight, d.h - dy));
    if (e.timeStamp > d.t) { d.v = (h - d.panel.offsetHeight) / (e.timeStamp - d.t); }
    d.t = e.timeStamp;
    d.panel.style.height = `${h}px`;
  }
  onPointerUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d?.active) { return; }
    this.dragEndedAt = e.timeStamp;
    const h = d.panel.offsetHeight;
    d.panel.style.transition = "";
    if (h + d.v * 150 < 120) {  // a flick carries 150ms further
      d.panel.style.height = "0px";
      setTimeout(this.props.closePanel, 200);
    } else {
      const height = `${100 * h / window.innerHeight}%`;  // a share of the screen, so it survives rotation
      d.panel.style.height = height;
      this.props.setHeight(height);
    }
  }
  onPointerCancel() {
    if (this.drag?.active) {
      this.drag.panel.style.transition = "";
      this.drag.panel.style.height = this.drag.height;
    }
    this.drag = null;
  }
  onClickCapture(e) {
    // A drag that ends over a link must not also follow it.
    if (e.timeStamp - this.dragEndedAt < 400) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  getLanguageSwitcher() {
    if (!Sefaria._siteSettings.TORAH_SPECIFIC) {
      // Language toggling only applies when both languages should be visible.
      return null;
    }
    const excludedModes = ["Resources", "ConnectionsList"];
    if (excludedModes.includes(this.props.connectionsMode) && this.props.interfaceLang !== "english") {
      // if interface is Hebrew and we're not viewing actual source text in the sidebar, language switcher is turned off.
      return null;
    }
    const currentLang = Sefaria.util.getUrlVars()["lang2"];
    const nextLang = currentLang === "en" ? "he" : "en";
    const nextLangUrl = Sefaria.util.replaceUrlParam("lang2", nextLang);
    // Provide the English/Hebrew toggle button.
    return <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} url={nextLangUrl} />;
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
    const backButtonSettings = this.props.backButtonSettings;
    if (backButtonSettings) {
      const onClick = (e) => {
        e.preventDefault();
        backButtonSettings.onClick();
      };        
      title = <a
        href={backButtonSettings.url}
        className="connectionsHeaderTitle sans-serif active"
        onClick={onClick}
        onKeyDown={(e) => Util.handleKeyboardClick(e, onClick)}
      >
      <InterfaceText>
          <EnglishText>
              <i className="fa fa-chevron-left"></i>
              { backButtonSettings.backText }
          </EnglishText>
          <HebrewText>
              <i className="fa fa-chevron-right"></i>
              { backButtonSettings.backText }
          </HebrewText>
      </InterfaceText>
    </a>;
    } else if (this.props.connectionsMode === "Resources") {
      // Top Level Menu (on mobile the drag handle stands in for the title)
      title = !this.props.multiPanel ? null : <div className="connectionsHeaderTitle sans-serif">
                    <InterfaceText text={{en: "Resources" , he:"קישורים וכלים" }} />
                  </div>;

    } else if ((this.props.previousCategory && this.props.connectionsMode === "TextList") || previousMode) {
      // In a text list, back to Previous Category
      const prev = previousMode ? previousMode.splitCamelCase() : this.props.previousCategory;
      const prevHe = Sefaria._(CONNECTION_MODE_STRING_IDS[prev] || prev);
      const url = Sefaria.util.replaceUrlParam("with", prev);
      title = <a
        href={url}
        className="connectionsHeaderTitle sans-serif active"
        onClick={this.onClick}
        onKeyDown={(e) => Util.handleKeyboardClick(e, this.onClick)}
      >
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
      title = <a 
        href={url} 
        className="connectionsHeaderTitle sans-serif active" 
        onClick={onClick}
        onKeyDown={(e) => Util.handleKeyboardClick(e, onClick)}
      >
                    <InterfaceText>
                        <EnglishText>
                            <i className="fa fa-chevron-left"></i>
                            Resources
                        </EnglishText>
                        <HebrewText>
                            <i className="fa fa-chevron-right"></i>
                            קישורים וכלים
                        </HebrewText>
                    </InterfaceText>
                  </a>;
    }
    if (this.props.multiPanel) {
      const closeUrl = Sefaria.util.removeUrlParam("with");
      const toggleButton = this.getLanguageSwitcher();

      return (<div className="connectionsPanelHeader">
                {title}
                <div className="rightButtons">
                  {toggleButton}
                  <CloseButton icon="circledX" onClick={this.props.closePanel} url={closeUrl} />
                </div>
              </div>);
    } else {
      const style = !this.props.multiPanel && this.props.connectionsMode === "TextList" ? {"borderTopColor": Sefaria.palette.categoryColor(this.props.previousCategory)} : {}
      // Modeling the class structure when ConnectionsPanelHeader is created inside ReaderControls in the multiPanel case
      let classes = classNames({readerControls: 1, connectionsHeader: 1, fullPanel: this.props.multiPanel});
      return (<div className={classes} style={style}
                onPointerDown={this.onPointerDown}
                onPointerMove={this.onPointerMove}
                onPointerUp={this.onPointerUp}
                onPointerCancel={this.onPointerCancel}
                onClickCapture={this.onClickCapture}>
                <div className="connectionsDragHandle" aria-hidden="true" />
                <div className="readerControlsInner">
                  <div className="readerTextToc">
                    <div className="connectionsPanelHeader" style={style}>
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
                      <CloseButton icon="circledXSolid" onClick={this.props.closePanel} url={Sefaria.util.removeUrlParam("with")} />
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
    setHeight:              PropTypes.func,
    toggleLanguage:         PropTypes.func,
    interfaceLang:          PropTypes.string.isRequired,
    backButtonSettings:     PropTypes.object,
};


export default ConnectionsPanelHeader;
