import React, {useState} from "react";
import { useCombobox } from 'downshift';



export const GeneralAutocomplete = ({
    getSuggestions,
    renderItems,
    renderInput,
    containerClassString,
    dropdownMenuClassString,
    shouldDisplaySuggestions,
}) => {
    /**
 * @param {Function} getSuggestions - A function that takes the current input value as a parameter
 *                                    and returns a promise resolving to an array of suggestions.
 * @param {Function} renderItems - A function to render the list of suggestions. It receives the following arguments:
 *                                 (suggestions, highlightedIndex, getItemProps, getInputProps).
 * @param {Function} renderInput - A function to render the input box. It receives the following arguments:
 *                                 (highlightedIndex, highlightedSuggestion, getInputProps, setInputValue).
 * @param {string} containerClassString - CSS class string for styling the main container of the autocomplete component.
 * @param {string} dropdownMenuClassString - CSS class string for styling the dropdown menu containing the suggestions.
 * @param {Function} shouldDisplaySuggestions - An optional function to determine whether the suggestions dropdown should
 *                                                be displayed. Defaults to checking if the dropdown is open.
 */
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

    const highlightedSuggestion=suggestions[highlightedIndex]
    shouldDisplaySuggestions = shouldDisplaySuggestions || (() => {return isOpen})

    return (
        <div className={containerClassString}>
            {renderInput(highlightedIndex, highlightedSuggestion, getInputProps, setInputValue)}
            <div
              {...getMenuProps()}
              className={dropdownMenuClassString}
            >
                {shouldDisplaySuggestions(isOpen) && renderItems(suggestions, highlightedIndex, getItemProps, getInputProps)}
            </div>
        </div>
    );
};