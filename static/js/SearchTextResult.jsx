const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
const classNames = require('classnames');
import Component      from 'react-class';


class SearchTextResult extends Component {
    constructor(props) {
        super(props);

        this.state = {
            duplicatesShown: false
        };
    }
    toggleDuplicates(event) {
        this.setState({
            duplicatesShown: !this.state.duplicatesShown
        });
    }
    getHighlights() {
      const highlights = [];
      const highlightReg = /<b>([^<]+)<\/b>/g;
      if (this.props.data.highlight) {
        const vals = Object.values(this.props.data.highlight);
        if (vals.length > 0) {
          // vals should have only one entry. either 'naive_lemmatizer' or 'exact'
          for (let h of vals[0]) {
            let matches = null;
            while ((matches = highlightReg.exec(h)) !== null) {
                highlights.push(matches[1]);
            }
          }
        }
      }
      return highlights;
    }
    handleResultClick(event) {
        if(this.props.onResultClick) {
            event.preventDefault();
            const s = this.props.data._source;
            const textHighlights = this.getHighlights();
            console.log(textHighlights);
            Sefaria.track.event("Search", "Search Result Text Click", `${this.props.query} - ${s.ref}/${s.version}/${s.lang}`);
            this.props.onResultClick(s.ref, {[s.lang]: s.version}, { textHighlights });
        }
    }
    get_snippet_markup(data) {
        var snippet;
        var field;
        if (data.highlight) {
          field = Object.keys(data.highlight)[0]; //there should only be one key
          snippet = data.highlight[field].join("...");
        } else {
          field = "exact";
          snippet = data._source[field];
        }
        // if (data.highlight && data.highlight[field]) {

        // } else {
        //     snippet = s[field];  // We're filtering out content, because it's *huge*, especially on Sheets
        // }
        const lang = Sefaria.hebrew.isHebrew(snippet) ? "he" : "en";
        snippet = snippet.replace(/^[ .,;:!-)\]]+/, "");
        return { markup:{__html:snippet}, lang };
    }
    render () {
        var data = this.props.data;
        var s = this.props.data._source;
        const href = `/${Sefaria.normRef(s.ref)}?v${s.lang}=${s.version.replace(/ /g, "_")}&qh=${this.props.query}`;

        const more_results_caret =
            (this.state.duplicatesShown)
            ? <i className="fa fa-caret-down fa-angle-down"></i>
            : <i className="fa fa-caret-down"></i>;

        const more_results_indicator = (!(data.duplicates)) ? "" :
                <div className='similar-trigger-box' onClick={this.toggleDuplicates}>
                    <span className='similar-title int-he'>
                        { data.duplicates.length } {(data.duplicates.length > 1) ? " גרסאות נוספות" : " גרסה נוספת"}
                    </span>
                    <span className='similar-title int-en'>
                        { data.duplicates.length } more version{(data.duplicates.length > 1) ? "s" : null}
                    </span>
                    {more_results_caret}
                </div>;

        const shown_duplicates = (data.duplicates && this.state.duplicatesShown) ?
            (<div className='similar-results'>
                    {data.duplicates.filter(result => !!result._source.version).map(function(result) {
                        var key = result._source.ref + "-" + result._source.version;
                        return <SearchTextResult
                            data={result}
                            key={key}
                            query={this.props.query}
                            onResultClick={this.props.onResultClick}
                            />;
                        }.bind(this))}
            </div>) : null;

        const snippetMarkup = this.get_snippet_markup(data);
        const snippetClasses = classNames({contentText: 1, snippet: 1, en: snippetMarkup.lang == "en", he: snippetMarkup.lang == "he"});
        return (
            <div className="result text_result">
                <a href={href} onClick={this.handleResultClick}>
                    <div className="result-title">
                        <span className="int-en">{s.ref}</span>
                        <span className="int-he">{s.heRef}</span>
                    </div>
                    <div className={snippetClasses} dangerouslySetInnerHTML={snippetMarkup.markup} ></div>
                    <div className="version" >{s.version}</div>
                </a>
                {more_results_indicator}
                {shown_duplicates}
            </div>
        )
    }
}
SearchTextResult.propTypes = {
    query: PropTypes.string,
    data: PropTypes.object,
    onResultClick: PropTypes.func
};


module.exports = SearchTextResult;
