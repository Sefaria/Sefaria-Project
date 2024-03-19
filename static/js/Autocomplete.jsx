import Sefaria from "./sefaria/sefaria";
import React, {useEffect, useState} from "react";
import classNames from "classnames";
import {SearchButton} from "./Misc";
import { useCombobox } from 'downshift';


const SearchSuggestion = ({ itemKey, itemType, itemLabel, itemUrl, itemPic }) => {

  const _type_icon_map = {
      "Collection": "collection.svg",
      "AuthorTopic": "iconmonstr-pen-17.svg",
      "TocCategory": "iconmonstr-view-6.svg",
      "PersonTopic": "iconmonstr-hashtag-1.svg",
      "Topic": "iconmonstr-hashtag-1.svg",
      "ref": "iconmonstr-book-15.svg",
      "search": "iconmonstr-magnifier-2.svg",
      "Term": "iconmonstr-script-2.svg",
      "User": "iconmonstr-user-2%20%281%29.svg"
    }

  const _type_icon = function(itemType, itemPic) {
    if (itemType === "User" && itemPic !== "") {
      return itemPic;
    } else {
      return `/static/icons/${_type_icon_map[itemType]}`;
    }
  }

  const isHebrew = Sefaria.hebrew.isHebrew(itemLabel);

  return (
     <div className="ui-menu-item"
        // data-item-autocomplete={item}
        className={`
          hebrew-result ${!!isHebrew ? 'hebrew-result' : ''} 
          english-result ${!isHebrew ? 'english-result' : ''}
        `}>
      <img alt={itemType}
           className={`ac-img-${itemType === "User" && itemPic === "" ? "UserPlaceholder" : itemType}`}
           src={_type_icon(itemType, itemPic)} />
       <a href={itemUrl} role="option" data-type-key={`${itemType}-${itemKey}`}>
        {itemLabel}
      </a>
    </div>  );
};

