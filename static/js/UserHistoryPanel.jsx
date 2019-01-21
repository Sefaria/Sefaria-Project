const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  TextBlockLink,
  LanguageToggleButton,
  LoadingMessage,
}               = require('./Misc');
const React      = require('react');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const Sefaria     = require('./sefaria/sefaria');
const Footer     = require('./Footer');
import Component from 'react-class';


class UserHistoryPanel extends Component {
  constructor(props) {
    super(props);

    this.state = {
      items: null,
    };
  }
  componentDidMount() {
    this._isMounted = true;
    this.get_items(this.props);
  }
  componentWillUnmount() {
    this._isMounted = false;
  }
  get_items(props) {
    if (props.menuOpen === "saved") { this.setState({ items: Sefaria.saved })}
    else {
      //history
      Sefaria.userHistoryAPI().then( items => {
        if (this._isMounted) {
          this.setState({ items });
        }
      });
    }
  }
  navHome() {
    this.props.setCategories([]);
    this.props.openNav();
  }
  render() {
    const content = !!this.state.items ?
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
          naturalTime={item.natural_time}
          showSections={true}
          recentItem={true}
          sideColor={true}
          saved={this.props.menuOpen === 'saved'}
          key={item.ref + "|" + item.time_stamp + "|" + iitem }
      />)
    ) : (<LoadingMessage />);


    const footer = this.props.compare ? null :
                    (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                      <Footer />
                    </footer> );

    const title = this.props.menuOpen === "saved" ? Sefaria._("Saved") : Sefaria._("History");
    const navMenuClasses = classNames({recentPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader, compare:this.props.compare, noLangToggleInHebrew: 1});
    const navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    const contentClasses = classNames({content: 1, hasFooter: footer != null});
    return (
      <div onClick={this.props.handleClick} className={navMenuClasses}>
        {this.props.hideNavHeader ? null :
          <div className={navTopClasses}>
            <CategoryColorLine category={"Other"} />
            <ReaderNavigationMenuMenuButton onClick={this.navHome} compare={this.props.compare} interfaceLang={this.props.interfaceLang}/>
            {this.props.interfaceLang !== "hebrew" ? <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} /> : null}
            <h2>
              <span className="int-en">Recent</span>
              <span className="int-he">נצפו לאחרונה</span>
            </h2>
        </div>}
        <div className={contentClasses}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <h1>
              {this.props.interfaceLang !== "hebrew" ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null}
              <span className="int-en">{ title }</span>
              <span className="int-he">{ title }</span>
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

module.exports = UserHistoryPanel;
