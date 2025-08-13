import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from "../sefaria/sefaria";

function VersionTitleAndSelector({currentRef, version, currObjectVersions, openVersionInReader, isSelected}) {
    function makeShortVersionTitle() {
        let shortVersionTitle = version.shortVersionTitle || version.versionTitle;
        if (Sefaria.interfaceLang === "hebrew") {
            shortVersionTitle = version.shortVersionTitleInHebrew || version.versionTitleInHebrew || shortVersionTitle;
        }
        return shortVersionTitle;
    }
    return (
        <div className='version-with-preview-title-line'>
            <div className='open-details'>
                {makeShortVersionTitle()}
            </div>
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
