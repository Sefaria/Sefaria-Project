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
import { SheetOptions} from "./SheetOptions";
import { SheetContent } from "./SheetContent";

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
        this.props.onCitationClick(`Sheet ${path.slice(8)}`, `Sheet ${this.props.sheetID}`, true)
      }

      else if (Sefaria.isRef(path.slice(1))) {
        e.preventDefault();
        Sefaria.util.openInNewTab(target.href);
      }
    }
  }

  render() {
    const sheet = this.getSheetFromCache();
    const classes = classNames({sheetsInPanel: 1});
    const editable = Sefaria._uid === sheet?.owner;
    let content;
    if (!sheet) {
      content = (<LoadingMessage />);
    }
    else {
      const sheetOptions = <SheetOptions toggleSignUpModal={this.props.toggleSignUpModal}
                                                 sheetID={sheet.id}
                                                 historyObject={this.props.historyObject}
                                                 editable={editable}/>;
      content = (
            <div className="sidebarLayout">
              <SheetContent
                  sheetOptions = {sheetOptions}
                  sources={sheet.sources}
                  title={sheet.title}
                  handleClick={this.handleClick}
                  sheetSourceClick={this.props.onSegmentClick}
                  highlightedNode={this.props.highlightedNode} // for example, "3" -- the third node in the sheet
                  highlightedRefs={this.props.highlightedRefs} // for example, ["Genesis 1:1"] or ["Sheet 4:3"] -- the actual source
                  highlightedRefsInSheet={this.props.highlightedRefsInSheet}
                  scrollToHighlighted={this.props.scrollToHighlighted}
                  editable={editable}
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
              <SheetContentSidebar
                  authorStatement={sheet.ownerName}
                  authorUrl={sheet.ownerProfileUrl}
                  authorImage={sheet.ownerImageUrl}
                  collections={sheet.collections}
                  toggleSignUpModal={this.props.toggleSignUpModal}
              />
          </div>
      );
    }
    return (
      <div className={classes}>
        { sheet && editable && Sefaria._uses_new_editor ?
        <div className="sheetContent">
          <SefariaEditor
            data={sheet}
            hasSidebar={this.props.hasSidebar}
            handleClick={this.handleClick}
            multiPanel={this.props.multiPanel}
            sheetSourceClick={this.props.onSegmentClick}
            highlightedNode={this.props.highlightedNode}
            highlightedRefsInSheet={this.props.highlightedRefsInSheet}
            setDivineNameReplacement={this.props.setDivineNameReplacement}
            divineNameReplacement={this.props.divineNameReplacement}
          />
        </div>
        :
        content }
      </div>
    );
  }
}

export default Sheet;
