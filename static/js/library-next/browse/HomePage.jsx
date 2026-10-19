/** `/` — the persona-aware home page, built from modules in `def.homeModules` order. */
import React from 'react';
import { usePersona } from '../persona';
import { useCollection } from '../store';
import { useLangs } from './components';
import { HOME_MODULES, moduleOrder } from './homeModules';
import './styles.css';

export default function HomePage() {
  const { t } = useLangs();
  const { persona, def } = usePersona();
  const { items: history } = useCollection('history');
  const ids = moduleOrder(def, history.length > 0);
  return (
    <div className="ln-container ln-home" data-persona={persona}>
      <header className="ln-home-head">
        <h1 className="ln-page-title">{t(`home.title.${persona}`)}</h1>
        <p className="ln-home-intro ln-muted">{t(`home.intro.${persona}`)}</p>
      </header>
      {ids.map(id => { const Module = HOME_MODULES[id]; return <Module key={id} />; })}
    </div>
  );
}
