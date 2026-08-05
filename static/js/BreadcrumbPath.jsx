import React, { useRef, useState, useLayoutEffect } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

const CHEVRON = '/static/icons/chevron-right-sm.svg';

function Breadcrumb({ label, hebrewLabel, href }) {
  const text = <InterfaceText text={{ en: label, he: hebrewLabel }} />;
  if (href) {
    return (
      <a
        href={href}
        className="searchResultCard-crumb searchResultCard-crumb--link"
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </a>
    );
  }
  return <span className="searchResultCard-crumb">{text}</span>;
}

function CrumbSep() {
  return (
    <img
      src={CHEVRON}
      alt=""
      aria-hidden="true"
      className="searchResultCard-crumbChevron"
    />
  );
}

function CrumbList({ crumbs }) {
  return crumbs.map((crumb, i) => (
    <React.Fragment key={i}>
      {i > 0 && <CrumbSep />}
      <Breadcrumb label={crumb.label} hebrewLabel={crumb.hebrewLabel} href={crumb.href} />
    </React.Fragment>
  ));
}

/**
 * BreadcrumbPath
 *
 * Props: crumbs – array of { label: string, hebrewLabel?: string, href?: string }
 *
 * Truncation rules (per designer spec):
 *   - Never truncate individual nodes mid-label.
 *   - If the full path overflows, show [first] > [...] > [last].
 *   - The "..." node has the same hover style as a text crumb.
 *   - Hovering "..." shows a static tooltip listing the hidden middle crumbs
 *     joined by " > ", styled like the reader-header tooltip.
 */
function BreadcrumbPath({ crumbs }) {
  const containerRef = useRef(null);
  const measureRef   = useRef(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure   = measureRef.current;
    if (!container || !measure) return;

    const check = () => {
      setIsTruncated(measure.scrollWidth > container.clientWidth + 1);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [crumbs]);

  if (!crumbs || crumbs.length === 0) return null;

  const isHebrew = Sefaria.interfaceLang === 'hebrew';
  const first    = crumbs[0];
  const last     = crumbs[crumbs.length - 1];
  const middle   = crumbs.slice(1, -1);

  const tooltipText = middle
    .map(c => (isHebrew && c.hebrewLabel) ? c.hebrewLabel : c.label)
    .join(' > ');

  const truncatedCrumbs = (
    <>
      <Breadcrumb label={first.label} hebrewLabel={first.hebrewLabel} href={first.href} />
      {middle.length > 0 && (
        <>
          <CrumbSep />
          <span
            className="searchResultCard-crumb searchResultCard-crumb--ellipsis tooltip-toggle"
            aria-label={tooltipText}
          >
            &hellip;
          </span>
        </>
      )}
      {crumbs.length > 1 && (
        <>
          <CrumbSep />
          <Breadcrumb label={last.label} hebrewLabel={last.hebrewLabel} href={last.href} />
        </>
      )}
    </>
  );

  return (
    <div ref={containerRef} className="searchResultCard-breadcrumbs">
      <div
        ref={measureRef}
        className="searchResultCard-breadcrumbs-measure"
        aria-hidden="true"
      >
        <CrumbList crumbs={crumbs} />
      </div>
      <div className="searchResultCard-breadcrumbs-inner">
        {isTruncated ? truncatedCrumbs : <CrumbList crumbs={crumbs} />}
      </div>
    </div>
  );
}

BreadcrumbPath.propTypes = {
  crumbs: PropTypes.arrayOf(PropTypes.shape({
    label:       PropTypes.string.isRequired,
    hebrewLabel: PropTypes.string,
    href:        PropTypes.string,
  })),
};

export default BreadcrumbPath;
