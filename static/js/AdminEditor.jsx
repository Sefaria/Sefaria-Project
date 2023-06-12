import React, {useRef, useState} from "react";
import Sefaria from "./sefaria/sefaria";
import {AdminToolHeader, InterfaceText} from "./Misc";
import sanitizeHtml  from 'sanitize-html';

const AdminEditorButton = ({toggleAddingTopics, text}) => {
    return <div onClick={toggleAddingTopics} id="editTopic" className="button extraSmall topic" role="button">
        <InterfaceText>{text}</InterfaceText>
    </div>;
}

function useEditToggle() {
  const [editingBool, toggleEditingBool] = useState(false);
  const toggleAddingTopics = function(e) {
      if (e.currentTarget.id === "editTopic") {
        toggleEditingBool(true);
      }
      else if(e.currentTarget.id === "cancel") {
        toggleEditingBool(false);
     }
  }
  return [editingBool, toggleAddingTopics];
}

const AdminEditor = ({title, data, close, catMenu, updateData, savingStatus,
                             validate, deleteObj, items = [], isNew = true,
                             extras = [], path = []}) => {
    const [validatingLinks, setValidatingLinks] = useState(false);
    const checkForLinks = (element, i, parent) => {
        if (element?.tagName === 'a') {
            if (links.indexOf(element.properties.href) === -1) {
                const newLinks = [...links];
                newLinks.push(element);
                setLinks(newLinks);
            }
        }
        return true;
    }
    const setTextareaValue = (newVal, e) => {
        data[e.target.id] = sanitizeHtml(newVal, {allowedTags: [], disallowedTagsMode: 'discard'});
        data[e.target.id] = newVal;
        updateData({...data});
    }
    const setInputValue = (e) => {
        if (data.hasOwnProperty(e.target.id)) {
            data[e.target.id] = sanitizeHtml(e.target.value, {allowedTags: [], disallowedTagsMode: 'discard'});
        }
        updateData({...data});
    }
    const preprocess = async () => {
        setValidatingLinks(true);
        for (const x of items) {
            if (options_for_form[x]?.is_textarea) {
                const field = options_for_form[x].field;
                const valid_tags = await validateMarkdownTags(data[field]);
                if (!valid_tags) {
                    setValidatingLinks(false);
                    return false;
                }
            }
        }
        validate();
        setValidatingLinks(false);
    }
    const validateMarkdownTags = async (input) => {
        const regexp = /\[.*?\]\((.*?)\)/g;
        const matches = [...input.matchAll(regexp)];
        const matches_without_duplicates = Array.from(new Set(matches));
        for (const match of matches_without_duplicates) {
            const url = match[1];
            const name = url.split("/").slice(-1)[0];
            let namesFound = [];
            let d = [];
            if (url.startsWith("/topics")) {
                d = await Sefaria.getTopicCompletions(name, (x) => x[1]);
            }
            else {
                d = await Sefaria.getName(name, false);
                if (d.is_ref) {
                    continue;
                }
                d = d.completion_objects;
            }
            d.forEach((x) => {
                Array.isArray(x.key) ?
                    x.key.forEach((y) => namesFound.push(y)) // the key is an array when getName returns a TocCategory
                    : namesFound.push(x.key);
            });
            const validLink = namesFound.includes(name) > 0 ? true :
                confirm(`${name} not found in Sefaria database.  Please confirm that you meant to write '${url}' in the description.`);
            if (!validLink) {
                return false;
            }
        }
        return true;
    }
    const item = ({label, field, placeholder, is_textarea}) => {
        return <div className="section">
            <label><InterfaceText>{label}</InterfaceText></label>
            {is_textarea ?
                    // <MDEditor textareaProps={{id: field, placeholder: Sefaria._(placeholder)}}
                    //      commands={[commands.bold, commands.italic, commands.link]}
                    //      value={data[field]} onChange={setTextareaValue}/>
                    <textarea className="default" id={field} onBlur={setInputValue} defaultValue={data[field]}
                         placeholder={Sefaria._(placeholder)}/>
                    : <input type='text' id={field} onBlur={setInputValue} defaultValue={data[field]}
                         placeholder={Sefaria._(placeholder)}/>}
        </div>;
    }
    const options_for_form = {
        "Title": {label: "Title", field: "enTitle", placeholder: "Add a title."},
        "Hebrew Title": {label: "Hebrew Title", field: "heTitle", placeholder: "Add a title."},
        "English Description": {
            label: "English Description",
            field: "enDescription",
            placeholder: "Add a description.",
            is_textarea: true
        },
        "Hebrew Description": {
            label: "Hebrew Description",
            field: "heDescription",
            placeholder: "Add a description.",
            is_textarea: true
        },
        "Prompt": {label: "Prompt", field: "prompt", placeholder: "Add a prompt.", textarea: true},
        "English Short Description": {
            label: "English Short Description for Table of Contents", field: "enCategoryDescription",
            placeholder: "Add a short description.", is_textarea: true
        },
        "Hebrew Short Description": {
            label: "Hebrew Short Description for Table of Contents", field: "heCategoryDescription",
            placeholder: "Add a short description.", is_textarea: true
        },
    }
    return <div className="editTextInfo">
        <div className="static">
            <div className="inner">
                {savingStatus || validatingLinks ? <div className="collectionsWidget">{Sefaria._("Saving...")}</div> : null}
                <div id="newIndex">
                    <AdminToolHeader title={title} close={close} validate={preprocess}/>
                    {items.map((x) => {
                        if (x.includes("Hebrew") && (!Sefaria._siteSettings.TORAH_SPECIFIC)) {
                            return null;
                        } else if (x === "Category Menu") {
                            return catMenu;
                        } else {
                            return item({...options_for_form[x]});
                        }
                    })}
                    {extras}
                    {!isNew &&
                    <div onClick={deleteObj} id="deleteTopic" className="button small deleteTopic" tabIndex="0"
                         role="button">
                        <InterfaceText>Delete</InterfaceText>
                    </div>}

                </div>
            </div>
        </div>
    </div>
}

export {AdminEditor, AdminEditorButton, useEditToggle};
