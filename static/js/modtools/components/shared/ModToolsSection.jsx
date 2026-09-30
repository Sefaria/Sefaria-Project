/**
 * ModToolsSection - Collapsible wrapper component for modtools sections
 *
 * Provides consistent styling, structure, and collapse/expand functionality
 * for each tool section. All modtools components should be wrapped in this component.
 *
 * Features:
 * - Collapsible sections with smooth animation
 * - Collapse toggle on left side of header
 * - Optional help button on right side of header
 * - Keyboard accessible (Enter/Space to toggle)
 * - All sections collapsed by default
 *
 * Layout:
 * [▼ collapse] [Title] ............................ [? help]
 *
 * @example
 * <ModToolsSection
 *   title="Bulk Download"
 *   titleHe="הורדה"
 *   helpContent={<p>Help text here</p>}
 * >
 *   <form>...</form>
 * </ModToolsSection>
 */
import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import HelpButton from './HelpButton';

/**
 * Chevron icon component for collapse indicator
 */
const ChevronIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/**
 * ModToolsSection component
 *
 * @param {string} title - English section title
 * @param {string} titleHe - Hebrew section title
 * @param {React.ReactNode} children - Section content
 * @param {string} className - Additional CSS classes
 * @param {React.ReactNode} helpContent - Optional help modal content
 * @param {string} helpTitle - Title for help modal (defaults to title prop)
 * @param {boolean} defaultCollapsed - Whether section starts collapsed (default: true)
 */
const ModToolsSection = ({
  title,
  titleHe,
  children,
  className = '',
  helpContent,
  helpTitle,
  defaultCollapsed = true
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleCollapse();
    }
  }, [toggleCollapse]);

  const handleHelpClick = useCallback((e) => {
    // Prevent collapse toggle when clicking help button
    e.stopPropagation();
  }, []);

  const sectionClasses = [
    'modToolsSection',
    isCollapsed ? 'collapsed' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={sectionClasses}>
      {(title || titleHe) && (
        <div
          className="sectionHeader"
          onClick={toggleCollapse}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-expanded={!isCollapsed}
        >
          <div className="sectionHeaderLeft">
            <div className="collapseToggle" aria-hidden="true">
              <ChevronIcon />
            </div>
            <div className="dlSectionTitle">
              {title && <span className="int-en">{title}</span>}
              {titleHe && <span className="int-he">{titleHe}</span>}
            </div>
          </div>
          {helpContent && (
            <div className="sectionHeaderRight" onClick={handleHelpClick}>
              <HelpButton
                title={helpTitle || title}
                description={helpContent}
              />
            </div>
          )}
        </div>
      )}
      <div className="sectionContent">
        {children}
      </div>
    </div>
  );
};

ModToolsSection.propTypes = {
  title: PropTypes.string,
  titleHe: PropTypes.string,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  helpContent: PropTypes.node,
  helpTitle: PropTypes.string,
  defaultCollapsed: PropTypes.bool
};

export default ModToolsSection;
