import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminEditor} from "./AdminEditor";
import {requestWithCallBack, Autocompleter, InterfaceText} from "./Misc";
import React, {useState} from "react";
import {useRef} from "react";

const SourceEditor = ({topic, close, origData={}}) => {
    const isNew = !origData.ref;
    const [displayRef, setDisplayRef] = useState(origData.lang === 'he' ?
                                                            (origData.heRef || "") :  (origData.ref || "") );
    const langKey = Sefaria.interfaceLang === 'english' ? 'en' : 'he';
    const { title = '', prompt = '', ai_context = '' } = origData?.descriptions?.[langKey] || {};

    const [data, setData] = useState({enTitle: title,  // use enTitle for hebrew or english case
                                                prompt, ai_context
                                                });
    const [changed, setChanged] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);

    const updateData = (newData) => {
        setChanged(true);
        setData(newData);
    }

    const validate = async function () {
        if (!changed) {
            alert("Please change one of the fields before saving.");
            return false;
        }
        if (displayRef.length === 0) {
          alert(Sefaria._("Ref must be provided."));
          return false;
        }
        let refInCache = Sefaria.getRefFromCache(displayRef);
        if (!refInCache) {
            refInCache = await Sefaria.getRef(displayRef);
        }
        if (!refInCache?.ref) {
          alert(Sefaria._("Valid ref must be provided."));
          return false;
        }
        await save();
    }

    const save = async function () {
        setSavingStatus(true);
        let refInUrl = isNew ? displayRef : origData.ref;
        let url = `/api/ref-topic-links/${Sefaria.normRef(refInUrl)}`;
        let postData = {"topic": topic, "is_new": isNew, 'new_ref': displayRef, 'interface_lang': Sefaria.interfaceLang};
        postData['description'] = {"title": data.enTitle, "prompt": data.prompt, "ai_context": data.ai_context, "review_state": "edited"};
        requestWithCallBack({url, data: postData, setSavingStatus, redirect: () => window.location.href = "/topics/"+topic});
    }

    const handleChange = (x) => {
        setChanged(true);
        setDisplayRef(x);
    }

    const getSuggestions = async (input) => {
        let results = {"helperPromptText": null, "currentSuggestions": null,
            "showAddButton": false
        };
        setDisplayRef(input);
        if (input === "") {  // this occurs when there was text in the inputbox and user just erased it
            return results;
        }
        const d = await Sefaria.getName(input, true, 5);
        if (d.is_section || d.is_segment) {
            results.helperPromptText = null;
            results.currentSuggestions = null;
            results.showAddButton = true;
            results.previewText = input;
            return results;
        } else {
            results.previewText = null;
        }

        results.currentSuggestions = d.completion_objects
            .map(suggestion => ({
                name: suggestion.title,
                key: suggestion.key,
                border_color: Sefaria.palette.refColor(suggestion.key)
            }))
        return results;
    }

    const deleteTopicSource = function() {
        const url = `/api/ref-topic-links/${origData.ref}?topic=${topic}&interface_lang=${Sefaria.interfaceLang}`;
        requestWithCallBack({url, type: "DELETE", redirect: () => window.location.href = `/topics/${topic}`});
    }
    const previousTitleItemRef = useRef(data.enTitle ? "Previous Title" : null); //use useRef to make value null even if component re-renders
    const previousPromptItemRef = useRef(data.prompt ? "Previous Prompt" : null);
    const previousTitleItem = previousTitleItemRef.current;
    const previousPromptItem = previousPromptItemRef.current;

    return <div>
        <AdminEditor title="Source Editor" close={close}  data={data} savingStatus={savingStatus}
                validate={validate} items={[previousTitleItem, "Title", previousPromptItem, "Prompt", "Context for Prompt"]} deleteObj={deleteTopicSource} updateData={updateData} isNew={isNew}
                extras={
                    [<div>
                        <label><InterfaceText>Enter Source Ref (for example: 'Yevamot.62b.9-11' or 'Yevamot 62b:9-11')</InterfaceText></label>
                        <Autocompleter
                            selectedCallback={() => {}}
                            getSuggestions={getSuggestions}
                            inputValue={displayRef}
                            changeInputValue={handleChange}
                            inputPlaceholder="Search for a Text or Commentator."
                            buttonTitle="Select Source"
                            autocompleteClassNames="addInterfaceInput"
                            showSuggestionsOnSelect={true}
                        />
                    </div>]
                }/>

    </div>;
}

export {SourceEditor};