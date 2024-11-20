import React from 'react';
import {GeneralAutocomplete} from "../GeneralAutocomplete";
import Sefaria from "../sefaria/sefaria";
import {SearchButton} from "../Misc";

const getSuggestions = async (input) => {
    if (input.length <=1) {
      return [];
    }
    const word = input.trim();

    const _getFormattedPath = (slug, lang) => {
      const categories = Sefaria.topicTocCategories(slug);
      if(!categories){return ""}
      const titles = categories.map((cat) => cat[lang]);
      return "("+ titles.join(` > `) + ")";
    }

    const parseSuggestions = (d, lang) => {
      let topics = [];
      if (d[1].length > 0) {
        topics = d[1].slice(0, 10).map((e) => ({
          title: "# " + e.title + " " + _getFormattedPath(e.key, lang),
          key: e.key,
        }));
      }
      const dummySuggestion = {title: "# Dummy", key: 'dummy'};
      topics = topics.concat([dummySuggestion, dummySuggestion, dummySuggestion, dummySuggestion, dummySuggestion])
      return topics;
    };

    const isInputHebrew = Sefaria.hebrew.isHebrew(word);
    const lang = isInputHebrew? 'he' : 'en';

    const rawCompletions = await Sefaria.getTopicCompletions(word);
    const completionObjects = parseSuggestions(rawCompletions, lang)
    return completionObjects.map((suggestion) => ({
      text: suggestion.title,
      slug: suggestion.key,
    }));
  };


const renderItem = (openTopic, item, index, highlightedIndex, getItemProps)=>{
  const isHighlighted = index === highlightedIndex;
  const highlightedClassString = isHighlighted ? "highlighted" : '';
  return (
      <div onClick={openTopic.bind(null, item.slug)}>
    <div
      className={`topic-landing-search-suggestion ${highlightedClassString}`}
      key={item.slug}
      {...getItemProps({index})}
    >{item.text}
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

export const TopicLandingSearch = ({openTopic, numOfTopics}) => {

    return (<div className="topic-landing-search-wrapper">
        <GeneralAutocomplete getSuggestions={getSuggestions} renderItems={renderItems.bind(null, openTopic)} containerClassString={"topic-landing-search-container"} dropdownMenuClassString='topic-landing-search-dropdown'
                                 renderInput={renderInput.bind(null, openTopic, numOfTopics)}/>
            </div>
    );
};