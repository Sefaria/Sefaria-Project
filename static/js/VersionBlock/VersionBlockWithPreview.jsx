import React, {useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import VersionBlockHeader from "./VersionBlockHeader";
import {VersionBlockUtils} from './VersionBlock';
import VersionTitleAndSelector from './VersionTitleAndSelector';
import VersionMetadata from "./VersionMetadata";
import VersionBlockSelectButton from "./VersionBlockSelectButton";
import {OpenConnectionTabButton} from "../TextList";

function VersionBlockWithPreview({currentRef, version, currObjectVersions, openVersionInSidebar, openVersionInReader, isSelected, srefs, onRangeClick}) {
    const opeInSidebar = VersionBlockUtils.openVersionInSidebar.bind(null, currentRef, version, currObjectVersions, openVersionInSidebar);
    function openInTabCallback(sref) {
        const {versionTitle, languageFamilyName} = version;
        onRangeClick(sref, false, {[version.language]: {versionTitle, languageFamilyName}});
    }
    return (
        <div className='versionBlock with-preview'>
            <VersionBlockHeader
              text={version.text}
              onClick={opeInSidebar}
              renderMode='contentText'
              link={VersionBlockUtils.makeVersionLink(currentRef, version, currObjectVersions, false)}
              direction={version.direction || 'ltr'}
             />
            <div className='version-with-preview-header-row'>
                <div className='version-with-preview-title-line version-with-preview-select-btn-container'>
                    {
                        (() => {
                            const renderMode = 'translation';
                            const openVersionInMainPanel = VersionBlockUtils.openVersionInMainPanel.bind(
                                null,
                                currentRef,
                                version,
                                currObjectVersions,
                                renderMode,
                                null,
                                openVersionInReader
                            );
                            const buttonText = isSelected ? 'Currently Selected' : 'Select';
                            const link = VersionBlockUtils.makeVersionLink(currentRef, version, currObjectVersions, true);
                            return (
                                <VersionBlockSelectButton
                                    isSelected={isSelected}
                                    openVersionInMainPanel={openVersionInMainPanel}
                                    text={buttonText}
                                    link={link}
                                />
                            );
                        })()
                    }
                </div>
                <details>
                    <summary>
                        <VersionTitleAndSelector
                          version={version}
                          currentRef={currentRef}
                          currObjectVersions={currObjectVersions}
                          openVersionInReader={openVersionInReader}
                          isSelected={isSelected}
                        />
                    </summary>
                    <div className='version-block-with-preview-details'>
                        <VersionMetadata
                            currentRef={currentRef}
                            version={version}
                        />
                        <OpenConnectionTabButton
                            srefs={srefs}
                            openInTabCallback={openInTabCallback}
                            openStrings={['Open Text', 'פתיחת טקסט']}
                        />
                    </div>
                </details>
            </div>
            
            
        </div>
    );
}
VersionBlockWithPreview.prototypes = {
  version: PropTypes.object.isRequired,
  currObjectVersions: PropTypes.object.isRequired,
  currentRef: PropTypes.string.isRequired,
  openVersionInSidebar: PropTypes.func,
  openVersionInReader: PropTypes.func.isRequired,
  isSelected: PropTypes.bool.isRequired,
  srefs: PropTypes.array.isRequired,
  onRangeClick: PropTypes.func.isRequired,
};
export default VersionBlockWithPreview;
