const {
  LoadingMessage,
}                = require('./Misc');
const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
const DictionarySearch = require('./DictionarySearch');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
import Component      from 'react-class';


class LexiconBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchedWord: null,   // This is used only to counteract the influence of a ref, currently, but should really be show in the search box after search, and bubble up to state.
      entries: [],
      loaded: false
    };
  }
  componentDidMount() {
    if(this.props.selectedWords){
      this.getLookups(this.props.selectedWords, this.props.oref);
    }
  }
  componentWillReceiveProps(nextProps) {
    // console.log("component will receive props: ", nextProps.selectedWords);
    if (!nextProps.selectedWords) {
      this.clearLookups();
    } else if (this.props.selectedWords !== nextProps.selectedWords) {
      this.clearLookups();
      this.getLookups(nextProps.selectedWords, nextProps.oref);
    }
  }
  clearLookups() {
    this.setState({
      searchedWord: null,
      loaded: false,
      entries: []
    });
  }
  searchWord(word) {
    this.clearLookups();
    this.setState({searchedWord: word});
    this.getLookups(word);
  }
  getLookups(words, oref) {
    if(this.shouldActivate(words)) {
      let ref = oref ? oref.ref : undefined;
      // console.log('getting data: ', words, oref.ref);
      Sefaria.getLexiconWords(words, ref).then(data => {
        this.setState({
          loaded: true,
          entries: data
        });

        let action = (data.length === 0)? "Open No Result": "Open";
        action += oref ? " / " + oref.categories.join("/") + "/" + oref.book : "";
        Sefaria.track.event("Lexicon", action, words);

        // console.log('gotten data from Sefaria.js, state re-set: ', this, data);
      });
    }
  }
  shouldActivate(selectedWords){
    if (this.state.searchedWord) {
      return true;
    }
    if(selectedWords && selectedWords.match(/[\s:\u0590-\u05ff.]+/)) {
      const wordList = selectedWords.split(/[\s:\u05c3\u05be\u05c0.]+/);
      const inputLength = wordList.length;
      return (inputLength <= 3);
    } else {
        return null;
    }
  }
  render() {
  /*
    if (!this.props.selectedWords) {
      return (
        <div className="lexicon-instructions">
          <span className="int-en">Highlight words to look up definitions.</span>
          <span className="int-he">סמן מילים כדי לחפש הגדרות</span>
        </div>);
    }
  */

    const refCats = (this.props.oref && (!this.state.searchedWord)) ? this.props.oref.categories.join(", ") : null; //TODO: the way to filter by categories is very limiting.
    const enEmpty = 'No definitions found for "' + this.props.selectedWords + '".';
    const heEmpty = 'לא נמצאו תוצאות "' + this.props.selectedWords + '".';
    let content = "";

    if(this.shouldActivate(this.props.selectedWords)) {
      if(!this.state.loaded) {
          // console.log("lexicon not yet loaded");
          content = (<LoadingMessage message="Looking up words..." heMessage="מחפש מילים..."/>);
      } else if(this.state.entries.length === 0) {
          if (this.props.selectedWords.length > 0) {
            content = (<LoadingMessage message={enEmpty} heMessage={heEmpty}/>);
          }
      } else {
          let entries = this.state.entries;
          content =  entries.filter(e => (!refCats) || e['parent_lexicon_details']['text_categories'].length === 0 || e['parent_lexicon_details']['text_categories'].indexOf(refCats) > -1).map(function(entry, i) {
                return (<LexiconEntry
                    data={entry}
                    onEntryClick={this.props.onEntryClick}
                    onCitationClick={this.props.onCitationClick}
                    key={i} />)
              }.bind(this));
          content = content.length ? content : <LoadingMessage message={enEmpty} heMessage={heEmpty} />;
      }
    }

    return (
        <div className="lexicon-content">
         <DictionarySearch
              interfaceLang={this.props.interfaceLang}
              showWordList={this.searchWord}
              contextSelector=".lexicon-content"/>
          <div className="lexicon-results">
            { content }
          </div>
        </div>
      );
  }
}
LexiconBox.propTypes = {
  interfaceLang:    PropTypes.string.isRequired,
  selectedWords: PropTypes.string,
  oref:          PropTypes.object,
  onEntryClick:  PropTypes.func,
  onCitationClick: PropTypes.func
};


