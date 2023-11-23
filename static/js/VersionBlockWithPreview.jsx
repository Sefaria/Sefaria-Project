import React, {useState} from 'react';
import PropTypes from 'prop-types';
import VersionBlockHeader from "./VersionBlockHeader";
import {versionTools} from './VersionBlock';
import VersionBlockWithPreviewTitleLine from './VersionBlockWithPreviewTitleLine';
import VersionPreviewMeta from "./VersionPreviewMeta";
import {OpenConnectionTabButton} from "./TextList";

function VersionBlockWithPreview({currentRef, version, currObjectVersions, openVersionInSidebar, openVersionInReader, isSelected, srefs, onRangeClick}) {
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const opeInSidebar = versionTools.openVersionInSidebar.bind(null, currentRef, version, currObjectVersions, openVersionInSidebar);
    function openInTabCallback(sref) {
        onRangeClick(sref, false, {[version.language]: version.versionTitle});
    }
    return (
        <div className='versionBlock with-preview'>
            <VersionBlockHeader
              text={version.text}
              onClick={opeInSidebar}
              renderMode='contentText'
              link={versionTools.makeVersionLink(currentRef, version, currObjectVersions, false)}
              direction={version.direction || 'ltr'}
             />
            <VersionBlockWithPreviewTitleLine
              version={version}
              currentRef={currentRef}
              currObjectVersions={currObjectVersions}
              openVersionInReader={openVersionInReader}
              isInfoOpen={isInfoOpen}
              setIsInfoOpen={setIsInfoOpen}
              isSelected={isSelected}
            />
            {isInfoOpen ?
            <div className='version-block-with-preview-details'>
                <VersionPreviewMeta
                    currentRef={currentRef}
                    version={version}
                />
                <OpenConnectionTabButton
                    srefs={srefs}
                    openInTabCallback={openInTabCallback}
                    renderMode='versionPreview'
                />
            </div>
            : null}
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
