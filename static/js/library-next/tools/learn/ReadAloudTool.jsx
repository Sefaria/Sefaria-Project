/**
 * Read it to me (newcomer): the browser's speech synthesis reads the selection's English, and
 * its Hebrew when a Hebrew voice is installed. Without speech support the tool says so and is
 * marked simulated; it never shows a dead control.
 */
import React from 'react';
import { useT } from '../../i18n';
import { useKv } from '../../store';
import { selectionText } from '../../reader/textData';
import { useSpeech } from './speech';

const Speaker = () => (
  <svg className="ln-tool-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
export const speakerIcon = <Speaker />;

export default function ReadAloudTool({ selection }) {
  const { t } = useT();
  const [vowels] = useKv('reader.vowels', true);
  const { support, status, rate, setRate, speak, pause, resume, stop } = useSpeech();
  const text = selectionText(selection.segments, { vowels, cantillation: false });
  if (!support.supported) {
    return (
      <div className="ln-tool-body ln-stack ln-learn">
        <p className="ln-muted">{t('learn.readAloud.unavailable')}</p>
        <span className="ln-badge-simulated">{t('learn.simulated')}</span>
      </div>
    );
  }
  const button = (lang) => {
    const voice = support[lang];
    const has = !!voice && !!text[lang];
    return (
      <div key={lang} className="ln-learn-voice">
        <button type="button" className="ln-btn ln-btn-primary" disabled={!has} onClick={() => speak(text[lang], lang)}>{t(`learn.readAloud.${lang}`)}</button>
        <span className="ln-small ln-muted">{voice ? t('learn.readAloud.voice', { name: voice.name }) : t(lang === 'he' ? 'learn.readAloud.noHe' : 'learn.readAloud.noEn')}</span>
      </div>
    );
  };
  return (
    <div className="ln-tool-body ln-stack ln-learn">
      {['en', 'he'].map(button)}
      <div className="ln-row">
        <label className="ln-row ln-small ln-muted">
          {t('learn.readAloud.rate')}
          <select className="ln-input ln-learn-rate" value={rate} onChange={e => setRate(Number(e.target.value))}>
            {[0.8, 1, 1.2, 1.5].map(r => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        {status === 'speaking' && <button type="button" className="ln-btn" onClick={pause}>{t('learn.readAloud.pause')}</button>}
        {status === 'paused' && <button type="button" className="ln-btn" onClick={resume}>{t('learn.readAloud.resume')}</button>}
        {status !== 'idle' && <button type="button" className="ln-btn ln-btn-quiet" onClick={stop}>{t('learn.readAloud.stop')}</button>}
      </div>
      {status === 'speaking' && <p className="ln-small ln-muted" role="status">{t('learn.readAloud.speaking')}</p>}
      {!support.he && !support.en && <span className="ln-badge-simulated">{t('learn.simulated')}</span>}
    </div>
  );
}
