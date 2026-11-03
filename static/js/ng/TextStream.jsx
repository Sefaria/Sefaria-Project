/**
 * The reading surface: every loaded section of the book, one after another, in the document
 * scroller. It renders synchronously from its props, so the server HTML carries the full text.
 *
 * Layouts: source only, translation only, or bilingual (stacked, or side by side), each
 * segmented (a block per segment with its number in the margin) or, for a single language,
 * continuous (flowing prose; the default for Talmud).
 */
import React, {memo, useMemo, useRef, useState} from 'react';
import {
  addPoetrySpans, bindDashes, isTalmud, sectionLabelParts, segmentNumberLabel, showsSegmentNumbers, stripHebrewMarks,
  visibleTexts,
} from './text';
import {layoutFor} from './settings';
import {displayTitle, formatCount, openTarget} from './associated';
import {useIsomorphicLayoutEffect} from './context';
import {associatedStrings} from './associatedStrings';

function prepareHtml(html, version, settings, section, isPrimaryText) {
  if (!html) { return ''; }
  let out = html;
  if (isPrimaryText && version && version.direction === 'rtl') {
    out = stripHebrewMarks(out, settings, isTalmud(section));
  }
  if (version && version.formatAsPoetry) { out = addPoetrySpans(out); }
  if (!version || version.direction !== 'rtl') { out = bindDashes(out); }
  return out;
}

function TextBlock({html, version, className, fallbackLang, fallbackDir, as: Tag = 'div'}) {
  return (
    <Tag className={className}
         lang={(version && version.lang) || fallbackLang}
         dir={(version && version.direction) || fallbackDir}
         dangerouslySetInnerHTML={{__html: html}} />
  );
}

/** Direction of the frame a section's text sits in; segment numbers go on its inline-start side. */
export function textFrameDir(section, language, interfaceDir) {
  if (language === 'hebrew') { return (section.primary && section.primary.direction) || 'rtl'; }
  if (language === 'english') { return (section.translation && section.translation.direction) || 'ltr'; }
  return interfaceDir;
}

function numberUsesHebrew(language, interfaceLang, frameDir) {
  if (language === 'bilingual') { return interfaceLang === 'hebrew'; }
  return frameDir === 'rtl';
}

/**
 * The count of associated texts for a segment (I2): quiet, and a tap opens the associated panel
 * on this segment. Rendered only once the counts have loaded in the browser.
 */
function CountBadge({segmentRef, count, interfaceLang, inline}) {
  if (!count) { return null; }
  const s = associatedStrings(interfaceLang);
  return (
    <button type="button" className={inline ? 'ng-seg-badge ng-seg-badge-inline' : 'ng-seg-badge'} data-ng="segment-badge"
            data-ref={segmentRef} aria-label={s.connections(count)} title={s.connections(count)}>
      <span aria-hidden="true">{formatCount(count)}</span>
    </button>
  );
}

/** Which texts a pinned comment shows for the reader's language, with the Hebrew-only fallback. */
function commentTexts(comment, language) {
  if (language === 'hebrew') { return {he: comment.he.length ? comment.he : [], en: comment.he.length ? [] : comment.en, hebrewOnly: false}; }
  if (language === 'english') { return {he: comment.en.length ? [] : comment.he, en: comment.en, hebrewOnly: !comment.en.length}; }
  return {he: comment.he, en: comment.en, hebrewOnly: false};
}

/**
 * A pinned work's comments on one segment, as one run of text per language (its Hebrew, then
 * its English), each run clamped to PIN_LINES until the reader expands it.
 */
export function pinRuns(comments, language) {
  const out = {he: [], en: [], hebrewOnly: false};
  for (const comment of comments || []) {
    const t = commentTexts(comment, language);
    t.he.forEach(html => out.he.push({ref: comment.ref, html}));
    t.en.forEach(html => out.en.push({ref: comment.ref, html}));
    out.hebrewOnly = out.hebrewOnly || t.hebrewOnly;
  }
  return out;
}

export const PIN_LINES = 3;
const PIN_TOP_MARGIN = 72;  // below the header, when a collapse brings a comment back into view

