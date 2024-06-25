import Sefaria from "./sefaria/sefaria";
import React, {useEffect, useState} from "react";
import classNames from "classnames";
import {EnglishText, HebrewText, InterfaceText, SearchButton} from "./Misc";
import { useCombobox } from 'downshift';

const type_icon_map = {
  "Collection": "collection.svg",
  "AuthorTopic": "iconmonstr-pen-17.svg",
  "TocCategory": "iconmonstr-view-6.svg",
  "PersonTopic": "iconmonstr-hashtag-1.svg",
  "Topic": "iconmonstr-hashtag-1.svg",
  "ref": "iconmonstr-book-15.svg",
  "search": "iconmonstr-magnifier-2.svg",
  "Term": "iconmonstr-script-2.svg",
  "User": "profile.svg"
};

const type_title_map = {
  "Collection": "Collections",
  "AuthorTopic": "Authors",
  "TocCategory": "Categories",
  "PersonTopic": "Topics",
  "Topic": "Topics",
  "ref": "Books",
  "search": "",
  "Term": "Terms",
  "User": "Users"
};

function type_icon(itemType, itemPic) {
    if (itemType === "User" && itemPic !== "") {
      return itemPic;
    } else {
      return `/static/icons/${type_icon_map[itemType]}`;
    }
};

function groupByType(seggestedItems) {
    const groupedItems = {};

    // Group items by their "type"
    seggestedItems.forEach(item => {
        if (!groupedItems[item.type]) {
            groupedItems[item.type] = [];
        }
        groupedItems[item.type].push(item);
    });

    //Convert into a datastructure like this: [{"type": name,
    //                                         "items" : [item1, item2]}]
    return Object.keys(groupedItems).map(type => ({
        type,
        items: groupedItems[type]
    }));

};

function sortByTypeOrder(array) {

    const typesOrder = [
        "search",
        "ref",
        "Collection",
        "TocCategory",
        "Topic",
        "PersonTopic",
        "AuthorTopic",
        "User",
        "Term",
    ];

    return array.sort((a, b) => {

        const typeAIndex = typesOrder.indexOf(a.type);
        const typeBIndex = typesOrder.indexOf(b.type);

        // If types are in the provided list, compare their index
        if (typeAIndex !== undefined && typeBIndex !== undefined) {
            return typeBIndex - typeAIndex
        }

        // If one of the types is not in the list, fallback to alphanumeric sorting
        return a.type.localeCompare(b.type);
    });
}

const getURLForObject = function(type, key) {
    if (type === "Collection") {
      return `/collections/${key}`;
    } else if (type === "TocCategory") {
      return `/texts/${key.join('/')}`;
    } else if (type in {"Topic": 1, "PersonTopic": 1, "AuthorTopic": 1}) {
      return `/topics/${key}`;
    } else if (type === "ref") {
      return `/${key.replace(/ /g, '_')}`;
    } else if (type === "User") {
      return `/profile/${key}`;
    }
};

const getQueryObj = (query) => {
  return Sefaria.getName(query)
    .then(d => {
      const repairedCaseVariant = Sefaria.repairCaseVariant(query, d);
      if (repairedCaseVariant !== query) {
        return getQueryObj(repairedCaseVariant);
      }
      const repairedQuery = Sefaria.repairGershayimVariant(query, d);
      if (repairedQuery !== query) {
        return getQueryObj(repairedQuery);
      }

      if (d["is_ref"]) {
        return {'type': 'Ref', 'id': d["ref"], 'is_book': d['is_book']};
      } else if (!!d["topic_slug"]) {
        return {'type': 'Topic', 'id': d["topic_slug"], 'is_book': d['is_book']};
      } else if (d["type"] === "Person" || d["type"] === "Collection" || d["type"] === "TocCategory") {
        return {'type': d["type"], 'id': d["key"], 'is_book': d['is_book']};
      } else {
        return {'type': "Search", 'id': query, 'is_book': d['is_book']};
      }
    });
};

