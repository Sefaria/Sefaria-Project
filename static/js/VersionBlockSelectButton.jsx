import React from 'react';
import PropTypes from "prop-types";

function VersionBlockSelectButton({link, openVersionInMainPanel, text, isSelected}) {
    return (
          <a className={`selectButton ${isSelected ? "currSelectButton" : ""}`}
              href={link}
              onClick={openVersionInMainPanel}
          >
              {Sefaria._(text)}
          </a>
    );
}
VersionBlockSelectButton.prototypes = {
  openVersionInMoinPanel: PropTypes.func.isRequired,
  text: PropTypes.string.isRequired,
  isSelected: PropTypes.bool.isRequired,
  link: PropTypes.string.isRequired,
};
export default VersionBlockSelectButton;
