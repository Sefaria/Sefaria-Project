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
      dlReady: false,
      showLogin: false,
      sheetCopyStatus: "Copy",
      copiedSheetId: null,
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

  getSheetFromCache() {
    return Sefaria.sheets.loadSheetByID(this.props.id);
  }

  getSheetFromAPI() {
    Sefaria.sheets.loadSheetByID(this.props.id, this.onDataLoad);
  }

  onDataLoad(data) {

    this.forceUpdate();

    for (var i = 0; i < data.sources.length; i++) {
      if ("ref" in data.sources[i]) {
        Sefaria.ref(data.sources[i].ref, function(ref) {
           {
               Sefaria.links(ref.sectionRef, function(){
                    this.forceUpdate();
               }.bind(this))

               }
        }.bind(this));
      }
    }
  }

  ensureSheetData() {
      if (Sefaria.sheets.loadSheetByID(this.props.sheet.id)) {
          var data = Sefaria.sheets.loadSheetByID(this.props.sheet.id)
          this.filterAndSaveCopiedSheetData(data)
      }
      else {
        Sefaria.sheets.loadSheetByID(this.props.sheet.id, (data) => {
            this.filterAndSaveCopiedSheetData(data)
        });
      }
  }

  filterAndSaveCopiedSheetData(data) {
    var newSheet = data;
    newSheet.status = "unlisted";
    newSheet.title = newSheet.title + " (Copy)";

    if (Sefaria._uid != this.props.sheet.owner) {
        newSheet.via = this.props.sheet.id;
        newSheet.viaOwner = this.props.sheet.owner;
        newSheet.owner = Sefaria._uid
    }
    delete newSheet.group;
    delete newSheet.id;
    delete newSheet.ownerName;
    delete newSheet.views;
    delete newSheet.dateCreated;
    delete newSheet.dateModified;
    delete newSheet.likes;
    delete newSheet.naturalDateCreated;
    delete newSheet.promptedToPublish;
    delete newSheet._id;

    var postJSON = JSON.stringify(newSheet);
    $.post("/api/sheets/", {"json": postJSON}, (data) => {
        if (data.id)  {
          this.setState({
              sheetCopyStatus: "Copied",
              copiedSheetId: data.id
          });

        } else if ("error" in data) {
            console.log(data.error);
        }
    })
  }

  copySheet() {
    if (!Sefaria._uid) {
      this.setState({showLogin: true});
    } else if (this.state.sheetCopyStatus == "Copy") {
        this.setState({sheetCopyStatus: "Copying..."});
        this.ensureSheetData();
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
                {Sefaria._uid == this.props.sheet.owner ?
                    <a href={"/sheets/"+this.props.sheet.id+"?panel=0"} className="button white" role="button">Edit</a> :
                    <a href="#" className="button white" role="button" onClick={this.toggleLike}>Like</a>
                }
                    <a href="#" className="button white" onClick={this.copySheet}>{this.state.sheetCopyStatus}</a>
            </div>
            <div className="int-he">
                {Sefaria._uid == this.props.sheet.owner ?
                    <a href={"/sheets/"+this.props.sheet.id+"?panel=0"} className="button white" role="button">ערוך</a> :
                    <a href="#" className="button white" role="button" onClick={this.toggleLike}>אהבתי</a>
                }
                <a href="#" className="button white" onClick={this.copySheet}>{Sefaria._(this.state.sheetCopyStatus)}</a>
            </div>

            {this.state.sheetCopyStatus == "Copied" ? <a href={"/sheets/"+this.state.copiedSheetId+"?panel=1"}><span className="int-en">View copy &raquo;</span><span className="int-he">צפה בהעתק &raquo;</span> </a> : null}
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
    else if (this.props.sheet.viaOwnerName) {
      authorStatement = "by "+ this.props.sheet.ownerName +" based on a sheet by  " + this.props.sheet.viaOwnerName;
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
