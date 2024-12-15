import React  from 'react';
import ReactDOM  from 'react-dom';
import classNames  from 'classnames';
import Component from 'react-class'
import $  from '../sefaria/sefariaJquery';
import Sefaria  from '../sefaria/sefaria';
import SefariaEditor from '../Editor';
import SheetContentSidebar from "./SheetContentSidebar";
import {
  LoadingMessage,
} from '../Misc'; 
import {SheetOptions} from "./SheetOptions";
import {SheetContent} from "./SheetContent";

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
    const target = e.target.closest('a')
    if (target) {
      let url;
      try {
        url = new URL(target.href);
      } catch {
        return false;
      }
      const path = url.pathname;
      const params = url.searchParams;

      if (path.match(/^\/sheets\/\d+/)) {
        e.preventDefault()
        console.log();
        this.props.onCitationClick(`Sheet ${path.slice(8)}`, `Sheet ${this.props.id}`, true)
      }

      else if (Sefaria.isRef(path.slice(1))) {
        e.preventDefault();
        Sefaria.util.openInNewTab(target.href);
      }
    }
  }
  handleCollectionsChange() {
    // when editing a sheet and user selects through SheetOptions to change the status of the collections for the sheet,
    // update the user's collections and sheet cache.  need to forceUpdate because sheet is stored not in this component's state
    // but rather in Sefaria module's cache
    Promise.all([
         Sefaria.getUserCollections(Sefaria._uid),
         Sefaria.getUserCollectionsForSheet(this.props.id)
      ])
     .then(() => {
       Sefaria.sheets._loadSheetByID[this.props.id].collections = Sefaria.getUserCollectionsForSheetFromCache(this.props.id);
       this.forceUpdate();
     });
  }

  render() {
    const classes = classNames({sheetsInPanel: 1});
    const sheet = this.getSheetFromCache();
    const editable = Sefaria._uid === sheet?.owner;
    let content, editor;
    if (!sheet) {
      content = (<LoadingMessage />);
      editor = (<LoadingMessage />);
    }
    else {
      const sheetOptions = <SheetOptions toggleSignUpModal={this.props.toggleSignUpModal}
                                                 sheetID={sheet.id}
                                                 historyObject={this.props.historyObject}
                                                 editable={editable}
                                                 authorUrl={sheet.ownerProfileUrl}
                                                 handleCollectionsChange={editable && this.handleCollectionsChange}/>;
      const sidebar = <SheetContentSidebar
                                  authorStatement={sheet.ownerName}
                                  authorUrl={sheet.ownerProfileUrl}
                                  authorImage={sheet.ownerImageUrl}
                                  collections={sheet.collections}
                                  toggleSignUpModal={this.props.toggleSignUpModal}
                              />;
        editor = <div className="sidebarLayout">
                  <div className="sheetContent">
                    <SefariaEditor
                        data={sheet}
                        handleClick={this.handleClick}
                        multiPanel={this.props.multiPanel}
                        sheetSourceClick={this.props.onSegmentClick}
                        highlightedNode={this.props.highlightedNode}
                        highlightedRefsInSheet={this.props.highlightedRefsInSheet}
                        setDivineNameReplacement={this.props.setDivineNameReplacement}
                        divineNameReplacement={this.props.divineNameReplacement}
                        sheetOptions={sheetOptions}
                        authorStatement={sheet.ownerName}
                        authorUrl={sheet.ownerProfileUrl}
                        authorImage={sheet.ownerImageUrl}
                        title={sheet.title || ""}
                        summary={sheet.summary || ""}
                    />
                  </div>
                  {sidebar}
                </div>;
      content = (
          <div className="sidebarLayout">
            <SheetContent
                sheetOptions={sheetOptions}
                sheetNotice={sheet.sheetNotice}
                sources={sheet.sources}
                title={sheet.title}
                onRefClick={this.props.onRefClick}
                handleClick={this.handleClick}
                sheetSourceClick={this.props.onSegmentClick}
                highlightedNode={this.props.highlightedNode} // for example, "3" -- the third node in the sheet
                highlightedRefs={this.props.highlightedRefs} // for example, ["Genesis 1:1"] or ["sheet 4:3"] -- the actual source
                highlightedRefsInSheet={this.props.highlightedRefsInSheet}
                scrollToHighlighted={this.props.scrollToHighlighted}
                editable={editable}
                setSelectedWords={this.props.setSelectedWords}
                sheetNumbered={sheet.options.numbered}
                hideImages={!!sheet.hideImages}
                sheetID={sheet.id}
                authorStatement={sheet.ownerName}
                authorID={sheet.owner}
                authorUrl={sheet.ownerProfileUrl}
                authorImage={sheet.ownerImageUrl}
                summary={sheet.summary}
                toggleSignUpModal={this.props.toggleSignUpModal}
                historyObject={this.props.historyObject}
            />
            {sidebar}
          </div>
      );
    }
    return (
      <div className={classes}>
        { editable && Sefaria._uses_new_editor ?
        editor
        :
        content }
      </div>
    );
  }
}

export default Sheet;
