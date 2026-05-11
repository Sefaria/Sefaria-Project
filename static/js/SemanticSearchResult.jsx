import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';


const SemanticSearchResult = ({ result }) => {
    const href = `/${Sefaria.normRef(result.ref)}`;
    const isHebrew = Sefaria.hebrew.isHebrew(result.snippet);

    return (
        <div className="search-result semantic-result">
            <div className="result-title">
                <a href={href} onClick={() => Sefaria.track.event("Search", "Semantic Result Click", result.ref)}>
                    <span className="int-he">{result.heRef}</span>
                    <span className="int-en">{result.ref}</span>
                </a>
            </div>
            {result.snippet && (
                <div className={`result-snippet ${isHebrew ? "he" : "en"}`}>
                    {result.snippet}
                </div>
            )}
            {result.keyphrases_matched?.length > 0 && (
                <div className="semantic-keyphrases">
                    {result.keyphrases_matched.map(phrase => (
                        <span key={phrase} className="semantic-keyphrase-tag">{phrase}</span>
                    ))}
                </div>
            )}
        </div>
    );
};

SemanticSearchResult.propTypes = {
    result: PropTypes.shape({
        ref: PropTypes.string.isRequired,
        heRef: PropTypes.string,
        snippet: PropTypes.string,
        score: PropTypes.number,
        keyphrases_matched: PropTypes.arrayOf(PropTypes.string),
    }).isRequired,
};

export default SemanticSearchResult;
