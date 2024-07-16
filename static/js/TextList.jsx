import {
  SheetListing,
  LoadingMessage,
  SimpleLinkedBlock, InterfaceText, EnglishText, HebrewText
} from './Misc';
import {
  RecentFilterSet,
} from './ConnectionFilters';
import React  from 'react';
import ReactDOM  from 'react-dom';
import Sefaria  from './sefaria/sefaria';
import PropTypes  from 'prop-types';
import TextRange  from './TextRange';
import Component      from 'react-class';
import classNames from 'classnames';

class TextList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      linksLoaded: false, // has the list of refs been loaded
      textLoaded:  false, // has the text of those refs been loaded
      waitForText: true,  // should we delay rendering texts until preload is finished
    }
  }
  componentDidMount() {
    this._isMounted = true;
    this.loadConnections();
  }
  componentWillUnmount() {
    this._isMounted = false;
  }
  componentWillReceiveProps(nextProps) {
    if (!Sefaria.util.object_equals(this.props.filter, nextProps.filter)) {
      this.preloadText(nextProps.filter);
    }
  }
  componentWillUpdate(nextProps) {
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadConnections();
    }
    const didRender = prevState.linksLoaded && (!prevState.waitForText || prevState.textLoaded);
    const willRender = this.state.linksLoaded && (!this.state.waitForText || this.state.textLoaded);
    if (!didRender && willRender) {
      // links text just loaded
      this.props.checkVisibleSegments();
    }
  }
  getSectionRef() {
    var ref = this.props.srefs[0]; // TODO account for selections spanning sections
    var sectionRef = Sefaria.sectionRef(ref) || ref;
    return sectionRef;
  }
  loadConnections() {
    // Load connections data from server for this section
    var sectionRef = this.getSectionRef();
    if (!sectionRef) { return; }
    Sefaria.related(sectionRef, function(data) {
      if (this._isMounted) {
        this.preloadText(this.props.filter);
        this.setState({
          linksLoaded: true,
        });
      }
    }.bind(this));
  }
  onDataChange() {
    Sefaria.clearLinks();
    this.setState({linksLoaded: false});
    this.loadConnections();
  }
  preloadText(filter) {
    // Preload text of links if `filter` is a single commentary, or all commentary
    if (filter.length == 1 &&
        Sefaria.index(filter[0]) && // filterSuffix for quoting commmentary prevents this path for QC
        (Sefaria.index(filter[0]).categories[0] == "Commentary"||
         Sefaria.index(filter[0]).primary_category == "Commentary")) {
      // Individual commentator names ("Rashi") are put into Sefaria.index with "Commentary" as first category
      // Intentionally fails when looking up "Rashi on Genesis", which indicates we're looking at a quoting commentary.
      this.preloadSingleCommentaryText(filter);

    } else if (filter.length == 1 && filter[0] == "Commentary") {
      this.preloadAllCommentaryText(filter);

    } else {
      this.setState({waitForText: false, textLoaded: false});
    }
  }
  preloadSingleCommentaryText(filter) {
    //console.log('preloading single commentary')
    // Preload commentary for an entire section of text.
    this.setState({textLoaded: false});
    var commentator       = filter[0];
    var basetext          = this.getSectionRef();
    var commentarySection = Sefaria.commentarySectionRef(commentator, basetext);
    if (!commentarySection) {
      this.setState({waitForText: false});
      return;
    }
    this.setState({waitForText: true});
    Sefaria.text(commentarySection, {}, function() {
      if (this._isMounted) {
        this.setState({textLoaded: true});
      }
    }.bind(this));
  }
  preloadAllCommentaryText() {
    var basetext   = this.getSectionRef();
    var summary    = Sefaria.linkSummary(basetext);
    if (summary.length && summary[0].category == "Commentary") {
      this.setState({textLoaded: false, waitForText: true});
      // Get a list of commentators on this section that we need don't have in the cache
      var commentators = summary[0].books.map(function(item) {
        return item.book;
      });

      if (commentators.length) {
        var commentarySections = commentators.map(function(commentator) {
          return Sefaria.commentarySectionRef(commentator, basetext);
        }).filter(function(commentarySection) {
          return !!commentarySection;
        });
        this.waitingFor = Sefaria.util.clone(commentarySections);
        this.target = 0;
        for (var i = 0; i < commentarySections.length; i++) {
          Sefaria.text(commentarySections[i], {}, function(data) {
            var index = this.waitingFor.indexOf(data.commentator);
            if (index == -1) {
                // console.log("Failed to clear commentator:");
                // console.log(data);
                this.target += 1;
            }
            if (index > -1) {
                this.waitingFor.splice(index, 1);
            }
            if (this.waitingFor.length == this.target) {
              if (this._isMounted) {
                this.setState({textLoaded: true});
              }
            }
          }.bind(this));
        }
      } else {
        // All commentaries have been loaded already
        this.setState({textLoaded: true});
      }
    } else {
      // There were no commentaries to load
      this.setState({textLoaded: true});
    }
  }
  getLinks() {
    var refs               = this.props.srefs;
    var filter             = this.props.filter;
    var excludedSheet      = this.props.nodeRef ? this.props.nodeRef.split(".")[0] : null;
    var sectionRef         = this.getSectionRef();

    var sortConnections = function(a, b) {
      // Sort according this which verse the link connects to
      if (a.anchorVerse !== b.anchorVerse) {
        return a.anchorVerse - b.anchorVerse;
      }
      if (a.index_title == b.index_title) {
        // For Sheet links of the same group sort by title
        if (a.isSheet && b.isSheet) {
          return a.title > b.title ? 1 : -1;
        }
        // For text links of same text/commentary use content order, set by server
        return a.commentaryNum - b.commentaryNum;
      }
      if (this.props.contentLang == "hebrew") {
        return a.sourceHeRef > b.sourceHeRef ? 1 : -1;
      } else {
        return a.sourceRef > b.sourceRef ? 1 : -1;
      }
    }.bind(this);

    let sectionLinks = Sefaria.getLinksFromCache(sectionRef);
    sectionLinks.map(link => {
      if (!("anchorRefExpanded" in link)) { link.anchorRefExpanded = Sefaria.splitRangingRef(link.anchorRef); }
    });
    let overlaps = link => (!(link.anchorRefExpanded.every(aref => Sefaria.util.inArray(aref, refs) === -1)));
    let links = Sefaria._filterLinks(sectionLinks, filter)
      .filter(overlaps)
      .sort(sortConnections);

    if (excludedSheet) {
      links = Sefaria._filterSheetFromLinks(links, excludedSheet);
    }

    return links;
  }
  render() {
    var refs               = this.props.srefs;
    var oref               = Sefaria.ref(refs[0]);
    var filter             = this.props.filter; // Remove filterSuffix for display
    var displayFilter      = filter.map(filter => filter.split("|")[0]);  // Remove filterSuffix for display
    var links              = this.getLinks();

    var en = "No connections known" + (filter.length ? " for " + displayFilter.join(", ") + " here" : "") + ".";
    var he = displayFilter.map(f => Sefaria.hebrewTerm(f)).join(", ") + "ལ་འདིར་འབྲེལ་བ་གང་ཡང་ཤེས་རྟོགས་མེད།";
    var noResultsMessage = <LoadingMessage message={en} heMessage={he} />;
    var message = !this.state.linksLoaded ? (<LoadingMessage />) : (links.length === 0 ? noResultsMessage : null);
    var content = links.length === 0 ? message :
                  this.state.waitForText && !this.state.textLoaded ?
                    (<LoadingMessage />) :
                    links.map(function(link, i) {
                        if (link.isSheet) {
                          var hideAuthor = link.index_title == this.props.filter[0];
                          return (<SheetListing
                                    sheet={link}
                                    handleSheetClick={this.props.handleSheetClick}
                                    connectedRefs={this.props.srefs}
                                    hideAuthor={hideAuthor}
                                    openInNewTab={true}
                                    key={i + link.anchorRef} />);
                        } else {
                          var hideTitle = link.category === "Commentary" && this.props.filter[0] !== "Commentary";
                          const classes = classNames({ textListTextRangeBox: 1,  typeQF: link.type.startsWith('quotation_auto')});
                          return (<div className={classes} key={i + link.sourceRef}>
                                    <TextRange
                                      panelPosition ={this.props.panelPosition}
                                      sref={link.sourceRef}
                                      hideTitle={hideTitle}
                                      numberLabel={link.category === "Commentary" ? link.anchorVerse : 0}
                                      basetext={false}
                                      textHighlights={link.highlightedWords || null}
                                      inlineReference={link.inline_reference || null}
                                      onCitationClick={this.props.onCitationClick}
                                      translationLanguagePreference={this.props.translationLanguagePreference}
                                    />
                                    <ConnectionButtons>
                                      <OpenConnectionTabButton srefs={[link.sourceRef]} openInTabCallback={this.props.onTextClick}/>
                                      <AddConnectionToSheetButton srefs={[link.sourceRef]} addToSheetCallback={this.props.setConnectionsMode}/>
                                      {Sefaria.is_moderator ?
                                      <DeleteConnectionButton delUrl={"/api/links/" + link._id} connectionDeleteCallback={this.onDataChange}/> : null
                                      }
                                    </ConnectionButtons>
                                  </div>);

                        }
                      }, this);
    return (
        <div>
          {this.props.fullPanel ?
          <RecentFilterSet
            srefs={this.props.srefs}
            asHeader={false}
            filter={this.props.filter}
            recentFilters={this.props.recentFilters}
            textCategory={oref ? oref.primary_category : null}
            setFilter={this.props.setFilter}
            showAllFilters={this.showAllFilters} />
            : null }
          { content }
        </div>);
  }
}
TextList.propTypes = {
  srefs:                   PropTypes.array.isRequired,    // an array of ref strings
  filter:                  PropTypes.array.isRequired,
  recentFilters:           PropTypes.array.isRequired,
  fullPanel:               PropTypes.bool,
  multiPanel:              PropTypes.bool,
  contentLang:             PropTypes.string,
  setFilter:               PropTypes.func,
  setConnectionsMode:      PropTypes.func,
  onTextClick:             PropTypes.func,
  onCitationClick:         PropTypes.func,
  onDataChange:            PropTypes.func,
  handleSheetClick:        PropTypes.func,
  openNav:                 PropTypes.func,
  openDisplaySettings:     PropTypes.func,
  closePanel:              PropTypes.func,
  selectedWords:           PropTypes.string,
  checkVisibleSegments:    PropTypes.func.isRequired,
  translationLanguagePreference: PropTypes.string,
};

