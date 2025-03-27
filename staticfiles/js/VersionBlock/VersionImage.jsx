import React from 'react';
import PropTypes from 'prop-types';
import classNames from "classnames";
import Sefaria from "../sefaria/sefaria";
import {VersionBlockUtils} from "./VersionBlock";

function VersionImage({version}) {
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
            <img className="versionImage" src={makeImageSrc()} alt={Sefaria._("text.version.information.buy_now")} />
          </a>
        </div>
      </div>
    )
}
VersionImage.prototypes = {
    version: PropTypes.object.isRequired,
};
export default VersionImage;
