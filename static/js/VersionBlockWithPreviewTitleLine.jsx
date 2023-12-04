import React from 'react';
import PropTypes from 'prop-types';
import VersionBlockSelectButton from "./VersionBlockSelectButton";
import {versionTools} from './VersionBlock';
import Sefaria from "./sefaria/sefaria";

function VersionBlockWithPreviewTitleLine({currentRef, version, currObjectVersions, openVersionInReader, isSelected}) {
    function makeShortVersionTitle() {
        let shortVersionTitle = version.shortVersionTitle || version.versionTitle;
        if (Sefaria.interfaceLang === "hebrew") {
            shortVersionTitle = version.shortVersionTitleInHebrew || version.versionTitleInHebrew || shortVersionTitle;
        }
        return shortVersionTitle;
    }
    const openVersionInMainPanel = versionTools.openVersionInMainPanel.bind(null, currentRef, version, currObjectVersions, 'select-button',
        null, openVersionInReader);
    const buttonText = isSelected ? 'Currently Selected' : 'Select';
    return (
        <div className='version-with-preview-title-line'>
            <div className='open-details'>
                {makeShortVersionTitle()}
            </div>
            <VersionBlockSelectButton
                isSelected={isSelected}
                openVersionInMainPanel={openVersionInMainPanel}
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
  isSelected: PropTypes.bool.isRequired,
};
export default VersionBlockWithPreviewTitleLine;