const TextualSearchSuggestion = ({label, onClick, ...props}) => {
    const searchOverridePre = Sefaria._('Search for') +':';
    const displayedLabel = (
        <>
            <span className={"search-override-text"}>
                {searchOverridePre}
                <span>&nbsp;</span>
            </span>
            <InterfaceText html={{en: "&ldquo;", he: "&#1524;"}} />
            {label}
            <InterfaceText html={{en: "&rdquo;", he: "&#1524;"}} />
        </>
    );
    return (
        <div className={"TextualSearchSuggestion"}>
            <SearchSuggestionInner onClick={() => onClick(label)} displayedLabel={displayedLabel} label={label} wrapperClasses={"search-override-wrapper"} {...props}/>
        </div>
    );
};

const SearchSuggestionInner = ({ value, type, displayedLabel, label, url, pic,
                                wrapperClasses,
                              universalIndex, highlightedIndex, getItemProps, onClick}) => {
  const isHebrew = Sefaria.hebrew.isHebrew(label);
  return (
      <a href={url} onClick={onClick} className={`search-suggestion-link-wrapper ${wrapperClasses}`}>
          <div
            key={value}
            {...getItemProps({ index: universalIndex})}
           className={` search-suggestion
           ${highlightedIndex === universalIndex ? 'highlighted' : ''}`}
          >
             <img alt={type}
                   className={`ac-img-${type === "User" && pic === "" ? "UserPlaceholder" : type} type-icon ${!isHebrew ? 'english-result' : ''} `}
                   src={type_icon(type, pic)}/>

              <div className={` ${isHebrew ? 'hebrew-result' : ''} ${!isHebrew ? 'english-result' : ''}
               search-suggestion-text`}>
                {displayedLabel}
              </div>
          </div>
      </a>
);
};

const EntitySearchSuggestion = ({label, onClick, type, url, ...props}) => {
    return (
        <SearchSuggestionInner onClick={() => onClick({type, url})} displayedLabel={label} label={label} type={type} url={url} {...props}/>
    );
}

const SearchInputBox = ({getInputProps, suggestions, highlightedIndex, hideHebrewKeyboard, setInputValue,
                        setSearchFocused, searchFocused,
                            submitSearch, redirectToObject}) => {

    const getInputValue = () =>{
        return otherDownShiftProps.value || getVirtualKeyboardInputValue();
    }
    const getVirtualKeyboardInputValue = () =>{
        return document.querySelector('#searchBox .keyboardInput').value;
    }
    useEffect(() => {
      showVirtualKeyboardIcon(false); // Initially hide the virtual keyboard icon
    }, []);
   const { onBlur, onKeyDown, ...otherDownShiftProps } = getInputProps();

    const handleSearchKeyDown = (event) => {
      onKeyDown(event);
      if (event.keyCode !== 13) return;
      const highlightedItem = highlightedIndex > -1 ? suggestions[highlightedIndex] : null
      if (highlightedItem  && highlightedItem.type != 'search'){
        redirectToObject(highlightedItem);
        return;
      }
      const inputQuery = getInputValue();
      if (!inputQuery) return;
      submitSearch(inputQuery);
    };


    const handleSearchButtonClick = (event) => {
      const inputQuery = getInputValue();
      if (inputQuery) {
        submitSearch(inputQuery);
      } else {
        focusSearch()
      }
    };

    const showVirtualKeyboardIcon = (show) => {
      if (document.getElementById('keyboardInputMaster')) {
        return; // if keyboard is open, ignore
      }
      if (Sefaria.interfaceLang === 'english' && !hideHebrewKeyboard) {
        const keyboardInitiator = document.querySelector(".keyboardInputInitiator");
        if (keyboardInitiator) {
          keyboardInitiator.style.display = show ? "inline" : "none";
        }
      }
    };
    const focusSearch = () => {
      setSearchFocused(true);
      showVirtualKeyboardIcon(true);
    };

    const blurSearch = (e) => {
      onBlur(e);
      const oldValue = getVirtualKeyboardInputValue();
      const parent = document.getElementById('searchBox');
      if (!parent.contains(e.relatedTarget) && !document.getElementById('keyboardInputMaster')) {
        // debug: comment out the following line:
        setSearchFocused(false);
        showVirtualKeyboardIcon(false);
      }
      !document.getElementById('keyboardInputMaster') && setInputValue(oldValue)
    };

    const inputClasses = classNames({
      search: 1,
      serif: 1,
      keyboardInput: Sefaria.interfaceLang === "english",
      hebrewSearch: Sefaria.interfaceLang === "hebrew"
    });

    const searchBoxClasses = classNames({ searchBox: 1, searchFocused });

    return (
      <div id="searchBox"
           className={searchBoxClasses}>
        <SearchButton onClick={handleSearchButtonClick} />
        <input
          className={inputClasses}
          id="searchInput"
          placeholder={Sefaria._("Search")}
          onKeyDown={handleSearchKeyDown}
          onFocus={focusSearch}
          onBlur={blurSearch}
          maxLength={75}
          title={Sefaria._("Search for Texts or Keywords Here")}
          {...otherDownShiftProps}
        />
      </div>
    );
  };
