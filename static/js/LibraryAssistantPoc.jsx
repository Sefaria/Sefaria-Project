import React, { useEffect, useState } from 'react';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

// POC only (la-sandbox): the Library Assistant widget's POC toolbox saves its choices in
// localStorage and broadcasts live previews, so its entry points on the page can be tried out.
const POC_TOOLBOX_KEY = 'lc_chatbot:poc_toolbox';
export const usePocToolboxConfig = () => {
  const [config, setConfig] = useState({});
  useEffect(() => {
    try { setConfig(JSON.parse(localStorage.getItem(POC_TOOLBOX_KEY)) || {}); } catch (e) {}
    const onConfig = (e) => setConfig(e.detail || {});
    document.addEventListener('chatbot:poc-config', onConfig);
    return () => document.removeEventListener('chatbot:poc-config', onConfig);
  }, []);
  return config;
};

// Whether the assistant widget is on the page (checked after mount: SSR has no document)
export const useHasLibraryAssistant = () => {
  const [hasAssistant, setHasAssistant] = useState(false);
  useEffect(() => setHasAssistant(!!document.querySelector('lc-chatbot')), []);
  return hasAssistant;
};

// A purple banner above "Browse the Library", when the toolbox places the assistant there
// instead of in the header. Its copy can be changed in the toolbox too.
export const LibraryAssistantBrowseBanner = () => {
  const config = usePocToolboxConfig();
  const hasAssistant = useHasLibraryAssistant();
  if (!hasAssistant || config.placement !== 'banner') return null;
  const text = config.bannerText?.trim();
  const open = (e) => {
    e.preventDefault(); // tells ReaderApp's in-app link handler to leave this click alone
    document.dispatchEvent(new CustomEvent('chatbot:open', {detail: {source: 'browse_banner'}}));
  };
  return (
    <a href="#" role="button" className="libraryAssistantBanner" onClick={open}>
      <span className="libraryAssistantBannerStar" aria-hidden="true">✦</span>
      <span className="libraryAssistantBannerText">
        {text ? <span className={Sefaria.interfaceLang === 'hebrew' ? 'int-he' : 'int-en'}>{text}</span>
              : <InterfaceText>texts_page.library_assistant_banner</InterfaceText>}
      </span>
      <span className="libraryAssistantBannerArrow" aria-hidden="true">›</span>
    </a>
  );
};
