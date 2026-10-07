/**
 * Read it to me: a thin layer over the browser's `speechSynthesis`. `speechSupport()` says what
 * this device can do; `useSpeech()` drives play / pause / stop from React. No voice for a
 * language means that language's button is disabled, never broken.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const synth = () => (typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null);

export function pickVoice(voices, lang) {
  const list = (voices || []).filter(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(lang));
  if (!list.length) { return null; }
  return list.find(v => v.default) || list.find(v => /google|natural|premium|enhanced/i.test(v.name)) || list[0];
}

/** `{ supported, voices, en, he }` for the current device. */
export function speechSupport(voices = (synth() ? synth().getVoices() : [])) {
  const s = synth();
  return { supported: !!s && typeof window.SpeechSynthesisUtterance === 'function', voices, en: pickVoice(voices, 'en'), he: pickVoice(voices, 'he') };
}

/** Split long text into sentence-sized utterances (browsers cut off very long ones). */
export function chunkText(text, max = 220) {
  const parts = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?׃:;]+[.!?׃:;]*\s*/g) || [];
  const out = [];
  for (const p of parts) {
    if (out.length && (out[out.length - 1] + p).length <= max) { out[out.length - 1] += p; } else { out.push(p); }
  }
  return out.map(s => s.trim()).filter(Boolean);
}

export function useSpeech() {
  const [support, setSupport] = useState(() => speechSupport());
  const [status, setStatus] = useState('idle');   // idle | speaking | paused
  const [rate, setRate] = useState(1);
  const queue = useRef([]);
  useEffect(() => {
    const s = synth();
    if (!s) { return undefined; }
    const refresh = () => setSupport(speechSupport(s.getVoices()));
    refresh();
    if (typeof s.addEventListener === 'function') { s.addEventListener('voiceschanged', refresh); }
    return () => {
      if (typeof s.removeEventListener === 'function') { s.removeEventListener('voiceschanged', refresh); }
      s.cancel();
    };
  }, []);
  const stop = useCallback(() => { const s = synth(); if (s) { s.cancel(); } queue.current = []; setStatus('idle'); }, []);
  const speak = useCallback((text, lang) => {
    const s = synth();
    const voice = support[lang];
    if (!s || !voice) { return false; }
    s.cancel();
    const chunks = chunkText(text);
    queue.current = chunks;
    chunks.forEach((chunk, i) => {
      const u = new window.SpeechSynthesisUtterance(chunk);
      u.voice = voice; u.lang = voice.lang; u.rate = rate;
      if (i === chunks.length - 1) { u.onend = () => setStatus('idle'); }
      u.onerror = () => setStatus('idle');
      s.speak(u);
    });
    setStatus('speaking');
    return true;
  }, [support, rate]);
  const pause = useCallback(() => { const s = synth(); if (s) { s.pause(); setStatus('paused'); } }, []);
  const resume = useCallback(() => { const s = synth(); if (s) { s.resume(); setStatus('speaking'); } }, []);
  return { support, status, rate, setRate, speak, pause, resume, stop };
}
