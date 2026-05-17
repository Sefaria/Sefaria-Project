import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { ColorBarBox, InterfaceText } from './Misc';


const SemanticSearchResult = ({ result }) => {
    const href = `/${Sefaria.normRef(result.ref)}`;
    const snippet = result.en_text || result.he_text || "";
    const snippetLang = !result.en_text && result.he_text ? "he" : "en";

    return (
        <div className="result textResult">
            <a href={href} onClick={() => Sefaria.track.event("Search", "Semantic Result Click", result.ref)}>
                <div className="result-title">
                    <InterfaceText text={{ en: result.ref, he: result.heRef }} />
                </div>
            </a>
            {snippet && (
                <ColorBarBox tref={result.ref}>
                    <div className={`snippet ${snippetLang}`}>{snippet}</div>
                </ColorBarBox>
            )}
            {result.keyphrases_matched?.length > 0 && (
                <div className="semantic-keyphrases">
                    <span className="semantic-keyphrases-label">
                        <InterfaceText text={{ en: "Key Phrases:", he: "ביטויי מפתח:" }} />
                    </span>
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
        en_text: PropTypes.string,
        he_text: PropTypes.string,
        score: PropTypes.number,
        keyphrases_matched: PropTypes.arrayOf(PropTypes.string),
    }).isRequired,
};

export default SemanticSearchResult;
