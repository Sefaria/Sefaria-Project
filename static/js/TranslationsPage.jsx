import { useState, useEffect } from "react";
import Sefaria from "./sefaria/sefaria";
import {InterfaceText} from './Misc';
import { NavSidebar, Modules } from './NavSidebar';
import Footer  from './Footer';


const TranslationsPage = ({translationsSlug}) => {
    const [translations, setTranslations] = useState(null);
    let sidebarModules = [];
    let translation = Sefaria.getTranslation(translationsSlug).then(x => {
        setTranslations(x)
    });
    
    return (
        <div className="readerNavMenu noLangToggleInHebrew" key="0">
        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1 className="sans-serif"><InterfaceText>About Texts in {Sefaria.ISOMap[translationsSlug]["name"]}</InterfaceText></h1>
              {JSON.stringify(translations)}
            {translations ? Object.keys(translations).map(x => {
                return (<div><h3>{x}</h3>
                {Object.keys(translations[x]).map(y => JSON.stringify(translations[x][y]))}
                </div>)
            }) : null}  
                   </div>
            <NavSidebar modules={sidebarModules} />
          </div>
          <Footer />
        </div>
      </div>
    )
}

export default TranslationsPage