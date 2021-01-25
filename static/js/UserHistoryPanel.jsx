import {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  SinglePanelNavHeader,
  TextBlockLink,
  LanguageToggleButton,
  LoadingMessage,
  IntText,
} from './Misc';
import React  from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import MobileHeader from './MobileHeader';
import Footer  from './Footer';
import Component from 'react-class';


class UserHistoryPanel extends Component {
  constructor(props) {
    super(props);

    if (props.menuOpen === "saved") {
      this.state = {
        items: Sefaria.saved
      };
    } else if (props.menuOpen === "history") {
      this.state = {
        items: Sefaria._userHistory.history
      }
    }
  }
  componentDidMount() {
    this._isMounted = true;
    this.getItems(this.props);
  }
  componentWillUnmount() {
    this._isMounted = false;
  }
  getItems(props) {
    if (props.menuOpen === "history") {
      Sefaria.userHistoryAPI().then( items => {
        if (this._isMounted) {
          this.setState({ items });
        }
      });
    }
  }
  render() {
    const content = (this.props.menuOpen === 'history' && !Sefaria.is_history_enabled) ? (
        <div id="history-disabled-msg">
          <span className="int-en">Reading history is currently disabled. You can re-enable this feature in your <a href="/settings/account">account settings</a>.</span>
          <span className="int-he">היסטורית קריאה כבויה כרגע. ניתן להפעילה מחדש במסך <a href="/settings/account">ההגדרות</a>.</span>
        </div>
    ) : !!this.state.items ?
      this.state.items.reduce((accum, curr, index) => (  // reduce consecutive history items with the same ref
        (!accum.length || curr.ref !== accum[accum.length-1].ref) ? accum.concat([curr]) : accum
      ), [])
      .map((item, iitem) =>
       (<TextBlockLink
          sref={item.ref}
          heRef={item.he_ref}
          book={item.book}
          currVersions={item.versions}
          sheetOwner={item.sheet_owner}
          sheetTitle={item.sheet_title}
          timeStamp={item.time_stamp}
          showSections={true}
          recentItem={true}
          sideColor={true}
          saved={this.props.menuOpen === 'saved'}
          key={item.ref + "|" + item.time_stamp + "|" + iitem }
      />)
    ) : (<LoadingMessage />);


    const title = this.props.menuOpen === "saved" ? "Saved" : "History";
    const footer = this.props.compare ? null : <Footer />;
    const navMenuClasses = classNames({recentPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader, compare:this.props.compare, noLangToggleInHebrew: 1});
    const navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    const contentClasses = classNames({content: 1, hasFooter: footer != null});
    return (
      <div onClick={this.props.handleClick} className={navMenuClasses}>
        {this.props.hideNavHeader ? null :
        <MobileHeader
          mode={"innerTOC"}
          navHome={this.props.openNav}
          catTitle={title}
          heCatTitle={Sefaria._(title)}
          interfaceLang={Sefaria.interfaceLang}
          openDisplaySettings={this.props.openDisplaySettings}
          showDisplaySettings={this.props.interfaceLang !== "hebrew"}
          compare={this.props.compare}
        />}
        <div className={contentClasses}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <h1>
              {this.props.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
              <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null}
              <IntText>{ title }</IntText>
            </h1>
            : null }
            { content }
          </div>
          {footer}
        </div>
      </div>
      );
  }
}
UserHistoryPanel.propTypes = {
  handleClick:         PropTypes.func.isRequired,
  toggleLanguage:      PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func.isRequired,
  openNav:             PropTypes.func.isRequired,
  compare:             PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  interfaceLang:       PropTypes.string,
  menuOpen:            PropTypes.string.isRequired,
};

export default UserHistoryPanel;
