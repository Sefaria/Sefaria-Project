const {
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuDisplaySettingsButton,
  CategoryAttribution,
  CategoryColorLine,
  LoadingMessage,
  TwoBox,
  LoginPrompt,
}                = require('./Misc');
const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const sanitizeHtml = require('sanitize-html');
import Component from 'react-class';


class SheetMetadata extends Component {
  // Menu for the Table of Contents for a single text
  constructor(props) {
    super(props);

    this.state = {
      versions: [],
      versionsLoaded: false,
      currentVersion: null,
      showAllVersions: false,
      dlVersionTitle: null,
      dlVersionLanguage: null,
      dlVersionFormat: null,
      dlReady: false
    };
  }
  componentDidUpdate(prevProps, prevState) {
    if ((this.props.settingsLanguage != prevProps.settingsLanguage)) {
      this.forceUpdate();


    }
  }
  handleClick(e) {
    var $a = $(e.target).closest("a");
    if ($a.length && ($a.hasClass("sectionLink") || $a.hasClass("linked"))) {
      var ref = $a.attr("data-ref");
      ref = decodeURIComponent(ref);
      ref = Sefaria.humanRef(ref);
      this.props.close();
      this.props.showBaseText(ref, false, this.props.version, this.props.versionLanguage);
      e.preventDefault();
    }
  }

  toggleLike() {

  }

  copySheet() {
    if (!Sefaria._uid) {
      this.setState({showLogin: true});
    } else {
      var sheet = this.props.sheet;
      sheet.status = "unlisted";
      sheet.title = sheet.title + " (Copy)";

      if (Sefaria._uid != this.props.sheet.owner) {
          sheet.via = this.props.sheet.id;
          sheet.viaOwner = this.props.sheet.owner;
          sheet.owner = Sefaria._uid
      }
      delete sheet.group;
      delete sheet.id;
      delete sheet.ownerName;
      delete sheet.views;
      delete sheet.dateCreated;
      delete sheet.dateModified;
      delete sheet.likes;
      delete sheet.naturalDateCreated;
      delete sheet.promptedToPublish;
      delete sheet._id;

      var postJSON = JSON.stringify(sheet);
      $.post("/api/sheets/", {"json": postJSON}, function(data) {
          if (data.id) {
              console.log('Source Sheet copied: '+data.id)

          } else if ("error" in data) {
              sjs.alert.message(data.error);
          }
      })




    }
  }

  generateSheetMetaDataButtons() {
    if (this.state.showLogin == true) {
      return (<LoginPrompt fullPanel={true} />)
    }
    else {
      return (
         <div>
                <div className="int-en">
                    <a href="#" className="button white" role="button" onClick={this.toggleLike}>Like</a> <a href="#" className="button white" onClick={this.copySheet}>Copy</a>
                </div>
                <div className="int-he">
                    <a href="#" className="button white" onClick={this.toggleLike}>אהבתי</a> <a href="#" className="button white" onClick={this.copySheet}>העתקה</a>
                </div>
         </div>
      )
    }


  }


  render() {
    var title = this.props.sheet.title;
    var authorStatement;

    if (this.props.sheet.attribution) {
      authorStatement = this.props.sheet.attribution;
    }
    else if (this.props.sheet.assignerName) {
      authorStatement = "Assigned by "+ this.props.sheet.assignerName +" Completed by " + this.props.sheet.ownerName;
    }
    else if (this.props.sheet.viaOwner) {
      authorStatement = "by "+ this.props.sheet.assignerName +" based on a sheet by  " + this.props.sheet.ownerName;
    }
    else {
      authorStatement = "by " + this.props.sheet.ownerName;
    }



    // Text Details
    var details = this.props.sheet.summary;

    var closeClick = this.props.close;
    var classes = classNames({readerTextTableOfContents:1, readerNavMenu:1, narrowPanel: this.props.narrowPanel, noLangToggleInHebrew: this.props.interfaceLang == 'hebrew'});

    return (<div className={classes}>
              <CategoryColorLine category="Sheets" />
              <div className="readerControls">
                <div className="readerControlsInner">
                  <div className="leftButtons">
                    <ReaderNavigationMenuCloseButton onClick={closeClick}/>
                  </div>
                  <div className="readerTextToc readerTextTocHeader">
                    <div className="readerTextTocBox">
                      <span className="int-en">Table of Contents</span>
                      <span className="int-he">תוכן העניינים</span>
                    </div>
                  </div>
                  <div className="rightButtons">
                    {this.props.interfaceLang !== "hebrew" ?
                      <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
                      : <ReaderNavigationMenuDisplaySettingsButton placeholder={true} />}
                  </div>
                </div>
              </div>
              <div className="content">
                <div className="contentInner">
                  <div className="tocTop">
                    <a className="tocCategory" href="/sheets">
                      <span className="en">Sheet</span>
                      <span className="he">{Sefaria.hebrewTerm("Sheets")}</span>
                    </a>
                    <div className="tocTitle" role="heading" aria-level="1">
                      <span>{title.stripHtml()}</span>
                    </div>
                    <div className="tocDetail authorStatement" dangerouslySetInnerHTML={ {__html: authorStatement} }></div>
                    <div className="sheetMeta">
                      <div className="int-en">
                          Created {this.props.sheet.naturalDateCreated} · {this.props.sheet.views} Views · {this.props.sheet.likes ? this.props.sheet.likes.length : 0} Likes
                      </div>
                      <div className="int-he">
                          <span>נוצר ב{this.props.sheet.naturalDateCreated} · </span>
                          <span>{this.props.sheet.views} צפיות · </span>
                          <span>קיבלת {this.props.sheet.likes ? this.props.sheet.likes.length : 0} לייקים </span>
                      </div>
                    </div>

                      {this.generateSheetMetaDataButtons()}

                    <div className="tocDetails">
                      {details ? <div className="tocDetail sheetSummary"><em>{details}</em></div> : null}
                    </div>

                    <div className="sheetTags int-en">
                      {this.props.sheet.tags.map(function(tag, i) {
                        return (
                            <a href={"/sheets/tags/" + tag}
                                    target="_blank"
                                    className="sheetTag button"
                                    key={tag}
                                    >{tag}</a>
                        )
                      }.bind(this))}
                    </div>
                    <div className="sheetTags int-he">
                      {this.props.sheet.tags.map(function(tag, i) {
                        return (
                            <a href={"/sheets/tags/" + tag}
                                    target="_blank"
                                    className="int-he sheetTag button"
                                    key={tag}
                                    >{Sefaria.hebrewTerm(tag)}</a>
                        )
                      }.bind(this))}
                    </div>


                  </div>
                </div>
              </div>
            </div>);
  }
}
SheetMetadata.propTypes = {
  mode:             PropTypes.string.isRequired,
  settingsLanguage: PropTypes.string.isRequired,
  versionLanguage:  PropTypes.string,
  version:          PropTypes.string,
  narrowPanel:      PropTypes.bool,
  close:            PropTypes.func.isRequired,
  openNav:          PropTypes.func.isRequired,
  showBaseText:     PropTypes.func.isRequired,
  selectVersion:    PropTypes.func,
  interfaceLang:    PropTypes.string,
};




module.exports = SheetMetadata;
