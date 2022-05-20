import { useState, useEffect } from "react";
import Sefaria from "./sefaria/sefaria";
import classNames  from 'classnames';
import {InterfaceText, TabView} from './Misc';
import { NavSidebar, Modules } from './NavSidebar';
import Footer  from './Footer';


const TranslationsPage = ({translationsSlug}) => {
    const [translations, setTranslations] = useState(null);
    let sidebarModules = [];
    let translation = Sefaria.getTranslation(translationsSlug).then(x => {
        setTranslations(x)
    });
    const tabs = [{id: "texts", title: {en: "Texts", he: Sefaria._("Texts", "Header")}}];
    
    return (
        <div className="readerNavMenu noLangToggleInHebrew" key="0">
        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1 className="serif pageTitle"><InterfaceText>{"About Texts in " + Sefaria.ISOMap[translationsSlug]["name"]}</InterfaceText></h1>
              {<TabView
                  currTabIndex={0}
                  tabs={tabs}
                  containerClasses={"largeTabs"}
                  renderTab={t => (
                            <div className={classNames({tab: 1, noselect: 1, filter: t.justifyright, open: t.justifyright && showFilterHeader})}>
                              <InterfaceText text={t.title} />
                              { t.icon ? <img src={t.icon} alt={`${t.title.en} icon`} /> : null }
                            </div>
                          )}
                 
                  ><> {translations ?  Object.keys(translations).map(corpus => {
                return (<div className="translationsPage">
                  <h2>{corpus}</h2>
                  {Sefaria.tocObjectByCategories([corpus]).contents.filter(x => Object.keys(translations[corpus]).includes(x.category)).map(x => {
                    return (<details open={translationsSlug !== "en"}><summary>{x.category}</summary>
                    <ul>
                      {translations[corpus][x.category]/*.sort((a, b) => a['order'][0] - b['order'][0])*/.map((y, i) => {
                        return (<li key={i} className={i !== translations[corpus][x.category].length - 1 ? "bullet languageItem" : "languageItem"}><a href={`/${y.title}.1?with=Translations&${y.rtlLanguage === "en" ? "ven=" + y.versionTitle : "vhe=" + y.versionTitle}`}>{y.title}</a></li>)
                      })}
                    </ul>
                    </details>)
                  })}                  
                </div>)
              }) : null}
              </>
              </TabView>}
              </div>
            <NavSidebar modules={sidebarModules} />
          </div>
          <Footer />
        </div>
      </div>
    )
}

export default TranslationsPage