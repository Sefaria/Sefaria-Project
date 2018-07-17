const {
  LoadingMessage,
}                = require('./Misc');
const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
import Component      from 'react-class';


class LexiconBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
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
    } else if (this.props.selectedWords != nextProps.selectedWords) {
      this.clearLookups();
      this.getLookups(nextProps.selectedWords, nextProps.oref);
    }
  }
  clearLookups() {
    this.setState({
      loaded: false,
      entries: []
    });
  }
  getLookups(words, oref) {
    if(this.shouldActivate(words)){
      // console.log('getting data: ', words, oref.ref);
      Sefaria.lexicon(words, oref.ref, function(data) {
        this.setState({
          loaded: true,
          entries: data
        });

        var action = (data.length == 0)? "Open No Result": "Open";
        action += " / " + oref.categories.join("/") + "/" + oref.book;
        Sefaria.track.event("Lexicon", action, words);

        // console.log('gotten data from Sefaria.js, state re-set: ', this, data);
      }.bind(this));
    }
  }
  shouldActivate(selectedWords){
    if(selectedWords && selectedWords.match(/[\s:\u0590-\u05ff.]+/)) {
      var wordList = selectedWords.split(/[\s:\u05c3\u05be\u05c0.]+/);
      var inputLength = wordList.length;
      return (inputLength <= 3);
    } else {
        return null;
    }
  }
  render() {
    if (!this.props.selectedWords) {
      return (
        <div className="lexicon-instructions">
          <span className="int-en">Highlight words to look up definitions.</span>
          <span className="int-he">סמן מילים כדי לחפש הגדרות</span>
        </div>);
    }

    var refCats = this.props.oref.categories.join(", "); //TODO: the way to filter by categories is very limiting.
    var enEmpty = 'No definitions found for "' + this.props.selectedWords + '".';
    var heEmpty = 'לא נמצאו תוצאות "' + this.props.selectedWords + '".';
    if(!this.shouldActivate(this.props.selectedWords)){
      //console.log("not rendering lexicon");
      return false;
    }
    var content;
    if(!this.state.loaded) {
      // console.log("lexicon not yet loaded");
      content = (<LoadingMessage message="Looking up words..." heMessage="מחפש מילים..."/>);
    } else if(this.state.entries.length == 0) {
      if (this.props.selectedWords.length == 0) {
        //console.log("empty words: nothing to render");
        return false;
      } else {
        //console.log("no results");
        content = (<LoadingMessage message={enEmpty} heMessage={heEmpty}/>);
      }
    }else{
      var entries = this.state.entries;
      content =  entries.filter(e => e['parent_lexicon_details']['text_categories'].length == 0 || e['parent_lexicon_details']['text_categories'].indexOf(refCats) > -1).map(function(entry, i) {
            return (<LexiconEntry data={entry} key={i} />)
          });
      content = content.length ? content : <LoadingMessage message={enEmpty} heMessage={heEmpty} />;
    }
    return (
        <div className="lexicon-content">
          <div className="lexicon-results">
            { content }
          </div>
        </div>
      );
  }
}
LexiconBox.propTypes = {
  selectedWords: PropTypes.string,
  oref:          PropTypes.object
};


class LexiconEntry extends Component {
  renderLexiconEntrySenses(content) {
    var grammar     = ('grammar' in content) ? '('+ content['grammar']['verbal_stem'] + ')' : "";
    var def         = ('definition' in content) ? (<span className="def"  dangerouslySetInnerHTML={ {__html: content['definition']}}></span>) : "";
    var notes       = ('notes' in content) ? (<span className="notes" dangerouslySetInnerHTML={ {__html: content['notes']}}></span>) : "";
    var sensesElems = ('senses' in content) ? content['senses'].map((sense, i) => {
      return <div key={i}>{this.renderLexiconEntrySenses(sense)}</div>;
    }) : "";
    var senses = sensesElems.length ? (<ol className="senses">{sensesElems}</ol>) : "";
    return (
      <li className="sense">
        {grammar}
        {def}
        {notes}
        {senses}
      </li>
    );
  }
  renderLexiconAttribution () {
    var entry = this.props.data;
		var lexicon_dtls = entry['parent_lexicon_details'];
        return (
            <div>
                <span>
                  <a target="_blank"
                      href={('source_url' in lexicon_dtls) ? lexicon_dtls['source_url'] : ""}>
                    <span className="int-en">Source: </span>
                    <span className="int-he">מקור:</span>
                    {'source' in lexicon_dtls ? lexicon_dtls['source'] : lexicon_dtls['source_url']}
                  </a>
                </span>
                <span>
                  <a target="_blank"
                      href={('attribution_url' in lexicon_dtls) ? lexicon_dtls['attribution_url'] : ""}>
                    <span className="int-en">Creator: </span>
                    <span className="int-he">יוצר:</span>
                    {'attribution' in lexicon_dtls ? lexicon_dtls['attribution'] : lexicon_dtls['attribution_url']}
                  </a>
                </span>
            </div>
        );
  }
  render() {
    var entry = this.props.data;
    var headwordClassNames = classNames('headword', entry['parent_lexicon_details']["to_language"].slice(0,2));
    var definitionClassNames = classNames('definition-content', entry['parent_lexicon_details']["to_language"].slice(0,2));
    var entryHeadHtml =  (<span className="headword">{entry['headword']}</span>);
    var morphologyHtml = ('morphology' in entry['content']) ?  (<span className="morphology">({entry['content']['morphology']})</span>) :"";
    var senses = this.renderLexiconEntrySenses(entry['content']);
    var attribution = this.renderLexiconAttribution();
    return (
        <div className="entry">
          <div className={headwordClassNames}>{entryHeadHtml}{altHeadHtml}</div>
          <div className={definitionClassNames}>{morphologyHtml}<ol className="definition">{senses}</ol></div>
          <div className="attribution">{attribution}</div>
        </div>
    );
  }
}
LexiconEntry.propTypes = {
  data: PropTypes.object.isRequired
};


module.exports = LexiconBox;
