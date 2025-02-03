import React from 'react';
import classNames  from 'classnames';
import {GeneralAutocomplete} from "../GeneralAutocomplete";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText, SearchButton} from "../Misc";

const getSuggestions = async (input) => {
    if (input.length <=1) {
      return [];
    }
    const word = input.trim();

    const _capitalizeFirstLetter = (text)=> {
        return String(text).charAt(0).toUpperCase() + String(text).slice(1);
    }
    const _extractDisambiguation = (title) => {
        const match = title.match(/\((.*?)\)$/);
        return match?.[1];
    };
    const _removeDisambiguation = (title)=>{
        return title.replace(/\s*\(.*?\)\s*$/, '').trim();
    }

    const _getFormattedPath = (slug, lang) => {
      const categories = Sefaria.topicTocCategories(slug);
      if(!categories){return ""}
      const titles = categories.map((cat) => cat[lang]);
      return `(${titles.join(' > ')})`;
    }

    const _parseSuggestions = (completionObjs, lang) => {
      if (completionObjs.length === 0) {return [];}

      return completionObjs.map((e) => {
        const categories = Sefaria.topicTocCategories(e.key);
        const isDisambiguationEqualCategory =
            categories?.some(category => _extractDisambiguation(e.title) === category[lang]);

        const title = isDisambiguationEqualCategory
          ? _removeDisambiguation(e.title)
          : e.title;

        return {
          title: `#${_capitalizeFirstLetter(title)}`,
          categoryPathTitle: _getFormattedPath(e.key, lang),
          key: e.key,
        };
      });
    };

    const isInputHebrew = Sefaria.hebrew.isHebrew(word);
    const lang = isInputHebrew? 'he' : 'en';

    const rawCompletions = await Sefaria.getName(word,20, "Topic", "library", true, true);
    const completionObjects = _parseSuggestions(rawCompletions["completion_objects"], lang);
    return completionObjects.map((suggestion) => ({
      text: suggestion.title,
      categoryText: suggestion.categoryPathTitle,
      slug: suggestion.key,
    }));
};


const renderItem = (openTopic, item, index, highlightedIndex, getItemProps)=>{
    const highlightedClassString = classNames({
      highlighted: index === highlightedIndex,
    });
    return (
      <div onClick={openTopic.bind(null, item.slug)}>
        <div
          className={`topic-landing-search-suggestion ${highlightedClassString}`}
          key={item.slug}
          {...getItemProps({index})}
        >
            <span className="topic-landing-search-suggestion-title">{item.text}</span> <span className="topic-landing-search-suggestion-category-path">&nbsp;{item.categoryText}</span>
        </div>
      </div>
    );
};

const renderItems = (openTopic, suggestions, highlightedIndex, getItemProps) => {
    return (
        <>
          {suggestions.map((item, index) =>
            renderItem(openTopic, item, index, highlightedIndex, getItemProps)
          )}
        </>
    );
};



const renderInput = (openTopic, numOfTopics, highlightedIndex, highlightedSuggestion, getInputProps) =>{
    const { onKeyDown, ...otherInputDownshiftProps } = getInputProps();
    const onKeyDownOverride = (event) => {
        onKeyDown(event);
        if (event.key === 'Enter') {
            highlightedIndex >= 0 && openTopic(highlightedSuggestion.slug)
        }
    };
    const placeHolder = Sefaria._v({"he": `חפש ${numOfTopics} אנשים, מקומות, חפצים`, "en": `Find ${numOfTopics} People, Places, Things`})
    return (
        <div className="topic-landing-search-input-box-wrapper">
        <SearchButton/>
        <input
            className='topic-landing-search-input'
            id="searchInput"
            placeholder={placeHolder}
            onKeyDown={onKeyDownOverride}
            maxLength={75}
            title={Sefaria._("Search for Texts or Keywords Here")}
            {...otherInputDownshiftProps}
        />
        </div>
    )
}

const scrollBrowseTopicsIntoView = (e) =>{
    document.getElementById("browseTopics")?.scrollIntoView({block: 'center', inline: 'center', behavior: 'auto'});
}

export const TopicLandingSearch = ({openTopic, numOfTopics}) => {

    return (
        <>
        <div className="topic-landing-search-wrapper">
            <GeneralAutocomplete
                getSuggestions={getSuggestions}
                renderItems={renderItems.bind(null, openTopic)}
                containerClassString="topic-landing-search-container"
                dropdownMenuClassString="topic-landing-search-dropdown"
                renderInput={renderInput.bind(null, openTopic, numOfTopics)}
                // shouldDisplaySuggestions={()=>true}
            />
        </div>
    <div className="explore-all-topics-prompt" onClick={scrollBrowseTopicsIntoView}>
        <InterfaceText>Explore all topics ›</InterfaceText>
    </div>
            </>
    );
};