const SuggestionsDispatcher = ({ suggestions, getItemProps, highlightedIndex,
                                            submitSearch, redirectToObject}) => {

    let groupedSuggestions = groupByType(suggestions);
    let universalIndex = 0;

    return (
        <>
            {groupedSuggestions.map((object, index) => {
                const initialIndexForGroup = universalIndex;
                universalIndex += object.items.length;
                return (
                    <SuggestionsGroup
                        getItemProps={getItemProps}
                        highlightedIndex={highlightedIndex}
                        key={object.type}
                        suggestions={object.items}
                        initialIndexForGroup={initialIndexForGroup}

                        submitSearch={submitSearch}
                        redirectToObject={redirectToObject}
                    />
                );
            })}
        </>
    );
}


const SearchSuggestionFactory = ({ type, submitSearch, redirectToObject, ...props }) => {
    const _type_component_map = {
        search: {
            onSuggestionClick: submitSearch,
            SuggestionComponent: TextualSearchSuggestion
        },
        other: {
            onSuggestionClick: redirectToObject,
            SuggestionComponent: EntitySearchSuggestion
        }
    };

    const { onSuggestionClick, SuggestionComponent } = _type_component_map[type] || _type_component_map.other;

    return (
        <SuggestionComponent onClick={onSuggestionClick} type={type} {...props} />
    );
}

