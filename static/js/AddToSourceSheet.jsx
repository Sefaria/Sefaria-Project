const {
  LoadingMessage,
  LoginPrompt,
}                = require('./Misc');
const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
import Component from 'react-class';


class AddToSourceSheetBox extends Component {
  // In the main app, the function `addToSourceSheet` is executed in the ReaderApp,
  // and collects the needed data from highlights and app state.
  // It is used in external apps, liked gardens.  In those cases, it's wrapped in AddToSourceSheetWindow,
  // refs and text are passed directly, and the add to source sheets API is invoked from within this object.
  constructor(props) {
    super(props);

    this.state = {
      sheetsLoaded: false,
      selectedSheet: null,
      sheetListOpen: false,
      showConfirm: false,
      showLogin: false,
    };
  }
  componentDidMount() {
    this.loadSheets();
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs) || prevProps.nodeRef !=this.props.nodeRef) {
      this.setState({showConfirm: false});
    }
  }
  loadSheets() {
    if (!Sefaria._uid) {
      this.onSheetsLoad();
    } else {
      Sefaria.sheets.userSheets(Sefaria._uid, this.onSheetsLoad);
    }
  }
  onSheetsLoad() {
    this.setDefaultSheet();
    this.setState({sheetsLoaded: true});
  }
  setDefaultSheet() {
    if (this.state.selectedSheet) { return; }
    if (!Sefaria._uid) {
        this.setState({selectedSheet: {title: "Your Sheet"}});
    } else {
      var sheets = Sefaria.sheets.userSheets(Sefaria._uid);
      if (!sheets.length) {
        this.setState({selectedSheet: {title: "Create a New Sheet"}});
      } else {
        this.setState({selectedSheet: sheets[0]});
      }
    }
  }
  toggleSheetList() {
    if (!Sefaria._uid) {
      this.props.toggleSignUpModal()
    } else {
      this.setState({sheetListOpen: !this.state.sheetListOpen});
    }
  }
  selectSheet(sheet) {
    this.setState({selectedSheet: sheet, sheetListOpen: false});
  }
  copyNodeToSourceSheet() {
    if (!Sefaria._uid) { this.props.toggleSignUpModal() }
    if (!this.state.selectedSheet || !this.state.selectedSheet.id) { return; }
    if (!this.props.nodeRef) {
      this.props.addToSourceSheet(this.state.selectedSheet.id, this.confirmAdd);
    } else {
      var url     = "/api/sheets/" + this.state.selectedSheet.id + "/copy_source";
      $.post(url, {
          sheetID: this.props.nodeRef.split(".")[0],
          nodeID:this.props.nodeRef.split(".")[1]
      }, this.confirmAdd);
    }
  }
  addToSourceSheet() {
    if (!Sefaria._uid) { this.props.toggleSignUpModal() }
    if (!this.state.selectedSheet || !this.state.selectedSheet.id) { return; }
    if (this.props.addToSourceSheet) {
      this.props.addToSourceSheet(this.state.selectedSheet.id, this.confirmAdd);
    } else {
      var url     = "/api/sheets/" + this.state.selectedSheet.id + "/add";
      var source = {};
      if (this.props.srefs) {
        source.refs = this.props.srefs;
        if (this.props.en) source.en = this.props.en;
        if (this.props.he) source.he = this.props.he;
      } else {
        if (this.props.en && this.props.he) {
          source.outsideBiText = {he: this.props.he, en: this.props.en};
        } else {
          source.outsideText = this.props.en || this.props.he;
        }
      }
      var postData = {source: JSON.stringify(source)};
      if (this.props.note) {
        postData.note = this.props.note;
      }
      $.post(url, postData, this.confirmAdd);
    }
  }
  createSheet(refs) {
    var title = $(ReactDOM.findDOMNode(this)).find("input").val();
    if (!title) { return; }
    var sheet = {
      title: title,
      options: {numbered: 0},
      sources: []
    };
    var postJSON = JSON.stringify(sheet);
    $.post("/api/sheets/", {"json": postJSON}, function(data) {
      Sefaria.sheets.clearUserSheets(Sefaria._uid);
      this.selectSheet(data);
    }.bind(this));
  }
  confirmAdd() {
    if (this.props.srefs) {
      Sefaria.track.event("Tools", "Add to Source Sheet Save", this.props.srefs.join("/"));
    } else {
      Sefaria.track.event("Tools", "Add to Source Sheet Save", "Outside Source");
    }
    this.setState({showConfirm: true});
  }
  render() {
    if (this.state.showConfirm) {
      return (<ConfirmAddToSheet sheetId={this.state.selectedSheet.id} />);
    } else if (this.state.showLogin) {
      return (<div className="addToSourceSheetBox sans">
                <LoginPrompt />
              </div>);
    }
    var sheets     = Sefaria._uid ? Sefaria.sheets.userSheets(Sefaria._uid) : null;
    var sheetsList = Sefaria._uid && sheets ? sheets.map((sheet) => {
      var classes     = classNames({dropdownOption: 1, noselect: 1, selected: this.state.selectedSheet && this.state.selectedSheet.id == sheet.id});
      var title = sheet.title ? sheet.title.stripHtml() : Sefaria._("Untitled Source Sheet");
      var selectSheet = this.selectSheet.bind(this, sheet);
      return (<div className={classes} onClick={selectSheet} key={sheet.id}>{title}</div>);
    }) : (Sefaria._uid ? <LoadingMessage /> : null);

    // Uses
    return (
      <div className="addToSourceSheetBox noselect sans">
        <div className="dropdown">
          <div className="dropdownMain noselect" onClick={this.toggleSheetList}>
            <i className="dropdownOpenButton noselect fa fa-caret-down"></i>
            {this.state.sheetsLoaded ? (this.state.selectedSheet.title === null ? Sefaria._("Untitled Source Sheet") : this.state.selectedSheet.title.stripHtml()) : <LoadingMessage messsage="Loading your sheets..." heMessage="טוען את דפי המקורות שלך"/>}          </div>
          {this.state.sheetListOpen ?
          <div className="dropdownListBox noselect">
            <div className="dropdownList noselect">
              {sheetsList}
            </div>
            <div className="newSheet noselect">
              <input className="newSheetInput noselect" placeholder={Sefaria._("Name New Sheet")}/>
              <div className="button small noselect" onClick={this.createSheet} >
                <span className="int-en">Create</span>
                <span className="int-he">דף מקורות חדש</span>
              </div>
             </div>
          </div>
          : null}
        </div>
        <div className="button noselect fillWidth" onClick={this.props.nodeRef ? this.copyNodeToSourceSheet : this.addToSourceSheet}>
          <span className="int-en noselect">Add to Sheet</span>
          <span className="int-he noselect">הוסף לדף המקורות</span>
        </div>
      </div>);
  }
}
AddToSourceSheetBox.propTypes = {
  srefs:              PropTypes.array,
  addToSourceSheet:   PropTypes.func,
  fullPanel:          PropTypes.bool,
  en:                 PropTypes.string,
  he:                 PropTypes.string,
  note:               PropTypes.string
};


class ConfirmAddToSheet extends Component {
  render() {
    return (<div className="confirmAddToSheet addToSourceSheetBox">
              <div className="message">
                <span className="int-en">Your source has been added.</span>
                <span className="int-he">הטקסט נוסף בהצלחה לדף המקורות</span>
              </div>
              <a className="button white" href={"/sheets/" + this.props.sheetId} target="_blank">
                <span className="int-en">Go to Source Sheet</span>
                <span className="int-he">עבור לדף המקורות</span>
              </a>
            </div>);
  }
}
ConfirmAddToSheet.propTypes = {
  sheetId: PropTypes.number.isRequired
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


module.exports.AddToSourceSheetBox = AddToSourceSheetBox;
module.exports.AddToSourceSheetWindow = AddToSourceSheetWindow;
