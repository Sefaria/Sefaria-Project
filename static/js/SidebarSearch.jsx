import { useState, useEffect } from "react";
import {InterfaceText, EnglishText, HebrewText} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import SearchState from './sefaria/searchState';
import SearchResultList  from './SearchResultList';
import DictionarySearch  from './DictionarySearch';
import classNames from 'classnames';

import {
  SearchButton,
} from './Misc';
import { sefariaSetup } from "./ReaderApp";


const SidebarSearch = ({ title, updateAppliedOptionSort, navigatePanel, sidebarSearchQuery, setSidebarSearchQuery, onSidebarSearchClick }) => {
  const [lexiconName, setLexiconName] = useState(Sefaria.getIndexDetailsFromCache(title)?.lexiconName)
  const [searchFilterPathForBook, setSearchFilterPathForBook] = useState('');
  const [query, setQuery] = useState(sidebarSearchQuery || '');
  const [mongoSearchedText, setMongoSearchedText] = useState({});
  const isDictionary = !!lexiconName;
  const [searchState, setSearchState] = useState(
          new SearchState({
                  type: 'text',
                  appliedFilters:        [searchFilterPathForBook],
                  field:                 "naive_lemmatizer",
                  appliedFilterAggTypes: ["path"],
                  sortType:              "chronological",
          })
      )

  useEffect(() => {
      // attachKeyboard();
      const searchInput = document.getElementById('searchQueryInput')
      if (searchInput) {
          searchInput.value = query
      }
  }, []);

  useEffect(() => {
      Sefaria.bookSearchPathFilterAPI(title).then((path) => {
        setSearchFilterPathForBook(path)
      })
      setSidebarSearchQuery(query)
      searchmongoText()
  }, [query])

  useEffect(() => {
      setSearchState(
        new SearchState({
                type: 'text',
                appliedFilters:        [searchFilterPathForBook],
                field:                 "naive_lemmatizer",
                appliedFilterAggTypes: ["path"],
                sortType:              "chronological",
                filtersValid: true,
        })
      )
  }, [searchFilterPathForBook])

   const attachKeyboard = () => {
      const inputElement = document.querySelector('.sidebarSearch input');
      if (inputElement && (!inputElement.VKI_attached)) {
        VKI_attach(inputElement);
      }
    }

    const searchmongoText = async () => {
      const data = await Sefaria.mongoSearch(query, title)
      setMongoSearchedText(data)
    }
  const inputClasses = classNames({
    search: 1,
    serif: 1,
    keyboardInput: Sefaria.interfaceLang === "english",
    hebrewSearch: Sefaria.interfaceLang === "hebrew"
    });
  // const searchBoxClasses = classNames({searchBox: 1, searchFocused: this.state.searchFocused});
  const searchBoxClasses = classNames({searchBox: 1});

  const handleSearchButtonClick = () => {
    const searchBoxValue = document.getElementById('searchQueryInput').value
    if (searchBoxValue !== query) {
      searchmongoText()
      setSearchFilterPathForBook('')
      setQuery(document.getElementById('searchQueryInput').value)
    }
  }


  return (
    <div className="sidebarSearch lexicon-content">
    <div className={searchBoxClasses}>

    { isDictionary ?
       <DictionarySearch
            lexiconName={lexiconName}
            title={title}
            navigatePanel={navigatePanel}
            contextSelector=".lexicon-content"/>
      :
      <>
        <SearchButton onClick={handleSearchButtonClick} />
        <input className={inputClasses}
          placeholder={Sefaria._("Search in this text")}
          id="searchQueryInput"
          maxLength={75}
          onKeyUp={
            (event) => {
              if (event.keyCode === 13) {
                handleSearchButtonClick()
              }
            }
          }
          title={Sefaria._("Search in this text")} />
      </>
      }

    </div>


      {query && mongoSearchedText?
        <SearchResultList
          mongoSearch={mongoSearchedText}
          query={query}
          compare={false}
          searchInBook={true}
          tab="text"
          types={["text"]}
          textSearchState={searchState}
          updateTotalResults={n => console.log(n)}
          registerAvailableFilters={n => console.log(n)}
          updateAppliedOptionSort={updateAppliedOptionSort}
          onResultClick={onSidebarSearchClick}
        /> :

        null

    }


    </div>
  );



}




export default SidebarSearch;
