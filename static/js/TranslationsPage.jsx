import { useState, useEffect } from "react";
import Sefaria from "./sefaria/sefaria";
import classNames  from 'classnames';
import {InterfaceText, TabView} from './Misc';
import { NavSidebar, Modules } from './NavSidebar';
import Footer  from './Footer';


const TranslationsPage = ({translationsSlug}) => {
    const [translations, setTranslations] = useState(null);
    let sidebarModules = [{type: "AboutTranslatedText", props: {translationsSlug: translationsSlug}}];
    let translation = Sefaria.getTranslation(translationsSlug).then(x => {
        setTranslations(x)
    });
    const tabs = [{id: "texts", title: {en: "Texts", he: Sefaria._("Texts", "Header")}}];
    const sortFx = (a, b) => {
      if(a["order"] && b["order"]) {
        return a['order'][0] - b['order'][0];
      } else {
        return 0;
      }
    }
    return (
        <div className="readerNavMenu noLangToggleInHebrew" key="0">
        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1 className="serif pageTitle"><InterfaceText>{Sefaria.getHebrewTitle(translationsSlug)}</InterfaceText></h1>
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
                 
                  ><> {translations ?  Sefaria.toc.filter(w => Object.keys(translations).includes(w.category))
                  .map(w => w.category)
                  .map(corpus => {
                return (<div key={corpus} className="translationsPage">
                  <h2><InterfaceText>{corpus}</InterfaceText></h2>
                  {Sefaria.tocObjectByCategories([corpus]).contents.filter(x => Object.keys(translations[corpus]).includes(x.category)).map(x => {
                    return (<details key={x.category} open={translationsSlug !== "en"}><summary><InterfaceText>{x.category}</InterfaceText></summary>
                    <ul>
                      {translations[corpus][x.category].sort(sortFx).map((y, i) => {
                        return (<li key={i+y.title} className="bullet languageItem"><a href={y.url}><InterfaceText>{y.title}</InterfaceText></a></li>)
                      })}
                    </ul>
                    </details>)
                  })}
                  {
                    Object.keys(translations[corpus]).includes("Uncategorized") ? 
                    <details open={translationsSlug !== "en"}><summary><InterfaceText>Uncategorized</InterfaceText></summary>
                    <ul>
                      {translations[corpus]["Uncategorized"].sort(sortFx).map((y, i) => {
                        return (<li key={i+y.title} className="bullet languageItem"><a href={y.url}>{y.title}</a></li>)
                      })}
                    </ul>
                    </details>
                    : null
                  }       
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