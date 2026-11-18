import { InterfaceText, EnglishText, HebrewText, LanguageToggleButton, CloseButton } from './Misc';
import { RecentFilterSet } from './ConnectionFilters';
import React from 'react';
import ReactDOM from 'react-dom';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { CONNECTION_MODE_STRING_IDS } from './constants';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import Component from 'react-class';
import Util from './sefaria/util';
import { attachPanelDrag } from './sefaria/panelDrag';

class ConnectionsPanelHeader extends Component {
  constructor(props) {
    super(props);
    this.previousModes = {
      // mapping from modes to previous modes
      'Translation Open': 'Translations',
      'extended notes': 'Translations',
      WebPagesList: 'WebPages',
    };
  }
  componentDidMount() {
    this.setMarginForScrollbar();
    if (!this.props.multiPanel && this.props.closeConnectionsInPanel && this.headerRef) {
      // Mobile web: drag the header down to close the Resources panel
      this.detachDrag = attachPanelDrag(this.headerRef, () => this.headerRef.closest('.textList'), {
        onClose: () => this.props.closeConnectionsInPanel(),
        isExpanded: () => !!this.props.expanded,
        setExpanded: this.props.setExpanded ? (expanded) => this.props.setExpanded(expanded) : null,
      });
    }
  }
  componentWillUnmount() {
    this.detachDrag?.();
  }
  setHeaderRef(el) {
    this.headerRef = el;
  }
  getPreviousMode() {
    return this.props.previousMode ? this.props.previousMode : this.previousModes[this.props.connectionsMode];
  }
  setMarginForScrollbar() {
    // Scrollbars take up spacing, causing the centering of ConnectsionPanel to be slightly off center
    // compared to the header. This functions sets appropriate margin to compensate.
    const width = Sefaria.util.getScrollbarWidth();
    const $container = $(ReactDOM.findDOMNode(this));
    if (this.props.interfaceLang === 'hebrew') {
      $container.css({ marginRight: 0, marginLeft: width });
    } else {
      $container.css({ marginRight: width, marginLeft: 0 });
    }
  }

