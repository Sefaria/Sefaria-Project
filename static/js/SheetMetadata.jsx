import {
  InterfaceTextWithFallback,
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuDisplaySettingsButton,
  CategoryAttribution,
  CategoryColorLine,
  IntText,
  LoadingMessage,
  LoginPrompt,
} from './Misc';
import { CollectionsModal } from './CollectionsWidget'
import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import sanitizeHtml  from 'sanitize-html';
import Component from 'react-class';


class SheetMetadata extends Component {
  // Menu for the Table of Contents for a single text
  constructor(props) {
    super(props);
    this.loadSaved();
    this.state = {
      sheetCopyStatus: "Copy",
      copiedSheetId: null,
      sheetSaves: null,
      sheetLikeAdjustment: 0,
      showCollectionsModal: false,
    };
  }
  componentDidMount() {
    this._isMounted = true;
  }
  componentWillUnmount() {
    this._isMounted = false;
  }
  componentDidUpdate(prevProps, prevState) {
    if ((this.props.settingsLanguage != prevProps.settingsLanguage)) {
      this.forceUpdate();
    }
  }
  loadSaved() {
    Sefaria.getRefSavedHistory("Sheet " + this.props.id).then(data => {
      const sheetSaves = [];
      for (let hist of data) {
        sheetSaves.push(hist["uid"]);
      }
      if (this._isMounted) {
        this.setState({ sheetSaves });
      }
    });
  }
  getSheetFromCache() {
    return Sefaria.sheets.loadSheetByID(this.props.id);
  }
  getSheetFromAPI() {
    Sefaria.sheets.loadSheetByID(this.props.id, this.onDataLoad);
  }
  onDataLoad(data) {
    this.forceUpdate();
  }
  copySheet() {
    if (!Sefaria._uid) {
        this.props.toggleSignUpModal();
    } else if (this.state.sheetCopyStatus == "Copy") {
        this.setState({sheetCopyStatus: "Copying..."});
        if (Sefaria.sheets.loadSheetByID(this.props.id)) {
            var data = Sefaria.sheets.loadSheetByID(this.props.id)
            this.filterAndSaveCopiedSheetData(data);
        }
        else {
          Sefaria.sheets.loadSheetByID(this.props.id, (data) => {
              this.filterAndSaveCopiedSheetData(data);
          });
        }
    }
  }
  filterAndSaveCopiedSheetData(data) {
    var newSheet = Sefaria.util.clone(data);
    newSheet.status = "unlisted";
    newSheet.title = newSheet.title + " (Copy)";

    if (Sefaria._uid != newSheet.owner) {
        newSheet.via = this.props.id;
        newSheet.viaOwner = newSheet.owner;
        newSheet.owner = Sefaria._uid
    }
    delete newSheet.id;
    delete newSheet.ownerName;
    delete newSheet.views;
    delete newSheet.dateCreated;
    delete newSheet.dateModified;
    delete newSheet.displayedCollection;
    delete newSheet.collectionName;
    delete newSheet.collectionImage;
    delete newSheet.likes;
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
  toggleCollectionsModal() {
    if (!Sefaria._uid) {
      this.props.toggleSignUpModal();
    } else {
      this.setState({showCollectionsModal: !this.state.showCollectionsModal});      
    }
  }
  generateSheetMetaDataButtons() {
    const sheet = this.getSheetFromCache();
    return (
      <div>
        <div>
          {Sefaria._uid == sheet.owner && !$.cookie("new_editor") ?
          <a href={"/sheets/"+sheet.id+"?editor=1"} className="button white" role="button">
            <IntText>Edit</IntText>
          </a> : null }

          <a href="#" className="button white" onClick={this.copySheet}>
            <IntText>{this.state.sheetCopyStatus}</IntText>
          </a>

          <a href="#" className="button white" onClick={this.toggleCollectionsModal}>
            <IntText>Add to Collection</IntText>
          </a>

          {Sefaria._uid !== sheet.owner && !$.cookie("new_editor") ?
          <a href={"/sheets/"+sheet.id+"?editor=1"} className="button white" role="button">
            <IntText>View in Editor</IntText>
          </a> : null }
        </div>

        {this.state.sheetCopyStatus == "Copied" ? 
        <div><a href={"/sheets/"+this.state.copiedSheetId}>
            <span className="int-en">View Copy &raquo;</span>
            <span className="int-he">צפייה בהעתק &raquo;</span>
        </a></div> : null }

        {$.cookie("new_editor") ? 
        <a className="smallText" href={"/sheets/"+sheet.id+"?editor=1"}>
          <span className="int-en">View in the old sheets experience</span>
          <span className="int-he">תצוגה בפורמט הישן של דפי המקורות</span>
        </a> : null }
      
        {this.state.showCollectionsModal ? 
        <CollectionsModal 
          sheetID={sheet.id}
          close={this.toggleCollectionsModal} /> : null }

      </div>
    );
  }
  render() {
    const sheet = this.getSheetFromCache();
    const timestampCreated = Date.parse(sheet.dateCreated)/1000;
    var title = sheet.title;
    var authorStatement;

    if (sheet.attribution) {
      authorStatement = sheet.attribution;
    }
    else if (sheet.assignerName) {
      authorStatement = "Assigned by <a href='"+sheet.assignerOwnerProfileUrl + "'>" + sheet.assignerName +" Completed by <a href='" + sheet.ownerProfileUrl + "'>" + sheet.ownerName + "</a>";
    }
    else if (sheet.viaOwnerName) {
      authorStatement = "by <a href='" + sheet.ownerProfileUrl + "'>" + sheet.ownerName + "</a> based on a <a href='/sheets/"+sheet.via+"'>sheet</a> by <a href='"+ sheet.viaOwnerProfileUrl + "'>" + sheet.viaOwnerName+"</a>";
    }
    else {
      authorStatement = "by <a href='" + sheet.ownerProfileUrl + "'>" + sheet.ownerName + "</a>";
    }


    // Text Details
    var details = sheet.summary;

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
                      <span>{title.stripHtmlKeepLineBreaks().replace(/&amp;/g, '&').replace(/(<br>|\n)+/g,' ')}</span>
                    </div>

                    <div className="tocDetail authorStatement">
                        <div className="collectionListingImageBox imageBox">
                            <a href={sheet.ownerProfileUrl}>
                                <img className="collectionListingImage img-circle" src={sheet.ownerImageUrl} alt="Author Avatar" />
                            </a>
                        </div>
                        <span dangerouslySetInnerHTML={ {__html: authorStatement} }></span>
                    </div>

                    {sheet.displayedCollection ?
                    <div className="tocDetail authorStatement">
                        <div className="collectionListingImageBox imageBox">
                            <a href={"/collections/" + sheet.displayedCollection}>
                              <img className={classNames({collectionListingImage:1, "img-circle": 1, default: !sheet.collectionImage})} src={sheet.collectionImage || "/static/icons/collection.svg"} alt="Collection Logo"/>
                            </a>
                        </div>
                        <a href={"/collections/" + sheet.displayedCollection}>{sheet.collectionName}</a>
                    </div> : null }
                    <div className="sheetMeta">
                      <div className="int-en">
                          Created {Sefaria.util.naturalTime(timestampCreated, "en")} ago · {sheet.views} Views · { !!this.state.sheetSaves ? this.state.sheetSaves.length + this.state.sheetLikeAdjustment : '--'} Saves
                      </div>
                      <div className="int-he">
                          <span>נוצר לפני  {Sefaria.util.naturalTime(timestampCreated, "he")} · </span>
                          <span>{sheet.views} צפיות · </span>
                          <span> {!!this.state.sheetSaves ? this.state.sheetSaves.length + this.state.sheetLikeAdjustment : '--' } שמירות </span>
                      </div>
                    </div>

                    {this.generateSheetMetaDataButtons()}

                    <div className="tocDetails">
                      {details ? <div className="description" dangerouslySetInnerHTML={ {__html: details} }></div> : null}
                    </div>
                    {sheet.topics && sheet.topics.length > 0 ?
                    <div className="tagsSection">
                        <h2 className="tagsTitle int-en">Tags</h2>
                        <h2 className="tagsTitle int-he">תוית</h2>

                        <div className="sheetTags">
                          {sheet.topics.map((topic, i) => (
                              <a href={"/topics/" + topic.slug}
                                target="_blank"
                                className="sheetTag button"
                                key={i}
                              >
                                <InterfaceTextWithFallback en={topic.en} he={topic.he} />
                              </a>
                            ))
                          }
                        </div>
                    </div> : null }

                  </div>
                </div>
              </div>
            </div>);
  }
}
SheetMetadata.propTypes = {
  id:               PropTypes.number.isRequired,
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




export default SheetMetadata;