class LexiconEntry extends Component {
  renderLexiconEntrySenses(content) {
    var grammar     = ('grammar' in content) ? '('+ content['grammar']['verbal_stem'] + ')' : "";
    var def         = ('definition' in content) ? (<span className="def"  dangerouslySetInnerHTML={ {__html: content['definition']}}></span>) : "";
    var alternative = ('alternative' in content) ? (<span className="alternative"  dangerouslySetInnerHTML={ {__html: content['alternative']}}></span>) : "";
    var notes       = ('notes' in content) ? (<span className="notes" dangerouslySetInnerHTML={ {__html: content['notes']}}></span>) : "";
    var sensesElems = ('senses' in content) ? content['senses'].map((sense, i) => {
      return <div key={i}>{this.renderLexiconEntrySenses(sense)}</div>;
    }) : "";
    var senses = sensesElems.length ? (<ol className="senses">{sensesElems}</ol>) : "";
    return (
      <li className="sense">
        {grammar}
        {def}
        {alternative}
        {notes}
        {senses}
      </li>
    );
  }
  getRef() {
    var ind = this.props.data.parent_lexicon_details.index_title;
    return ind ? `${ind}, ${this.props.data.headword}`: "";

  }
  handleClick(event) {
    if ($(event.target).hasClass("refLink")) {
        //Click of citation
        event.preventDefault();
        let ref = Sefaria.humanRef($(event.target).attr("data-ref"));
        this.props.onCitationClick(ref, this.props.sref);
        event.stopPropagation();
        Sefaria.track.event("Reader", "Citation Link Click", ref);
    } else if (this.props.onEntryClick) {
      //Click on the body of the TextRange itself from TextList
      this.props.onEntryClick(this.getRef());
      Sefaria.track.event("Reader", "Click Dictionary Entry from Lookup", this.getRef());
    }
  }
  handleKeyPress(event) {
    if (event.charCode == 13) {
      this.handleClick(event);
    }
  }
  renderLexiconAttribution () {
    var entry = this.props.data;
    var lexicon_dtls = entry['parent_lexicon_details'];

    var sourceContent = <div>
      <span className="int-en">Source: </span>
      <span className="int-he">מקור:</span>
      {'source' in lexicon_dtls ? lexicon_dtls['source'] : lexicon_dtls['source_url']}
    </div>;

    var attributionContent = <div>
      <span className="int-en">Creator: </span>
      <span className="int-he">יוצר:</span>
      {'attribution' in lexicon_dtls ? lexicon_dtls['attribution'] : lexicon_dtls['attribution_url']}
    </div>;

    return (
        <div>
          {('source_url' in lexicon_dtls) ?
            <a target="_blank" href={ lexicon_dtls['source_url'] }>{sourceContent}</a> :
            sourceContent}
          {('attribution_url' in lexicon_dtls) ?
            <a target="_blank" href={ lexicon_dtls['attribution_url'] }>{attributionContent}</a> :
            attributionContent}
        </div>
    );
  }
  render() {
    var entry = this.props.data;
    var headwordClassNames = classNames('headword', entry['parent_lexicon_details']["to_language"].slice(0,2));
    var definitionClassNames = classNames('definition-content', entry['parent_lexicon_details']["to_language"].slice(0,2));

    var headwords = [entry['headword']];
    if ('alt_headwords' in entry) {
      headwords = headwords.concat(entry['alt_headwords']);
    }

    var morphologyHtml = ('morphology' in entry['content']) ?  (<span className="morphology">&nbsp;({entry['content']['morphology']})</span>) :"";

    var langHtml = "";
    if ('language_code' in entry || 'language_reference' in entry) {
      langHtml = (<span className="lang-ref">&nbsp;
        {('language_code' in entry) ? entry['language_code'] : ""}
        {('language_reference' in entry) ? <span className="language_reference" dangerouslySetInnerHTML={ {__html: entry['language_reference']}}></span> : ""}
      </span>);
    }

    var entryHeadHtml = (<span className="headline" dir="ltr">
      {headwords
          .map((e,i) => <span className="headword" key={i} dir="rtl">{e}</span>)
          .reduce((prev, curr) => [prev, ', ', curr])}
      {morphologyHtml}
      {langHtml}
      </span>);

    var endnotes = ('notes' in entry) ? <span className="notes" dangerouslySetInnerHTML={ {__html: entry['notes']}}></span> : "";
    var derivatives = ('derivatives' in entry) ? <span className="derivatives" dangerouslySetInnerHTML={ {__html: entry['derivatives']}}></span> : "";

    var senses = this.renderLexiconEntrySenses(entry['content']);
    var attribution = this.renderLexiconAttribution();
    return (
        <div className="entry" onClick={this.handleClick} onKeyPress={this.handleKeyPress} data-ref={this.getRef()}>
          <div className={headwordClassNames}>{entryHeadHtml}</div>
          <div className={definitionClassNames}><ol className="definition">{senses}{endnotes}{derivatives}</ol></div>
          <div className="attribution">{attribution}</div>
        </div>
    );
  }
}
LexiconEntry.propTypes = {
  data: PropTypes.object.isRequired,
  onEntryClick:  PropTypes.func,
  onCitationClick: PropTypes.func
};


module.exports = LexiconBox;
