import Sefaria from "./sefaria/sefaria";
import React, {useEffect, useState} from "react";
import classNames from "classnames";
import {InterfaceText, SearchButton} from "./Misc";
import {GeneralAutocomplete} from "./GeneralAutocomplete";

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

const MODULE_ALLOWED_SEARCH_TYPES = {
  [Sefaria.LIBRARY_MODULE]: ['Topic', 'ref', 'TocCategory', 'Term'],
  [Sefaria.VOICES_MODULE]: ['Topic', 'User', 'Collection']
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
    if (type === "Collection" && Sefaria.activeModule === Sefaria.VOICES_MODULE) {
      return `/collections/${key}`;
    } else if (type === "TocCategory" && Sefaria.activeModule === Sefaria.LIBRARY_MODULE) {
      return `/texts/${key.join('/')}`;
    } else if (type in {"Topic": 1, "PersonTopic": 1, "AuthorTopic": 1}) {
      return `/topics/${key}`;
    } else if (type === "ref" && Sefaria.activeModule === Sefaria.LIBRARY_MODULE) {
      return `/${key.replace(/ /g, '_')}`;
    } else if (type === "User" && Sefaria.activeModule === Sefaria.VOICES_MODULE) {
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

      const allowedTypes = MODULE_ALLOWED_SEARCH_TYPES[Sefaria.activeModule];
      if (d["is_ref"] && allowedTypes.includes('ref')) {
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
  url = url?.replace(/\?/g, '%3F');
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

const SearchInputBox = ({getInputProps, highlightedSuggestion, highlightedIndex, hideHebrewKeyboard, setInputValue,
                        setSearchFocused, searchFocused,
                            submitSearch, redirectToObject, panelData}) => {

    const getPanelType = () => {
      let panel_type = null;
      if (firstPanel.menuOpen === "navigation" || firstPanel.menuOpen === "book toc") {
        panel_type = "TOC";
      } else if (firstPanel.menuOpen === "topics") {
        panel_type = "topics";
      } else if (firstPanel.mode === "Text" || firstPanel.mode === "TextAndConnections") {
        panel_type = "reader";
      } else if (firstPanel.mode === "Sheet") {
        panel_type = "sheet";
      } else {
        panel_type = "other";
      }
      return panel_type;
    }
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
      const highlightedItem = highlightedIndex > -1 ? highlightedSuggestion : null
      if (highlightedItem  && highlightedItem.type != 'search'){
        gtag("event", "search_navto", {
          "project": "Global Search",
          "panel_type": getPanelType(),
          "feature_name": "Nav To by Keyboard",
          "text": getInputValue(),
          "to": highlightedItem.label || highlightedItem.type
        });
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
      gtag("event", "search_focus", {
        "project": "Global Search",
        "panel_type": getPanelType(),
        "panel_name": Sefaria._inBrowser && document.title
      });
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
      !document.getElementById('keyboardInputMaster') && setInputValue(oldValue);
      gtag("event", "search_defocus", {
        "project": "Global Search",
        "text": oldValue,
        "panel_type": getPanelType(),
        "panel_name": Sefaria._inBrowser && document.title
      });
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
           className={searchBoxClasses}
           role="search"
           aria-label={Sefaria._("Site search")}>
        <SearchButton onClick={handleSearchButtonClick} />
        <input
          className={inputClasses}
          id="searchInput"
          placeholder={Sefaria._("Search")}
          aria-label={Sefaria._("Search for Texts or Keywords Here")}
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
                                            submitSearch, redirectToObject, inputValue}) => {

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
                        inputValue={inputValue}
                        submitSearch={submitSearch}
                        redirectToObject={redirectToObject}
                    />
                );
            })}
        </>
    );
}


const SearchSuggestionFactory = ({ type, submitSearch, redirectToObject, inputValue, ...props }) => {
    const _type_component_map = {
        search: {
            onSuggestionClick: (query) => {submitSearch(query, undefined, undefined, true)},
            SuggestionComponent: TextualSearchSuggestion
        },
        other: {
            onSuggestionClick: redirectToObject,
            SuggestionComponent: EntitySearchSuggestion
        }
    };

    const { onSuggestionClick, SuggestionComponent } = _type_component_map[type] || _type_component_map.other;
    const handleClick = (e) => {
      gtag("event", "search_navto", {
        "project": "Global Search",
        "panel_type": null,
        "feature_name": "Nav To by Mouse",
        "to": props.label,
        "text": inputValue
      });
      onSuggestionClick(e);
    }
    return (
        <SuggestionComponent onClick={handleClick} type={type} {...props} />
    );
}

const SuggestionsGroup = ({ suggestions, initialIndexForGroup, getItemProps, highlightedIndex,
                                    submitSearch, redirectToObject, inputValue}) => {

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
                            inputValue={inputValue}
                            submitSearch={submitSearch}
                            redirectToObject={redirectToObject}
                        />
                );
            })}
                </div>
        </div>
    );
};

