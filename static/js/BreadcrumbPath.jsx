import React, { useRef, useState, useLayoutEffect } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

const CHEVRON = '/static/icons/chevron-right-sm.svg';

function Breadcrumb({ label, hebrewLabel, href, linkProps }) {
  const text = <InterfaceText text={{ en: label, he: hebrewLabel }} />;
  if (href) {
    // onClick is pulled out of linkProps instead of being spread with the rest, so a caller's
    // handler runs *in addition to* stopPropagation rather than replacing it. Without the
    // stopPropagation, clicking a crumb would also trigger the enclosing card and open the
    // result instead of the category.
    const { onClick, ...rest } = linkProps || {};
    return (
      <a
        href={href}
        className="searchResultCard-crumb searchResultCard-crumb--link"
        {...rest}
        onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
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

function CrumbList({ crumbs, getCrumbLinkProps }) {
  return crumbs.map((crumb, i) => (
    <React.Fragment key={i}>
      {i > 0 && <CrumbSep />}
      <Breadcrumb label={crumb.label} hebrewLabel={crumb.hebrewLabel} href={crumb.href}
                  linkProps={getCrumbLinkProps?.(crumb)} />
    </React.Fragment>
  ));
}

/**
 * BreadcrumbPath
 *
 * Props:
 *   crumbs – array of { label: string, hebrewLabel?: string, href?: string }
 *   getCrumbLinkProps – optional (crumb) => props, spread onto that crumb's <a>.
 *     An `onClick` in the returned props runs after the built-in stopPropagation
 *     rather than replacing it. Used by SearchResultCard to report crumb clicks
 *     to search analytics; the component itself knows nothing about analytics.
 *
 * Truncation rules (per spec):
 *   - Never truncate individual nodes mid-label.
 *   - If the full path overflows, show [first] > [...] > [last].
 *   - The "..." node has the same hover style as a text crumb.
 *   - Hovering "..." shows a static tooltip listing the hidden middle crumbs
 *     joined by ">", styled like the reader-header tooltip.
 */
function BreadcrumbPath({ crumbs, getCrumbLinkProps }) {
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
      <Breadcrumb label={first.label} hebrewLabel={first.hebrewLabel} href={first.href}
                  linkProps={getCrumbLinkProps?.(first)} />
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
          <Breadcrumb label={last.label} hebrewLabel={last.hebrewLabel} href={last.href}
                      linkProps={getCrumbLinkProps?.(last)} />
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
        {/* Measurement copy only — `pointer-events: none`, and deliberately given no
            link props, so it can never emit a duplicate analytics event. */}
        <CrumbList crumbs={crumbs} />
      </div>
      <div className="searchResultCard-breadcrumbs-inner">
        {isTruncated
          ? truncatedCrumbs
          : <CrumbList crumbs={crumbs} getCrumbLinkProps={getCrumbLinkProps} />}
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
  getCrumbLinkProps: PropTypes.func,
};

export default BreadcrumbPath;
