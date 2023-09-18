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
import {getVersions} from "./sefaria/textManager";
import {useState, useEffect} from "react";

const TextRange = (props) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const data = await getVersions(props.sref, { language: 'he', versionTitle: 'base' }, { language: 'en', versionTitle: 'base' }, null);
      setData(data);
    };

    fetchData();
  }, [props.sref, props.currVersions, props.translationLanguagePreference]);

  const handleClick = (event) => {
    if (window.getSelection().type === "Range") {
      // Don't do anything if this click is part of a selection
      return;
    }
    if (props.onRangeClick) {
      //Click on the body of the TextRange itself from TextList
      props.onRangeClick(props.sref);
      Sefaria.track.event("Reader", "Click Text from TextList", props.sref);
    }
  };

  const handleKeyPress = (event) => {
    if (event.charCode === 13) {
      handleClick(event);
    }
  };

  const placeSegmentNumbers = () => {
    // console.log("placeSegmentNumbers", props.sref);
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    if (!props.basetext) { return; }

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

    const side = props.settings.language == "hebrew" ? "right" : "left";
    const selector = props.settings.language == "hebrew" ? ".he" : ".en";
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
  };

  const onFootnoteClick = (event) => {
    event.preventDefault();
    $(event.target).closest("sup").next("i.footnote").toggle();
    placeSegmentNumbers();
  };

  const renderParashahHeader = (data, segment, includeAliyout = false) => {
    // Returns the English/Hebrew title of a Parasha, if `ref` is the beginning of a new parahsah
    // returns null otherwise.
    //let data = getText();
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
  };

    
  let title, heTitle, ref;
  if (data && props.basetext) {
    ref              = props.withContext ? data.sectionRef : data.ref;
    const sectionStrings   = Sefaria.sectionStringFromData(ref, data);
    const oref             = Sefaria.ref(ref);
    const useShortString   = oref && Sefaria.util.inArray(oref.primary_category, ["Tanakh", "Mishnah", "Talmud", "Tanaitic", "Commentary"]) !== -1;
    title            = useShortString ? sectionStrings.en.numbered : sectionStrings.en.named;
    heTitle          = useShortString ? sectionStrings.he.numbered : sectionStrings.he.named;
  } else if (data && !props.basetext) {
    title            = data.ref;
    heTitle          = data.heRef;
    ref              = data.ref;
  } else if (!data) {
    title            = "Loading...";
    heTitle          = "טעינה...";
    ref              = null;
  }
  const formatEnAsPoetry = data && data.formatEnAsPoetry
  const formatHeAsPoetry = data && data.formatHeAsPoetry

  const showNumberLabel =  data && data.categories &&
  data.categories[0] !== "Liturgy" &&
  data.categories[0] !== "Reference";

  const showSegmentNumbers = showNumberLabel && props.basetext;

  // [\.\!\?\:\,\u05F4]+                                                                      # Match (and remove) one or more punctuation or gershayim
  //    (?![\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d\u05d0-\u05eA](?:[\.\!\?\:\,\u05F4\s]|$))   # So long as it's not immediately followed by one letter (followed by space, punctuation, endline, etc.)
  // |—\s;                                                                                    # OR match (and remove) an mdash followed by a space
  const punctuationre = /[\.\!\?\:\,\u05F4]+(?![\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d\u05d0-\u05eA](?:[\.\!\?\:\,\u05F4\s]|$))|—\s/g;

  const strip_punctuation_re = (props.settings?.language === "hebrew" || props.settings?.language === "bilingual") && props.settings?.punctuationTalmud === "punctuationOff" && data?.type === "Talmud" ? punctuationre : null;
  const nre = /[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5\u200d]/g; // cantillation
  const cnre = /[\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d]/g; // cantillation and nikud

  let strip_vowels_re = null;

  if(props.settings && props.settings.language !== "english" && props.settings.vowels !== "all"){
    strip_vowels_re = (props.settings.vowels == "partial") ? nre : cnre;
  }

  let segments      = Sefaria.makeSegmentsV3(data, props.withContext);
  if(segments.length > 0 && strip_vowels_re && !strip_vowels_re.test(segments[0].he)){
    strip_vowels_re = null; //if the first segment doesnt even match as containing vowels or cantillation- stop
  }
  let textSegments = segments.map((segment, i) => {
    let highlight = props.highlightedRefs && props.highlightedRefs.length ?        // if highlighted refs are explicitly set
                          Sefaria.util.inArray(segment.ref, props.highlightedRefs) !== -1 || // highlight if this ref is in highlighted refs prop
                          Sefaria.util.inArray(Sefaria.sectionRef(segment.ref), props.highlightedRefs) !== -1 : // or if the highlighted refs include a section level ref including this ref
                          props.basetext && segment.highlight;  // otherwise highlight if this a basetext and the ref is specific
    const textHighlights = (highlight || !props.basetext) && !!props.textHighlights ? props.textHighlights : null; // apply textHighlights in a base text only when the segment is hightlights
    let parashahHeader = null;
      if (props.showParashahHeaders) {
      const parashahNames = renderParashahHeader(data, segment, (props.settings.aliyotTorah == 'aliyotOn'));
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
    segment.source = strip_vowels_re ? segment.source.replace(strip_vowels_re, "") : segment.source;
    segment.source = strip_punctuation_re ? segment.source.replace(strip_punctuation_re, "") : segment.source;

    return (
      <span className="rangeSpan" key={i + segment.ref}>
        { parashahHeader }
        <TextSegment
          sref={segment.ref}
          enLangCode={props.currVersions.en && /\[([a-z][a-z][a-z]?)\]$/.test(props.currVersions.en) ? /\[([a-z][a-z][a-z]?)\]$/.exec(props.currVersions.en)[1] : 'en'}
          heLangCode={props.currVersions.he && /\[([a-z][a-z][a-z]?)\]$/.test(props.currVersions.he) ? /\[([a-z][a-z][a-z]?)\]$/.exec(props.currVersions.he)[1] : 'he'}
          en={!props.useVersionLanguage || props.currVersions.en ? segment.translation : null}
          he={!props.useVersionLanguage || props.currVersions.he ? segment.source : null}
          highlight={highlight}
          showHighlight={props.showHighlight}
          textHighlights={textHighlights}
          segmentNumber={showSegmentNumbers ? segment.number : 0}
          showLinkCount={props.basetext}
          linkCount={Sefaria.linkCount(segment.ref, props.filter)}
          filter={props.filter}
          panelPosition={props.panelPosition}
          onSegmentClick={props.onSegmentClick}
          onCitationClick={props.onCitationClick}
          onFootnoteClick={onFootnoteClick}
          onNamedEntityClick={props.onNamedEntityClick}
          unsetTextHighlight={props.unsetTextHighlight}
          formatEnAsPoetry={formatEnAsPoetry}
          formatHeAsPoetry={formatHeAsPoetry}
          placeSegmentNumbers={placeSegmentNumbers}
        />
      </span>
    );
  });
  textSegments = textSegments.length ? textSegments : null;

  const classes = classNames({
                    textRange: 1,
                    basetext: props.basetext,
                    loading: !data,
                    lowlight: props.lowlight
                });

  // configure number display for inline references
  let sidebarNum;
  const displaySidebarNumber = (props.inlineReference &&
      props.inlineReference['data-commentator'] === Sefaria.index(Sefaria.parseRef(props.sref).index).collectiveTitle);
  if (displaySidebarNumber) {
    let enDisplayValue, heDisplayValue;
    if (props.inlineReference['data-label']) {
       enDisplayValue = props.inlineReference['data-label'];
       heDisplayValue = props.inlineReference['data-label'];
    }
    else {
       enDisplayValue = props.inlineReference['data-order'];
       heDisplayValue = Sefaria.hebrew.encodeHebrewNumeral(enDisplayValue);
    }
    if (heDisplayValue === undefined) {
      heDisplayValue = enDisplayValue;
    }
    sidebarNum = <div className="numberLabel sans-serif itag">
      <span className="numberLabelInner">
        <ContentText text={{en:enDisplayValue, he:heDisplayValue}} defaultToInterfaceOnBilingual={true}/>
      </span>
    </div>;
  } else if (showNumberLabel && props.numberLabel) {
    sidebarNum = <div className="numberLabel sans-serif">
      <span className="numberLabelInner">
        <ContentText text={{en:props.numberLabel, he:Sefaria.hebrew.encodeHebrewNumeral(props.numberLabel)}} defaultToInterfaceOnBilingual={true}/>
      </span>
    </div>;
  } else { sidebarNum = null;}
  return (
    <div className={classes} onClick={handleClick} onKeyPress={handleKeyPress} data-ref={ref}>
      {sidebarNum}
      {props.hideTitle ? null :
      (<div className="title">
        <div className="titleBox" role="heading" aria-level="2">
          <ContentText text={{en: title, he: heTitle}} defaultToInterfaceOnBilingual={true}/>
        </div>
        {props.titleButtons ? <div className="buttons" onClick={e => e.stopPropagation()}>{props.titleButtons}</div> : null }
      </div>)}
      <div className="text">
        <div className="textInner">
          { textSegments }
          { props.showActionLinks ? actionLinks : null }
        </div>
      </div>
    </div>
  );
};

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
  handleClick(event) {
    // grab refLink from target or parent (sometimes there is an <i> within refLink forcing us to look for the parent)
    const refLink = $(event.target).hasClass("refLink") ? $(event.target) : ($(event.target.parentElement).hasClass("refLink") ? $(event.target.parentElement) : null);
    const namedEntityLink = $(event.target).closest("a.namedEntityLink");
    const footnoteLink = $(event.target).is("sup") || $(event.target).parents("sup").size();
    if (refLink) {
      //Click of citation
      event.preventDefault();
      let ref = Sefaria.humanRef(refLink.attr("data-ref"));
      const ven = refLink.attr("data-ven") ? refLink.attr("data-ven") : null;
      const vhe = refLink.attr("data-vhe") ? refLink.attr("data-vhe") : null;
      let currVersions = {"en": ven, "he": vhe};
      this.props.onCitationClick(ref, this.props.sref, true, currVersions);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Citation Link Click", ref);
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
          value = Sefaria.hebrew.encodeHebrewNumeral($(i).attr('data-order'));
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
                 text={{"en": this.props.segmentNumber, "he": Sefaria.hebrew.encodeHebrewNumeral(this.props.segmentNumber)}}
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
};

export default TextRange;