import React, {useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import VersionBlockHeader from "./VersionBlockHeader";
import {VersionBlockUtils} from './VersionBlock';
import VersionTitleAndSelector from './VersionTitleAndSelector';
import VersionMetadata from "./VersionMetadata";
import {OpenConnectionTabButton} from "../TextList";

function VersionBlockWithPreview({currentRef, version, currObjectVersions, openVersionInSidebar, openVersionInReader, isSelected, srefs, onRangeClick}) {
    const opeInSidebar = VersionBlockUtils.openVersionInSidebar.bind(null, currentRef, version, currObjectVersions, openVersionInSidebar);
    function openInTabCallback(sref) {
        onRangeClick(sref, false, {[version.language]: version.versionTitle});
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
                        openStrings={['Open Text', 'གཞུང་འབྱེད་པ།']}
                    />
                </div>
            </details>
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
