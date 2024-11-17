import React from 'react';
import {GeneralAutocomplete} from "../GeneralAutocomplete";
import Sefaria from "../sefaria/sefaria";

const getSuggestions = async (input) => {
    console.log("I got called")
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
    const a = completionObjects.map((suggestion) => ({
      text: suggestion.title,
      slug: suggestion.key,
    }));
    console.log(a);
    return a;
  };
const renderItem = (item, index, highlightedIndex, getItemProps, otherRelevenatDownshiftProps)=>{
  const isHighlighted = index === highlightedIndex;
  return (
    <div
      key={item.slug}
      style={{
        backgroundColor: isHighlighted ? 'grey' : 'transparent'
      }}
    >
      <a href={`/topics/${item.slug}`}>{item.text}</a>
    </div>
  );
};

const renderInput = (downshiftProps) =>{
    return (
        <input
            className={''}
            id="searchInput"
            placeholder={Sefaria._("Search")}
            // onKeyDown={handleSearchKeyDown}
            // onFocus={focusSearch}
            // onBlur={blurSearch}
            maxLength={75}
            title={Sefaria._("Search for Texts or Keywords Here")}
            {...downshiftProps}
        />
    )
}

export const TopicLandingSearch = ({}) => {
    return (<GeneralAutocomplete getSuggestions={getSuggestions} renderItem={renderItem} dropdownMenuClassString=''
                                 renderInput={renderInput}/>);
};