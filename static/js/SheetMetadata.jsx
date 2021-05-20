import {
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuDisplaySettingsButton,
  CategoryAttribution,
  CategoryColorLine,
  InterfaceText,
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
import ReactTags from 'react-tag-autocomplete'

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
      tags: [],
      suggestions: [],
      summary: '',
      validationFailed: 'none',
      validationMsg: '',
      published: null,
      lastModified: null,
    };
    this.reactTags = React.createRef()
    this.debouncedSaveSummary = Sefaria.util.debounce(this.saveSummary, 250);
  }
  componentDidMount() {
    this._isMounted = true;
    const sheet = (this.getSheetFromCache())

    const tags = sheet.topics.map((topic, i) => ({
          id: i,
          name: topic["asTyped"],
          slug: topic["slug"],
        })
      )


    this.setState({
      tags: tags,
      summary: sheet.summary,
      published: sheet.status == "public",
      lastModified: sheet.dateModified,

    })

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
  updateSheetTags() {

  }
  isFormValidated() {
    if ((!this.state.summary || this.state.summary.trim() == '') && this.state.tags.length == 0) {
      this.setState({
        validationMsg: Sefaria._("Please add a description and topics to publish your sheet."),
        validationFailed: "both"
      });
      return false
    }
    else if (!this.state.summary || this.state.summary.trim() == '') {
      this.setState({
        validationMsg: Sefaria._("Please add a description to publish your sheet."),
        validationFailed: "summary"
      });
      return false
    }

    else if (this.state.tags.length == 0) {
      this.setState({
        validationMsg: Sefaria._("Please add topics to publish your sheet."),
        validationFailed: "topics"
      });
      return false
    }

    else {
      this.setState({
        validationMsg: "",
        validationFailed: "none"
      });
      return true
    }
  }

  async togglePublish() {
    if (!this.state.published) {
      if (!(this.isFormValidated())) {return}
    }

    const newPublishState = this.state.published ? "unlisted" : "public";
    let updatedSheet = await (new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(this.props.id, sheet => resolve(sheet))));
    updatedSheet.status = newPublishState;
    updatedSheet.lastModified = this.state.lastModified;
    delete updatedSheet._id;
    this.setState({published: !this.state.published})
    const postJSON = JSON.stringify(updatedSheet);
    this.postSheet(postJSON);

  }


  loadSheetData(sheetID) {
    if (Sefaria.sheets.loadSheetByID(sheetID)) {
        return(Sefaria.sheets.loadSheetByID(sheetID));
    }
    else {
      Sefaria.sheets.loadSheetByID(sheetID, (data) => {
          return(data);
      });
    }
  }

  copySheet() {
    if (!Sefaria._uid) {
        this.props.toggleSignUpModal();
    } else if (this.state.sheetCopyStatus == "Copy") {
        this.setState({sheetCopyStatus: "Copying..."});
        this.filterAndSaveCopiedSheetData(this.loadSheetData(this.props.id))
    }
  }

  postSheet(postJSON) {
    $.post("/api/sheets/", {"json": postJSON}, (data) => {
        if (data.id)  {
          console.log('saved...')
          this.setState({lastModified: data.dateModified})
          Sefaria.sheets._loadSheetByID[data.id] = data;
        } else if ("error" in data) {
            console.log(data.error);
        }
    })
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

  async updateTopics(tags) {
    let updatedSheet = await (new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(this.props.id, sheet => resolve(sheet))));

    const topics = tags.map(tag => ({
          asTyped: tag.name,
          slug: tag.slug,
        })
    )
    updatedSheet.topics = topics;
    updatedSheet.lastModified = this.state.lastModified;
    delete updatedSheet._id;
    const postJSON = JSON.stringify(updatedSheet);
    this.postSheet(postJSON)
  }

  onTagDelete(i) {
    const tags = this.state.tags.slice(0);
    tags.splice(i, 1);
    this.setState({ tags });
    this.updateTopics(tags);
  }

  onTagAddition(tag) {
    const tags = [].concat(this.state.tags, tag);
    this.setState({ tags });
    this.updateTopics(tags);
  }

  onTagValidate(tag) {
    return this.state.tags.every((item) => item.name !== tag.name)
  }

  updateSuggestedTags(input) {
    if (input == "") return
    Sefaria.getName(input, false, 0).then(d => {
      const topics = d.completion_objects
          .filter(obj => obj.type === "Topic")
          .map((filteredObj, index) => ({
            id: index,
            name: filteredObj.title,
            slug: filteredObj.key
          })
      )
      return topics
    }).then(topics => this.setState({suggestions: topics}))
  }

  async saveSummary() {
    let updatedSheet = await (new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(this.props.id, sheet => resolve(sheet))));
    updatedSheet.summary = this.state.summary;
    updatedSheet.lastModified = this.state.lastModified;
    delete updatedSheet._id;
    const postJSON = JSON.stringify(updatedSheet);
    this.postSheet(postJSON)
  }

  handleSummaryChange(event) {
    const newSummary = event.target.value
    if (event.target.value.length > 280) {
      this.setState({
        validationMsg: Sefaria._("The summary description is limited to 280 characters."),
        validationFailed: "summary"
      });
    }
    else {
      this.setState({
        validationMsg: "",
        validationFailed: "none"
      });
    }
    this.setState({summary: newSummary})
    this.debouncedSaveSummary()
  }

  generateSheetMetaDataButtons() {
    const sheet = this.getSheetFromCache();
    return (
      <div>
        <div>
          {Sefaria._uid == sheet.owner && !Sefaria._uses_new_editor ?
          <a href={"/sheets/"+sheet.id+"?editor=1"} className="button white" role="button">
            <InterfaceText>Edit</InterfaceText>
          </a> : null }

          <a href="#" className="button white" onClick={this.copySheet}>
            <InterfaceText>{this.state.sheetCopyStatus}</InterfaceText>
          </a>

          <a href="#" className="button white" onClick={this.toggleCollectionsModal}>
            <InterfaceText>Add to Collection</InterfaceText>
          </a>

          {Sefaria._uid !== sheet.owner && !Sefaria._uses_new_editor ?
          <a href={"/sheets/"+sheet.id+"?editor=1"} className="button white" role="button">
            <InterfaceText>View in Editor</InterfaceText>
          </a> : null }
        </div>

        {this.state.sheetCopyStatus == "Copied" ?
        <div><a href={"/sheets/"+this.state.copiedSheetId}>
            <span className="int-en">View Copy &raquo;</span>
            <span className="int-he">צפייה בהעתק &raquo;</span>
        </a></div> : null }

        {Sefaria._uses_new_editor ?
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

    if (!sheet) {return (<LoadingMessage/>)}

    const timestampCreated = Date.parse(sheet.dateCreated)/1000;
    const canEdit = Sefaria._uid == sheet.owner;
    const title = sheet.title;
    let authorStatement;

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
    const details = sheet.summary;

    var closeClick = this.props.close;
    var classes = classNames({
      readerTextTableOfContents:1,
      readerNavMenu:1,
      narrowPanel: this.props.narrowPanel,
      noLangToggleInHebrew: this.props.interfaceLang == 'hebrew',
      "sans-serif": 1,
    });

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
                    <a className="tocCategory serif" href="/sheets">
                      <span className="en">Sheet</span>
                      <span className="he">{Sefaria.hebrewTerm("Sheets")}</span>
                    </a>
                    <div className="tocTitle serif" role="heading" aria-level="1">
                      <span>{title.stripHtmlConvertLineBreaks()}</span>
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
                          Created {Sefaria.util.naturalTime(timestampCreated, "en")} ago · {sheet.views} Views · { !!this.state.sheetSaves ? this.state.sheetSaves.length + this.state.sheetLikeAdjustment : '--'} Saves {this.state.published ? null : (<span className="unlisted">· <img src="/static/img/eye-slash.svg"/><span>{Sefaria._("Not Published")}</span></span>)}

                      </div>
                      <div className="int-he">
                          <span>נוצר לפני  {Sefaria.util.naturalTime(timestampCreated, "he")} · </span>
                          <span>{sheet.views} צפיות · </span>
                          <span> {!!this.state.sheetSaves ? this.state.sheetSaves.length + this.state.sheetLikeAdjustment : '--' } שמירות </span> {this.state.published ? null : (<span className="unlisted">· <img src="/static/img/eye-slash.svg"/><span>{Sefaria._("Not Published")}</span></span>)}                      </div>
                    </div>

                    {this.generateSheetMetaDataButtons()}

                    <div className="tocDetails">
                      {details && !canEdit ? <div className="description" dangerouslySetInnerHTML={ {__html: details} }></div> : null}
                    </div>
                    {sheet.topics && sheet.topics.length > 0 && !canEdit ?
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
                                <InterfaceText text={{en:topic.en, he:topic.he}} />
                              </a>
                            ))
                          }
                        </div>
                    </div> : null }

                    {canEdit ? <div className={"publishBox sans-serif"}>
                      <h3 className={"header"}>
                        <InterfaceText>{this.state.published ? "Publish Settings" : "Publish Sheet"}</InterfaceText>
                      </h3>



                      {this.state.published ?
                        <p><InterfaceText>Your sheet is</InterfaceText> <strong><InterfaceText>published</InterfaceText></strong> <InterfaceText>on Sefaria and visible to others through search and topics.</InterfaceText></p> :
                        <p><InterfaceText>List your sheet on Sefaria for others to discover.</InterfaceText></p>
                      }


                      <hr/>
                      {this.state.validationFailed == "none" ? null :  <p className="error"><InterfaceText>{this.state.validationMsg}</InterfaceText></p> }
                      <p className={"smallText"}><InterfaceText>Summary</InterfaceText></p>
                      <textarea
                        className={this.state.validationFailed == "both" || this.state.validationFailed == "summary" ? "error" : ""}
                        rows="3"
                        maxLength="281"
                        placeholder={Sefaria._("Write a short description of your sheet...")}
                        value={this.state.summary} onChange={this.handleSummaryChange}></textarea>
                      <p className={"smallText"}><InterfaceText>Topics</InterfaceText></p>
                      <div className={this.state.validationFailed == "both" || this.state.validationFailed == "topics" ? "error" : ""}>
                      <ReactTags
                        ref={this.reactTags}
                        allowNew={true}
                        tags={this.state.tags}
                        suggestions={this.state.suggestions}
                        onDelete={this.onTagDelete.bind(this)}
                        placeholderText={Sefaria._("Add a topic...")}
                        delimiters={["Enter", "Tab", ","]}
                        onAddition={this.onTagAddition.bind(this)}
                        onValidate={this.onTagValidate.bind(this)}
                        onInput={this.updateSuggestedTags.bind(this)}
                      />
                      </div>

                        <div className={"publishButton"}>
                        <a href="#" className={this.state.published ? "button published" : "button"} onClick={this.togglePublish}>
                          <InterfaceText>{this.state.published ? "Unpublish" : "Publish"}</InterfaceText>
                        </a>
                        </div>

                    </div> : null}

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
