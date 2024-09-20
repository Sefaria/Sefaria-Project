import {
  CloseButton,
  DisplaySettingsButton,
  CategoryAttribution,
  CategoryColorLine,
  InterfaceText,
  LoadingMessage,
  LoginPrompt,
  SheetAuthorStatement,
  ProfilePic,

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
import { SignUpModalKind } from './sefaria/signupModalContent';

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
        validationMsg: Sefaria._("topic.add_desription"),
        validationFailed: "both"
      });
      return false
    }
    else if (!this.state.summary || this.state.summary.trim() == '') {
      this.setState({
        validationMsg: Sefaria._("sheet.add_description"),
        validationFailed: "summary"
      });
      return false
    }

    else if (this.state.tags.length == 0) {
      this.setState({
        validationMsg: Sefaria._("topic.add_topic_to_sheet"),
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
        this.props.toggleSignUpModal(SignUpModalKind.AddToSheet);
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
        } else {
            console.log(data);
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
      this.props.toggleSignUpModal(SignUpModalKind.AddToSheet);
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
    delete updatedSheet.error;
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
        validationMsg: Sefaria._("sheet.message.summary_limit"),
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

  render() {
    const sheet = this.getSheetFromCache();

    if (!sheet) {return (<LoadingMessage/>)}

    const timestampCreated = Date.parse(sheet.dateCreated)/1000;
    const canEdit = Sefaria._uid == sheet.owner;
    const title = sheet.title;

    // Text Details
    const details = sheet.summary;

    var closeClick = this.props.close;
    var classes = classNames({
      bookPage:1,
      sheetPage: 1,
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
                    <CloseButton onClick={closeClick}/>
                  </div>
                  <div className="readerTextToc readerTextTocHeader">
                    <div className="readerTextTocBox">
                      <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._("text.table_of_contents")} </span>
                    </div>
                  </div>
                  <div className="rightButtons">
                    {this.props.interfaceLang !== "hebrew" ?
                      <DisplaySettingsButton onClick={this.props.openDisplaySettings} />
                      : <DisplaySettingsButton placeholder={true} />}
                  </div>
                </div>
              </div>
              <div className="content">
                <div className="contentInner">
                  <div className="tocTop">
                    <div className="tocTitle serif" role="heading" aria-level="1">
                      <span>{title.stripHtmlConvertLineBreaks()}</span>
                    </div>

                    <a className="tocCategory serif" href="/sheets">
                      <span className="en">{Sefaria._("Sheet")}</span>
                      <span className="he">{Sefaria.hebrewTerm("Sheets")}</span>
                    </a>

                    <div className="tocDetail authorStatement">
                      <SheetAuthorStatement
                          authorUrl={sheet.ownerProfileUrl}
                          authorStatement={sheet.ownerName}
                      >
                        <ProfilePic
                          url={sheet.ownerImageUrl}
                          len={30}
                          name={sheet.ownerName}
                          outerStyle={{width: "30px", height: "30px", display: "inline-block", verticalAlign: "middle", marginRight: "10px"}}
                        />
                        <a href={sheet.ownerProfileUrl}>
                          <InterfaceText>{sheet.ownerName}</InterfaceText>
                        </a>
                      </SheetAuthorStatement>
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
                        {Sefaria._("common.created")}  {Sefaria.util.naturalTime(timestampCreated, "en")} {Sefaria._("sheet.created_time.ago")} · {sheet.views} {Sefaria._("profile.tab.sheet.tag.views")} · { !!this.state.sheetSaves ? this.state.sheetSaves.length + this.state.sheetLikeAdjustment : '--'} {Sefaria._("common.saves")} {this.state.published ? null : (<span className="unlisted">· <img src="/static/img/eye-slash.svg"/><span>{Sefaria._("profile.tab.sheet.tag.not_published")}</span></span>)}

                      </div>
                      <div className="int-he">
                          <span> {Sefaria._("common.created")} {Sefaria.util.naturalTime(timestampCreated, "he")} {Sefaria._("sheet.created_time.ago")}  · </span>
                          <span>{sheet.views} · {Sefaria._("profile.tab.sheet.tag.views")}</span>
                          <span> {!!this.state.sheetSaves ? this.state.sheetSaves.length + this.state.sheetLikeAdjustment : '--' } {Sefaria._("common.saves")} </span> {this.state.published ? null : (<span className="unlisted">· <img src="/static/img/eye-slash.svg"/><span>{Sefaria._("profile.tab.sheet.tag.not_published")}</span></span>)}                      </div>
                    </div>

                    <div>
                      <div className="sheetMetaButtons">
                        {Sefaria._uid === sheet.owner && !Sefaria._uses_new_editor ?
                        <a href={"/sheets/"+sheet.id+"?editor=1"} className="button white" role="button">
                          <img src="/static/icons/tools-write-note.svg" alt="edit sheet" />
                          <InterfaceText>{Sefaria._("collection.edit")}</InterfaceText>
                        </a> : null }

                        <a href="#" className="button white" onClick={this.copySheet}>
                          <img src="/static/icons/copy.svg" alt="copy sheet" />
                          <InterfaceText>{this.state.sheetCopyStatus}</InterfaceText>
                        </a>

                        <a href="#" className="button white" onClick={this.toggleCollectionsModal}>
                          <img src="/static/icons/plus.svg" alt="copy sheet" />
                          <InterfaceText>{Sefaria._("collection.add_to_collection")}</InterfaceText>
                        </a>

                        {Sefaria._uid !== sheet.owner && !Sefaria._uses_new_editor ?
                        <a href={"/sheets/"+sheet.id+"?editor=1"} className="button white" role="button">
                          <InterfaceText>{ Sefaria._("sheet.editor.view_in_editor")}</InterfaceText>
                        </a> : null }
                      </div>

                      {this.state.sheetCopyStatus === "Copied" ?
                      <div><a href={"/sheets/"+this.state.copiedSheetId}>
                          <span className={`${Sefaria.languageClassFont()}`}>{ Sefaria._("sheet.view_copy")} &raquo;</span>
                      </a></div> : null }

                      {Sefaria._uses_new_editor ?
                      <a className="smallText" href={"/sheets/"+sheet.id+"?editor=1"}>
                        <span className={`${Sefaria.languageClassFont()}`}>{ Sefaria._("sheet.view_old_sheet_experience")}</span>
                      </a> : null }

                      {this.state.showCollectionsModal ?
                      <CollectionsModal
                        sheetID={sheet.id}
                        close={this.toggleCollectionsModal} /> : null }
                    </div>

                    <div className="tocDetails sheetSummary">
                      <h3><InterfaceText>{ Sefaria._("sheet.about_this_sheet")}</InterfaceText></h3>
                      {details && !canEdit ? <div className="description" dangerouslySetInnerHTML={ {__html: details} }></div> : null}
                    </div>

                    {sheet.topics && sheet.topics.length > 0 && !canEdit ?
                    <div className="tocDetails tagsSection">
                      <h3><InterfaceText>{ Sefaria._("sheet.tags")}</InterfaceText></h3>
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
                        <InterfaceText>{this.state.published ? Sefaria._("sheet.publish_setting"): Sefaria._("Publish Sheet")}</InterfaceText>
                      </h3>



                      {this.state.published ?
                        <p><InterfaceText>{ Sefaria._("sheet.your_sheet_is")} </InterfaceText> <strong><InterfaceText>{ Sefaria._("sheet.published")}</InterfaceText></strong> <InterfaceText>{ Sefaria._("topic.visible_to_other")}</InterfaceText></p> :
                        <p><InterfaceText>{ Sefaria._("List your sheet on Sefaria for others to discover.")}</InterfaceText></p>
                      }


                      <hr/>
                      {this.state.validationFailed === "none" ? null :  <p className="error"><InterfaceText>{this.state.validationMsg}</InterfaceText></p> }
                      <p className={"smallText"}><InterfaceText>{ Sefaria._("Summary")}</InterfaceText></p>
                      <textarea
                        className={this.state.validationFailed === "both" || this.state.validationFailed === "summary" ? "error" : ""}
                        rows="3"
                        maxLength="281"
                        placeholder={Sefaria._("write_short_description")}
                        value={this.state.summary} onChange={this.handleSummaryChange}></textarea>
                      <p className={"smallText"}><InterfaceText> {Sefaria._("header.topic")}</InterfaceText></p>
                      <div className={this.state.validationFailed == "both" || this.state.validationFailed == "topics" ? "error" : ""}>
                      <ReactTags
                        ref={this.reactTags}
                        allowNew={true}
                        tags={this.state.tags}
                        suggestions={this.state.suggestions}
                        onDelete={this.onTagDelete.bind(this)}
                        placeholderText={Sefaria._("sheet.placeholder.add_topic")}
                        delimiters={["Enter", "Tab", ","]}
                        onAddition={this.onTagAddition.bind(this)}
                        onValidate={this.onTagValidate.bind(this)}
                        onInput={this.updateSuggestedTags.bind(this)}
                      />
                      </div>

                        <div className={"publishButton"}>
                        <a href="#" className={this.state.published ? "button published" : "button"} onClick={this.togglePublish}>
                          <InterfaceText>{this.state.published ? Sefaria._("unpublish") : Sefaria._("publish")}</InterfaceText>
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
