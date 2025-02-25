import React from 'react';
import PropTypes from 'prop-types';
import classNames from "classnames";
import Sefaria from "../sefaria/sefaria";
import {VersionBlockUtils} from './VersionBlock';
import { VersionStatusLong } from '../Misc'

function VersionInformation({currentRef, version}) {
    function makeLicenseLink() {
        const license_map = Sefaria.getLicenseMap();
        return (version.license in license_map) ? license_map[version.license] : "#";
    }
    const markdownText = `
    # React Markdown Example
    
    - Some text
    - Some other text
    
    ## Subtitle
    
    ### Additional info
    
    | Column 1 | Column 2 | Column 3 |
    |----------|----------|----------|
    | Row 1    | Data 1   | Data 2   |
    | Row 2    | Data 3   | Data 4   |
    | Row 3    | Data 5   | Data 6   |
    
    This is a [link](https://github.com/remarkjs/react-markdown)
    `
    return (
        <div className="versionDetailsInformation">
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionSource": 1, "versionDetailsElement": 1}, "versionSource"))}>
              <span className="versionDetailsLabel">
                {`${Sefaria._("text.versions.source")}: `}
              </span>
              <a className="versionDetailsLink" href={version.versionSource} target="_blank">
                { Sefaria.util.parseUrl(version.versionSource).host.replace("www.", "") }
              </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionDigitizedBySefaria": 1, "versionDetailsElement": 1}, "digitizedBySefaria"))}>
              <span className="versionDetailsLabel">
                {`${Sefaria._("text.version.information.digitization")}: `}
              </span>
              <a className="versionDetailsLink" href="/digitized-by-pecha" target="_blank">
<<<<<<< HEAD
                {Sefaria._("Pecha")}
=======
                Pecha.org
>>>>>>> ec48bac0f (version display post)
              </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionLicense": 1, "versionDetailsElement": 1}, "license" ))}>
              <span className="versionDetailsLabel">
                {`${Sefaria._("connection_panel.license")}: `}
              </span>
              <a className="versionDetailsLink" href={makeLicenseLink()} target="_blank">
                {Sefaria._(version?.license)}
              </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionHistoryLink": 1, "versionDetailsElement": 1}, null))}>
               <a className="versionDetailsLink" href={`/activity/${Sefaria.normRef(currentRef)}/${version.language}/${version.versionTitle && version.versionTitle.replace(/\s/g,"_")}`} target="_blank">
                 <span className='review-history-text'>
                  {Sefaria._("text.versions.information.review_history")}
                 </span>
               </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionBuyLink": 1, "versionDetailsElement": 1}, "purchaseInformationURL"))}>
               <a className="versionDetailsLink" href={version.purchaseInformationURL} target="_blank">
                {Sefaria._("text.version.information.buy_in_print")}
               </a>
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionDigitizedBySefaria": 1, "versionDetailsElement": 1}, "digitizedBySefaria"))}>
              <VersionStatusLong id={version.versionTitle} version={version} markdownString={markdownText} />
            </div>
        </div>
    );
}
VersionInformation.prototypes = {
    currentRef: PropTypes.string.isRequired,
    version: PropTypes.object.isRequired,
};
export default VersionInformation;
