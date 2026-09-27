/**
 * The reading surface: every loaded section of the book, one after another, in the document
 * scroller. It renders synchronously from its props, so the server HTML carries the full text.
 *
 * Layouts: source only, translation only, or bilingual (stacked, or side by side), each
 * segmented (a block per segment with its number in the margin) or, for a single language,
 * continuous (flowing prose; the default for Talmud).
 */
import React, {memo, useMemo} from 'react';
import {
  addPoetrySpans, bindDashes, isTalmud, sectionLabelParts, segmentNumberLabel, showsSegmentNumbers, stripHebrewMarks,
  visibleTexts,
} from './text';
import {layoutFor} from './settings';
import {displayTitle, formatCount} from './associated';
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

/** The pinned commentators' comments on one segment (I1). A tap opens that work in the panel. */
function PinnedComments({segmentRef, pinned, language, interfaceLang}) {
  const s = associatedStrings(interfaceLang);
  return (
    <span className="ng-pinned" data-ng="pinned">
      {pinned.map(pin => (
        <span key={`${pin.category}|${pin.title}`} className="ng-pin" data-ng="pin" data-ref={segmentRef}
              data-pin-key={`${pin.category}|${pin.title}`} role="button" tabIndex={0}>
          <span className="ng-pin-name">{displayTitle(pin, interfaceLang)}</span>
          {pin.comments.map(comment => {
            const t = commentTexts(comment, language);
            return (
              <span key={comment.ref} className="ng-pin-comment">
                {t.he.map((html, i) => <span key={`he${i}`} className="ng-pin-he" lang="he" dir="rtl" dangerouslySetInnerHTML={{__html: html}} />)}
                {t.en.map((html, i) => <span key={`en${i}`} className="ng-pin-en" lang="en" dir="ltr" dangerouslySetInnerHTML={{__html: html}} />)}
                {t.hebrewOnly ? <span className="ng-hebrew-only">{s.hebrewOnly}</span> : null}
              </span>
            );
          })}
        </span>
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
      {pinned ? <PinnedComments segmentRef={segment.ref} pinned={pinned} language={settings.language} interfaceLang={interfaceLang} /> : null}
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
              <PinnedComments segmentRef={segment.ref} pinned={pinned[segment.ref]} language={settings.language} interfaceLang={interfaceLang} />
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
