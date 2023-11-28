import React from 'react';
import PropTypes from 'prop-types';
import VersionBlockSelectButton from "./VersionBlockSelectButton";
import {versionTools} from './VersionBlock';
import Sefaria from "./sefaria/sefaria";

function VersionBlockWithPreviewTitleLine({currentRef, version, currObjectVersions, openVersionInReader, isInfoOpen, setIsInfoOpen, isSelected}) {
    function makeShortVersionTitle() {
        let shortVersionTitle = version.shortVersionTitle || version.versionTitle;
        if (Sefaria.interfaceLang === "hebrew") {
            shortVersionTitle = version.shortVersionTitleInHebrew || version.versionTitleInHebrew || shortVersionTitle;
        }
        return shortVersionTitle;
    }
    const chevronDirection = isInfoOpen ? 'up' : 'down';
    const openVersionInMoinPanel = versionTools.openVersionInMoinPanel.bind(null, currentRef, version, currObjectVersions, 'select-button',
        null, openVersionInReader);
    const buttonText = isSelected ? 'Currently Selected' : 'Select';
    return (
        <div className='version-with-preview-title-line'>
            <a className={`open-details chevron-${chevronDirection}`} onClick={() => setIsInfoOpen(!isInfoOpen)} href='#'>
                {makeShortVersionTitle()}
            </a>
            <VersionBlockSelectButton
                isSelected={isSelected}
                openVersionInMoinPanel={openVersionInMoinPanel}
                text={buttonText}
                link={versionTools.makeVersionLink(currentRef, version, currObjectVersions, true)}
            />
        </div>
    );
}
VersionBlockWithPreviewTitleLine.prototypes = {
  currObjectVersions: PropTypes.object.isRequired,
  version: PropTypes.object.isRequired,
  currentRef: PropTypes.string.isRequired,
  openVersionInReader: PropTypes.func.isRequired,
  isInfoOpen: PropTypes.bool.isRequired,
  setIsInfoOpen: PropTypes.func.isRequired,
  isSelected: PropTypes.bool.isRequired,
};
export default VersionBlockWithPreviewTitleLine;
