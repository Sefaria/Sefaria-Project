import React  from 'react';
import Sefaria  from './sefaria/sefaria';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Component      from 'react-class';
import {
    ColorBarBox,
    InterfaceText
} from './Misc'


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
        // Gets list of highlights (text in <b> tags) in the current match
        // Returns list of strings
        let highlights = [];
        let longestLength = 0;
        const highlightReg = /((?:[\s,.?!:;]){0,}<b>[^<]+<\/b>[\s,.?!:;]{0,})+/g;  // capture consecutive <b> tags in one match
        if (!this.props.data.highlight) { return []; }
        const vals = Object.values(this.props.data.highlight);
        if (vals.length === 0) { return []; }
        // vals should have only one entry. either 'naive_lemmatizer' or 'exact'
        for (let h of vals[0]) {
            let matches = null;
            while ((matches = highlightReg.exec(h)) !== null) {
                const matchText = matches[0].replace(/<\/?b>/g, '');
                if (matchText.length > longestLength) { longestLength = matchText.length; }
                highlights.push(matchText);
            }
        }
        // in order to decrease spurious highlights (e.g. for a lone "The") we only take the longest match
        // commenting out for now. Not sure we want this.
        // highlights = highlights.filter(h => h.length === longestLength);
        return highlights;
    }
    async handleResultClick(event) {
        if (this.props.onResultClick) {
            event.preventDefault();
            // const s = this.props.data._source;
            const s = this.props.data;
            const textHighlights = this.getHighlights();
            // in case a change to a title was made and ElasticSearch cronjob hasn't run,
            // there won't be an index, so normalize "Bereishit Rabbah 3" => "Bereshit Rabbah 3" by calling API
            let parsedRef = Sefaria.parseRef(s.ref);
            if (parsedRef.index.length === 0) {
                const d = await Sefaria.getRef(s.ref);
                parsedRef.ref = d.ref;
            }

            if (this.props.searchInBook) {
                // Sefaria.track.event("Search", "Sidebar Search Result Click", `${this.props.query} - ${parsedRef.ref}/${s.version}/${s.lang}`);
                Sefaria.track.event("Search", "Sidebar Search Result Click", `${this.props.query} - ${parsedRef.ref}/${s.title}/${s.lang}`);
            } else {
                // Sefaria.track.event("Search", "Search Result Text Click", `${this.props.query} - ${parsedRef.ref}/${s.version}/${s.lang}`);
                Sefaria.track.event("Search", "Search Result Text Click", `${this.props.query} - ${parsedRef.ref}/${s.title}/${s.lang}`);
            }
            this.props.onResultClick(parsedRef.ref, {[s.lang]: s.version}, {textHighlights});
        }
    }
    highight(data, query) {
        let boldData
        if (Array.isArray(data)) {
            boldData = data[0].split(query).join(` <b>${query}</b> `)
            return { markup: {__html: boldData}, lang: "en" };
        } else {
            
            boldData = data.split(query).join(` <b>${query}</b> `)
            return { markup: {__html: boldData}, lang: "en" };
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
    render() {
        var data = this.props.data;
        var s = this.props.data;
        // const href = `/${Sefaria.normRef(s.ref)}?v${s.lang}=${Sefaria.util.encodeVtitle(s.version)}&qh=${this.props.query}`;
        const href = `/${Sefaria.normRef(s.ref)}`;


        // const more_results_caret =
        //     (this.state.duplicatesShown)
        //         ? <i className="fa fa-caret-down fa-angle-down"></i>
        //         : <i className="fa fa-caret-down"></i>;

        // const more_results_indicator = (!(data.duplicates)) ? "" :
        //     <div className='similar-trigger-box' onClick={this.toggleDuplicates}>
        //             <span className='similar-title int-he'>
        //                 {data.duplicates.length} {(data.duplicates.length > 1) ? Sefaria._("search.more_results")  : Sefaria._("search.another_result")}
        //             </span>
        //         <span className='similar-title int-en'>
        //                 {data.duplicates.length} more version{(data.duplicates.length > 1) ? "s" : null}
        //             </span>
        //         {more_results_caret}
        //     </div>;

        // const shown_duplicates = (data.duplicates && this.state.duplicatesShown) ?
        //     (<div className='similar-results'>
        //         {data.duplicates.filter(result => !!result._source.version).map(function (result) {
        //             var key = result._source.ref + "-" + result._source.version;
        //             return <SearchTextResult
        //                 data={result}
        //                 key={key}
        //                 query={this.props.query}
        //                 onResultClick={this.props.onResultClick}
        //             />;
        //         }.bind(this))}
        //     </div>) : null;

        const snippetMarkup = this.highight(s.chapter, this.props.query);
        const snippetClasses = classNames({snippet: 1, en: snippetMarkup.lang === "en", he: snippetMarkup.lang === "he"});
        return (
            <div className="result textResult">
                <a href={href} onClick={this.handleResultClick}>
                    <div className="result-title">
                        <InterfaceText text={{en: s.ref, he: s.heRef}}/>
                    </div>
                </a>
                <ColorBarBox >
                    <div className={snippetClasses} dangerouslySetInnerHTML={snippetMarkup.markup}></div>
                </ColorBarBox>
                <div className="version">
                    {Sefaria.interfaceLang === 'hebrew' && s.version || s.title}
                </div>

                {/* {more_results_indicator}
                {shown_duplicates} */}
            </div>
        );
    }
}
SearchTextResult.propTypes = {
    query: PropTypes.string,
    data: PropTypes.object,
    onResultClick: PropTypes.func,
    mongoSearchText: PropTypes.array
};


export default SearchTextResult;
