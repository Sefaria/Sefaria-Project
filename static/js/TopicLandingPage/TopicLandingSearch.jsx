import React from 'react';
import {GeneralAutocomplete} from "../GeneralAutocomplete";
import Sefaria from "../sefaria/sefaria";

const getSuggestions = async (input) => {
    if (input === "") {
      return [];
    }
    const word = input.trim();

    const _getFormattedPath = (slug, lang) => {
      const categories = Sefaria.topicTocCategories(slug);
      if(!categories){return ""}
      const titles = categories.map((cat) => cat[lang]);
      return "("+ titles.join(" < ") + ")";
    }

    const parseSuggestions = (d) => {
      let topics = [];
      console.log(d)
      if (d[1].length > 0) {
        topics = d[1].slice(0, 10).map((e) => ({
          title: e.title + " " + _getFormattedPath(e.key, 'en'),
          key: e.key,
        }));
      }
      return topics;
    };
    // const completionObjects = await Sefaria.getTopicCompletions(word, callback());
    let returnValue = await Sefaria.getTopicCompletions(word);
    const completionObjects = parseSuggestions(returnValue)
    return completionObjects.map((suggestion) => ({
      text: suggestion.title,
      slug: suggestion.key,
    }));
  };


const renderItem = (openTopic, item, index, highlightedIndex, getItemProps)=>{
  const isHighlighted = index === highlightedIndex;
  return (
    <div
      key={item.slug}
      style={{
        backgroundColor: isHighlighted ? 'grey' : 'transparent'
      }}
      onClick={(e) => openTopic(item.slug)}
      {...getItemProps({index})}
    >{item.text}
    </div>
  );
};



const renderInput = (openTopic, numOfTopics, highlightedIndex, highlightedSuggestion, inputDownshiftProps) =>{
    console.log(inputDownshiftProps)
    const { onKeyDown, ...otherInputDownshiftProps } = inputDownshiftProps;
    const onKeyDownOverride = (event) => {
        onKeyDown(event);
        if (event.key === 'Enter') {
            highlightedIndex >= 0 && openTopic(highlightedSuggestion.slug)
        }
    }
    return (
        <input
            className=''
            id="searchInput"
            placeholder={`Find ${numOfTopics} Topics`}
            // onFocus={focusSearch}
            // onBlur={blurSearch}
            onKeyDown={onKeyDownOverride}
            maxLength={75}
            title={Sefaria._("Search for Texts or Keywords Here")}
            {...otherInputDownshiftProps}
        />
    )
}

export const TopicLandingSearch = ({openTopic, numOfTopics}) => {
    return (<GeneralAutocomplete getSuggestions={getSuggestions} renderItem={renderItem.bind(null, openTopic)} dropdownMenuClassString=''
                                 renderInput={renderInput.bind(null, openTopic, numOfTopics)}/>);
};