import React from 'react';
import PropTypes from 'prop-types';
import VersionBlockSelectButton from "./VersionBlockSelectButton";
import {VersionBlockUtils} from './VersionBlock';
import Sefaria from "../sefaria/sefaria";

function VersionTitleAndSelector({currentRef, version, currObjectVersions, openVersionInReader, isSelected}) {
    function makeShortVersionTitle() {
        let shortVersionTitle = version.shortVersionTitle || version.versionTitle;
        if (Sefaria.interfaceLang === "hebrew") {
            shortVersionTitle = version.shortVersionTitleInHebrew || version.versionTitleInHebrew || shortVersionTitle;
        }
        return shortVersionTitle;
    }
    const openVersionInMainPanel = VersionBlockUtils.openVersionInMainPanel.bind(null, currentRef, version, currObjectVersions, 'select-button',
        null, openVersionInReader);
    const buttonText = isSelected ? Sefaria._('Currently Selected') : Sefaria._('select');
    return (
        <div className='version-with-preview-title-line'>
            <div className='open-details'>
                {makeShortVersionTitle()}
            </div>
            <VersionBlockSelectButton
                isSelected={isSelected}
                openVersionInMainPanel={openVersionInMainPanel}
                text={buttonText}
                link={VersionBlockUtils.makeVersionLink(currentRef, version, currObjectVersions, true)}
            />
        </div>
    );
}
VersionTitleAndSelector.prototypes = {
  currObjectVersions: PropTypes.object.isRequired,
  version: PropTypes.object.isRequired,
  currentRef: PropTypes.string.isRequired,
  openVersionInReader: PropTypes.func.isRequired,
  isSelected: PropTypes.bool.isRequired,
};
export default VersionTitleAndSelector;
