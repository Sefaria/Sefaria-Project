import Sefaria from "./sefaria/sefaria";
import React, {useEffect, useState} from "react";
import classNames from "classnames";
import {EnglishText, HebrewText, InterfaceText, SearchButton} from "./Misc";
import { useCombobox } from 'downshift';



export const GeneralAutocomplete = ({
    getSuggestions,
    renderItems,
    renderInput,
    containerClassString,
    dropdownMenuClassString,
    shouldDisplaySuggestions,
    onSubmit,
}) => {
    const [suggestions, setSuggestions] = useState([]);
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
        onInputValueChange: async ({ inputValue }) => {
            setSuggestions(await getSuggestions(inputValue));
        }
    });
    const inputDownshiftProps = getInputProps();
    const highlightedSuggestion=suggestions[highlightedIndex]
    shouldDisplaySuggestions = shouldDisplaySuggestions || (() => {return isOpen})
    return (
        <div className={containerClassString}>
            {renderInput(highlightedIndex, highlightedSuggestion, getInputProps, setInputValue)}
            <div
              {...getMenuProps()}
              className={dropdownMenuClassString}
            >
                {/*{(shouldDisplaySuggestions(isOpen)) && suggestions.map((item, index) => renderItem(item, index, highlightedIndex, getItemProps, onSubmit))}*/}
                {(shouldDisplaySuggestions(isOpen)) && renderItems(suggestions, highlightedIndex, getItemProps, getInputProps)}
            </div>
        </div>
    );
};