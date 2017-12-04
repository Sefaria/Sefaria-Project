const React      = require('react');
const ReactDOM   = require('react-dom');
const PropTypes  = require('prop-types');
const classNames = require('classnames');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
import Component from 'react-class'

class TextRange extends Component {
  // A Range or text defined a by a single Ref. Specially treated when set as 'basetext'.
  // This component is responsible for retrieving data from `Sefaria` for the ref that defines it.
  componentDidMount() {
    this._isMounted = true;
    var data = this.getText();
    if (data && !this.dataPrefetched) {
      // If data was populated server side, onTextLoad was never called
      this.onTextLoad(data);
    } else if (this.props.basetext || this.props.segmentNumber) {
      this.placeSegmentNumbers();
    }
    window.addEventListener('resize', this.handleResize);
  }
  componentWillUnmount() {
    this._isMounted = false;
    window.removeEventListener('resize', this.handleResize);
  }
  componentDidUpdate(prevProps, prevState) {
    // Place segment numbers again if update affected layout
    if (this.props.basetext || this.props.segmentNumber) {
      if (this.props.version != prevProps.version ||
          this.props.versionLanguage != prevProps.versionLanguage ||
          prevProps.settings.language !== this.props.settings.language ||
          prevProps.settings.layoutDefault !== this.props.settings.layoutDefault ||
          prevProps.settings.layoutTanakh !== this.props.settings.layoutTanakh ||
          prevProps.settings.layoutTalmud !== this.props.settings.layoutTalmud ||
          prevProps.settings.biLayout !== this.props.settings.biLayout ||
          prevProps.settings.fontSize !== this.props.settings.fontSize ||
          prevProps.layoutWidth !== this.props.layoutWidth ||
          prevProps.filter !== this.props.filter) {
            // Rerender in case version has changed
            this.forceUpdate(function() {
                this.placeSegmentNumbers();
            }.bind(this));
      }
    }
  }
  handleResize() {
    if (this.props.basetext || this.props.segmentNumber) {
      this.placeSegmentNumbers();
    }
  }
  handleClick(event) {
    if (window.getSelection().type === "Range") {
      // Don't do anything if this click is part of a selection
      return;
    }
    if (this.props.onRangeClick) {
      //Click on the body of the TextRange itself from TextList
      this.props.onRangeClick(this.props.sref);
      Sefaria.track.event("Reader", "Click Text from TextList", this.props.sref);
    }
  }
  handleKeyPress(event) {
    if (event.charCode == 13) {
      this.handleClick(event);
    }
  }
  getText() {
    var settings = {
      context: this.props.withContext ? 1 : 0,
      version: this.props.version || null,
      language: this.props.versionLanguage || null
    };
    var data = Sefaria.text(this.props.sref, settings);

    if ((!data || "updateFromAPI" in data) && !this.textLoading) { // If we don't have data yet, call again with a callback to trigger API call
      this.textLoading = true;
      Sefaria.text(this.props.sref, settings, this.onTextLoad);
    }
    return data;
  }
  onTextLoad(data) {
    // Initiate additional API calls when text data first loads
    this.textLoading = false;
    if (this.props.basetext && this.props.sref !== data.ref) {
      // Replace ReaderPanel contents ref with the normalized form of the ref, if they differ.
      // Pass parameter to showBaseText to replaceHistory - normalization should't add a step to history
      this.props.showBaseText(data.ref, true, this.props.version, this.props.versionLanguage);
      return;
    }

    // If this is a ref to a super-section, rewrite it to first available section
    if (this.props.basetext && data.textDepth - data.sections.length > 1 && data.firstAvailableSectionRef) {
      this.props.showBaseText(data.firstAvailableSectionRef, true, this.props.version, this.props.versionLanguage);
      return;
    }

    this.prefetchData();

    if (this._isMounted) {
      this.forceUpdate(function() {
        this.placeSegmentNumbers();
        this.props.onTextLoad && this.props.onTextLoad(); // Don't call until the text is actually rendered
      }.bind(this));
    }
  }
  prefetchData() {
    // Prefetch additional data (next, prev, links, notes etc) for this ref
    if (this.dataPrefetched) { return; }

    var data = this.getText();
    if (!data) { return; }

    // Load links at section level if spanning, so that cache is properly primed with section level refs
    var sectionRefs = data.isSpanning ? data.spanningRefs : [data.sectionRef];
    sectionRefs = sectionRefs.map(function(ref) {
      if (ref.indexOf("-") > -1) {
        ref = ref.split("-")[0];
        ref = ref.slice(0, ref.lastIndexOf(":"));
      }
      return ref;
    });

    if (this.props.loadLinks && !Sefaria.linksLoaded(sectionRefs)) {
      for (var i = 0; i < sectionRefs.length; i++) {
        Sefaria.related(sectionRefs[i], function() {
          if (this._isMounted) { this.forceUpdate(); }
        }.bind(this));
        if (Sefaria._uid) {
          Sefaria.relatedPrivate(sectionRefs[i], function() {
            if (this._isMounted) { this.forceUpdate(); }
          }.bind(this));
        }
      }
    }

    if (this.props.prefetchNextPrev) {
     if (data.next) {
       Sefaria.text(data.next, {
         context: 1,
         version: this.props.version || null,
         language: this.props.versionLanguage || null
       }, function() {});
     }
     if (data.prev) {
       Sefaria.text(data.prev, {
         context: 1,
         version: this.props.version || null,
         language: this.props.versionLanguage || null
       }, function() {});
     }
     if (data.indexTitle) {
        // Preload data that is used on Text TOC page
        Sefaria.indexDetails(data.indexTitle, function() {});
     }
    }
    this.dataPrefetched = true;
  }
  placeSegmentNumbers() {
    //console.log("placeSegmentNumbers", this.props.sref);
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    var $text  = $(ReactDOM.findDOMNode(this));
    var elemsAtPosition = {}; // Keyed by top position, an array of elements found there
    var setTop = function() {
      var $elem = $(this);
      var top   = $elem.parent().position().top;
      $elem.css({top: top});
      var list = elemsAtPosition[top] || [];
      list.push($elem);
      elemsAtPosition[top] = list;
    };
    $text.find(".linkCount").each(setTop);
    elemsAtPosition = {};  // resetting because we only want it to track segmentNumbers
    $text.find(".segmentNumber").each(setTop).show();
    var fixCollision = function ($elems) {
      // Takes an array of jQuery elements that all currently appear at the same top position
      if ($elems.length == 1) { return; }
      if ($elems.length == 2) {
        var adjust = 8;
        $elems[0].css({top: "-=" + adjust});
        $elems[1].css({top: "+=" + adjust});
      }
    };
    for (var top in elemsAtPosition) {
      if (elemsAtPosition.hasOwnProperty(top)) {
        fixCollision(elemsAtPosition[top]);
      }
    }
    $text.find(".segmentNumber").show();
    $text.find(".linkCount").show();
  }
  onFootnoteClick(event) {
    $(event.target).closest("sup").next("i.footnote").toggle();
    this.placeSegmentNumbers();
  }
  parashahHeader(ref) {
    // Returns the English/Hebrew title of a Parasha, if `ref` is the beginning of a new parahsah
    // returns null otherwise. 
    var data = this.getText();
    if (!data) { return null; }
    var index = Sefaria.indexDetails(data.indexTitle);
    if (index && "alts" in index && "Parasha" in index.alts && index.categories[1] == "Torah" && !("dependence" in index)) {
      for (var i=0; i < index.alts.Parasha.nodes.length; i++) {
        var parashahRef = index.alts.Parasha.nodes[i].wholeRef.split("-")[0];
        if (ref == parashahRef) {
          return {
            en: index.alts.Parasha.nodes[i].title,
            he: index.alts.Parasha.nodes[i].heTitle,
          };
        }
      }
    }
    return null;
  }
  render() {
    var data = this.getText();
    if (data && this.props.basetext) {
      var ref              = this.props.withContext ? data.sectionRef : data.ref;
      var sectionStrings   = Sefaria.sectionString(ref);
      var oref             = Sefaria.ref(ref);
      var useShortString   = oref && Sefaria.util.inArray(oref.primary_category, ["Tanakh", "Mishnah", "Talmud", "Tanaitic", "Commentary"]) !== -1;
      var title            = useShortString ? sectionStrings.en.numbered : sectionStrings.en.named;
      var heTitle          = useShortString ? sectionStrings.he.numbered : sectionStrings.he.named;
    } else if (data && !this.props.basetext) {
      var title            = data.ref;
      var heTitle          = data.heRef;
    } else if (!data) {
      var title            = "Loading...";
      var heTitle          = "טעינה...";
    }
    var showNumberLabel    =  data &&
                              data.categories &&
                              data.categories[0] !== "Talmud" &&
                              data.categories[0] !== "Liturgy";

    var showSegmentNumbers = showNumberLabel && this.props.basetext;

    var segments      = Sefaria.makeSegments(data, this.props.withContext);
    var textSegments  = segments.map(function (segment, i) {
      var highlight     = this.props.highlightedRefs && this.props.highlightedRefs.length ?        // if highlighted refs are explicitly set
                            Sefaria.util.inArray(segment.ref, this.props.highlightedRefs) !== -1 : // highlight if this ref is in highlighted refs prop
                            this.props.basetext && segment.highlight;                              // otherwise highlight if this a basetext and the ref is specific
      var parashahHeader = null;
      if (this.props.showParashahHeaders && this.parashahHeader(segment.ref)) {
        var parashahNames = this.parashahHeader(segment.ref);
        var parashahHeader = <div className="parashahHeader">
          <span className="en">{ parashahNames.en }</span>
          <span className="he">{ parashahNames.he }</span>
        </div>;
      }
      return (<span key={i + segment.ref}>
                { parashahHeader }
                <TextSegment
                    sref={segment.ref}
                    en={segment.en}
                    he={segment.he}
                    highlight={highlight}
                    segmentNumber={showSegmentNumbers ? segment.number : 0}
                    showLinkCount={this.props.basetext}
                    linkCount={Sefaria.linkCount(segment.ref, this.props.filter)}
                    filter={this.props.filter}
                    panelPosition={this.props.panelPosition}
                    onSegmentClick={this.props.onSegmentClick}
                    onCitationClick={this.props.onCitationClick}
                    onFootnoteClick={this.onFootnoteClick} />
              </span>);
    }.bind(this));
    textSegments = textSegments.length ? textSegments : null;

    var classes = {
                    textRange: 1,
                    basetext: this.props.basetext,
                    loading: !data,
                    lowlight: this.props.lowlight
                  };
    classes = classNames(classes);

    var open        = function() { this.props.onNavigationClick(this.props.sref)}.bind(this);
    var compare     = function() { this.props.onCompareClick(this.props.sref)}.bind(this);
    var connections = function() { this.props.onOpenConnectionsClick([this.props.sref])}.bind(this);

    var actionLinks = (<div className="actionLinks">
                        <span className="openLink" onClick={open}>
                          <img src="/static/img/open-64.png" alt="" />
                          <span className="en">Open</span>
                          <span className="he">פתח</span>
                        </span>
                        <span className="compareLink" onClick={compare}>
                          <img src="/static/img/compare-64.png" alt="" />
                          <span className="en">Compare</span>
                          <span className="he">השווה</span>
                        </span>
                        <span className="connectionsLink" onClick={connections}>
                          <i className="fa fa-link"></i>
                          <span className="en">Connections</span>
                          <span className="he">קשרים</span>
                        </span>
                      </div>);

    // configure number display for inline references
    var sidebarNumberDisplay = (this.props.inlineReference &&
    this.props.inlineReference['data-commentator'] === Sefaria.index(Sefaria.parseRef(this.props.sref).index).collectiveTitle);
    if (sidebarNumberDisplay) {
      if (this.props.inlineReference['data-label']) {
        var displayValue = this.props.inlineReference['data-label'];
      }
      else {
        var displayValue = Sefaria.hebrew.encodeHebrewNumeral(this.props.inlineReference['data-order']);
      }
      if (displayValue === undefined) {
        displayValue = this.props.inlineReference['data-order'];
      }
      var sidebarNum = <div className="numberLabel sans itag">
        <span className="numberLabelInner">
          <span className="he heOnly">{displayValue}</span>
        </span>
      </div>;
    } else if (showNumberLabel && this.props.numberLabel) {
      var sidebarNum = <div className="numberLabel sans">
        <span className="numberLabelInner">
          <span className="en">{this.props.numberLabel}</span>
          <span className="he">{Sefaria.hebrew.encodeHebrewNumeral(this.props.numberLabel)}</span>
        </span>
      </div>;
    } else {var sidebarNum = null;}

    return (
      <div className={classes} onClick={this.handleClick} onKeyPress={this.handleKeyPress} data-ref={this.props.sref}>
        {sidebarNum}
        {this.props.hideTitle ? null :
        (<div className="title">
          <div className="titleBox" role="heading" aria-level="2">
            <span className="en" >{title}</span>
            <span className="he">{heTitle}</span>
          </div>
          {this.props.titleButtons ? <div className="buttons" onClick={e => e.stopPropagation()}>{this.props.titleButtons}</div> : null }
        </div>)}
        <div className="text">
          <div className="textInner">
            { textSegments }
            { this.props.showActionLinks ? actionLinks : null }
          </div>
        </div>
      </div>
    );
  }
}
TextRange.propTypes = {
  sref:                   PropTypes.string.isRequired,
  version:                PropTypes.string,
  versionLanguage:        PropTypes.string,
  highlightedRefs:        PropTypes.array,
  basetext:               PropTypes.bool,
  withContext:            PropTypes.bool,
  hideTitle:              PropTypes.bool,
  loadLinks:              PropTypes.bool,
  prefetchNextPrev:       PropTypes.bool,
  lowlight:               PropTypes.bool,
  numberLabel:            PropTypes.number,
  settings:               PropTypes.object,
  filter:                 PropTypes.array,
  titleButtons:           PropTypes.object,
  showParashahHeaders:    PropTypes.bool,
  onTextLoad:             PropTypes.func,
  onRangeClick:           PropTypes.func,
  onSegmentClick:         PropTypes.func,
  onCitationClick:        PropTypes.func,
  onNavigationClick:      PropTypes.func,
  onCompareClick:         PropTypes.func,
  onOpenConnectionsClick: PropTypes.func,
  showBaseText:           PropTypes.func,
  panelsOpen:             PropTypes.number,
  layoutWidth:            PropTypes.number,
  showActionLinks:        PropTypes.bool,
  inlineReference:        PropTypes.object,
};


