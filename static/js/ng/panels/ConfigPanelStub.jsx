/**
 * Placeholder for the config panel. Enough to switch among the three reading modes and the
 * layouts, which exercises settings persistence (the classic reader's cookies) and URL sync,
 * plus the documented opt-out to the classic reader. Version choice comes with the real panel.
 */
import React from 'react';
import {useNgReader} from '../context';
import {classicReaderUrl} from '../url';

function Choice({name, value, current, label, onChange}) {
  const selected = value === current;
  return (
    <button type="button" className="ng-choice" aria-pressed={selected} data-ng={`setting-${name}-${value}`}
            onClick={() => onChange(name, value)}>
      {label}
    </button>
  );
}

export default function ConfigPanelStub({onClose}) {
  const {strings, settings, setSetting, currentLayout, currentUrl} = useNgReader();
  const bilingualSideBySide = settings.biLayout === 'heLeft' || settings.biLayout === 'heRight';
  return (
    <div className="ng-panel" data-ng="panel-config">
      <div className="ng-panel-head">
        <h2 className="ng-panel-title">{strings.textSettings}</h2>
        <button type="button" className="ng-panel-close" data-ng="overlay-close" onClick={onClose}>{strings.close}</button>
      </div>
      <div className="ng-choices" role="group" aria-label={strings.textSettings}>
        <Choice name="language" value="hebrew" current={settings.language} label={strings.source} onChange={setSetting} />
        <Choice name="language" value="english" current={settings.language} label={strings.translation} onChange={setSetting} />
        <Choice name="language" value="bilingual" current={settings.language} label={strings.bilingual} onChange={setSetting} />
      </div>
      {settings.language === 'bilingual' ? (
        <div className="ng-choices" role="group" aria-label={strings.layout}>
          <Choice name="biLayout" value="stacked" current={bilingualSideBySide ? 'heRight' : 'stacked'} label={strings.stacked} onChange={setSetting} />
          <Choice name="biLayout" value="heRight" current={bilingualSideBySide ? 'heRight' : 'stacked'} label={strings.sideBySide} onChange={setSetting} />
        </div>
      ) : (
        <div className="ng-choices" role="group" aria-label={strings.layout}>
          <Choice name="layout" value="segmented" current={currentLayout} label={strings.segmented} onChange={setSetting} />
          <Choice name="layout" value="continuous" current={currentLayout} label={strings.continuous} onChange={setSetting} />
        </div>
      )}
      <a className="ng-panel-link" data-ng="classic-link" href={classicReaderUrl(currentUrl)}>{strings.classicView}</a>
    </div>
  );
}
