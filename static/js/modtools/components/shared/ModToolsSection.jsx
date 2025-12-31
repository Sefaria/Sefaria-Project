/**
 * ModToolsSection - Wrapper component for modtools sections
 *
 * Provides consistent styling and structure for each tool section.
 * All modtools components should be wrapped in this component.
 */
import React from 'react';
import PropTypes from 'prop-types';

const ModToolsSection = ({ title, titleHe, children, className = '' }) => {
  return (
    <div className={`modToolsSection ${className}`.trim()}>
      {(title || titleHe) && (
        <div className="dlSectionTitle">
          {title && <span className="int-en">{title}</span>}
          {titleHe && <span className="int-he">{titleHe}</span>}
        </div>
      )}
      {children}
    </div>
  );
};

ModToolsSection.propTypes = {
  title: PropTypes.string,
  titleHe: PropTypes.string,
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};

export default ModToolsSection;
