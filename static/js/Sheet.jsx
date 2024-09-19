import React  from 'react';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import sanitizeHtml  from 'sanitize-html';
import Component from 'react-class'
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import SefariaEditor from './Editor';
import {
  InterfaceText,
  LoadingMessage,
  ReaderMessage,
  SheetMetaDataBox,
  SheetAuthorStatement,
  SheetTitle,
  CollectionStatement,
  ProfilePic,
} from './Misc';
import SheetContent from "./sheets/SheetContent";
import SheetSidebar from "./SheetSidebar";
import {SheetOptions} from "./sheets/SheetOptions";

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
    this.preloadConnections();
    this.updateDivineNameStateWithSheetValue()
  }
  ensureData() {
    if (!this.getSheetFromCache()) {
      this.getSheetFromAPI();
    } else {
      this.preloadConnections();
      this.updateDivineNameStateWithSheetValue()
    }
  }
  preloadConnections() {
    const data = this.getSheetFromCache();
    if (!data) {return; }
    for (let i = 0; i < data.sources.length; i++) {
      if ("ref" in data.sources[i]) {
        Sefaria.related(data.sources[i].ref, () => this.forceUpdate);
      }
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
        e.preventDefault()
        const currVersions = {en: params.get("ven"), he: params.get("vhe")};
        const options = {showHighlight: path.slice(1).indexOf("-") !== -1};   // showHighlight when ref is ranged
        this.props.onCitationClick(path.slice(1), `Sheet ${this.props.sheetID}`, true, currVersions)
      }

    }
  }


  render() {
    const sheet = this.getSheetFromCache();
    const classes = classNames({sheetsInPanel: 1});
    let content;
    if (!sheet) {
      content = (<LoadingMessage />);
    }
    else {
      const sheetOptions = <SheetOptions toggleSignUpModal={this.props.toggleSignUpModal}
                                                 sheetID={sheet.id}
                                                 historyObject={this.props.historyObject}/>;
      content = (
            <div className="sidebarLayout">
              <SheetContent
                  sheetOptions = {sheetOptions}
                  sheetNotice={sheet.sheetNotice}
                  sources={sheet.sources}
                  title={sheet.title}
                  onRefClick={this.props.onRefClick}
                  handleClick={this.handleClick}
                  sheetSourceClick={this.props.onSegmentClick}
                  highlightedNode={this.props.highlightedNode}
                  highlightedRefsInSheet={this.props.highlightedRefsInSheet}
                  scrollToHighlighted={this.props.scrollToHighlighted}
                  editable={Sefaria._uid === sheet.owner}
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
              <SheetSidebar
                  authorStatement={sheet.ownerName}
                  authorID={sheet.owner}
                  authorUrl={sheet.ownerProfileUrl}
                  authorImage={sheet.ownerImageUrl}
                  collections={sheet.collections}
                  summary={sheet.summary}
              />
          </div>
      );
    }
    return (
      <div className={classes}>
        { sheet && Sefaria._uid === sheet.owner && Sefaria._uses_new_editor ?
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

class SheetNotice extends Component {
  render() {
    return (
        <div className="sheetNotice sans-serif">
          <InterfaceText>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam arcu felis, molestie sed mauris a, hendrerit vestibulum augue.</InterfaceText>
        </div>
    );
  }
}

export default Sheet;
