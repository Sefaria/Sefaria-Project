import React from 'react';
import Sefaria from "./sefaria/sefaria";
import PropTypes from "prop-types";

function OpenVersion({currRef, version, currObjectVersions, targetPanel, text, className, openVersionInSidebar, openVersionInReader, rendermode, firstSectionRef}) {

    const mainPanel = targetPanel === 'main';
    function makeVersionLink() {
        // maintain all versions for languages you're not currently selecting
        if (version.merged) {
          return "#"; // there's no url for a merged version
        }
        const withParam = mainPanel ? "" : "&with=Translation Open";
        const versionParam = mainPanel ? version.language : 'side';
        const nonSelectedVersionParams = Object.entries(currObjectVersions)
                                          .filter(([vlang, ver]) => !!ver && !!ver?.versionTitle && !version?.merged && (withParam || vlang !== version.language))  // in 'side' case, keep all version params
                                          .map(([vlang, ver]) => `&v${vlang}=${ver.versionTitle.replace(/\s/g,'_')}`)
                                          .join("");
        const versionLink = nonSelectedVersionParams === "" ? null : `/${Sefaria.normRef(currRef)}${nonSelectedVersionParams}&v${versionParam}=${version.versionTitle.replace(/\s/g,'_')}${withParam}`.replace("&","?");
        return versionLink;
    }

    function openInSidebar(e) {
        e.preventDefault();
        try {
          gtag("event", "onClick_version_title", {element_name: `version_title`,
              change_to: `${version.versionTitle}`, change_from: `${currObjectVersions[version.language]['versionTitle']}`,
              categories: `${Sefaria.refCategories(currRef)}`, book: `${Sefaria.parseRef(currRef).index}` })
        }
        catch(err) {
          console.log(err);
        }
        openVersionInSidebar(version.versionTitle, version.language);
    }

    function openInMainPanel(e) {
        e.preventDefault();
        try {
          gtag("event", "onClick_select_version", {element_name: `select_version`,
          change_to: `${version.versionTitle}`, change_from: `${currObjectVersions[version.language]['versionTitle']}`,
          categories: `${Sefaria.refCategories(currRef)}`, book: `${Sefaria.parseRef(currRef).index}` })
        }
        catch(err) {
          console.log(err);
        }
        if (rendermode === 'book-page') {
            window.location = `/${firstSectionRef}?v${version.language}=${version.versionTitle.replace(/\s/g,'_')}`;
        } else {
            openVersionInReader(version.versionTitle, version.language);
        }
        Sefaria.setVersionPreference(currRef, version.versionTitle, version.language);
    }

    return (
          <a className={className}
              href={makeVersionLink()}
              onClick={mainPanel ? openInMainPanel : openInSidebar}>
              {text}
          </a>
    );
}
OpenVersion.prototypes = {
  version: PropTypes.object.isRequired,
  currObjectVersions: PropTypes.object.isRequired,
  currRef: PropTypes.string.isRequired,
  className: PropTypes.string,
  openVersionInSidebar: PropTypes.func,
  openVersionInReader: PropTypes.func.isRequired,
  targetPanel: PropTypes.string.isRequired,
  text: PropTypes.string,
  rendermode: PropTypes.string.isRequired,
  firstSectionRef: PropTypes.string,
}

export default OpenVersion;