export const HeaderAutocomplete = ({onRefClick, showSearch, openTopic, openURL, onNavigate, firstPanel, hideHebrewKeyboard = false}) => {
    const [searchFocused, setSearchFocused] = useState(false);

    const fetchSuggestions = async (inputValue) => {
        if (inputValue.length < 3){
          return[];
        }
        try {
        const types = MODULE_ALLOWED_SEARCH_TYPES[Sefaria.activeModule];
        const topic_pool = Sefaria.getTopicPoolNameForModule(Sefaria.activeModule);
        const d = await Sefaria.getName(inputValue, undefined, types, topic_pool);

        let comps = d["completion_objects"].map(o => {
          const c = {...o};
          c["value"] = `${o['title']}${o["type"] === "ref" ? "" : `(${o["type"]})`}`;
          c["label"] = o["title"];
          c["url"] = getURLForObject(c["type"], c["key"]);  // if null, the object will be filtered out

          //"Topic" and "PersonTopic" considered same type:
          const currentType = c["type"];
          const newType = ["Topic", "PersonTopic"].includes(currentType) ? "Topic" : currentType;
          c["type"] = newType;


          return c;
        }).filter(o => o.url !== null);  // filter out objects with null url
        comps = sortByTypeOrder(comps)
        if (comps.length > 0) {
          const q = inputValue;
          return([{value: "SEARCH_OVERRIDE", label: q, type: "search"}].concat(comps));

        } else {
          return[];
        }
        } catch (error) {
        console.error('Error fetching autocomplete suggestions:', error);
        return[];
        }
    };
    const clearSearchBox = function (onChange) {
        onChange({ target: { value: '' } });
  }
  const search = (onChange, query) => {
      //   Execute the actions for searching the query string
      Sefaria.track.event("Search", "Search Box Search", query);
      gtag("event", "search_submit", {
        "project": "Global Search",
        "panel_type": null,
        "feature_name": "Search Results",
        "text": query
      });
      showSearchWrapper(query);
      clearSearchBox(onChange);
  }
  const redirectOrSearch = (onChange, query) => {
      //   Redirect search when an action that is not actually a search is needed (e.g. go to the selected ref), or execute a search
      getQueryObj(query).then(({ type: queryType, id: queryId, is_book: queryIsBook }) => {
          if (queryType === 'Ref') {
              gtag("event", "search_navto", {
                "project": "Global Search",
                "panel_type": null,
                "feature_name": "Autolink",
                "text": query,
                "to": queryId
              });
              let action = queryIsBook ? "Search Box Navigation - Book" : "Search Box Navigation - Citation";
              Sefaria.track.event("Search", action, queryId);
              clearSearchBox(onChange);
              onRefClick(queryId);
              onNavigate && onNavigate();
          } else if (queryType === 'Topic') {
              gtag("event", "search_navto", {
                "project": "Global Search",
                "panel_type": null,
                "feature_name": "Autolink",
                "text": query,
                "to": queryId
              });
              Sefaria.track.event("Search", "Search Box Navigation - Topic", query);
              clearSearchBox(onChange);
              openTopic(queryId);
              onNavigate && onNavigate();
          } else if (queryType === "Person" || queryType === "Collection" || queryType === "TocCategory") {
              gtag("event", "search_navto", {
                "project": "Global Search",
                "panel_type": null,
                "feature_name": "Autolink",
                "text": query,
                "to": queryId
              });
              const item = { type: queryType, key: queryId, url: getURLForObject(queryType, queryId) };
              redirectToObject(onChange, item);
          } else {
              search(onChange, query);
          }
      })
    }
   const submitSearch = (onChange, query, highlightedIndex, highlightedSuggestion, enforceSearch) => {
      if (highlightedIndex > -1 && highlightedSuggestion.type === 'search') {
              showSearchWrapper(query);
              clearSearchBox(onChange);
              return;
      }

      if (enforceSearch) {
          search(onChange, query);
      } else {
          redirectOrSearch(onChange, query);
      }
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

    const redirectToObject = (onChange, item) => {
        Sefaria.track.event("Search", `Search Box Navigation - ${item.type}`, item.key);
        gtag("event", "search_navto", {
          "project": "Global Search",
          "panel_type": null,
          "link_type": type_title_map[item.type],
          "to": item.label || item.key,
          "text": item.key
        });
        clearSearchBox(onChange);
        const url = item.url.replace(/\?/g, '%3F');
        const handled = openURL(url);
        if (!handled) {
          window.location = url;
        }
        onNavigate && onNavigate();
    }

    const renderInput = (highlightedIndex, highlightedSuggestion, getInputProps, setInputValue)=> {

        return(
            <SearchInputBox
            getInputProps={getInputProps}
            highlightedSuggestion={highlightedSuggestion}
            hideHebrewKeyboard={hideHebrewKeyboard}
            highlightedIndex={highlightedIndex}
            setInputValue={setInputValue}
            panel={firstPanel}

            setSearchFocused={setSearchFocused}
            searchFocused={searchFocused}

            submitSearch={submitSearch.bind(null, getInputProps().onChange)}
            redirectToObject={redirectToObject.bind(null, getInputProps().onChange)}
        />
        )
    };

    const renderItems =(suggestions, highlightedIndex, getItemProps, getInputProps) => {
        const inputValue = getInputProps().value || '';

        return(
             <SuggestionsDispatcher      
                suggestions={suggestions}
                getItemProps={getItemProps}
                highlightedIndex={highlightedIndex}
                inputValue={inputValue}
                submitSearch={submitSearch.bind(null, getInputProps().onChange)}
                redirectToObject={redirectToObject.bind(null, getInputProps().onChange)}
              />
        )
    };

  return (
      <GeneralAutocomplete
          containerClassString='search-container'
          dropdownMenuClassString='autocomplete-dropdown'
          renderInput={renderInput}
          renderItems={renderItems}
          getSuggestions={fetchSuggestions}
          shouldDisplaySuggestions={isOpen=> isOpen && searchFocused}
      />
  );
};
