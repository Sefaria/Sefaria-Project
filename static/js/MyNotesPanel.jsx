const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  Note,
}                         = require('./Misc');
const React               = require('react');
const PropTypes           = require('prop-types');
const ReactDOM            = require('react-dom');
const classNames          = require('classnames');
const Sefaria             = require('./sefaria/sefaria');
const $                   = require('./sefaria/sefariaJquery');
const TextRange           = require('./TextRange');
const AddToSourceSheetBox = require('./AddToSourceSheetBox');
const Footer              = require('./Footer');
import Component          from 'react-class';


class MyNotesPanel extends Component {
  constructor(props) {
      super(props);
      this.state = { numberToRender: 2 };
  }
  componentDidMount() {
    this.loadData();
  }
  loadData() {
    var notes = Sefaria.allPrivateNotes();

    if (!notes) {
      Sefaria.allPrivateNotes(this.incrementNumberToRender);
    }
  }
  onScroll() {
    // Poor man's scrollview
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 500;
    var $unloaded = $(".textRange.placeholder").eq(0);
    if (!$unloaded.length) { return; }
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $unloaded.position().top) {
      this.incrementNumberToRender();
    }
  }
  incrementNumberToRender() {
    this.setState({numberToRender: this.state.numberToRender+3});
  }
  render() {
    var notes = Sefaria.allPrivateNotes();
    var classStr = classNames({myNotesPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader });
    var navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    var contentClasses = classNames({content: 1, hasFooter: 1});

    return (
      <div className={classStr}>
        {this.props.hideNavHeader ? null :
          <div className={navTopClasses}>
            <CategoryColorLine category={"Other"} />
            <ReaderNavigationMenuMenuButton onClick={this.props.navHome}/>
            <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
            <h2>
              <span className="int-en">My Notes</span>
              <span className="int-he">הרשומות שלי</span>
            </h2>
        </div>}
        <div className={contentClasses} onScroll={this.onScroll}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <h1>
                { this.props.multiPanel && Sefaria._torah_specific ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                <span className="int-en">My Notes</span>
                <span className="int-he">הרשומות שלי</span>
              </h1>
              : null }
            <div className="noteList">
              { notes ?
                  (notes.length ?
                    notes.map(function(item, i) {
                      // All notes are rendered initially (so ctrl+f works on page) but text is only loaded
                      // from API as notes scroll into view.
                      return <NoteListing data={item} key={i} showText={i <= this.state.numberToRender} />
                    }.bind(this))
                    : <LoadingMessage message="You haven't written any notes yet." heMessage="טרם הוספת רשומות משלך" />)
                  : <LoadingMessage />
              }
            </div>

          </div>
          <footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
            <Footer />
          </footer>
        </div>
      </div>);
  }
}
MyNotesPanel.propTypes = {
  interfaceLang:       PropTypes.string,
  mutliPanel:          PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  navHome:             PropTypes.func,
  toggleLanguage:      PropTypes.func,
  openDisplaySettings: PropTypes.func,
};


class NoteListing extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showSheetModal: false
    };
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevState.showSheetModal && this.state.showSheetModal) {
      this.positionSheetModal();
    }
  }
  showSheetModal() {
    this.setState({showSheetModal: true});
  }
  hideSheetModal() {
    this.setState({showSheetModal: false});
  }
  positionSheetModal() {
    $(".addToSourceSheetModal").position({my: "center center-40", at: "center center", of: window});
  }
  render() {
    var data = this.props.data;
    var url  = "/" + Sefaria.normRef(data.ref) + "?with=Notes";

    return (<div className="noteListing">
              <div className="addToSheetButton sans he" onClick={this.showSheetModal}>
                <span className="int-en">Add to Sheet</span>
                <span className="int-he">הוסף לדף מקורות</span>
              </div>
              <div className="addToSheetButton sans en" onClick={this.showSheetModal}>
                <span className="int-en">Add to Sheet</span>
                <span className="int-he">הוסף לדף מקורות</span>
              </div>
              <a href={url}>
                {this.props.showText ?
                  <TextRange sref={data.ref} /> :
                  <span className="textRange placeholder">
                    <span className="title">
                      {data.ref}
                    </span>
                  </span> }
              </a>
              <Note text={data.text} />
              {this.state.showSheetModal ?
                <div>
                  <AddToSourceSheetWindow
                    srefs={[data.ref]}
                    note={data.text}
                    close={this.hideSheetModal} />
                  <div className="mask" onClick={this.hideSheetModal}></div>
                </div>
                : null }

            </div>);
  }
}
NoteListing.propTypes = {
  data:     PropTypes.object.isRequired,
  showText: PropTypes.bool,
};
NoteListing.defaultProps = {
  showText: true
};


class AddToSourceSheetWindow extends Component {
  close () {
    if (this.props.close) {
      this.props.close();
    }
  }
  render () {
    var nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());

    return (<div className="addToSourceSheetModal">
      <div className="sourceSheetBoxTitle">
        <img src="/static/img/circled-x.svg" className="closeButton" aria-hidden="true" alt="Close" onClick={this.close}/>
        {Sefaria.loggedIn ? null : <span>
            In order to add this source to a sheet, please <a href={"/login" + nextParam}>log in.</a>
        </span>}
        <div className="clearFix"></div>
      </div>
      {Sefaria.loggedIn ?
        <AddToSourceSheetBox
          srefs = {this.props.srefs}
          en = {this.props.en}
          he = {this.props.he}
          note = {this.props.note}
        /> : null }
      </div>);
  }
}
AddToSourceSheetWindow.propTypes = {
  srefs:        PropTypes.array,
  close:        PropTypes.func,
  en:           PropTypes.string,
  he:           PropTypes.string,
  note:         PropTypes.string,
};

module.exports = MyNotesPanel;
