import React from 'react';
import PropTypes from 'prop-types';
import {versionTools} from "./VersionBlock";
import VersionDetailsInformation from "./VersionDetailsInformation";
import VersionDetailsImage from "./VersionDetailsImage";

function VersionPreviewMeta({currentRef, version}) {
    return (
        <div className='versionDetails preview'>
            <div className='version-preview-informations'>
                <div className='versionDetails-version-title'>{versionTools.makeVersionTitle(version).text}</div>
                <VersionDetailsInformation currentRef={currentRef} version={version}/>
            </div>
            <VersionDetailsImage version={version}/>
        </div>
    );
}
VersionPreviewMeta.prototypes = {
    currentRef: PropTypes.string.isRequired,
    version: PropTypes.object.isRequired,
};
export default VersionPreviewMeta;
