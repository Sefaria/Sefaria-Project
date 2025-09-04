import React  from 'react';
import ReactDOM  from 'react-dom';
import classNames  from 'classnames';
import Component from 'react-class'
import $  from '../sefaria/sefariaJquery';
import Sefaria  from '../sefaria/sefaria';
import { SefariaEditor } from '../Editor';
import SheetSidebar from "./SheetSidebar";
import {
  LoadingMessage,
} from '../Misc'; 
import { SheetContent } from "./SheetContent";
import {shouldUseEditor} from '../sefaria/sheetsUtils';


class Sheet extends Component {
  constructor(props) {
    super(props);
  }
  componentDidMount() {
    this.$container = $(ReactDOM.findDOMNode(this));
    this.ensureData();
    const params = {
       content_type: "Sheet",
       item_id: this.props.id
     }
    gtag("event", "select_content", params)

  }
  getSheetFromCache() {
    return Sefaria.sheets.loadSheetByID(this.props.id);
  }
  getSheetFromAPI() {
    Sefaria.sheets.loadSheetByID(this.props.id, this.onDataLoad);
  }
  onDataLoad(data) {
    const sheetRef = "Sheet " + data.id + (this.props.highlightedNode ? "." + this.props.highlightedNode : "");
    this.props.openSheet(sheetRef, true); // Replace state now that data is loaded so History can include sheet title
    this.forceUpdate();
    this.updateDivineNameStateWithSheetValue()
  }
  ensureData() {
    if (!this.getSheetFromCache()) {
      this.getSheetFromAPI();
    } else {
      this.updateDivineNameStateWithSheetValue()
    }
  }
  updateDivineNameStateWithSheetValue() {
    const sheet = this.getSheetFromCache();
    this.props.setDivineNameReplacement(sheet.options.divineNames)
  }
  handleClick(e) {
    const target = e.target.closest('a');
    if (target) {
      e.preventDefault();
      Sefaria.util.openInNewTab(target.href);
    }
  }
  handleCollectionsChange() {
    // when editing a sheet and user makes (through SheetOptions) a change in sheet's collections data we need to forceUpdate because
    // sheet is stored not in this component's state but rather in Sefaria module's cache
     Sefaria.sheets._loadSheetByID[this.props.id].collections = Sefaria.getUserCollectionsForSheetFromCache(this.props.id);
     this.forceUpdate();
  }
  getEditor = (sheet) => (
              <div className="sidebarLayout">
                  <div className="sheetContent">
                    <SefariaEditor
                        data={sheet}
                        style={this.props.style}
                        handleClick={this.handleClick}
                        multiPanel={this.props.multiPanel}
                        sheetSourceClick={this.props.onSegmentClick}
                        highlightedNode={this.props.highlightedNode}
                        highlightedRefsInSheet={this.props.highlightedRefsInSheet}
                        setDivineNameReplacement={this.props.setDivineNameReplacement}
                        divineNameReplacement={this.props.divineNameReplacement}
                        toggleSignUpModal={this.props.toggleSignUpModal}
                        historyObject={this.props.historyObject}
                        editable={true}
                        handleCollectionsChange={this.handleCollectionsChange}
                        editorSaveState={this.props.editorSaveState}
                        setEditorSaveState={this.props.setEditorSaveState}
                    />
                  </div>
                  {this.getSidebar(sheet, true)}
            </div>);
  getReader = (sheet) => (
    <div className="sidebarLayout">
      <SheetContent
          style={this.props.style}
          sources={sheet.sources}
          title={sheet.title}
          handleClick={this.handleClick}
          sheetSourceClick={this.props.onSegmentClick}
          highlightedNode={this.props.highlightedNode} // for example, "3" -- the third node in the sheet
          highlightedRefs={this.props.highlightedRefs} // for example, ["Genesis 1:1"] or ["Sheet 4:3"] -- the actual source
          highlightedRefsInSheet={this.props.highlightedRefsInSheet}
          scrollToHighlighted={this.props.scrollToHighlighted}
          setSelectedWords={this.props.setSelectedWords}
          sheetID={sheet.id}
          authorStatement={sheet.ownerName}
          authorID={sheet.owner}
          authorUrl={sheet.ownerProfileUrl}
          authorImage={sheet.ownerImageUrl}
          summary={sheet.summary}
          toggleSignUpModal={this.props.toggleSignUpModal}
          historyObject={this.props.historyObject}
      />
      {this.getSidebar(sheet, false)}
    </div>
  );
  getSidebar = (sheet, editor) => (
    <SheetSidebar
          authorStatement={sheet.ownerName}
          authorUrl={sheet.ownerProfileUrl}
          authorImage={sheet.ownerImageUrl}
          collections={sheet.collections}
          toggleSignUpModal={this.props.toggleSignUpModal}
          topics={sheet.topics}
          editorSaveState={editor &&this.props.editorSaveState}
    />
  );
  render() {
    const classes = classNames({sheetsInPanel: 1});
    const sheet = this.getSheetFromCache();
    let content;
    if (!sheet) {
      content = <LoadingMessage />;
    }
    else {
      const usingEditor = shouldUseEditor(sheet?.id);
      content = usingEditor ? this.getEditor(sheet) : this.getReader(sheet);
    }
    return <div className={classes}>{content}</div>

  }
}

export default Sheet;
