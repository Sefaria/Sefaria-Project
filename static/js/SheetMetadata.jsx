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
      showLogin: false,
      sheetCopyStatus: "Copy",
      copiedSheetId: null,
      viewerLikedSheet: this.props.sheet.likes ? this.props.sheet.likes.indexOf(Sefaria._uid) != -1 ? true : false : false,
      sheetLikeAdjustment: 0,
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
    if (!Sefaria._uid) {
        this.setState({showLogin: true});
    } else if (!this.state.viewerLikedSheet) {
          this.setState({
              viewerLikedSheet: true,
              sheetLikeAdjustment: this.state.sheetLikeAdjustment+1,
          });
          $.post("/api/sheets/" + this.props.sheet.id + "/like");

    } else {
          this.setState({
              viewerLikedSheet: false,
              sheetLikeAdjustment:  this.state.sheetLikeAdjustment-1,
          });
          $.post("/api/sheets/" + this.props.sheet.id + "/unlike");
    }
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
    delete newSheet.groupLogo;
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
                    <a href={"/sheets/"+this.props.sheet.id+"?editor=1"} className="button white" role="button">Edit Sheet</a> :
                    <a href="#" className="button white" role="button" onClick={this.toggleLike}>{this.state.viewerLikedSheet ? "Unlike" : "Like"}</a>
                }
                <a href="#" className="button white" onClick={this.copySheet}>{this.state.sheetCopyStatus}</a>

                {Sefaria._uid != this.props.sheet.owner ?
                    <a href={"/sheets/"+this.props.sheet.id+"?editor=1"} className="button white" role="button">View in Editor</a> : null }
            </div>
            <div className="int-he">
                {Sefaria._uid == this.props.sheet.owner ?
                    <a href={"/sheets/"+this.props.sheet.id+"?editor=1"} className="button white" role="button">ערוך</a> :
                    <a href="#" className="button white" role="button" onClick={this.toggleLike}>{this.state.viewerLikedSheet ? Sefaria._("Unlike") : Sefaria._("Like")}</a>
                }
                <a href="#" className="button white" onClick={this.copySheet}>{Sefaria._(this.state.sheetCopyStatus)}</a>

                {Sefaria._uid != this.props.sheet.owner ?
                    <a href={"/sheets/"+this.props.sheet.id+"?editor=1"} className="button white" role="button">לתצוגת עריכה</a> : null }

            </div>

            {this.state.sheetCopyStatus == "Copied" ? <a href={"/sheets/"+this.state.copiedSheetId}><span className="int-en">View copy &raquo;</span><span className="int-he">צפה בהעתק &raquo;</span> </a> : null}
         </div>
      )
    }


  }


  render() {
      console.log(this.props.sheet)
    var title = this.props.sheet.title;
    var authorStatement;

    if (this.props.sheet.attribution) {
      authorStatement = this.props.sheet.attribution;
    }
    else if (this.props.sheet.assignerName) {
      authorStatement = "Assigned by <a href='"+this.props.sheet.assignerOwnerProfileUrl + "'>" + this.props.sheet.assignerName +" Completed by <a href='" + this.props.sheet.ownerProfileUrl + "'>" + this.props.sheet.ownerName + "</a>";
    }
    else if (this.props.sheet.viaOwnerName) {
      authorStatement = "by <a href='" + this.props.sheet.ownerProfileUrl + "'>" + this.props.sheet.ownerName + "</a> based on a <a href='/sheets/"+this.props.sheet.via+"'>sheet</a> by <a href='"+ this.props.sheet.viaOwnerProfileUrl + "'>" + this.props.sheet.viaOwnerName+"</a>";
    }
    else {
      authorStatement = "by <a href='" + this.props.sheet.ownerProfileUrl + "'>" + this.props.sheet.ownerName + "</a>";
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
                      <div className="groupImageContainer">
                          <img src={this.props.sheet.groupLogo} />
                      </div>
                    <a className="tocCategory" href="/sheets">
                      <span className="en">Sheet</span>
                      <span className="he">{Sefaria.hebrewTerm("Sheets")}</span>
                    </a>
                    <div className="tocTitle" role="heading" aria-level="1">
                      <span>{title.stripHtmlKeepLineBreaks().replace(/&amp;/g, '&').replace(/(<br>|\n)+/g,' ')}</span>
                    </div>
                    <div className="tocDetail authorStatement" dangerouslySetInnerHTML={ {__html: authorStatement} }></div>
                    <div className="tocDetail authorStatement"><a href={"/groups/"+this.props.sheet.group}>{this.props.sheet.group}</a></div>
                    <div className="sheetMeta">
                      <div className="int-en">
                          Created {this.props.sheet.naturalDateCreated} · {this.props.sheet.views} Views · {this.props.sheet.likes ? this.props.sheet.likes.length + this.state.sheetLikeAdjustment : 0 +this.state.sheetLikeAdjustment} Likes
                      </div>
                      <div className="int-he">
                          <span>נוצר {this.props.sheet.naturalDateCreated} · </span>
                          <span>{this.props.sheet.views} צפיות · </span>
                          <span>קיבלת {this.props.sheet.likes ? this.props.sheet.likes.length + this.state.sheetLikeAdjustment : 0 + this.state.sheetLikeAdjustment } לייקים </span>
                      </div>
                    </div>

                      {this.generateSheetMetaDataButtons()}

                    <div className="tocDetails">
                      {details ? <div className="description">{details}</div> : null}
                    </div>
                    {this.props.sheet.tags.length > 0 ?
                    <div className="tagsSection">
                        <h2 className="tagsTitle int-en">Tags</h2>
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
                       <h2 className="tagsTitle int-he">תוית</h2>
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
                    </div> : null }


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
