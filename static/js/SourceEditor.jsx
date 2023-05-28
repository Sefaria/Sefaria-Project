import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminEditor} from "./AdminEditor";
import {postWithCallBack, Autocompleter, InterfaceText} from "./Misc";
import React, {useState} from "react";

const SourceEditor = ({topic, close, origData={}}) => {
    const isNew = !origData.ref;
    const [displayRef, setDisplayRef] = useState(origData.lang === 'he' ?
                                                            (origData.heRef || "") :  (origData.ref || "") );
    const [data, setData] = useState({enTitle: origData?.descriptions?.en?.title || "",
                                                heTitle: origData?.descriptions?.he?.title || "",
                                                enDescription: origData?.descriptions?.en?.prompt || "",
                                                heDescription: origData?.descriptions?.he?.prompt || "",
                                                });
    const [changed, setChanged] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);

    const updateData = function(newData) {
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
        let url = isNew ? `/api/ref-topic-links/${Sefaria.normRef(displayRef)}` : `/api/ref-topic-links/${Sefaria.normRef(origData.ref)}`;
        let descData = {};
        let postData = {"topic": topic, "is_new": isNew, 'new_ref': displayRef, 'interface_lang': Sefaria.interfaceLang};
        if (data.enTitle.length > 0) {
            descData['en'] = {"title": data.enTitle, "prompt": data.enDescription};
        }
        if (data.heTitle.length > 0) {
            descData['he'] = {"title": data.heTitle, "prompt": data.heDescription};
        }
        if (!!Object.keys(descData).length) {
            postData['descriptions'] = descData;
        }
        postWithCallBack({url, data: postData, setSavingStatus, redirect: () => window.location.href = "/topics/"+topic});
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
        if (input === "") {
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

    const deleteObj = function() {
      $.ajax({
        url: `/api/ref-topic-links/${origData.ref}?topic=${topic}&lang=${Sefaria.interfaceLang}`,
        type: "DELETE",
        success: function(result) {
          if ("error" in result) {
            alert(result.error);
          } else {
            alert(Sefaria._("Source Deleted."));
            window.location = `/topics/${topic}`;
          }
        }
      }).fail(function() {
        alert(Sefaria._("Something went wrong. Sorry!"));
      });
    }
    return <div>
        <AdminEditor title="Source Editor" close={close}  data={data} savingStatus={savingStatus}
                validate={validate} deleteObj={deleteObj} updateData={updateData} isNew={isNew} shortDescBool={false}
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