const DeleteConnectionButton = ({delUrl, connectionDeleteCallback}) =>{
  /*
  ConnectionButton composite element. Goes inside a ConnectionButtons
  Takes a url for a delete api (with the full URI of a specific object) and callback
   */
  const deleteLink = () => {
    if(!Sefaria.is_moderator) return;
    if (confirm("Are you sure you want to delete this connection?")) {
      const url = delUrl;
      $.ajax({
        type: "delete",
        url: url,
        success: function() {
          connectionDeleteCallback();
          alert("Connection deleted.");
        }.bind(this),
        error: function () {
          alert("There was an error deleting this connection. Please reload the page or try again later.");
        }
      });
    }
  }
  return Sefaria.is_moderator ? (
      <SimpleLinkedBlock
        aclasses={"connection-button delete-link"}
        onClick={deleteLink}
        en={"Remove"}
        he={"ཕྱིར་ཕུད།"}
      />
  ) : null;
}


const OpenConnectionTabButton = ({srefs, openInTabCallback, openStrings}) =>{
  /*
  ConnectionButton composite element. Goes inside a ConnectionButtons
  Takes a ref(s) for opening as a link and callback for opening in-app
   */
  const sref = Array.isArray(srefs) ? Sefaria.normRefList(srefs) : srefs;
  const [en, he] = openStrings || ['Open', 'སྒོ་ཕྱེས།'];
  const openLinkInTab = (event) => {
    if (openInTabCallback) {
      event.preventDefault();
      //Click on the body of the TextRange itself from TextList
      openInTabCallback(srefs);
      Sefaria.track.event("Reader", "Click Text from TextList", sref);
    }
  }
  return(
      <SimpleLinkedBlock
        aclasses={"connection-button panel-open-link"}
        onClick={openLinkInTab}
        en={en}
        he={he}
        url={`/${sref}`}
      />
  );
}


const AddConnectionToSheetButton = ({srefs, addToSheetCallback, versions= {"en":null, "he":null} }) =>{
  /*
  ConnectionButton composite element. Goes inside a ConnectionButtons
  Takes a ref(s) for opening an AddToSourceSheet element and callback for passing data to said element - refs and versions object
   */
  const addToSheet = () => {
    addToSheetCallback("Add To Sheet", {"addSource": "connectionsPanel", "connectionRefs" : srefs, "versions": versions});
  }
  return(
    <SimpleLinkedBlock
      aclasses={"connection-button add-to-sheet-link"}
      onClick={addToSheet}
      en={"Add to Sheet"}
      he={"ཤོག་ངོས་ནང་སྣོན།"}
    />
  );
}

const ConnectionButtons = ({children}) =>{
  /* This is basically just a composition container, and allows to apply css rules to a container for connection buttons.
    can also be expanded to use a default set of connection buttons, if not children are present?
   */
  return(
      <div className={`connection-buttons`}>
        {children}
      </div>
  );
}


export {TextList as default, ConnectionButtons, AddConnectionToSheetButton, OpenConnectionTabButton, DeleteConnectionButton};
