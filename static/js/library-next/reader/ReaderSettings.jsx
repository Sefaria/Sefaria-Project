/** Reading controls: bilingual layout, flow, text size, vowels and cantillation. */
import React from 'react';
import { useT } from '../i18n';

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="ln-segmented compact" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
                className={`ln-segment ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const FONT_STEPS = [0.85, 1, 1.15, 1.3, 1.5];

export default function ReaderSettings({ contentLang, biLayout, setBiLayout, flow, setFlow, fontScale, setFontScale, vowels, setVowels, cantillation, setCantillation }) {
  const { t } = useT();
  const step = FONT_STEPS.indexOf(fontScale);
  const i = step === -1 ? 1 : step;
  return (
    <div className="ln-reader-settings" role="group" aria-label={t('reader.toolbelt')}>
      {contentLang === 'bi' && (
        <Segmented label={t('reader.layout')} value={biLayout} onChange={setBiLayout}
                   options={[{ value: 'stacked', label: t('reader.layout.stacked') }, { value: 'side', label: t('reader.layout.side') }]} />
      )}
      <Segmented label={t('reader.flow')} value={flow} onChange={setFlow}
                 options={[{ value: 'segmented', label: t('reader.flow.segmented') }, { value: 'continuous', label: t('reader.flow.continuous') }]} />
      <div className="ln-segmented compact ln-font-steps" role="group" aria-label={t('reader.fontSize')}>
        <button type="button" className="ln-segment" aria-label={t('reader.fontSmaller')} disabled={i === 0}
                onClick={() => setFontScale(FONT_STEPS[Math.max(0, i - 1)])}>A−</button>
        <button type="button" className="ln-segment" aria-label={t('reader.fontLarger')} disabled={i === FONT_STEPS.length - 1}
                onClick={() => setFontScale(FONT_STEPS[Math.min(FONT_STEPS.length - 1, i + 1)])}>A+</button>
      </div>
      {contentLang !== 'en' && (
        <div className="ln-segmented compact" role="group" aria-label={t('reader.vowels')}>
          <button type="button" className={`ln-segment ${vowels ? 'active' : ''}`} aria-pressed={vowels} onClick={() => setVowels(!vowels)}>{t('reader.vowels')}</button>
          <button type="button" className={`ln-segment ${vowels && cantillation ? 'active' : ''}`} aria-pressed={vowels && cantillation} disabled={!vowels}
                  onClick={() => setCantillation(!cantillation)}>{t('reader.cantillation')}</button>
        </div>
      )}
    </div>
  );
}