const SearchInputBox = ({getInputProps, suggestions, highlightedIndex,
                      onRefClick, showSearch, openTopic, openURL, hideHebrewKeyboard}) => {
    const [searchFocused, setSearchFocused] = useState(false);

    useEffect(() => {
      showVirtualKeyboardIcon(false); // Initially hide the virtual keyboard icon
    }, []);
   const { onBlur, onKeyDown, ...otherDownShiftProps } = getInputProps();

   const _clearSearchBox = function () {
     getInputProps().onChange({ target: { value: '' } });
  }
   const _submitSearch = (query) => {
    Sefaria.getName(query)
      .then(d => {
        const repairedCaseVariant = Sefaria.repairCaseVariant(query, d);
        if (repairedCaseVariant !== query) {
          _submitSearch(repairedCaseVariant);
          return;
        }
        const repairedQuery = Sefaria.repairGershayimVariant(query, d);
        if (repairedQuery !== query) {
          _submitSearch(repairedQuery);
          return;
        }

        if (d["is_ref"]) {
          var action = d["is_book"] ? "Search Box Navigation - Book" : "Search Box Navigation - Citation";
          Sefaria.track.event("Search", action, query);
          _clearSearchBox();
          onRefClick(d["ref"]);
          onNavigate && onNavigate();

        } else if (!!d["topic_slug"]) {
          Sefaria.track.event("Search", "Search Box Navigation - Topic", query);
          _clearSearchBox();
          openTopic(d["topic_slug"]);
          onNavigate && onNavigate();

        } else if (d["type"] === "Person" || d["type"] === "Collection" || d["type"] === "TocCategory") {
          _redirectToObject(d["type"], d["key"]);
        } else {
          Sefaria.track.event("Search", "Search Box Search", query);
          _showSearch(query);
        }
      });
  }

  const _showSearch = (query) => {
    query = query.trim();
    if (typeof sjs !== "undefined") {
      query = encodeURIComponent(query);
      window.location = `/search?q=${query}`;
      return;
    }
    showSearch(query);

    onNavigate && onNavigate();
  }

  const _redirectToObject = (item) => {
    Sefaria.track.event("Search", `Search Box Navigation - ${item.type}`, item.key);
    _clearSearchBox();
    const url = item.url
    const handled = openURL(url);
    if (!handled) {
      window.location = url;
    }
    onNavigate && onNavigate();
  }


    const _handleSearchKeyDown = (event) => {
      onKeyDown(event)
      if (event.keyCode !== 13) return;
      const highlightedItem = highlightedIndex > -1 ? suggestions[highlightedIndex] : null
      if (highlightedItem  && highlightedItem.type != 'search'){
        _redirectToObject(highlightedItem);
        return;
      }
      const inputQuery = otherDownShiftProps.value
      if (!inputQuery) return;
      _submitSearch(inputQuery);
    };

    const _handleSearchButtonClick = () => {
      const inputQuery = otherDownShiftProps.value
      if (inputQuery) {
        _submitSearch(inputQuery);
      } else {
        _focusSearch()
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
    const _focusSearch = () => {
      setSearchFocused(true);
      showVirtualKeyboardIcon(true);
    };

    const _blurSearch = (e) => {
      onBlur(e)
      const parent = document.getElementById('searchBox');
      if (!parent.contains(e.relatedTarget) && !document.getElementById('keyboardInputMaster')) {
        setSearchFocused(false);
        showVirtualKeyboardIcon(false);
      }
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
        <SearchButton onClick={_handleSearchButtonClick} />
        <input
          className={inputClasses}
          id="searchInput"
          placeholder={Sefaria._("Search")}
          onKeyDown={_handleSearchKeyDown}
          onFocus={_focusSearch}
          onBlur={_blurSearch}
          maxLength={75}
          title={Sefaria._("Search for Texts or Keywords Here")}
          {...otherDownShiftProps}
        />
      </div>
    );
  };
const SuggestionsDispatcher = ({ suggestions, getItemProps, highlightedIndex}) => {
  function groupByType(seggestedItems) {
    const groupedItems = {};

    // Group items by their "type", "Topic" and "PersonTopic" considered same type
    seggestedItems.forEach(item => {
        let itemType = item.type in ["Topic", "PersonTopic"] ? "Topic" : item.type;
        if (!groupedItems[itemType]) {
            groupedItems[itemType] = [];
        }
        groupedItems[itemType].push(item);
    });

    //Convert into a datastructure like this: [{"type": name,
    //                                         "items" : [item1, item2]}]
    const result = Object.keys(groupedItems).map(type => ({
        type,
        items: groupedItems[type]
    }));

    return result;
}

    let groupedSuggestions = groupByType(suggestions);
    let universalIndex = 0;

    return (
        <>
            {groupedSuggestions.map((object, index) => {
                const InitialIndexForGroup = universalIndex;
                universalIndex += object.items.length;
                return (
                    <SuggestionsGroup
                        getItemProps={getItemProps}
                        highlightedIndex={highlightedIndex}
                        key={index}
                        suggestions={object.items}
                        initialIndexForGroup={InitialIndexForGroup}
                    />
                );
            })}
        </>
    );



}

const SuggestionsGroup = ({ suggestions, initialIndexForGroup, getItemProps, highlightedIndex }) => {

    return (
        <>
            {suggestions.map((suggestion, index) => {
                const universalIndex = initialIndexForGroup + index
                return (
                    <div
                        key={suggestion.value}
                        {...getItemProps({
                            index: universalIndex,
                            item: suggestion,
                            style: {
                                backgroundColor: highlightedIndex === universalIndex ? '#EDEDEC' : '',
                            },
                        })}
                    >
                        <SearchSuggestion
                            itemKey={suggestion.key}
                            itemType={suggestion.type}
                            itemLabel={suggestion.label}
                            itemUrl={suggestion.url}
                            itemPic={suggestion.pic}
                        />
                    </div>
                );
            })}
        </>
    );
};

 const Autocomplete = ({onRefClick, showSearch, openTopic, openURL}) => {
  const [suggestions, setSuggestions] = useState([]);
  const searchOverridePre = Sefaria._('Search for') +': "';
  const searchOverridePost = '"';
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
  }
  const fetchSuggestions = async (inputValue) => {
  if (inputValue.length < 3){
      setSuggestions([]);
      return;
    }
  try {
    const d = await Sefaria.getName(inputValue);

    const comps = d["completion_objects"].map(o => {
      const c = {...o};
      c["value"] = `${o['title']}${o["type"] === "ref" ? "" : `(${o["type"]})`}`;
      c["label"] = o["title"];
      c["url"] = getURLForObject(c["type"], c["key"])
      return c;
    });
    if (comps.length > 0) {
      const q = `${searchOverridePre}${inputValue}${searchOverridePost}`;
      setSuggestions([{value: "SEARCH_OVERRIDE", label: q, type: "search"}].concat(comps));

    } else {
      setSuggestions([]);
    }
  } catch (error) {
    console.error('Error fetching autocomplete suggestions:', error);
    setSuggestions([]);
  }
};

   const {
    isOpen,
    getMenuProps,
    getInputProps,
    getItemProps,
    highlightedIndex,
  } = useCombobox({
    items: suggestions,
    itemToString: (item) => (item ? item.name : ''),
    onInputValueChange: ({ inputValue }) => {
      fetchSuggestions(inputValue);
    }
  });

  return (
    <div style={{ position: 'relative' }}>
      <SearchInputBox
            getInputProps={getInputProps}
            onRefClick={onRefClick}
            showSearch={showSearch}
            openTopic={openTopic}
            openURL={openURL}
            suggestions={suggestions}
            hideHebrewKeyboard={false}
            highlightedIndex={highlightedIndex}
      />
      <ul
        {...getMenuProps()}
        style={{ position: 'absolute', top: '100%', left: 0, zIndex: 999 }}>
          {isOpen &&
              <SuggestionsDispatcher suggestions={suggestions} getItemProps={getItemProps} highlightedIndex={highlightedIndex}/>
          }
      </ul>
    </div>
  );
};
export {Autocomplete};