  getLanguageSwitcher() {
    if (!Sefaria._siteSettings.TORAH_SPECIFIC) {
      // Language toggling only applies when both languages should be visible.
      return null;
    }
    const excludedModes = ['Resources', 'ConnectionsList'];
    if (excludedModes.includes(this.props.connectionsMode) && this.props.interfaceLang !== 'english') {
      // if interface is Hebrew and we're not viewing actual source text in the sidebar, language switcher is turned off.
      return null;
    }
    const currentLang = Sefaria.util.getUrlVars()['lang2'];
    const nextLang = currentLang === 'en' ? 'he' : 'en';
    const nextLangUrl = Sefaria.util.replaceUrlParam('lang2', nextLang);
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
      title = (
        <a
          href={backButtonSettings.url}
          className="connectionsHeaderTitle sans-serif active"
          onClick={onClick}
          onKeyDown={(e) => Util.handleKeyboardClick(e, onClick)}
        >
          <InterfaceText>
            <EnglishText>
              <i className="fa fa-chevron-left"></i>
              {backButtonSettings.backText}
            </EnglishText>
            <HebrewText>
              <i className="fa fa-chevron-right"></i>
              {backButtonSettings.backText}
            </HebrewText>
          </InterfaceText>
        </a>
      );
    } else if (this.props.connectionsMode === 'Resources') {
      // Top Level Menu
      title = (
        <div className="connectionsHeaderTitle sans-serif">
          <InterfaceText text={{ en: 'Resources', he: 'קישורים וכלים' }} />
        </div>
      );
    } else if ((this.props.previousCategory && this.props.connectionsMode === 'TextList') || previousMode) {
      // In a text list, back to Previous Category
      const prev = previousMode ? previousMode.splitCamelCase() : this.props.previousCategory;
      const prevHe = Sefaria._(CONNECTION_MODE_STRING_IDS[prev] || prev);
      const url = Sefaria.util.replaceUrlParam('with', prev);
      title = (
        <a
          href={url}
          className="connectionsHeaderTitle sans-serif active"
          onClick={this.onClick}
          onKeyDown={(e) => Util.handleKeyboardClick(e, this.onClick)}
        >
          <InterfaceText>
            <EnglishText>
              <i className="fa fa-chevron-left"></i>
              {this.props.multiPanel ? prev : null}
            </EnglishText>
            <HebrewText>
              <i className="fa fa-chevron-right"></i>
              {this.props.multiPanel ? prevHe : null}
            </HebrewText>
          </InterfaceText>
        </a>
      );
    } else {
      // Anywhere else, back to Top Level
      const url = Sefaria.util.replaceUrlParam('with', 'all');
      const onClick = function (e) {
        e.preventDefault();
        this.props.setConnectionsMode('Resources');
      }.bind(this);
      title = (
        <a
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
        </a>
      );
    }
    if (this.props.multiPanel) {
      const closeUrl = Sefaria.util.removeUrlParam('with');
      const toggleButton = this.getLanguageSwitcher();

      return (
        <div className="connectionsPanelHeader">
          {title}
          <div className="rightButtons">
            {toggleButton}
            <CloseButton icon="circledX" onClick={this.props.closePanel} url={closeUrl} />
          </div>
        </div>
      );
    } else {
      const style =
        !this.props.multiPanel && this.props.connectionsMode === 'TextList'
          ? { borderTopColor: Sefaria.palette.categoryColor(this.props.previousCategory) }
          : {};
      const cStyle =
        !this.props.multiPanel && this.props.connectionsMode === 'Resources' ? { justifyContent: 'center' } : style;
      // Modeling the class structure when ConnectionsPanelHeader is created inside ReaderControls in the multiPanel case
      let classes = classNames({ readerControls: 1, connectionsHeader: 1, fullPanel: this.props.multiPanel });
      return (
        <div className={classes} style={style} ref={this.setHeaderRef}>
          {/* Drag handle look, as on the Library Assistant's phone sheet; the whole header is the handle.
              Also a button, so filling the page doesn't need a drag (WCAG 2.5.7) */}
          {this.props.closeConnectionsInPanel && this.props.setExpanded ? (
            <button
              type="button"
              className="connectionsPanelGrabber"
              aria-expanded={!!this.props.expanded}
              aria-label={Sefaria._(this.props.expanded ? 'misc.collapse' : 'misc.expand')}
              onClick={() => this.props.setExpanded(!this.props.expanded)}
            >
              <span className="connectionsPanelGrabberBar" aria-hidden="true" />
            </button>
          ) : this.props.closeConnectionsInPanel ? (
            <span className="connectionsPanelGrabber" aria-hidden="true">
              <span className="connectionsPanelGrabberBar" />
            </span>
          ) : null}
          <div className="readerControlsInner">
            <div className="readerTextToc">
              <div className="connectionsPanelHeader" style={cStyle}>
                {title}
                {!this.props.multiPanel && this.props.previousCategory && this.props.connectionsMode === 'TextList' ? (
                  <RecentFilterSet
                    srefs={this.props.baseRefs}
                    asHeader={true}
                    filter={this.props.filter}
                    recentFilters={this.props.recentFilters}
                    textCategory={this.props.previousCategory}
                    setFilter={this.props.setFilter}
                  />
                ) : null}
              </div>
            </div>
          </div>
          {/* Centered on the whole header, so it lines up with the title */}
          {this.props.closeConnectionsInPanel ? (
            <button
              type="button"
              className="connectionsPanelClose"
              aria-label={Sefaria._('common.close')}
              title={Sefaria._('common.close')}
              onClick={() => this.props.closeConnectionsInPanel()}
            >
              {/* Lucide "x" */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      );
    }
  }
}
ConnectionsPanelHeader.propTypes = {
  connectionsMode: PropTypes.string.isRequired, // "Resources", "ConnectionsList", "TextList" etc
  previousCategory: PropTypes.string,
  multiPanel: PropTypes.bool,
  filter: PropTypes.array,
  recentFilters: PropTypes.array,
  baseRefs: PropTypes.array,
  setFilter: PropTypes.func,
  setConnectionsMode: PropTypes.func.isRequired,
  setConnectionsCategory: PropTypes.func.isRequired,
  closePanel: PropTypes.func.isRequired,
  closeConnectionsInPanel: PropTypes.func, // mobile web: closes the Resources panel back to the text
  expanded: PropTypes.bool, // mobile web: the panel fills the page
  setExpanded: PropTypes.func,
  toggleLanguage: PropTypes.func,
  interfaceLang: PropTypes.string.isRequired,
  backButtonSettings: PropTypes.object,
};

export default ConnectionsPanelHeader;
