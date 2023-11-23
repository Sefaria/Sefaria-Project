import React from 'react';
import PropTypes from "prop-types";

function VersionBlockHeader({text, link, onClick, renderMode, direction}) {
    return renderMode === 'versionTitle' ?
        (<VersionBlockHeaderTitle
            link={link}
            onClick={onClick}
            versionTitle={text}
        />) :
        (<VersionBlockHeaderText
            link={link}
            onClick={onClick}
            text={text}
            direction={direction}
        />);
}
VersionBlockHeader.prototypes = {
  onClick: PropTypes.func.isRequired,
  text: PropTypes.string.isRequired,
  renderMode: PropTypes.string.isRequired,
  link: PropTypes.string.isRequired,
  direction: PropTypes.string,
};

function VersionBlockHeaderTitle({link, onClick, versionTitle}) {
    return (
          <a
              href={link}
              onClick={onClick}
          >
              {versionTitle}
          </a>
    );
}
VersionBlockHeaderTitle.prototypes = {
  onClick: PropTypes.func.isRequired,
  versionTitle: PropTypes.string.isRequired,
  link: PropTypes.string.isRequired,
};

function VersionBlockHeaderText({link, onClick, text, direction}) {
    return (
          <a
              className='versionPreview'
              href={link}
              onClick={onClick}
              dangerouslySetInnerHTML={{__html: text}}
              dir={direction}
          />
    );
}
VersionBlockHeaderText.prototypes = {
  onClick: PropTypes.func.isRequired,
  versionTitle: PropTypes.string.isRequired,
  link: PropTypes.string.isRequired,
  direction: PropTypes.string.isRequired,
};

export default VersionBlockHeader;
