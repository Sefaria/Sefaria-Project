const React      = require('react');
const $          = require('./sefaria/sefariaJquery');
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
    handleResultClick(event) {
        if(this.props.onResultClick) {
            event.preventDefault();
            var s = this.props.data._source;
            Sefaria.track.event("Search", "Search Result Text Click", `${this.props.query} - ${s.ref}/${s.version}/${s.lang}`);
            this.props.onResultClick(s.ref, {[s.lang]: s.version}, {"highlight": this.props.query}); //highlight not yet handled, above in ReaderApp.handleNavigationClick()
        }
    }
    render () {
        var data = this.props.data;
        var s = this.props.data._source;
        const href = `/${Sefaria.normRef(s.ref)}?v${s.lang}=${s.version.replace(/ /g, "_")}&qh=${this.props.query}`;

        function get_snippet_markup() {
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
            let lang = Sefaria.hebrew.isHebrew(snippet) ? "he" : "en";
            snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
            return {markup:{__html:snippet}, lang: lang};
        }

        var more_results_caret =
            (this.state.duplicatesShown)
            ? <i className="fa fa-caret-down fa-angle-down"></i>
            : <i className="fa fa-caret-down"></i>;

        var more_results_indicator = (!(data.duplicates)) ? "" :
                <div className='similar-trigger-box' onClick={this.toggleDuplicates}>
                    <span className='similar-title int-he'>
                        { data.duplicates.length } {(data.duplicates.length > 1) ? " גרסאות נוספות" : " גרסה נוספת"}
                    </span>
                    <span className='similar-title int-en'>
                        { data.duplicates.length } more version{(data.duplicates.length > 1) ? "s" : null}
                    </span>
                    {more_results_caret}
                </div>;

        var shown_duplicates = (data.duplicates && this.state.duplicatesShown) ?
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

        var snippetMarkup = get_snippet_markup();
        var snippetClasses = classNames({snippet: 1, en: snippetMarkup.lang == "en", he: snippetMarkup.lang == "he"});
        return (
            <div className="result text_result">
                <a href={href} onClick={this.handleResultClick}>
                    <div className="result-title">
                        <span className="en">{s.ref}</span>
                        <span className="he">{s.heRef}</span>
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
