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
  shouldComponentUpdate(nextProps) {
    if (this.props.sref !== nextProps.sref)                   { return true; }
    if (!!this.props.filter !== !!nextProps.filter)           { return true; }
    if (this.props.filter && nextProps.filter &&
        !this.props.filter.compare(nextProps.filter))         { return true; }
    if (this.props.highlightedRefs && nextProps.highlightedRefs &&
        !this.props.highlightedRefs.compare(nextProps.highlightedRefs)) { return true; }
    if (this.props.currVersions.en !== nextProps.currVersions.en) { return true; }
    if (this.props.currVersions.he !== nextProps.currVersions.he) { return true; }
    // todo: figure out when and if this component receives settings at all
    if (nextProps.settings && this.props.settings &&
        (nextProps.settings.language !== this.props.settings.language ||
          nextProps.settings.layoutDefault !== this.props.settings.layoutDefault ||
          nextProps.settings.layoutTanakh !== this.props.settings.layoutTanakh ||
          nextProps.settings.aliyotTorah !== this.props.settings.aliyotTorah ||
          nextProps.settings.vowels !== this.props.settings.vowels ||
          nextProps.settings.layoutTalmud !== this.props.settings.layoutTalmud ||
          nextProps.settings.biLayout !== this.props.settings.biLayout ||
          nextProps.settings.fontSize !== this.props.settings.fontSize ||
          nextProps.layoutWidth !== this.props.layoutWidth))     { return true; }
    // lowlight ?

    return false;
  }
  componentDidUpdate(prevProps, prevState) {
    // Place segment numbers again if update affected layout
    if (this.props.basetext || this.props.segmentNumber) {
      if (prevProps.currVersions.en !== this.props.currVersions.en ||
          prevProps.currVersions.he !== this.props.currVersions.he ||
          prevProps.settings.language !== this.props.settings.language ||
          prevProps.settings.layoutDefault !== this.props.settings.layoutDefault ||
          prevProps.settings.layoutTanakh !== this.props.settings.layoutTanakh ||
          prevProps.settings.aliyotTorah !== this.props.settings.aliyotTorah ||
          prevProps.settings.layoutTalmud !== this.props.settings.layoutTalmud ||
          prevProps.settings.biLayout !== this.props.settings.biLayout ||
          prevProps.settings.fontSize !== this.props.settings.fontSize ||
          prevProps.layoutWidth !== this.props.layoutWidth ||
          !!prevProps.filter !== !!this.props.filter ||
          (!!prevProps.filter && !prevProps.filter.compare(this.props.filter))) {
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
      enVersion: this.props.currVersions.en || null,
      heVersion: this.props.currVersions.he || null
    };
    var data = Sefaria.getTextFromCache(this.props.sref, settings);

    if ((!data || "updateFromAPI" in data) && !this.textLoading) { // If we don't have data yet, call trigger an API call
      this.textLoading = true;
      Sefaria.getText(this.props.sref, settings).then(this.onTextLoad);
    }
    return data;
  }
  onTextLoad(data) {
    // Initiate additional API calls when text data first loads
    this.textLoading = false;
    if (this.props.basetext && this.props.sref !== data.ref) {
      // Replace ReaderPanel contents ref with the normalized form of the ref, if they differ.
      // Pass parameter to showBaseText to replaceHistory - normalization should't add a step to history
      this.props.showBaseText(data.ref, true, this.props.currVersions);
      return;
    } else if (this.props.basetext && data.spanning) {
      // Replace ReaderPanel contents with split refs if ref is spanning
      // Pass parameter to showBaseText to replaceHistory - normalization should't add a step to history
      //console.log("Re-rewriting spanning ref")
      this.props.showBaseText(data.spanningRefs, true, this.props.version, this.props.versionLanguage);
      return;
    }

    // If this is a ref to a super-section, rewrite it to first available section
    if (this.props.basetext && data.textDepth - data.sections.length > 1 && data.firstAvailableSectionRef) {
      this.props.showBaseText(data.firstAvailableSectionRef, true, this.props.currVersions);
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
  _prefetchLinksAndNotes(data) {
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
  }
  prefetchData() {
    // Prefetch additional data (next, prev, links, notes etc) for this ref
    if (this.dataPrefetched) { return; }

    var data = this.getText();
    if (!data) { return; }

    // Load links at section level if spanning, so that cache is properly primed with section level refs
    this._prefetchLinksAndNotes(data);

    if (this.props.prefetchNextPrev) {
     if (data.next) {
       Sefaria.getText(data.next, {
         context: 1,
         multiple: this.props.prefetchMultiple,
         enVersion: this.props.currVersions.en || null,
         heVersion: this.props.currVersions.he || null
       }).then(ds => Array.isArray(ds) ? ds.map(d => this._prefetchLinksAndNotes(d)) : this._prefetchLinksAndNotes(ds));
     }
     if (data.prev) {
       Sefaria.getText(data.prev, {
         context: 1,
         multiple: -this.props.prefetchMultiple,
         enVersion: this.props.currVersions.en || null,
         heVersion: this.props.currVersions.he || null
       }).then(ds => Array.isArray(ds) ? ds.map(d => this._prefetchLinksAndNotes(d)) : this._prefetchLinksAndNotes(ds));
     }
     if (data.indexTitle) {
        // Preload data that is used on Text TOC page
        Sefaria.getIndexDetails(data.indexTitle);
     }
    }
    this.dataPrefetched = true;
  }
  placeSegmentNumbers() {
    // console.log("placeSegmentNumbers", this.props.sref);
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    if (!this.props.basetext) { return; }

    var $text  = $(ReactDOM.findDOMNode(this));
    var elemsAtPosition = {}; // Keyed by top position, an array of elements found there
    var setTop = function() {
      var $elem = $(this);
      var top   = $elem.parent().position().top;
      $elem.css({top: top, left: '', right: ''});
      var list = elemsAtPosition[top] || [];
      list.push($elem);
      elemsAtPosition[top] = list;
    };
    $text.find(".linkCount").each(setTop);
    elemsAtPosition = {};  // resetting because we only want it to track segmentNumbers
    $text.find(".segmentNumber").each(setTop).show();

    var side = this.props.settings.language == "hebrew" ? "right" : "left";
    var selector = this.props.settings.language == "hebrew" ? ".he" : ".en";
    var fixCollision = function ($elems) {
      // Takes an array of jQuery elements that all currently appear at the same top position
      if ($elems.length == 1) { return; }
      if ($elems.length == 2) {
        var adjust1 = $elems[0].find(selector).find(".segmentNumberInner").width();
        var adjust2 = $elems[1].find(selector).find(".segmentNumberInner").width();
        $elems[0].css(side, "-=" + adjust1);
        $elems[1].css(side, "+=" + adjust2);
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
  parashahHeader(data, segment, includeAliyout=false) {
    // Returns the English/Hebrew title of a Parasha, if `ref` is the beginning of a new parahsah
    // returns null otherwise.
    //var data = this.getText();
    if (!data) { return null; }
    if ("alts" in data && data.alts.length && ((data.categories[1] == "Torah" && !data["isDependant"]) || data.categories[2] == "Onkelos")) {
      var curRef = segment.ref;
      if ("alt" in segment && segment.alt != null){
        if(includeAliyout || "whole" in segment.alt){
          return {"en": segment.alt["en"][0], "he": segment.alt["he"][0], "parashaTitle": "whole" in segment.alt}
        }
      }
    }
    return null;
  }
  render() {
    const data = this.getText();
    let title, heTitle, ref;
    if (data && this.props.basetext) {
      ref              = this.props.withContext ? data.sectionRef : data.ref;
      const sectionStrings   = Sefaria.sectionString(ref);
      const oref             = Sefaria.ref(ref);
      const useShortString   = oref && Sefaria.util.inArray(oref.primary_category, ["Tanakh", "Mishnah", "Talmud", "Tanaitic", "Commentary"]) !== -1;
      title            = useShortString ? sectionStrings.en.numbered : sectionStrings.en.named;
      heTitle          = useShortString ? sectionStrings.he.numbered : sectionStrings.he.named;
    } else if (data && !this.props.basetext) {
      title            = data.ref;
      heTitle          = data.heRef;
      ref              = data.ref;
    } else if (!data) {
      title            = "Loading...";
      heTitle          = "טעינה...";
      ref              = null;
    }
    const showNumberLabel    =  data &&
                              data.categories &&
                              data.categories[0] !== "Talmud" &&
                              data.categories[0] !== "Liturgy" &&
                              data.categories[0] !== "Reference";

    const showSegmentNumbers = showNumberLabel && this.props.basetext;

    const nre = /[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]/g;
    const cnre = /[\u0591-\u05bd\u05bf-\u05c5\u05c7]/g;
    let strip_text_re = null;
    if(this.props.settings && this.props.settings.language !== "english" && this.props.settings.vowels !== "all"){
      strip_text_re = (this.props.settings.vowels == "partial") ? nre : cnre;
    }

    var segments      = Sefaria.makeSegments(data, this.props.withContext);
    if(segments.length > 0 && strip_text_re && !strip_text_re.test(segments[0].he)){
      strip_text_re = null; //if the first segment doesnt even match as containing vowels or cantillation- stop
    }
    let textSegments = segments.map((segment, i) => {
      var highlight = this.props.highlightedRefs && this.props.highlightedRefs.length ?        // if highlighted refs are explicitly set
                            Sefaria.util.inArray(segment.ref, this.props.highlightedRefs) !== -1 : // highlight if this ref is in highlighted refs prop
                            this.props.basetext && segment.highlight;  // otherwise highlight if this a basetext and the ref is specific
      const textHighlights = (highlight || !this.props.basetext) && !!this.props.textHighlights ? this.props.textHighlights : null; // apply textHighlights in a base text only when the segment is hightlights
      let parashahHeader = null;
        if (this.props.showParashahHeaders) {
        const parashahNames = this.parashahHeader(data, segment, (this.props.settings.aliyotTorah == 'aliyotOn'));
        if (parashahNames){
          const pclasses = classNames({
                    parashahHeader: 1,
                    aliyah: !parashahNames.parashaTitle,
                  });
          parashahHeader = <div className={pclasses}>
            <span className="en">{ parashahNames.en }</span>
            <span className="he">{ parashahNames.he }</span>
          </div>;
        }
      }
      segment.he = strip_text_re ? segment.he.replace(strip_text_re, "") : segment.he;
      return (
        <span key={i + segment.ref}>
          { parashahHeader }
          <TextSegment
            sref={segment.ref}
            enLangCode={this.props.currVersions.en && /.+\[([a-z][a-z])\]$/g.test(this.props.currVersions.en) ? /.+\[([a-z][a-z])\]$/g.exec(this.props.currVersions.en)[1] : 'en'}
            heLangCode={this.props.currVersions.he && /.+\[([a-z][a-z])\]$/g.test(this.props.currVersions.he) ? /.+\[([a-z][a-z])\]$/g.exec(this.props.currVersions.he)[1] : 'he'}
            en={!this.props.useVersionLanguage || this.props.currVersions.en ? segment.en : null}
            he={!this.props.useVersionLanguage || this.props.currVersions.he ? segment.he : null}
            highlight={highlight}
            textHighlights={textHighlights}
            segmentNumber={showSegmentNumbers ? segment.number : 0}
            showLinkCount={this.props.basetext}
            linkCount={Sefaria.linkCount(segment.ref, this.props.filter)}
            filter={this.props.filter}
            panelPosition={this.props.panelPosition}
            onSegmentClick={this.props.onSegmentClick}
            onCitationClick={this.props.onCitationClick}
            onFootnoteClick={this.onFootnoteClick}
            unsetTextHighlight={this.props.unsetTextHighlight}
          />
        </span>
      );
    });
    textSegments = textSegments.length ? textSegments : null;

    const classes = classNames({
                      textRange: 1,
                      basetext: this.props.basetext,
                      loading: !data,
                      lowlight: this.props.lowlight
                  });

    const open        = () => { this.props.onNavigationClick(this.props.sref) };
    const compare     = () => { this.props.onCompareClick(this.props.sref) };
    const connections = () => { this.props.onOpenConnectionsClick([this.props.sref]) };

    const actionLinks = (<div className="actionLinks">
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
    let sidebarNum;
    const displaySidebarNumber = (this.props.inlineReference &&
        this.props.inlineReference['data-commentator'] === Sefaria.index(Sefaria.parseRef(this.props.sref).index).collectiveTitle);
    if (displaySidebarNumber) {
      let enDisplayValue, heDisplayValue;
      if (this.props.inlineReference['data-label']) {
         enDisplayValue = this.props.inlineReference['data-label'];
         heDisplayValue = this.props.inlineReference['data-label'];
      }
      else {
         enDisplayValue = this.props.inlineReference['data-order'];
         heDisplayValue = Sefaria.hebrew.encodeHebrewNumeral(enDisplayValue);
      }
      if (heDisplayValue === undefined) {
        heDisplayValue = enDisplayValue;
      }
      sidebarNum = <div className="numberLabel sans itag">
        <span className="numberLabelInner">
          <span className="en">{enDisplayValue}</span>
          <span className="he">{heDisplayValue}</span>
        </span>
      </div>;
    } else if (showNumberLabel && this.props.numberLabel) {
      sidebarNum = <div className="numberLabel sans">
        <span className="numberLabelInner">
          <span className="en">{this.props.numberLabel}</span>
          <span className="he">{Sefaria.hebrew.encodeHebrewNumeral(this.props.numberLabel)}</span>
        </span>
      </div>;
    } else { sidebarNum = null;}

    return (
      <div className={classes} onClick={this.handleClick} onKeyPress={this.handleKeyPress} data-ref={ref}>
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
  currVersions:           PropTypes.object.isRequired,
  useVersionLanguage:     PropTypes.bool,
  highlightedRefs:        PropTypes.array,
  basetext:               PropTypes.bool,
  withContext:            PropTypes.bool,
  hideTitle:              PropTypes.bool,
  loadLinks:              PropTypes.bool,
  prefetchNextPrev:       PropTypes.bool,
  prefetchMultiple:       PropTypes.number,
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
  unsetTextHighlight:     PropTypes.func,
  panelsOpen:             PropTypes.number, // used?
  layoutWidth:            PropTypes.number,
  showActionLinks:        PropTypes.bool,
  inlineReference:        PropTypes.object,
  textHighlights:         PropTypes.array,
};
TextRange.defaultProps = {
  currVersions: {en:null,he:null},
};


class TextSegment extends Component {
  shouldComponentUpdate(nextProps) {
    if (this.props.highlight !== nextProps.highlight)           { return true; }
    if (this.props.textHighlights !== nextProps.textHighlights) { return true; }
    if (this.props.showLinkCount !== nextProps.showLinkCount)   { return true; }
    if (this.props.linkCount !== nextProps.linkCount)           { return true; }
    if (!!this.props.filter !== !!nextProps.filter)             { return true; }
    if (this.props.filter && nextProps.filter &&
        !this.props.filter.compare(nextProps.filter))           { return true; }
    if (this.props.en !== nextProps.en
        || this.props.he !== nextProps.he)                      { return true; }

    return false;
  }
  componentDidUpdate(prevProps) {
    if (this.props.highlight !== prevProps.highlight && !!this.props.textHighlights) {
      this.props.unsetTextHighlight();
    }
  }
  handleClick(event) {
    if ($(event.target).hasClass("refLink")) {
      //Click of citation
      event.preventDefault();
      let ref = Sefaria.humanRef($(event.target).attr("data-ref"));
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
  formatItag(lang, text) {
    var $newElement = $("<div>" + text + "</div>");
    var textValue = function(i) {
      if ($(i).attr('data-label')) {
        return $(i).attr('data-label');
      } else {
        if (lang === "he") {
          var value = Sefaria.hebrew.encodeHebrewNumeral($(i).attr('data-order'));
        }
        else if (lang === "en") {
          var value = $(i).attr('data-order');
        }
      }
      if (value === undefined) {
        value = $(i).attr('data-order');
      }
      return value;
    };
    $newElement.find('i[data-commentator="' + this.props.filter[0] + '"]').each(function () {
      $(this).replaceWith('<sup class="itag">' + textValue(this) + "</sup>");
    });
    return $newElement.html();
  }
  addHighlights(text) {
    // for adding in highlights to query results in Reader
    if (!!this.props.textHighlights) {
      const highList = this.props.textHighlights.map(h => Sefaria.hebrew.isHebrew(h) ? Sefaria.hebrew.getNikkudRegex(h) : h);
      const reg = new RegExp(`(${highList.join("|")})`, 'g');
      console.log(reg);
      return text.replace(reg, '<span class="queryTextHighlight">$1</span>');
    }
    return text;
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
    var en = this.props.en || "";

    // render itags
    if (this.props.filter && this.props.filter.length > 0) {
      he = this.formatItag("he", he);
      en = this.formatItag("en", en);
    }
    he = this.addHighlights(he);
    en = this.addHighlights(en);

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
        <p lang={this.props.heLangCode} className="he" dangerouslySetInnerHTML={ {__html: he + " "} }></p>
        <p lang={this.props.enLangCode} className="en" dangerouslySetInnerHTML={ {__html: en + " "} }></p>
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
  textHighlights:  PropTypes.array,
  segmentNumber:   PropTypes.number,
  showLinkCount:   PropTypes.bool,
  linkCount:       PropTypes.number,
  filter:          PropTypes.array,
  onCitationClick: PropTypes.func,
  onSegmentClick:  PropTypes.func,
  onFootnoteClick: PropTypes.func,
  unsetTextHighlight: PropTypes.func,
};


module.exports = TextRange;
