import React, {useEffect, useState} from "react";
import Sefaria from "./sefaria/sefaria";
import {LoadingMessage} from "./Misc";
import {RecentFilterSet} from "./ConnectionFilters";
import TextRange from "./TextRange";
import {AddConnectionToSheetButton, ConnectionButtons, OpenConnectionTabButton} from "./TextList";
import PropTypes from "prop-types";

export const VersionsTextList = ({
                                     srefs,
                                     vFilter,
                                     recentVFilters,
                                     setFilter,
                                     onRangeClick,
                                     onCitationClick,
                                     translationLanguagePreference,
                                     setConnectionsMode,
                                     versionLangMap,
                                 }) => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const preloadText = async (filter) => {
            if (filter.length) {
                setLoaded(false);
                const sectionRef = getSectionRef();
                const [vTitle, language] = Sefaria.deconstructVersionsKey(filter[0]);
                let enVersion = null, heVersion = null;
                if (language === "en") {
                    enVersion = vTitle;
                } else {
                    heVersion = vTitle;
                }
                await Sefaria.getRef(sectionRef, currSelectedVersions);
                setLoaded(true);
            }
        };

        preloadText(vFilter);
    }, [vFilter]);


    const getSectionRef = () => {
        const ref = srefs[0]; // TODO account for selections spanning sections
        return Sefaria.sectionRef(ref) || ref;
    };

    const getVersion = () => {
        return Object.values(versionLangMap).flat().filter(
            v => Sefaria.getTranslateVersionsKey(v.versionTitle, v.language) === vFilter[0]
        )[0];
    };

    if (!loaded || !vFilter.length) {
        return <LoadingMessage/>;
    }

    const {languageFamilyName, versionTitle, language, isPrimary} = getVersion()
    const pseudoLanguage = (isPrimary) ? 'he' : 'en';
    const currSelectedVersions = {[pseudoLanguage]: {versionTitle, languageFamilyName}};
    const handleRangeClick = (sref) => {
        onRangeClick(sref, false, currSelectedVersions);
    };

    return (
        <div className="versionsTextList">
            <RecentFilterSet
                srefs={srefs}
                asHeader={false}
                filter={vFilter}
                recentFilters={recentVFilters}
                setFilter={setFilter}
            />
            <TextRange
                sref={Sefaria.humanRef(srefs)}
                currVersions={currSelectedVersions}
                useVersionLanguage={true}
                hideTitle={true}
                numberLabel={0}
                basetext={false}
                onCitationClick={onCitationClick}
                translationLanguagePreference={translationLanguagePreference}
            />
            <ConnectionButtons>
                <OpenConnectionTabButton srefs={srefs} openInTabCallback={handleRangeClick}/>
                <AddConnectionToSheetButton srefs={srefs} versions={{[language]: versionTitle}}
                                            addToSheetCallback={setConnectionsMode}/>
                                            {/*use language for sheets because there language means direction*/}
            </ConnectionButtons>
        </div>
    );
};
VersionsTextList.propTypes = {
  srefs: PropTypes.array,
  vFilter: PropTypes.array,
  recentVFilters: PropTypes.array,
  setFilter: PropTypes.func.isRequired,
  onRangeClick: PropTypes.func.isRequired,
  onCitationClick: PropTypes.func.isRequired,
  translationLanguagePreference: PropTypes.string,
  setConnectionsMode: PropTypes.func.isRequired,
  versionLangMap: PropTypes.object.isRequired,
};
