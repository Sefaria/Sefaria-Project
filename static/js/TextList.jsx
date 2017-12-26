const {
  LoadingMessage,
}                = require('./Misc');
const {
  RecentFilterSet,
}                = require('./ConnectionFilters');
const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
const TextRange  = require('./TextRange');
import Component      from 'react-class';


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
    this.preloadText(nextProps.filter);
  }
  componentWillUpdate(nextProps) {
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadConnections();
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
    // Preload commentary for an entire section of text.
    this.setState({textLoaded: false});
    var commentator       = filter[0];
    var basetext          = this.getSectionRef();
    var commentarySection = Sefaria.commentarySectionRef(commentator, basetext);
    if (!commentarySection) { return; }

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
      var links = Sefaria.links(basetext);
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
    var sectionRef         = this.getSectionRef();

    var sortConnections = function(a, b) {
      if (a.anchorVerse !== b.anchorVerse) {
        return a.anchorVerse - b.anchorVerse;
      }
      if (a.index_title == b.index_title) {
        return a.commentaryNum - b.commentaryNum;
      }
      if (this.props.contentLang == "hebrew") {
        var indexA = Sefaria.index(a.index_title);
        var indexB = Sefaria.index(b.index_title);
        return indexA.heTitle > index.heTitle ? 1 : -1;
      }
      else {
        return a.sourceRef > b.sourceRef ? 1 : -1;
      }
    }.bind(this);

    var sectionLinks = Sefaria.links(sectionRef);
    var links        = Sefaria._filterLinks(sectionLinks, filter);
    links            = links.filter(function(link) {
      if (Sefaria.splitRangingRef(link.anchorRef).every(aref => Sefaria.util.inArray(aref, refs) === -1)) {
        // Filter out every link in this section which does not overlap with current refs.
        return false;
      }
      return true;
    }.bind(this)).sort(sortConnections);

    return links;
  }
  render() {
    var refs               = this.props.srefs;
    var oref               = Sefaria.ref(refs[0]);
    var filter             = this.props.filter; // Remove filterSuffix for display
    var displayFilter      = filter.map(filter => filter.split("|")[0]);  // Remove filterSuffix for display
    var links              = this.getLinks();

    var en = "No connections known" + (filter.length ? " for " + displayFilter.join(", ") + " here" : "") + ".";
    var he = "אין קשרים ידועים"        + (filter.length ? " ל"    + displayFilter.map(f => Sefaria.hebrewTerm(f)).join(", ") : "") + ".";
    var noResultsMessage = <LoadingMessage message={en} heMessage={he} />;
    var message = !this.state.linksLoaded ? (<LoadingMessage />) : (links.length === 0 ? noResultsMessage : null);
    var content = links.length == 0 ? message :
                  this.state.waitForText && !this.state.textLoaded ?
                    (<LoadingMessage />) :
                    links.map(function(link, i) {
                        var hideTitle = link.category === "Commentary" && this.props.filter[0] !== "Commentary";
                        Sefaria.util.inArray(link.anchorRef, refs) === -1;
                        return (<div className="textListTextRangeBox" key={i + link.sourceRef}>
                                  <TextRange
                                    panelPosition ={this.props.panelPosition}
                                    sref={link.sourceRef}
                                    hideTitle={hideTitle}
                                    numberLabel={link.category === "Commentary" ? link.anchorVerse : 0}
                                    basetext={false}
                                    onRangeClick={this.props.onTextClick}
                                    onCitationClick={this.props.onCitationClick}
                                    onNavigationClick={this.props.onNavigationClick}
                                    onCompareClick={this.props.onCompareClick}
                                    onOpenConnectionsClick={this.props.onOpenConnectionsClick}
                                    inlineReference={link.inline_reference}/>
                                    {Sefaria.is_moderator || Sefaria.is_editor ?
                                    <EditorLinkOptions
                                      _id={link._id}
                                      onDataChange={ this.onDataChange } />
                                    : null}
                                </div>);
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
  onNavigationClick:       PropTypes.func,
  onCompareClick:          PropTypes.func,
  onOpenConnectionsClick:  PropTypes.func,
  onDataChange:            PropTypes.func,
  openNav:                 PropTypes.func,
  openDisplaySettings:     PropTypes.func,
  closePanel:              PropTypes.func,
  selectedWords:           PropTypes.string,
};


class EditorLinkOptions extends Component {
  constructor(props) {
    super(props);
    this.state = {collapsed: false};
  }
  expand() {
    this.setState({collapsed: false});
  }
  deleteLink () {
    if (confirm("Are you sure you want to delete this connection?")) {
      var url = "/api/links/" + this.props._id;
      $.ajax({
        type: "delete",
        url: url,
        success: function() {
          Sefaria.clearLinks();
          this.props.onDataChange();
          alert("Connection deleted.");
        }.bind(this),
        error: function () {
          alert("There was an error deleting this connection. Please reload the page or try again later.");
        }
      });
    }
  }
  render () {
    if (this.state.collapsed) {
      return <div className="editorLinkOptions" onClick={this.expand}><i className="fa fa-cog"></i></div>
    }

    return <div className="editorLinkOptions sans">
      <div className="editorLinkOptionsDelete" onClick={this.deleteLink}>
        <span className="int-en">Remove</span>
        <span className="int-he">מחק</span>
      </div>
    </div>
  }
}
EditorLinkOptions.propTypes = {
  _id:          PropTypes.string.isRequired,
  onDataChange: PropTypes.func
};


module.exports = TextList;
