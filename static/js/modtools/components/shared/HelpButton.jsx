/**
 * HelpButton - A help icon button that opens a modal with detailed documentation
 *
 * Usage:
 *   <HelpButton
 *     title="Tool Name"
 *     description={<>JSX content with detailed documentation</>}
 *   />
 *
 * The button renders as a question mark icon in the top-right corner of its
 * parent container. When clicked, it opens a modal with the full documentation.
 */
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const HelpButton = ({ title, description }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    if (isOpen) {
      // Use capture phase to intercept ESC before other handlers
      document.addEventListener('keydown', handleEsc, true);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc, true);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="helpButton"
        onClick={() => setIsOpen(true)}
        aria-label={`Help for ${title}`}
        title={`Learn more about ${title}`}
      >
        ?
      </button>

      {isOpen && (
        <div className="helpModal-overlay" onClick={() => setIsOpen(false)}>
          <div className="helpModal" onClick={(e) => e.stopPropagation()}>
            <div className="helpModal-header">
              <h2 className="helpModal-title">{title}</h2>
              <button
                type="button"
                className="helpModal-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="helpModal-body">
              {description}
            </div>
            <div className="helpModal-footer">
              <button
                type="button"
                className="modtoolsButton"
                onClick={() => setIsOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

HelpButton.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.node.isRequired
};

export default HelpButton;
