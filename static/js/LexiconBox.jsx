import {
  InterfaceText,
  LoadingMessage,
  ToolTipped,
} from './Misc';
import React  from 'react';
import Sefaria  from './sefaria/sefaria';
import DictionarySearch  from './DictionarySearch';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
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
    if (this.props.selectedNamedEntity) {
      this.getNamedEntity(this.props.selectedNamedEntity);
    } else if (this.props.selectedWords){
      this.getLookups(this.props.selectedWords, this.props.oref);
    } 
  }
  componentDidUpdate(prevProps, prevState) {
    if (this.props.selectedWords && this.props.selectedWords !== prevProps.selectedWords) {
      this.clearLookups();
      this.props.clearNamedEntity();
      this.getLookups(this.props.selectedWords, this.props.oref);
    } else if (this.props.selectedNamedEntity && this.props.selectedNamedEntity !== prevProps.selectedNamedEntity) {
      this.clearLookups();
      this.props.clearSelectedWords();
      this.getNamedEntity(this.props.selectedNamedEntity);
    }
  }
  clearLookups() {
    this.setState({
      searchedWord: null,
      namedEntity: null,
      loaded: false,
      entries: []
    });
  }
  searchWord(word) {
    this.clearLookups();
    this.props.clearNamedEntity();
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

  getNamedEntity(slug) {
    Sefaria.getTopic(slug, {annotated: false}).then(data => {
      this.setState({
        loaded: true,
        namedEntity: data,
      });
    })
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
    if (!!this.props.selectedNamedEntity) {
      if (!this.state.loaded || !this.state.namedEntity) {
        // not sure why I also need to check for this.state.namedEntity but I've seen situations where loaded is true and namedEntity is null
        content = (<LoadingMessage message="Looking up words..." heMessage="מחפש מילים..."/>);
      } else {
          // TODO. remove hard-coding
          let dataSourceText = "";
          if (this.props.srefs[0].indexOf("Jerusalem Talmud") !== -1) {
            dataSourceText = `${Sefaria._('This topic is connected to ')}"${Sefaria._r(this.props.srefs[0])}" ${Sefaria._('by')} ${Sefaria._('Sefaria')}.`;
          } else {
            dataSourceText = `${Sefaria._('This topic is connected to ')}"${Sefaria._r(this.props.srefs[0])}" ${Sefaria._('based on')} ${Sefaria._('research of Dr. Michael Sperling')}.`;
          }
          
          const neArray = this.state.namedEntity.possibilities || [this.state.namedEntity]; 
          const namedEntityContent = neArray.map(ne => (<div key={ne.slug} className="named-entity-wrapper">
            <div className="named-entity-title-bar">
              <a className="contentText topicLexiconTitle" href={`/topics/${ne.slug}`} target="_blank">
                <span className="en">{ne.primaryTitle.en}</span>
                <span className="he">{ne.primaryTitle.he}</span>
              </a>
              <ToolTipped altText={dataSourceText} classes={"saveButton tooltip-toggle three-dots-button"}>
                <img src="/static/img/three-dots.svg" alt={dataSourceText}/>
              </ToolTipped>
            </div>
            {
              ne.timePeriod ? (
                <div className="named-entity-time-period">
                  <div className="smallText">
                    <span className="int-en">{ne.timePeriod.name.en}</span>
                    <span className="int-he">{ne.timePeriod.name.he}</span>
                  </div>
                  <div className="smallText">
                    <span className="int-en">{ne.timePeriod.yearRange.en}</span>
                    <span className="int-he">{ne.timePeriod.yearRange.he}</span>
                  </div>
                </div>
              ) : null
            }
            <div className="contentText named-entity-description">
              <InterfaceText markdown={{en: ne.description ? ne.description.en : `No description known for '${ne.primaryTitle.en}'`,
                                        he: ne.description ? ne.description.he : `לא קיים מידע עבור '${ne.primaryTitle.he}'`}} />
            </div>
          </div>));
          content = (!!this.state.namedEntity.possibilities ? (
            <div>
              <div className="named-entity-ambiguous">
                <i className="systemText">
                  <span className="int-en">{`"${this.props.selectedNamedEntityText}" could refer to one of the following:`}</span>
                  <span className="int-he">{`ייתכן ש-"${this.props.selectedNamedEntityText}" מתייחס לאחד מהבאים:`}</span>
                </i>
              </div>
              { namedEntityContent }
            </div>
          ) : namedEntityContent);
      }
    } else if(this.shouldActivate(this.props.selectedWords)) {
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
  srefs:         PropTypes.array,
  onEntryClick:  PropTypes.func,
  onCitationClick: PropTypes.func
};


class LexiconEntry extends Component {
  isBDB(entry) {
    return RegExp(/^BDB.*?Dict/).test(entry['parent_lexicon']);
  }
  defaultHeadwordString(entry) {
    let headwords = [entry['headword']];
    if ('alt_headwords' in entry) {
      headwords = headwords.concat(entry['alt_headwords']);
    }
    return headwords
          .map((e,i) => <span className="headword" key={i} dir="rtl">{e}</span>)
          .reduce((prev, curr) => [prev, ', ', curr]);
  }
  bdbHeadwordString(entry) {
    const peculiar = entry.peculiar ? '‡ ' : '';
    const allCited = entry.all_cited ? '† ' : '';
    const ordinal = entry.ordinal ? `${entry["ordinal"]} ` : '';
    const hw = (<span dir="rtl">{entry['headword'].replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]*$/, '')}</span>);
    const occurrences = entry.occurrence ? (<sub>{entry['occurrences']}</sub>) : '';
    const alts = entry.alt_headwords ? entry['alt_headwords']
        .map(alt => {
            const ahw = <span dir="rtl">{alt['word']}</span>;
            const aocc = ('occurrences' in alt) ? <sub>{alt['occurrences']}</sub> : '';
          return <span>, {ahw}{aocc}</span>
        })
        .reduce((prev, curr) => [prev, curr]) : '';
    const allHeadwords = entry.headword_suffix ? <span>[{hw}<span className="headword-suffix" dangerouslySetInnerHTML={ {__html: entry['headword_suffix']}} />]{occurrences}</span>:
        (entry['brackets'] == 'all') ? <span>[{hw}{occurrences}{alts}]</span> :
        (entry['brackets'] == 'first_word') ? <span>[{hw}{occurrences}]{alts}</span> :
            <span>{hw}{occurrences}{alts}</span>;
    return (<span className="headword">{peculiar}{allCited}{ordinal}<span className="headword">{allHeadwords}</span></span>);
  }
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
  renderBDBEntrySenses(content) {
    const note = content.note ? <em>Note.</em> : '';
    const preNun = content.pre_num || '';
    const allCited = content.all_cited ? '†' : '';
    const num = content.num || '';
    const form = content.form || '';
    const occurrences = content.occurrences || '';
    const def = content.definition || '';
    if (content.definition) {
      const text = `${note} ${preNun} ${allCited}<b>${num}${form}</b><sub>${occurrences}</sub> ${def}`;
      return (
      <span className="def"  dangerouslySetInnerHTML={ {__html: text}}></span>);
    }
    const pre = `${note} ${preNun} ${allCited}`
    const sensesElems = content.senses ? content.senses.map((sense, i) => {
      return <div>{i==0 && pre}{i==0 && <b>{num}{form}</b>}{i==0 && <sub>{occurrences}</sub>}{this.renderBDBEntrySenses(sense)}</div>;
    }) : "";
    const senses = sensesElems.length ? (<div>{sensesElems}</div>) : "";
    return (<div>{senses}</div>);
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
      <span className="int-he">מקור: </span>
      {'source' in lexicon_dtls ? lexicon_dtls['source'] : lexicon_dtls['source_url']}
    </div>;

    var attributionContent = <div>
      <span className="int-en">Creator: </span>
      <span className="int-he">יוצר: </span>
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

    var headwordString = this.isBDB(entry) ? this.bdbHeadwordString(entry) : this.defaultHeadwordString(entry)

    var morphologyHtml = ('morphology' in entry['content']) ?  (<span className="morphology">&nbsp;({entry['content']['morphology']})</span>) :"";

    var langHtml = "";
    if ('language_code' in entry || 'language_reference' in entry) {
      langHtml = (<span className="lang-ref">&nbsp;
        {('language_code' in entry) ? entry['language_code'] : ""}
        {('language_reference' in entry) ? <span className="language_reference" dangerouslySetInnerHTML={ {__html: entry['language_reference']}}></span> : ""}
      </span>);
    }

    var entryHeadHtml = (<span className="headline" dir="ltr">
      {headwordString}
      {morphologyHtml}
      {langHtml}
      </span>);

    var endnotes = ('notes' in entry) ? <span className="notes" dangerouslySetInnerHTML={ {__html: entry['notes']}}></span> : "";
    var derivatives = ('derivatives' in entry) ? <span className="derivatives" dangerouslySetInnerHTML={ {__html: entry['derivatives']}}></span> : "";

    var senses = this.isBDB(entry) ?  this.renderBDBEntrySenses(entry['content'])
        : this.renderLexiconEntrySenses(entry['content']);
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


export default LexiconBox;
