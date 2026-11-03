/**
 * The text itself: loaded sections → numbered segments in he / en / bi (stacked or side by
 * side), segmented or continuous, with selection, URL highlight, footnote toggles and in-text
 * ref links. Pure presentation: selection state and loading live in ReaderPage.
 */
import React from 'react';
import { useT } from '../i18n';
import { navigate } from '../router';
import { stripHebrewMarks } from './textData';

function Html({ html, className, lang }) {
  return <div className={className} lang={lang} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SegmentText({ seg, contentLang, biLayout, vowels, cantillation, hasEn, hasHe }) {
  const he = stripHebrewMarks(seg.he, { vowels, cantillation });
  const showHe = contentLang !== 'en' || !hasEn;
  const showEn = contentLang !== 'he' || !hasHe;
  return (
    <div className={`ln-seg-body ${contentLang === 'bi' && showHe && showEn ? `is-bi is-${biLayout}` : ''}`}>
      {showHe && he && <Html className="ln-seg-he ln-text-he" lang="he" html={he} />}
      {showEn && seg.en && <Html className="ln-seg-en ln-text-en" lang="en" html={seg.en} />}
    </div>
  );
}

function sectionHasLang(segments, key) {
  return segments.some(s => s[key]);
}

export default function TextStream({
  sections, contentLang, biLayout, flow, vowels, cantillation, selectedRefs, focusRef, highlight,
  onSelect, renderAfterSegment, showSectionHeads,
}) {
  const { t, lang } = useT();

  const onClick = (e) => {
    const marker = e.target.closest && e.target.closest('.footnote-marker');
    if (marker) {
      e.stopPropagation();
      const note = marker.nextElementSibling;
      if (note && note.classList.contains('footnote')) { note.classList.toggle('is-open'); }
      return;
    }
    const a = e.target.closest && e.target.closest('a[href]');
    if (a) {
      const href = a.getAttribute('href');
      if (href && href.startsWith('/')) { e.preventDefault(); e.stopPropagation(); navigate(href); }
      return;
    }
    const segEl = e.target.closest && e.target.closest('[data-ref]');
    if (segEl && onSelect) { onSelect(segEl.getAttribute('data-ref'), { shift: e.shiftKey }); }
  };

  const numberFor = seg => (lang === 'he' ? seg.heLabel : seg.label);

  return (
    <div className={`ln-stream is-${flow} is-${contentLang}`} onClick={onClick}>
      {sections.map(({ data, segments }, si) => {
        const hasEn = sectionHasLang(segments, 'en');
        const hasHe = sectionHasLang(segments, 'he');
        const lastSelected = [...segments].reverse().find(s => selectedRefs.has(s.ref));
        const isFirst = si === 0;
        return (
          <section key={data.ref} className="ln-section" data-section-ref={data.sectionRef || data.ref} aria-label={lang === 'he' ? data.heRef : data.ref}>
            {showSectionHeads && (
              <h2 className="ln-section-head">{lang === 'he' ? (data.heSectionRef || data.heRef) : (data.sectionRef || data.ref)}</h2>
            )}
            {flow === 'segmented' ? (
              <ol className="ln-segments" aria-label={lang === 'he' ? data.heRef : data.ref}>
                {segments.map((seg, i) => {
                  const selected = selectedRefs.has(seg.ref);
                  const hi = isFirst && highlight && i >= highlight.from && i <= highlight.to;
                  return (
                    <React.Fragment key={seg.ref}>
                      <li className={`ln-seg ${selected ? 'is-selected' : ''} ${hi ? 'is-highlight' : ''} ${focusRef === seg.ref ? 'is-focus' : ''}`}
                          data-ref={seg.ref} id={segmentDomId(seg.ref)} aria-selected={selected}>
                        <button type="button" className="ln-seg-num" aria-label={t('reader.selectSegment', { ref: lang === 'he' ? seg.heRef : seg.ref })}
                                aria-pressed={selected}>{numberFor(seg)}</button>
                        <SegmentText seg={seg} contentLang={contentLang} biLayout={biLayout} vowels={vowels} cantillation={cantillation} hasEn={hasEn} hasHe={hasHe} />
                      </li>
                      {lastSelected === seg && renderAfterSegment && <li className="ln-toolbelt-slot" aria-hidden={false}>{renderAfterSegment(seg)}</li>}
                    </React.Fragment>
                  );
                })}
              </ol>
            ) : (
              <ContinuousSection segments={segments} contentLang={contentLang} biLayout={biLayout} vowels={vowels} cantillation={cantillation}
                                 selectedRefs={selectedRefs} focusRef={focusRef} highlight={isFirst ? highlight : null} numberFor={numberFor}
                                 hasEn={hasEn} hasHe={hasHe} after={lastSelected && renderAfterSegment ? renderAfterSegment(lastSelected) : null} t={t} lang={lang} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function ContinuousSection({ segments, contentLang, biLayout, vowels, cantillation, selectedRefs, focusRef, highlight, numberFor, hasEn, hasHe, after, t, lang }) {
  const showHe = contentLang !== 'en' || !hasEn;
  const showEn = contentLang !== 'he' || !hasHe;
  const block = (key) => (
    <div className={`ln-flow ${key === 'he' ? 'ln-text-he' : 'ln-text-en'}`} lang={key}>
      {segments.map((seg, i) => {
        const html = key === 'he' ? stripHebrewMarks(seg.he, { vowels, cantillation }) : seg.en;
        if (!html) { return null; }
        const selected = selectedRefs.has(seg.ref);
        const hi = highlight && i >= highlight.from && i <= highlight.to;
        return (
          <span key={seg.ref} className={`ln-seg ln-seg-inline ${selected ? 'is-selected' : ''} ${hi ? 'is-highlight' : ''} ${focusRef === seg.ref ? 'is-focus' : ''}`}
                data-ref={seg.ref} id={key === 'he' || !showHe ? segmentDomId(seg.ref) : undefined} aria-selected={selected}>
            <button type="button" className="ln-seg-num" aria-label={t('reader.selectSegment', { ref: lang === 'he' ? seg.heRef : seg.ref })} aria-pressed={selected}>{numberFor(seg)}</button>
            <span dangerouslySetInnerHTML={{ __html: html }} />{' '}
          </span>
        );
      })}
    </div>
  );
  return (
    <>
      <div className={`ln-flow-wrap ${showHe && showEn ? `is-bi is-${biLayout}` : ''}`}>
        {showHe && hasHe && block('he')}
        {showEn && hasEn && block('en')}
      </div>
      {after && <div className="ln-toolbelt-slot">{after}</div>}
    </>
  );
}

export function segmentDomId(ref) {
  return 'seg-' + ref.replace(/[^\w֐-׿]+/g, '_');
}
