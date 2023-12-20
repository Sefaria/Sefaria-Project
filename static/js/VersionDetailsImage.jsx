import React from 'react';
import PropTypes from 'prop-types';
import classNames from "classnames";
import Sefaria from "./sefaria/sefaria";
import {VersionBlockUtils} from "./VersionBlock";

function VersionDetailsImage({version}) {
    function makeImageLink() {
        return !!version.purchaseInformationURL ? version.purchaseInformationURL : version.versionSource;
    }
    function makeImageSrc(){
        return  !!version.purchaseInformationImage ? version.purchaseInformationImage : "data:,";
    }
    return (
      <div className="versionDetailsImage">
        <div className={classNames(VersionBlockUtils.makeAttrClassNames(version, {"versionBuyImage": 1, "versionDetailsElement": 1} , "purchaseInformationImage"))}>
          <a className="versionDetailsLink versionDetailsImageLink" href={makeImageLink()} target="_blank">
            <img className="versionImage" src={makeImageSrc()} alt={Sefaria._("Buy Now")} />
          </a>
        </div>
      </div>
    )
}
VersionDetailsImage.prototypes = {
    version: PropTypes.object.isRequired,
};
export default VersionDetailsImage;