const SuggestionsGroup = ({ suggestions, initialIndexForGroup, getItemProps, highlightedIndex,
                                    submitSearch, redirectToObject}) => {

    const type = suggestions[0].type;
    const title = type_title_map[type];

    return (
        <div className={"search-group-suggestions"}>

         {(type != 'search') &&
            <div className={'type-title'}><InterfaceText>{title}</InterfaceText></div>
         }

            <div className={"search-group-suggestions-items"}>
            {suggestions.map((suggestion, index) => {
                const universalIndex = initialIndexForGroup + index;
                return (
                        <SearchSuggestionFactory
                            key={suggestion.key}
                            value={suggestion.value}
                            type={suggestion.type}
                            label={suggestion.label}
                            url={suggestion.url}
                            pic={suggestion.pic}
                            universalIndex = {universalIndex}
                            highlightedIndex = {highlightedIndex}
                            getItemProps = {getItemProps}
                            submitSearch={submitSearch}
                            redirectToObject={redirectToObject}
                        />
                );
            })}
                </div>
        </div>
    );
};

 const Autocomplete = ({onRefClick, showSearch, openTopic, openURL, onNavigate, hideHebrewKeyboard = false}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const {
    isOpen,
    getMenuProps,
    getInputProps,
    getItemProps,
    highlightedIndex,
    setInputValue
  } = useCombobox({
    items: suggestions,
    itemToString: (item) => (item ? item.name : ''),
    onInputValueChange: ({ inputValue }) => {
      fetchSuggestions(inputValue);
    }
  });


  const fetchSuggestions = async (inputValue) => {
  if (inputValue.length < 3){
      setSuggestions([]);
      return;
    }
  try {
    const d = await Sefaria.getName(inputValue);

    let comps = d["completion_objects"].map(o => {
      const c = {...o};
      c["value"] = `${o['title']}${o["type"] === "ref" ? "" : `(${o["type"]})`}`;
      c["label"] = o["title"];
      c["url"] = getURLForObject(c["type"], c["key"]);

      //"Topic" and "PersonTopic" considered same type:
      const currentType = c["type"];
      const newType = ["Topic", "PersonTopic"].includes(currentType) ? "Topic" : currentType;
      c["type"] = newType;


      return c;
    });
    comps = sortByTypeOrder(comps)
    if (comps.length > 0) {
      const q = inputValue;
      setSuggestions([{value: "SEARCH_OVERRIDE", label: q, type: "search"}].concat(comps));

    } else {
      setSuggestions([]);
    }
  } catch (error) {
    console.error('Error fetching autocomplete suggestions:', error);
    setSuggestions([]);
  }
};
    const clearSearchBox = function () {
     getInputProps().onChange({ target: { value: '' } });
  }
   const submitSearch = (query) => {
      if (highlightedIndex > -1 && suggestions[highlightedIndex].type === 'search')
       {
              showSearchWrapper(query);
              clearSearchBox();
              return;
       }
      getQueryObj(query).then(({ type: queryType, id: queryId, is_book: queryIsBook }) => {

          if (queryType === 'Ref') {
              let action = queryIsBook ? "Search Box Navigation - Book" : "Search Box Navigation - Citation";
              Sefaria.track.event("Search", action, queryId);
              clearSearchBox();
              onRefClick(queryId);
              onNavigate && onNavigate();
          }
          else if (queryType === 'Topic') {
              Sefaria.track.event("Search", "Search Box Navigation - Topic", query);
              clearSearchBox();
              openTopic(queryId);
              onNavigate && onNavigate();
          }
          else if (queryType === "Person" || queryType === "Collection" || queryType === "TocCategory") {
              redirectToObject(queryType, queryId);
          }
          else {
              Sefaria.track.event("Search", "Search Box Search", queryId);
              showSearchWrapper(queryId);
              clearSearchBox();
          }
      }
      )
    };

  const showSearchWrapper = (query) => {
    query = query.trim();
    if (typeof sjs !== "undefined") {
      query = encodeURIComponent(query);
      window.location = `/search?q=${query}`;
      return;
    }
    showSearch(query);

    onNavigate && onNavigate();
  };

  const redirectToObject = (item) => {
    Sefaria.track.event("Search", `Search Box Navigation - ${item.type}`, item.key);
    clearSearchBox();
    const url = item.url
    const handled = openURL(url);
    if (!handled) {
      window.location = url;
    }
    onNavigate && onNavigate();
  }


  return (
    <div className={"search-container"}>
      <SearchInputBox
            getInputProps={getInputProps}
            suggestions={suggestions}
            hideHebrewKeyboard={hideHebrewKeyboard}
            highlightedIndex={highlightedIndex}
            setInputValue={setInputValue}

            setSearchFocused={setSearchFocused}
            searchFocused={searchFocused}

            submitSearch={submitSearch}
            redirectToObject={redirectToObject}
      />
      <div
        {...getMenuProps()}
        className={"autocomplete-dropdown"}
      >
      {/*//debug: make following condition always truthy:*/}
          {(isOpen && searchFocused) &&
              <SuggestionsDispatcher suggestions={suggestions} getItemProps={getItemProps} highlightedIndex={highlightedIndex}
                   getInputProps={getInputProps} submitSearch={submitSearch} redirectToObject={redirectToObject}
              />
          }
      </div>
    </div>
  );
};
export {Autocomplete};