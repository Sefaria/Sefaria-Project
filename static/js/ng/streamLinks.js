/**
 * Associated texts in the stream itself: the per-segment count badges, and the comments of the
 * pinned commentators under every segment.
 *
 * Both come from the same per-chunk link requests (/api/links/Genesis 1:1-8?with_text=0),
 * made only for segments near the viewport, so reading a chapter never fetches the chapter's
 * whole link set up front. Browser only: without IntersectionObserver nothing loads, and the
 * server renders the stream with no badges or pins.
 */
import {useEffect, useMemo, useRef, useState} from 'react';
import {booksFromLinks, corpusOf} from './associated';
import {chunkFor, loadChunk, loadPinnedComments} from './associatedData';
import {pinScope} from './pins';
import {SEGMENT_SELECTOR} from './currentSegment';

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  return mounted;
}

/**
 * Links per segment for the segments on (or near) screen: {bySegment: {ref: links}, version}.
 * `deps` re-observe the stream's segments when its content changes.
 */
export function useStreamLinks(streamRef, sections, deps = []) {
  const [state, setState] = useState({bySegment: {}, version: 0});
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const requested = useRef(new Set());
  const mounted = useMounted();

  useEffect(() => {
    const root = streamRef.current;
    if (!root || typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') { return undefined; }
    const request = (el) => {
      const section = sectionsRef.current.find(s => s.ref === el.getAttribute('data-section-ref'));
      const segment = section && section.segments.find(s => s.ref === el.getAttribute('data-ref'));
      const chunk = segment && chunkFor(section, segment.number);
      if (!chunk || requested.current.has(chunk.key)) { return; }
      requested.current.add(chunk.key);
      loadChunk(chunk).then(split => {
        if (!mounted.current) { return; }
        setState(prev => ({bySegment: {...prev.bySegment, ...split}, version: prev.version + 1}));
      }, () => { requested.current.delete(chunk.key); });
    };
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) { request(entry.target); } });
    }, {rootMargin: '60% 0px'});
    root.querySelectorAll(SEGMENT_SELECTOR).forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

/**
 * Link counts per section: {sectionRef: {segmentRef: n}}. A section's object keeps its
 * identity while its counts are unchanged, so memoized sections don't re-render.
 */
export function useLinkCounts(sections, bySegment) {
  const previous = useRef({});
  return useMemo(() => {
    const out = {};
    for (const section of sections) {
      const counts = {};
      let any = false;
      for (const segment of section.segments) {
        const links = bySegment[segment.ref];
        if (links) { counts[segment.ref] = links.length; any = true; }
      }
      if (!any) { continue; }
      const prev = previous.current[section.ref];
      const same = prev && Object.keys(prev).length === Object.keys(counts).length
        && Object.keys(counts).every(k => prev[k] === counts[k]);
      out[section.ref] = same ? prev : counts;
    }
    previous.current = out;
    return out;
  }, [sections, bySegment]);
}

const pinKey = (segmentRef, pin) => `${segmentRef}|${pin.category}|${pin.title}`;

/**
 * Comments of the pinned commentators, per section and segment:
 * {sectionRef: {segmentRef: [{title, heTitle, category, comments}]}}.
 */
export function usePinnedCommentary(sections, bySegment, pins) {
  const [results, setResults] = useState({});
  const requested = useRef(new Set());
  const mounted = useMounted();

  useEffect(() => {
    for (const section of sections) {
      const list = pins[pinScope(section, corpusOf(section))];
      if (!list || !list.length) { continue; }
      for (const segment of section.segments) {
        const links = bySegment[segment.ref];
        if (!links) { continue; }
        for (const pin of list) {
          const key = pinKey(segment.ref, pin);
          if (requested.current.has(key)) { continue; }
          const mine = links.filter(l => l.collectiveTitle.en === pin.title && l.category === pin.category);
          requested.current.add(key);
          if (!mine.length) { continue; }
          const ordered = booksFromLinks(mine)[0].links;
          loadPinnedComments(ordered, section).then(comments => {
            if (mounted.current) { setResults(prev => ({...prev, [key]: comments})); }
          }, () => { requested.current.delete(key); });
        }
      }
    }
  }, [sections, bySegment, pins]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const out = {};
    for (const section of sections) {
      const list = pins[pinScope(section, corpusOf(section))];
      if (!list || !list.length) { continue; }
      const bySeg = {};
      for (const segment of section.segments) {
        const entries = list
          .map(pin => ({...pin, comments: results[pinKey(segment.ref, pin)]}))
          .filter(p => p.comments && p.comments.length);
        if (entries.length) { bySeg[segment.ref] = entries; }
      }
      if (Object.keys(bySeg).length) { out[section.ref] = bySeg; }
    }
    return out;
  }, [sections, pins, results]);
}
