import { useState, useEffect } from "react";
import {InterfaceText, EnglishText, HebrewText} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import SearchState from './sefaria/searchState';
import SearchResultList  from './SearchResultList';
import classNames from 'classnames';

import {
  SearchButton,
} from './Misc';


const SidebarSearch = ({ title, updateAppliedOptionSort }) => {

  const [searchFilterPathForBook, setSearchFilterPathForBook] = useState('');
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState(
          new SearchState({
                  type: 'text',
                  appliedFilters:        [searchFilterPathForBook],
                  field:                 "naive_lemmatizer",
                  appliedFilterAggTypes: ["path"],
                  sortType:              "relevance",
          })
      )

  useEffect(() => {
      attachKeyboard();
  }, []);

  useEffect(() => {
      Sefaria.bookSearchPathFilterAPI(title).then((path) => {
        setSearchFilterPathForBook(path)
      })
  }, [query])

  useEffect(() => {
      setSearchState(
        new SearchState({
                type: 'text',
                appliedFilters:        [searchFilterPathForBook],
                field:                 "naive_lemmatizer",
                appliedFilterAggTypes: ["path"],
                sortType:              "relevance",
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


  const inputClasses = classNames({
    search: 1,
    serif: 1,
    keyboardInput: Sefaria.interfaceLang === "english",
    hebrewSearch: Sefaria.interfaceLang === "hebrew"
    });
  // const searchBoxClasses = classNames({searchBox: 1, searchFocused: this.state.searchFocused});
  const searchBoxClasses = classNames({searchBox: 1});

  const handleSearchButtonClick = () => {
    setSearchFilterPathForBook('')
    setQuery(document.getElementById('searchQueryInput').value)
  }


  return (
    <div className="sidebarSearch content">
    <div className={searchBoxClasses}>
      <SearchButton onClick={handleSearchButtonClick} />
      <input className={inputClasses}
        placeholder={Sefaria._("Search in this text")}
        id="searchQueryInput"
        maxLength={75}
        onKeyUp={  (event) => {
            if (event.keyCode === 13) {
              handleSearchButtonClick()
            }
          }
        }
        title={Sefaria._("Search in this text")} />
    </div>


      {query ?
        <SearchResultList
          query={query}
          compare={false}
          searchInBook={true}
          tab="text"
          types={["text"]}
          textSearchState={searchState}
          updateTotalResults={n => console.log(n)}
          registerAvailableFilters={n => console.log(n)}
          updateAppliedOptionSort={updateAppliedOptionSort}
        /> :

        null

    }


    </div>
  );



}




export default SidebarSearch;
