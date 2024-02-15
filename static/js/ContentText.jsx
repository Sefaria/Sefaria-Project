import React from "react";
import {useContentLang} from './Hooks';
import Sefaria from './sefaria/sefaria';
import ReactMarkdown from "react-markdown";
import { hebrewToTibetan } from './sefaria/boNumber.js'

const ContentText = (props) => {
   /* Renders content language throughout the site (content that comes from the database and is not interface language).
   * Gets the active content language from Context and returns only the appropriate child(ren) for given language
   * text {{text: object}} a dictionary {en: "some text", he: "some translated text"} to use for each language
   * markdown {{markdown: object}} a dictionary {en: "some text", he: "some translated text"} to use for each language in the case where text contains markdown
   * html {{html: object}} a dictionary {en: "some html", he: "some translated html"} to use for each language in the case where it needs to be dangerously set html
   * overrideLanguage a string with the language name (full not 2 letter) to force to render to overriding what the content language context says. Can be useful if calling object determines one langugae is missing in a dynamic way
   * defaultToInterfaceOnBilingual use if you want components not to render all languages in bilingual mode, and default them to what the interface language is
   * bilingualOrder is an array of short language notations (e.g. ["he", "en"]) meant to tell the component what
   * order to return the bilingual langauage elements in (as opposed to the unguaranteed order by default).
   */
   const langAndContentItems = _filterContentTextByLang(props);
   return langAndContentItems.map(item => <ContentSpan lang={item[0]} content={item[1]} isHTML={!!props.html} markdown={props.markdown}/>);
};

const VersionContent = (props) => {
  /* Used to render content of Versions.
  * imageLoadCallback is called to update segment numbers placement
  * overrideLanguage a string with the language name (full not 2 letter) to force to render to overriding what the content language context says. Can be useful if calling object determines one langugae is missing in a dynamic way
  * defaultToInterfaceOnBilingual use if you want components not to render all languages in bilingual mode, and default them to what the interface language is
  * See filterContentTextByLang for more documentation */
  const langAndContentItems = _filterContentTextByLang(props);
  const [languageToFilter, _] = useContentLang(props.defaultToInterfaceOnBilingual, props.overrideLanguage);
  return langAndContentItems.map((item) => {
      const [lang, content] = item;
      if (Sefaria.isFullSegmentImage(content)){
        return(<VersionImageSpan lang={lang} content={content} languageToFilter={languageToFilter} imageLoadCallback={props.imageLoadCallback}/>);
      }
      return (<ContentSpan lang={lang} content={content} isHTML={true}/>);
  })
}

const VersionImageSpan = ({lang, content, languageToFilter, imageLoadCallback}) => {
    function getImageAttribute(imgTag, attribute) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(imgTag, 'text/html');
      const imgElement = doc.querySelector('img');

      if (imgElement) {
        return imgElement.getAttribute(attribute);
      }

      return null;
    }
    const altText = getImageAttribute(content, 'alt');
    const srcText = getImageAttribute(content, 'src');
    content = (<div className="image-in-text">{<img onLoad={imageLoadCallback} src={srcText} alt={altText}/>}<p className="image-in-text-title">{altText}</p></div>);
    if (lang === 'he' && languageToFilter === "bilingual") {content = ''}

    return(<span className={`contentSpan ${lang}`} lang={lang} key={lang}>{content}</span>)
};

const _filterContentTextByLang = ({text, html, markdown, overrideLanguage, defaultToInterfaceOnBilingual=false, bilingualOrder = null}) => {
  /**
   See ContentText for documentation
   */
  const contentVariable = html || markdown || text;  // assumption is `markdown` or `html` are preferred over `text` if they are present
  const [languageToFilter, langShort] = useContentLang(defaultToInterfaceOnBilingual, overrideLanguage);
  let langAndContentItems = Object.entries(contentVariable);
  if(languageToFilter === "bilingual"){
    if(bilingualOrder !== null){
      //nifty function that sorts one array according to the order of a second array.
      langAndContentItems.sort(function(a, b){
        return bilingualOrder.indexOf(a[0]) - bilingualOrder.indexOf(b[0]);
      });
    }
  }else{
    langAndContentItems = langAndContentItems.filter(([lang, _])=>{
      return lang === langShort;
    });
  }
  return langAndContentItems;
}

const ContentSpan = ({lang, content, isHTML, markdown}) => {
  //pecha.org code
  let boContent = hebrewToTibetan(content, lang )
  return isHTML ?
          <span className={`contentSpan ${lang}`} lang={lang} key={lang} dangerouslySetInnerHTML={{__html: boContent}}/>
          : markdown ? <span className={`contentSpan ${lang}`} lang={lang} key={lang}>
                         <ReactMarkdown className={'reactMarkdown'} unwrapDisallowed={true} disallowedElements={['p']}>{boContent}</ReactMarkdown>
                       </span>
          : <span className={`contentSpan ${lang}`} lang={lang} key={lang}>{boContent}</span>;
}

export {ContentText, VersionContent};