class TextSegment extends Component {
  shouldComponentUpdate(nextProps) {
    if (this.props.highlight !== nextProps.highlight)         { return true; }
    if (this.props.showLinkCount !== nextProps.showLinkCount) { return true; }
    if (this.props.linkCount !== nextProps.linkCount)         { return true; }
    if (!!this.props.filter !== !!nextProps.filter)           { return true; }
    if (this.props.filter && nextProps.filter &&
        !this.props.filter.compare(nextProps.filter))         { return true; }

    return false;
  }
  handleClick(event) {
    if ($(event.target).hasClass("refLink")) {
      //Click of citation
      event.preventDefault();//add prevent default
      var ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.onCitationClick(ref, this.props.sref);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Citation Link Click", ref);
    } else if ($(event.target).is("sup") || $(event.target).parents("sup").size()) {
      this.props.onFootnoteClick(event);
      event.stopPropagation();
    } else if (this.props.onSegmentClick) {
      this.props.onSegmentClick(this.props.sref);
      Sefaria.track.event("Reader", "Text Segment Click", this.props.sref);
    }
  }
  handleKeyPress(event) {
    if (event.charCode == 13) {
      this.handleClick(event);
    }
  }
  render() {
    var linkCountElement;
    if (this.props.showLinkCount) {
      var linkCount = this.props.linkCount;
      var minOpacity = 20, maxOpacity = 70;
      var linkScore = linkCount ? Math.min(linkCount + minOpacity, maxOpacity) / 100.0 : 0;
      var style = {opacity: linkScore};
      linkCountElement = this.props.showLinkCount ? (<div className="linkCount sans" title={linkCount + " Connections Available"}>
                                                    <span className="en"><span className="linkCountDot" style={style}></span></span>
                                                    <span className="he"><span className="linkCountDot" style={style}></span></span>
                                                  </div>) : null;
    } else {
      linkCountElement = "";
    }
    var segmentNumber = this.props.segmentNumber ? (<div className="segmentNumber sans">
                                                      <span className="en"> <span className="segmentNumberInner">{this.props.segmentNumber}</span> </span>
                                                      <span className="he"> <span className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.segmentNumber)}</span> </span>
                                                    </div>) : null;
    var he = this.props.he || "";

    // render itags
    if (this.props.filter && this.props.filter.length > 0) {
      var $newElement = $("<div>" + he + "</div>");
      var textValue = function(i) {
        if ($(i).attr('data-label')) {
          return $(i).attr('data-label');
        } else {
          var value = Sefaria.hebrew.encodeHebrewNumeral($(i).attr('data-order'));
        }
        if (value === undefined) {
          value = $(i).attr('data-order');
        }
        return value;
      };
      $newElement.find('i[data-commentator="' + this.props.filter[0] + '"]').each(function () {
        $(this).replaceWith('<sup class="itag">' + textValue(this) + "</sup>");
      });
      he = $newElement.html();
    }

    var en = this.props.en || "";
    var classes=classNames({ segment: 1,
                     highlight: this.props.highlight,
                     heOnly: !this.props.en,
                     enOnly: !this.props.he });
    if(!this.props.en && !this.props.he){
        return false;
    }
    return (
      <div tabIndex="0" className={classes} onClick={this.handleClick} onKeyPress={this.handleKeyPress} data-ref={this.props.sref} aria-controls={"panel-"+(this.props.panelPosition+1)} aria-label={"Click to see links to "+this.props.sref}>
        {segmentNumber}
        {linkCountElement}
        <p className="he" dangerouslySetInnerHTML={ {__html: he + " "} }></p>
        <p className="en" dangerouslySetInnerHTML={ {__html: en + " "} }></p>
        <div className="clearFix"></div>
      </div>
    );
  }
}
TextSegment.propTypes = {
  sref:            PropTypes.string,
  en:              PropTypes.string,
  he:              PropTypes.string,
  highlight:       PropTypes.bool,
  segmentNumber:   PropTypes.number,
  showLinkCount:   PropTypes.bool,
  linkCount:       PropTypes.number,
  filter:          PropTypes.array,
  onCitationClick: PropTypes.func,
  onSegmentClick:  PropTypes.func,
  onFootnoteClick: PropTypes.func
};


module.exports = TextRange;
