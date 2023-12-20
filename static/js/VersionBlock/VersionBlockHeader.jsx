import React, {useEffect, useRef, useState} from 'react';
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
    const [shouldAttemptTruncation, setShouldAttemptTruncation] = useState(true);
    const [truncationOccurred, setTruncationOccurred] = useState(false);
    const textRef = useRef(null);
    useEffect(() => {
        const element = textRef.current;
        const computedStyles = window.getComputedStyle(element);
        const maxHeight = parseInt(computedStyles.getPropertyValue('max-height'), 10);
        setTruncationOccurred(element.scrollHeight > maxHeight+1); //added +1 because for some reason when the view is too big the height has 1 more
    }); //no second param for running in resize seems better than adding a listener
    function onEllipsisClick() {
        setShouldAttemptTruncation(false);
        setTruncationOccurred(false);
    }
    return (
        <div className={'versionPreviewWithOptionalEllipsis'} dir={direction}>
          <a
              className={`versionPreview ${shouldAttemptTruncation && 'shouldAttemptTruncation'}`}
              ref={textRef}
              href={link}
              onClick={onClick}
              dangerouslySetInnerHTML={{__html: text}}
          />
          {truncationOccurred && <a className='ellipsis' onClick={onEllipsisClick}>…</a>}
        </div>
    );
}
VersionBlockHeaderText.prototypes = {
  onClick: PropTypes.func.isRequired,
  versionTitle: PropTypes.string.isRequired,
  link: PropTypes.string.isRequired,
  direction: PropTypes.string.isRequired,
};

export default VersionBlockHeader;
