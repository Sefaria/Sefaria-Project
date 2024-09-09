import {
  CategoryColorLine,
  MenuButton,
  DisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  SinglePanelNavHeader,
  Note,
} from './Misc';
import React  from 'react';
import PropTypes  from 'prop-types';
import ReactDOM  from 'react-dom';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import TextRange  from './TextRange';
import { AddToSourceSheetWindow } from './AddToSourceSheet';
import Footer  from './Footer';
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
          <SinglePanelNavHeader
            title= {_("note.my_note")}
            navHome={this.props.navHome}
            showDisplaySettings={true}
            openDisplaySettings={this.props.openDisplaySettings}/>
        }
        <div className={contentClasses} onScroll={this.onScroll}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <h1>
                { this.props.multiPanel && Sefaria._siteSettings.TORAH_SPECIFIC ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._("My Notes")}</span>
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
          <Footer />
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
              <div className="addToSheetButton sans-serif he" onClick={this.showSheetModal}>
                <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._("sheet.add_to_sheet")}</span>
              </div>
              <div className="addToSheetButton sans-serif en" onClick={this.showSheetModal}>
                <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._("sheet.add_to_sheet")}</span>
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


export default MyNotesPanel;