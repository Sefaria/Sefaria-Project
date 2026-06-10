import React from 'react';
import PropTypes from 'prop-types';
import {VersionBlockUtils} from "./VersionBlock";
import VersionInformation from "./VersionInformation";
import VersionImage from "./VersionImage";

function VersionMetadata({currentRef, version}) {
    return (
        <div className='versionDetails preview'>
            <div className='version-preview-informations'>
                <div className='versionDetails-version-title'>{VersionBlockUtils.makeVersionTitle(version).text}</div>
                <VersionInformation currentRef={currentRef} version={version}/>
            </div>
            <VersionImage version={version}/>
        </div>
    );
}
VersionMetadata.prototypes = {
    currentRef: PropTypes.string.isRequired,
    version: PropTypes.object.isRequired,
};
export default VersionMetadata;
