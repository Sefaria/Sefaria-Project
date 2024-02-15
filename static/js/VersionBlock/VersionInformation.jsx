import React from 'react';
import PropTypes from 'prop-types';
import classNames from "classnames";
import Sefaria from "../sefaria/sefaria";
import {VersionBlockUtils} from './VersionBlock';

function VersionInformation({currentRef, version}) {
    function makeLicenseLink() {
        const license_map = Sefaria.getLicenseMap();
        return (version.license in license_map) ? license_map[version.license] : "#";
    }
    return (
        <div className="versionDetailsInformation">
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionSource": 1, "versionDetailsElement": 1}, "versionSource"))}>
              <span className="versionDetailsLabel">
                {`${Sefaria._("Source")}: `}
              </span>
              <a className="versionDetailsLink" href={version.versionSource} target="_blank">
                { Sefaria.util.parseUrl(version.versionSource).host.replace("www.", "") }
              </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionDigitizedBySefaria": 1, "versionDetailsElement": 1}, "digitizedBySefaria"))}>
              <span className="versionDetailsLabel">
                {`${Sefaria._("Digitization")}: `}
              </span>
              <a className="versionDetailsLink" href="/digitized-by-sefaria" target="_blank">
                {Sefaria._("Sefaria")}
              </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionLicense": 1, "versionDetailsElement": 1}, "license" ))}>
              <span className="versionDetailsLabel">
                {`${Sefaria._("License")}: `}
              </span>
              <a className="versionDetailsLink" href={makeLicenseLink()} target="_blank">
                {Sefaria._(version?.license)}
              </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionHistoryLink": 1, "versionDetailsElement": 1}, null))}>
               <a className="versionDetailsLink" href={`/activity/${Sefaria.normRef(currentRef)}/${version.language}/${version.versionTitle && version.versionTitle.replace(/\s/g,"_")}`} target="_blank">
                 {Sefaria._("Revision History")}
               </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionBuyLink": 1, "versionDetailsElement": 1}, "purchaseInformationURL"))}>
               <a className="versionDetailsLink" href={version.purchaseInformationURL} target="_blank">
                {Sefaria._("Buy in Print")}
               </a>
            </div>
        </div>
    );
}
VersionInformation.prototypes = {
    currentRef: PropTypes.string.isRequired,
    version: PropTypes.object.isRequired,
};
export default VersionInformation;
