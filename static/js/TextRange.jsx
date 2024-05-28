import React  from 'react';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class';
import {EnglishText, HebrewText} from "./Misc";
import {VersionContent} from "./ContentText";
import {ContentText} from "./ContentText";

class TextRange extends Component {
  // A Range or text defined a by a single Ref. Specially treated when set as 'basetext'.
  // This component is responsible for retrieving data from `Sefaria` for the ref that defines it.
  componentDidMount() {
    this._isMounted = true;
    let data = this.getText();
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
    if (this.props.translationLanguagePreference !== nextProps.translationLanguagePreference) { return true; }
    if (this.props.showHighlight !== nextProps.showHighlight) { return true; }
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
          nextProps.settings.punctuationTalmud !== this.props.settings.punctuationTalmud ||
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
          prevProps.settings.punctuationTalmud !== this.props.settings.punctuationTalmud ||
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
    let settings = {
      context: this.props.withContext ? 1 : 0,
      enVersion: this.props.currVersions.en || null,
      heVersion: this.props.currVersions.he || null,
      // Support redirect of basetext for schema node refs.  Don't rewrite refs on sidebar to avoid infinite loop of cache misses.
      firstAvailableRef: this.props.basetext ? 1 : 0,
      translationLanguagePreference: this.props.translationLanguagePreference,
      versionPref: Sefaria.versionPreferences.getVersionPref(this.props.sref),
    };
    let data = Sefaria.getTextFromCache(this.props.sref, settings);

    if ((!data || "updateFromAPI" in data) && !this.textLoading) { // If we don't have data yet, call trigger an API call
      this.textLoading = true;
      Sefaria.getText(this.props.sref, settings).then(this.onTextLoad);
    } else if (!!data && this.props.isCurrentlyVisible) {
      this._updateCurrVersions(data.versionTitle, data.heVersionTitle);
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
      // console.log("Re-rewriting spanning ref")
      this.props.showBaseText(data.spanningRefs, true, this.props.currVersions, this.props.versionLanguage);
      return;
    }

    this._updateCurrVersions(data.versionTitle, data.heVersionTitle);

    // If this is a ref to a super-section, rewrite it to first available section
    if (this.props.basetext && data.textDepth - data.sections.length > 1 && data.firstAvailableSectionRef) {
      this.props.showBaseText(data.firstAvailableSectionRef, true, this.props.currVersions);
      return;
    }

    this.prefetchData();

    if (this._isMounted) {
      this.forceUpdate(function() {
        this.placeSegmentNumbers();
        this.props.onTextLoad && this.props.onTextLoad(data.ref); // Don't call until the text is actually rendered
      }.bind(this));
    }
  }
  _updateCurrVersions(enVTitle, heVTitle) {
    // make sure currVersions matches versions returned, due to translationLanguagePreference and versionPreferences
    if (!this.props.updateCurrVersionsToMatchAPIResult) { return; }
    this.props.updateCurrVersionsToMatchAPIResult(enVTitle, heVTitle);
  }
  _prefetchLinksAndNotes(data) {
    let sectionRefs = data.isSpanning ? data.spanningRefs : [data.sectionRef];
    sectionRefs = sectionRefs.map(function(ref) {
      if (ref.indexOf("-") > -1) {
        ref = ref.split("-")[0];
        ref = ref.slice(0, ref.lastIndexOf(":"));
      }
      return ref;
    });

    if (this.props.loadLinks && !Sefaria.linksLoaded(sectionRefs)) {
      for (let i = 0; i < sectionRefs.length; i++) {
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

    let data = this.getText();
    if (!data) { return; }

    // Load links at section level if spanning, so that cache is properly primed with section level refs
    this._prefetchLinksAndNotes(data);

    if (this.props.prefetchNextPrev) {
     if (data.next) {
       Sefaria.getText(data.next, {
         context: 1,
         multiple: this.props.prefetchMultiple,
         enVersion: this.props.currVersions.en || null,
         heVersion: this.props.currVersions.he || null,
         translationLanguagePreference: this.props.translationLanguagePreference,
         versionPref: Sefaria.versionPreferences.getVersionPref(data.next),
       }).then(ds => Array.isArray(ds) ? ds.map(d => this._prefetchLinksAndNotes(d)) : this._prefetchLinksAndNotes(ds));
     }
     if (data.prev) {
       Sefaria.getText(data.prev, {
         context: 1,
         multiple: -this.props.prefetchMultiple,
         enVersion: this.props.currVersions.en || null,
         heVersion: this.props.currVersions.he || null,
         translationLanguagePreference: this.props.translationLanguagePreference,
         versionPref: Sefaria.versionPreferences.getVersionPref(data.prev),
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

    const $text  = $(ReactDOM.findDOMNode(this));
    let elemsAtPosition = {}; // Keyed by top position, an array of elements found there
    const setTop = function() {
      const $elem = $(this);
      const top   = $elem.parent().position().top;
      $elem.css({top: top, left: '', right: ''});
      let list = elemsAtPosition[top] || [];
      list.push($elem);
      elemsAtPosition[top] = list;
    };
    $text.find(".linkCount").each(setTop);
    elemsAtPosition = {};  // resetting because we only want it to track segmentNumbers
    $text.find(".segmentNumber").each(setTop).show();

    const side = this.props.settings.language == "hebrew" ? "left" : "left";
    const selector = this.props.settings.language == "hebrew" ? ".he" : ".en";
    const fixCollision = function ($elems) {
      // Takes an array of jQuery elements that all currently appear at the same top position
      if ($elems.length == 1) { return; }
      if ($elems.length == 2) {
        const adjust1 = $elems[0].find(".segmentNumberInner").width();
        const adjust2 = $elems[1].find(".segmentNumberInner").width();
        $elems[0].css(side, "-=" + adjust1);
        $elems[1].css(side, "+=" + adjust2);
      }
    };
    for (let top in elemsAtPosition) {
      if (elemsAtPosition.hasOwnProperty(top)) {
        fixCollision(elemsAtPosition[top]);
      }
    }
    $text.find(".segmentNumber").show();
    $text.find(".linkCount").show();
  }
  onFootnoteClick(event) {
    event.preventDefault();
    $(event.target).closest("sup").next("i.footnote").toggle();
    this.placeSegmentNumbers();
  }
  parashahHeader(data, segment, includeAliyout=false) {
    // Returns the English/Hebrew title of a Parasha, if `ref` is the beginning of a new parahsah
    // returns null otherwise.
    //let data = this.getText();
    if (!data) { return null; }
    if ("alts" in data && data.alts.length && ((data.categories[1] == "Torah" && !data["isDependant"]) || data.categories[2] == "Onkelos")) {
      const curRef = segment.ref;
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
      title            = useShortString ? sectionStrings.en.numbered : sectionStrings.en.numbered;
      heTitle          = useShortString ? sectionStrings.he.numbered : sectionStrings.he.numbered;
    } else if (data && !this.props.basetext) {
      title            = data.ref;
      heTitle          = data.heRef;
      ref              = data.ref;
    } else if (!data) {
      title            = "Loading...";
      heTitle          = "Loading...";
      ref              = null;
    }
    const formatEnAsPoetry = data && data.formatEnAsPoetry
    const formatHeAsPoetry = data && data.formatHeAsPoetry

    const showNumberLabel =  data && data.categories 

    const showSegmentNumbers = showNumberLabel && this.props.basetext;

    // [\.\!\?\:\,\u05F4]+                                                                      # Match (and remove) one or more punctuation or gershayim
    //    (?![\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d\u05d0-\u05eA](?:[\.\!\?\:\,\u05F4\s]|$))   # So long as it's not immediately followed by one letter (followed by space, punctuation, endline, etc.)
    // |—\s;                                                                                    # OR match (and remove) an mdash followed by a space
    const punctuationre = /[\.\!\?\:\,\u05F4]+(?![\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d\u05d0-\u05eA](?:[\.\!\?\:\,\u05F4\s]|$))|—\s/g;

    const strip_punctuation_re = (this.props.settings?.language === "hebrew" || this.props.settings?.language === "bilingual") && this.props.settings?.punctuationTalmud === "punctuationOff" && data?.type === "Talmud" ? punctuationre : null;
    const nre = /[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5\u200d]/g; // cantillation
    const cnre = /[\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d]/g; // cantillation and nikud

    let strip_vowels_re = null;

    if(this.props.settings && this.props.settings.language !== "english" && this.props.settings.vowels !== "all"){
      strip_vowels_re = (this.props.settings.vowels == "partial") ? nre : cnre;
    }

    let segments      = Sefaria.makeSegments(data, this.props.withContext);
    if(segments.length > 0 && strip_vowels_re && !strip_vowels_re.test(segments[0].he)){
      strip_vowels_re = null; //if the first segment doesnt even match as containing vowels or cantillation- stop
    }
    let textSegments = segments.map((segment, i) => {
      let highlight = this.props.highlightedRefs && this.props.highlightedRefs.length ?        // if highlighted refs are explicitly set
                            Sefaria.util.inArray(segment.ref, this.props.highlightedRefs) !== -1 || // highlight if this ref is in highlighted refs prop
                            Sefaria.util.inArray(Sefaria.sectionRef(segment.ref), this.props.highlightedRefs) !== -1 : // or if the highlighted refs include a section level ref including this ref
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
          parashahHeader = (
              <div className={pclasses}>
                <ContentText text={{en: parashahNames.en, he:parashahNames.he}} defaultToInterfaceOnBilingual={true}/>
              </div>
          );
        }
      }
      segment.he = strip_vowels_re ? segment.he.replace(strip_vowels_re, "") : segment.he;
      segment.he = strip_punctuation_re ? segment.he.replace(strip_punctuation_re, "") : segment.he;

      return (
        <span className="rangeSpan" key={i + segment.ref}>
          { parashahHeader }
          <TextSegment
            sref={segment.ref}
            enLangCode={this.props.currVersions.en && /\[([a-z][a-z][a-z]?)\]$/.test(this.props.currVersions.en) ? /\[([a-z][a-z][a-z]?)\]$/.exec(this.props.currVersions.en)[1] : 'en'}
            heLangCode={this.props.currVersions.he && /\[([a-z][a-z][a-z]?)\]$/.test(this.props.currVersions.he) ? /\[([a-z][a-z][a-z]?)\]$/.exec(this.props.currVersions.he)[1] : 'he'}
            en={!this.props.useVersionLanguage || this.props.currVersions.en ? segment.en : null}
            he={!this.props.useVersionLanguage || this.props.currVersions.he ? segment.he : null}
            highlight={highlight}
            showHighlight={this.props.showHighlight}
            textHighlights={textHighlights}
            segmentNumber={showSegmentNumbers ? segment.number : 0}
            showLinkCount={this.props.basetext}
            linkCount={Sefaria.linkCount(segment.ref, this.props.filter)}
            filter={this.props.filter}
            panelPosition={this.props.panelPosition}
            onSegmentClick={this.props.onSegmentClick}
            onCitationClick={this.props.onCitationClick}
            onFootnoteClick={this.onFootnoteClick}
            onNamedEntityClick={this.props.onNamedEntityClick}
            unsetTextHighlight={this.props.unsetTextHighlight}
            formatEnAsPoetry={formatEnAsPoetry}
            formatHeAsPoetry={formatHeAsPoetry}
            placeSegmentNumbers={this.placeSegmentNumbers}
            navigatePanel={this.props.navigatePanel}
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
         heDisplayValue = Sefaria.hebrew.tibetanNumeral(enDisplayValue);
      }
      if (heDisplayValue === undefined) {
        heDisplayValue = enDisplayValue;
      }
      sidebarNum = <div className="numberLabel sans-serif itag">
        <span className="numberLabelInner">
          <ContentText text={{en:enDisplayValue, he:heDisplayValue}} defaultToInterfaceOnBilingual={true}/>
        </span>
      </div>;
    } else if (showNumberLabel && this.props.numberLabel) {
      sidebarNum = <div className="numberLabel sans-serif">
        <span className="numberLabelInner">
          <ContentText text={{en:this.props.numberLabel, he:Sefaria.hebrew.tibetanNumeral(this.props.numberLabel)}} defaultToInterfaceOnBilingual={true}/>
        </span>
      </div>;
    } else { sidebarNum = null;}
    return (
      <div className={classes} onClick={this.handleClick} onKeyPress={this.handleKeyPress} data-ref={ref}>
        {sidebarNum}
        
        {this.props.hideTitle ? null :
        (<div className="title">
          <div className="titleBox" role="heading" aria-level="2">
            { (!title.includes("data")) ?
              <ContentText text={{en: title, he: heTitle}} defaultToInterfaceOnBilingual={true}/>
              : null
            }
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
  showHighlight:          PropTypes.bool,
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
  onNamedEntityClick:     PropTypes.func,
  showBaseText:           PropTypes.func,
  unsetTextHighlight:     PropTypes.func,
  panelsOpen:             PropTypes.number, // used?
  layoutWidth:            PropTypes.number,
  showActionLinks:        PropTypes.bool,
  inlineReference:        PropTypes.object,
  textHighlights:         PropTypes.array,
  translationLanguagePreference: PropTypes.string,
  navigatePanel:          PropTypes.func
};
TextRange.defaultProps = {
  currVersions: {en:null,he:null},
};

class TextSegment extends Component {
  shouldComponentUpdate(nextProps) {
    if (this.props.highlight !== nextProps.highlight)           { return true; }
    if (this.props.showHighlight !== nextProps.showHighlight)   { return true; }
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
  handleRefLinkClick(refLink, event) {
    event.preventDefault();
    let newRef = Sefaria.humanRef(refLink.attr("data-ref"));
    const newBook = Sefaria.parseRef(newRef)?.book;
    const currBook = Sefaria.parseRef(this.props.sref)?.book;
    const isScrollLink = refLink.attr('data-scroll-link');

    // two options: in most cases, we open a new panel, but if isScrollLink is 'true', we should navigate in the same panel to the new location
    const canNavigatePanel = newBook === currBook && !!this.props.navigatePanel; // navigatePanel only works if we're scrolling to a location in the same book
    if (isScrollLink === 'true' && canNavigatePanel) {
      this.props.navigatePanel(newRef);
    }
    else {
      const ven = refLink.attr("data-ven") ? refLink.attr("data-ven") : null;
      const vhe = refLink.attr("data-vhe") ? refLink.attr("data-vhe") : null;
      let currVersions = {"en": ven, "he": vhe};
      this.props.onCitationClick(newRef, this.props.sref, true, currVersions);
    }

    event.stopPropagation();
    Sefaria.track.event("Reader", "Citation Link Click", ref);
  }
  isRefLink (x) {
    // 'x' is a jquery element
    return x?.attr('data-ref') && x?.prop('tagName') === 'A';
  }
  handleClick(event) {
    // grab refLink from target or parent (sometimes there is an <i> within refLink forcing us to look for the parent)
    const refLink = this.isRefLink($(event.target)) ? $(event.target) : this.isRefLink($(event.target.parentElement)) ? $(event.target.parentElement) : null;
    const namedEntityLink = $(event.target).closest("a.namedEntityLink");
    const footnoteLink = $(event.target).is("sup") || $(event.target).parents("sup").size();
    if (refLink) {
      //Click of citation
      this.handleRefLinkClick(refLink, event);
    } else if (footnoteLink) {
      this.props.onFootnoteClick(event);
      event.stopPropagation();
    } else if (namedEntityLink.length > 0) {
      //Click of named entity
      event.preventDefault();
      if (!this.props.onNamedEntityClick) { return; }

      let topicSlug = namedEntityLink.attr("data-slug");
      Sefaria.util.selectElementContents(namedEntityLink[0]);
      this.props.onNamedEntityClick(topicSlug, this.props.sref, namedEntityLink[0].innerText);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Named Entity Link Click", topicSlug);
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
    let $newElement = $("<div>" + text + "</div>");
    const textValue = function(i) {
      let value;
      if ($(i).attr('data-label')) {
        return $(i).attr('data-label');
      } else {
        if (lang === "he") {
          value = Sefaria.hebrew.tibetanNumeral($(i).attr('data-order'));
        }
        else if (lang === "en") {
          value = $(i).attr('data-order');
        }
      }
      if (value === undefined) {
        value = $(i).attr('data-order');
      }
      return value;
    };
    //Since our list of commentaries has titles both with single quotes and double quotes in it, because reasons, we need to escape at least one so this function doest go down in flames.
    const escapedFilter = this.props.filter[0].replace(/["]/g, '\\"'); //we know filter is defined at this point, so no need to check if its there first.
    $newElement.find(`i[data-commentator="${escapedFilter}"]`).each(function () {
      $(this).replaceWith('<sup class="itag">' + textValue(this) + "</sup>");
    });
    return $newElement.html();
  }
  wrapWordsInGenericHTMLRegex(text) {
    const arbitraryHTMLTagsRegex = '(?:<\/?[^>]+>){0,}';
    return text.replace(/(\S+)/g, `${arbitraryHTMLTagsRegex}$1${arbitraryHTMLTagsRegex}`);
  }
  addHighlights(text) {
    // for adding in highlights to query results in Reader
    if (!!this.props.textHighlights) {
      const highList = this.props.textHighlights.map(h => this.wrapWordsInGenericHTMLRegex(h));
      const reg = new RegExp(`(${highList.join("|")})`, 'g');
      return text.replace(reg, '<span class="queryTextHighlight">$1</span>');
    }
    return text;
  }

  addPoetrySpans(text) {
    const textArray = text.split("<br>").map(t => (`<span class='poetry indentWhenWrap'>${t}</span>`) ).join("<br>")
    return(textArray)
  }

  render() {
    let linkCountElement = null;
    let he = this.props.he || "";
    let en = this.props.en || "";
    // render itags
    if (this.props.filter && this.props.filter.length > 0) {
      he = this.formatItag("he", he);
      en = this.formatItag("en", en);
    }
    he = this.addHighlights(he);
    en = this.addHighlights(en);

    en = this.props.formatEnAsPoetry ? this.addPoetrySpans(en) : en
    he = this.props.formatHeAsPoetry ? this.addPoetrySpans(he) : he

    const heOnly = !this.props.en;
    const enOnly = !this.props.he;
    const overrideLanguage = (enOnly || heOnly) ? (heOnly ? "hebrew" : "english") : null;

    if (this.props.showLinkCount) {
      const linkCount = this.props.linkCount;
      const minOpacity = 20, maxOpacity = 70;
      const linkScore = linkCount ? Math.min(linkCount + minOpacity, maxOpacity) / 100.0 : 0;
      const style = {opacity: linkScore};
      linkCountElement = this.props.showLinkCount ? (
          <div className="linkCount sans-serif" title={linkCount + " Connections Available"}>
             <span className="linkCountDot" style={style}></span>
          </div>
      ) : null;
    } else {
      linkCountElement = "";
    }
    let segmentNumber = this.props.segmentNumber ? (
        <div className="segmentNumber sans-serif">
          <span className="segmentNumberInner">
             <ContentText
                 text={{"en": this.props.segmentNumber, "he": Sefaria.hebrew.tibetanNumeral(this.props.segmentNumber)}}
                 defaultToInterfaceOnBilingual={true}
             />
          </span>
        </div>
    ) : null;



    const classes=classNames({
      segment: 1,
      highlight: this.props.highlight && this.props.showHighlight,
      invisibleHighlight: this.props.highlight,
      heOnly: heOnly,
      enOnly: enOnly,
      showNamedEntityLinks: !!this.props.onNamedEntityClick,
    });
    if(!this.props.en && !this.props.he){
        return false;
    }
    return (
      <div tabIndex="0"
           className={classes} onClick={this.handleClick} onKeyPress={this.handleKeyPress}
           data-ref={this.props.sref} aria-controls={"panel-"+(this.props.panelPosition+1)}
           aria-label={"Click to see links to "+this.props.sref}>
        {segmentNumber}
        {linkCountElement}
        <p className="segmentText">
          <VersionContent overrideLanguage={overrideLanguage} html={{"he": he+ " ", "en": en+ " " }} bilingualOrder={["he", "en"]} imageLoadCallback={this.props.placeSegmentNumbers}/>
        </p>

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
  showHighlight:   PropTypes.bool,
  textHighlights:  PropTypes.array,
  segmentNumber:   PropTypes.number,
  showLinkCount:   PropTypes.bool,
  linkCount:       PropTypes.number,
  filter:          PropTypes.array,
  onCitationClick: PropTypes.func,
  onSegmentClick:  PropTypes.func,
  onFootnoteClick: PropTypes.func,
  onNamedEntityClick: PropTypes.func,
  unsetTextHighlight: PropTypes.func,
  navigatePanel: PropTypes.func
};

export default TextRange;