const SmallIcon = ({children}) => (
  <svg className="ng-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"
       fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
// "Open front and center": an arrow out of its box.
export const OpenIcon = () => <SmallIcon><path d="M13.5 5.5h5v5M18.5 5.5l-7.5 7.5" /><path d="M16.5 14v3.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H10" /></SmallIcon>;
const ExpandIcon = () => <SmallIcon><path d="m6.5 9.5 5.5 5.5 5.5-5.5" /></SmallIcon>;

function hasSelection() {
  const selection = typeof window !== 'undefined' && window.getSelection && window.getSelection();
  return !!(selection && !selection.isCollapsed && String(selection).length);
}

/**
 * One pinned work under one segment (I1): its name (a tap opens the work in the panel), an Open
 * button (the comment front and center), and its text, at most PIN_LINES lines per language
 * with an ellipsis. A tap on the text expands it to full size and another collapses it; the
 * state is this comment's own. The expand affordance appears only when a run is clipped.
 */
function PinnedComment({segmentRef, pin, language, interfaceLang, sideBySide, fontSize}) {
  const s = associatedStrings(interfaceLang);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const bodyRef = useRef(null);
  const runs = pinRuns(pin.comments, language);
  const key = `${pin.category}|${pin.title}`;
  const title = displayTitle(pin, interfaceLang);
  const target = openTarget(pin.comments.map(c => c.ref));
  const content = pin.comments.map(c => c.ref).join('|');
  const bothColumns = sideBySide && runs.he.length > 0 && runs.en.length > 0;

  // Measure while collapsed: does any language run past its lines? Again on resize, and when
  // the text reflows (web fonts arriving, a new font size).
  useIsomorphicLayoutEffect(() => {
    if (expanded) { return undefined; }
    const body = bodyRef.current;
    if (!body) { return undefined; }
    const measure = () => {
      const over = Array.from(body.querySelectorAll('[data-ng="pin-run"]')).some(el => el.scrollHeight > el.clientHeight + 1);
      setClipped(over);
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(measure) : null;
    if (observer) { observer.observe(body); }
    return () => {
      window.removeEventListener('resize', measure);
      if (observer) { observer.disconnect(); }
    };
  }, [expanded, content, language, fontSize, bothColumns]);

  // Collapsing a long comment the reader has scrolled into: keep its top on screen, not the text
  // that would otherwise slide up under the header.
  const pinRef = useRef(null);
  const collapsedFrom = useRef(null);
  useIsomorphicLayoutEffect(() => {
    const el = pinRef.current;
    if (expanded || collapsedFrom.current === null || !el) { return; }
    collapsedFrom.current = null;
    const top = el.getBoundingClientRect().top;
    if (top < PIN_TOP_MARGIN) { window.scrollBy(0, top - PIN_TOP_MARGIN); }
  }, [expanded]);

  const expandable = clipped || expanded;
  const toggle = () => {
    if (!expandable) { return; }
    if (expanded) { collapsedFrom.current = true; }
    setExpanded(x => !x);
  };
  const onBodyClick = (e) => {
    const t = e.target;
    if (t.closest && t.closest('a.refLink')) { return; }  // a cited ref: the stream opens it in the panel
    e.stopPropagation();  // this tap is the comment's: not the header's, and not a navigation
    if (t.closest && t.closest('a')) { e.preventDefault(); }
    if (hasSelection()) { return; }  // the reader is selecting text
    toggle();
  };
  const run = (lang, parts) => (parts.length ? (
    <span className={`ng-pin-run ng-pin-${lang}`} data-ng="pin-run" lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {parts.map((part, i) => (
        <React.Fragment key={`${part.ref}${i}`}>
          {i ? ' ' : null}
          <span className="ng-pin-part" dangerouslySetInnerHTML={{__html: part.html}} />
        </React.Fragment>
      ))}
    </span>
  ) : null);

  return (
    <span className="ng-pin" data-ng="pin" data-ref={segmentRef} data-pin-key={key} ref={pinRef}
          data-expanded={expanded ? 'true' : 'false'} data-clipped={clipped ? 'true' : 'false'}>
      <span className="ng-pin-head">
        <button type="button" className="ng-pin-name" data-ng="pin-name" title={s.openInPanel(title)}>{title}</button>
        <span className="ng-pin-actions">
          {expandable ? (
            <button type="button" className="ng-pin-action ng-pin-expand" data-ng="pin-expand" aria-expanded={expanded}
                    aria-label={expanded ? s.showLess : s.showMore} title={expanded ? s.showLess : s.showMore}
                    onClick={(e) => { e.stopPropagation(); toggle(); }}><ExpandIcon /></button>
          ) : null}
          {target ? (
            <button type="button" className="ng-pin-action" data-ng="pin-open" data-open-ref={target}
                    aria-label={s.openRef(target)} title={s.openRef(target)}><OpenIcon /></button>
          ) : null}
        </span>
      </span>
      <span className="ng-pin-body" data-ng="pin-body" ref={bodyRef} onClick={onBodyClick}
            data-sbs={bothColumns || undefined} dir={bothColumns ? 'ltr' : undefined}>
        {run('he', runs.he)}
        {run('en', runs.en)}
      </span>
      {runs.hebrewOnly ? <span className="ng-hebrew-only">{s.hebrewOnly}</span> : null}
    </span>
  );
}

/** The pinned commentators' comments on one segment (I1). */
function PinnedComments({segmentRef, pinned, language, interfaceLang, sideBySide, fontSize}) {
  return (
    <span className="ng-pinned" data-ng="pinned">
      {pinned.map(pin => (
        <PinnedComment key={`${pin.category}|${pin.title}`} segmentRef={segmentRef} pin={pin} language={language}
                       interfaceLang={interfaceLang} sideBySide={sideBySide} fontSize={fontSize} />
      ))}
    </span>
  );
}

const Segment = memo(function Segment({
  segment, section, settings, highlighted, showNumber, hebrewNumbers, sideBySide, count, pinned, anchored, interfaceLang,
}) {
  const vis = visibleTexts(segment, settings.language);
  const he = vis.he ? prepareHtml(segment.he, section.primary, settings, section, true) : '';
  const en = vis.en ? prepareHtml(segment.en, section.translation, settings, section, false) : '';
  return (
    <div className="ng-seg" data-ng="segment" data-ref={segment.ref} data-he-ref={segment.heRef}
         data-section-ref={section.ref} data-highlighted={highlighted ? 'true' : undefined}
         data-anchor={anchored ? 'true' : undefined}>
      {showNumber ? (
        <span className="ng-segnum" aria-hidden="true"><span>{segmentNumberLabel(segment.number, hebrewNumbers)}</span></span>
      ) : null}
      <CountBadge segmentRef={segment.ref} count={count} interfaceLang={interfaceLang} />
      <div className="ng-seg-body" data-sbs={sideBySide || undefined} dir={sideBySide ? 'ltr' : undefined}>
        {he ? <TextBlock className="ng-he" html={he} version={section.primary} fallbackLang="he" fallbackDir="rtl" /> : null}
        {en ? <TextBlock className="ng-en" html={en} version={section.translation} fallbackLang="en" fallbackDir="ltr" /> : null}
      </div>
      {pinned ? (
        <PinnedComments segmentRef={segment.ref} pinned={pinned} language={settings.language} interfaceLang={interfaceLang}
                        sideBySide={sideBySide} fontSize={settings.fontSize} />
      ) : null}
    </div>
  );
});

function ContinuousText({section, settings, highlightedRefs, hebrewNumbers, counts, pinned, anchorRef, interfaceLang}) {
  const useSource = settings.language === 'hebrew';
  const version = useSource ? section.primary : section.translation;
  const numbered = !isTalmud(section) && showsSegmentNumbers(section);
  return (
    <div className={useSource ? 'ng-prose ng-he' : 'ng-prose ng-en'}
         lang={(version && version.lang) || (useSource ? 'he' : 'en')}
         dir={(version && version.direction) || (useSource ? 'rtl' : 'ltr')}>
      {section.segments.map(segment => {
        const vis = visibleTexts(segment, settings.language);
        const html = vis.he
          ? prepareHtml(segment.he, section.primary, settings, section, true)
          : prepareHtml(segment.en, section.translation, settings, section, false);
        return (
          <span key={segment.ref} className="ng-seg ng-seg-inline" data-ng="segment" data-ref={segment.ref}
                data-he-ref={segment.heRef} data-section-ref={section.ref}
                data-highlighted={highlightedRefs.has(segment.ref) ? 'true' : undefined}
                data-anchor={anchorRef === segment.ref ? 'true' : undefined}>
            {numbered ? <sup className="ng-inline-num" aria-hidden="true">{segmentNumberLabel(segment.number, hebrewNumbers)}</sup> : null}
            <span dangerouslySetInnerHTML={{__html: html}} />
            <CountBadge segmentRef={segment.ref} count={counts && counts[segment.ref]} interfaceLang={interfaceLang} inline />
            {pinned && pinned[segment.ref] ? (
              <PinnedComments segmentRef={segment.ref} pinned={pinned[segment.ref]} language={settings.language}
                              interfaceLang={interfaceLang} fontSize={settings.fontSize} />
            ) : null}
            {' '}
          </span>
        );
      })}
    </div>
  );
}

function BookTitle({section}) {
  return (
    <div className="ng-book-title" data-ng="book-title">
      <div className="ng-book-title-en" lang="en" dir="ltr">{section.indexTitle}</div>
      <div className="ng-book-title-he" lang="he" dir="rtl">{section.heIndexTitle}</div>
    </div>
  );
}

const Section = memo(function Section({section, settings, interfaceLang, interfaceDir, highlightedRefs, counts, pinned, anchorRef}) {
  const language = settings.language;
  const layout = layoutFor(settings, section);
  const continuous = layout === 'continuous' && language !== 'bilingual';
  const sideBySide = language === 'bilingual' && (settings.biLayout === 'heLeft' || settings.biLayout === 'heRight');
  const frameDir = textFrameDir(section, language, interfaceDir);
  const hebrewNumbers = numberUsesHebrew(language, interfaceLang, frameDir);
  const showNumbers = showsSegmentNumbers(section);
  const label = sectionLabelParts(section, interfaceLang === 'hebrew');
  return (
    <section className="ng-section" data-ng="section" data-ref={section.ref} data-layout={continuous ? 'continuous' : 'segmented'}
             data-category={section.primaryCategory || undefined} data-bilayout={sideBySide ? settings.biLayout : undefined}
             dir={frameDir}>
      {!section.prev ? <BookTitle section={section} /> : null}
      <h2 className="ng-section-title" data-ng="section-title" dir={interfaceDir}>
        <span className="ng-section-label">
          {label.name ? <span className="ng-section-name">{label.name}</span> : null}
          {label.name ? ' ' : null}
          <span className="ng-section-address">{label.address}</span>
        </span>
      </h2>
      {continuous ? (
        <ContinuousText section={section} settings={settings} highlightedRefs={highlightedRefs} hebrewNumbers={hebrewNumbers}
                        counts={counts} pinned={pinned} anchorRef={anchorRef} interfaceLang={interfaceLang} />
      ) : (
        <div className="ng-segments">
          {section.segments.map(segment => (
            <Segment key={segment.ref} segment={segment} section={section} settings={settings}
                     highlighted={highlightedRefs.has(segment.ref)} showNumber={showNumbers}
                     hebrewNumbers={hebrewNumbers} sideBySide={sideBySide} count={counts && counts[segment.ref]}
                     pinned={pinned && pinned[segment.ref]} anchored={anchorRef === segment.ref} interfaceLang={interfaceLang} />
          ))}
        </div>
      )}
    </section>
  );
});

/**
 * The top and bottom of the stream. Idle edges are real links to the neighbouring section, so
 * the server HTML (and a reader without JS) can page through the book; with JS they load in place.
 */
function EdgeStatus({dir, status, strings, onRetry, edgeRef, urlFor}) {
  const dataNg = `${dir}-edge`;
  if (status === 'loading' || status === 'ready') {
    return (
      <div className="ng-edge" data-ng={dataNg} data-status="loading" role="status">
        <span className="ng-spinner" aria-hidden="true" />
        <span className="ng-visually-hidden">{dir === 'next' ? strings.loadingNext : strings.loadingPrev}</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="ng-edge" data-ng={dataNg} data-status="error">
        <button type="button" className="ng-edge-button" onClick={() => onRetry(dir)}>{strings.retry}</button>
      </div>
    );
  }
  if (status === 'idle' && edgeRef) {
    const onClick = (e) => { e.preventDefault(); onRetry(dir); };
    return (
      <div className="ng-edge" data-ng={dataNg} data-status="idle">
        <a className="ng-edge-button" href={urlFor(edgeRef)} onClick={onClick}>
          {dir === 'next' ? strings.nextSection : strings.loadPrevious}
        </a>
      </div>
    );
  }
  if (dir === 'next' && status === 'done') {
    return <div className="ng-edge ng-end" data-ng={dataNg} data-status="done"><span>{strings.endOfBook}</span></div>;
  }
  return <div className="ng-edge" data-ng={dataNg} data-status={status} />;
}

const NONE = {};

export default function TextStream({
  sections, settings, interfaceLang, interfaceDir, highlightedRefs = [], stream, strings, onRetry, onClick, streamRef, urlFor,
  linkCounts = NONE, pinned = NONE, anchorRef = null,
}) {
  const highlighted = useMemo(() => new Set(highlightedRefs), [highlightedRefs]);
  const first = sections[0];
  const last = sections[sections.length - 1];
  return (
    <main className="ng-stream" data-ng="stream" ref={streamRef} onClick={onClick}
          data-language={settings.language} style={{'--ng-font-scale': settings.fontSize / 62.5}}>
      {first && first.prev ? (
        <EdgeStatus dir="prev" status={stream.prev.status} strings={strings} onRetry={onRetry} edgeRef={first.prev} urlFor={urlFor} />
      ) : null}
      {sections.map(section => (
        <Section key={section.ref} section={section} settings={settings} interfaceLang={interfaceLang}
                 interfaceDir={interfaceDir} highlightedRefs={highlighted} counts={linkCounts[section.ref]}
                 pinned={pinned[section.ref]} anchorRef={anchorRef && anchorRef.indexOf(section.ref) === 0 ? anchorRef : null} />
      ))}
      <EdgeStatus dir="next" status={stream.next.status} strings={strings} onRetry={onRetry}
                  edgeRef={last ? last.next : null} urlFor={urlFor} />
    </main>
  );
}
