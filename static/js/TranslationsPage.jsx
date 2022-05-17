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
              <h1 className="sans-serif"><InterfaceText>{"About Texts in " + Sefaria.ISOMap[translationsSlug]["name"]}</InterfaceText></h1>
              {translations ?  Object.keys(translations).map(corpus => {
                return (<div>
                  <h2>{corpus}</h2>
                  {Sefaria.tocObjectByCategories([corpus]).contents.filter(x => Object.keys(translations[corpus]).includes(x.category)).map(x => {
                    return (<><h4>{x.category}</h4>
                    <div>
                      {translations[corpus][x.category].sort((a, b) => a['order'][0] - b['order'][0]).map(y => {
                        return y.title
                      })}
                    </div>
                    </>)
                  })}
                </div>)
              }) : null}
              {/* {translations ? Object.keys(translations).map(x => {
                return (<div><h3>{x}</h3>
                {Object.keys(translations[x]).map((y, i0) => {
                  if("title" in translations[x][y]) {
                    return translations[x][y]["title"]
                  } else {
                    return Object.keys(translations[x][y]).map((z, i) =>
                      {return (translations[x][y][z]["title"] + ", ")}
                    )
                  }
                })}
                </div>)
            }) : null}   */}
                   </div>
            <NavSidebar modules={sidebarModules} />
          </div>
          <Footer />
        </div>
      </div>
    )
}

export default TranslationsPage