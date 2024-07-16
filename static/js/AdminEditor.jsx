import React, {useRef, useState} from "react";
import Sefaria from "./sefaria/sefaria";
import {AdminToolHeader, InterfaceText, TitleVariants} from "./Misc";
import sanitizeHtml  from 'sanitize-html';
import classNames from "classnames";
const options_for_form = {
    // "Picture": {label: "Picture", field: "picture", placeholder: "Add a picture.", type: "picture"},
    "English Caption": {label: "English Caption", field: "enImgCaption", placeholder: "Add a caption for topic picture"},
    "Hebrew Caption": {label: "Tibetan Caption", field: "heImgCaption", placeholder: "Add a Hebrew caption for topic picture"},
    "Title": {label: "Title", field: "enTitle", placeholder: "Add a title."},
    "Hebrew Title": {label: "Tibetan Title", field: "heTitle", placeholder: "Add a title."},
    "English Description": {
        label: "English Description",
        field: "enDescription",
        placeholder: "Add a description.",
        type: 'textarea',
        markdown: true,
    },
    "Hebrew Description": {
        label: "Tibetan Description",
        field: "heDescription",
        placeholder: "Add a description.",
        type: 'textarea',
        markdown: true
    },
    "Prompt": {label: "Prompt", field: "prompt", placeholder: "Add a prompt.", type: 'textarea'},
    "English Short Description": {
        label: "English Short Description for Table of Contents", field: "enCategoryDescription",
        placeholder: "Add a short description.", type: 'input'
    },
    "Hebrew Short Description": {
        label: "Tibetan Short Description for Table of Contents", field: "heCategoryDescription",
        placeholder: "Add a short description.", type: 'input'
    },
    "English Alternate Titles": {
        label: "English Alternate Titles", field: "enAltTitles",
        placeholder: "Add a title.", type: 'title variants'
    },
    "Hebrew Alternate Titles": {
        label: "Tibetan Alternate Titles", field: "heAltTitles",
        placeholder: "Add a title.", type: 'title variants'
    },
    "Birth Place": {
        label: "Place of Birth", field: "birthPlace", placeholder: "Place of birth", type: 'input'
    },
    "Hebrew Birth Place": {
        label: "Hebrew Place of Birth", field: "heBirthPlace", placeholder: "Place of birth", type: 'input'
    },
    "Place of Death": {
        label: "Place of Death", field: "deathPlace", placeholder: "Place of death", type: 'input'
    },
    "Hebrew Place of Death": {
        label: "Hebrew Place of Death", field: "heDeathPlace", placeholder: "Place of death", type: 'input'
    },
    "Birth Year": {
        label: "Year of Birth", field: "birthYear", placeholder: "Year of birth", type: 'input'
    },
    "Death Year": {
        label: "Year of Death", field: "deathYear", placeholder: "Year of death", type: 'input'
    },
    "Era": {
        label: "Era (GN/Gaonim, RI/Rishonim, AH/Achronim, CO/Contemporary)", field: "era", placeholder: "Choose an era", type: 'dropdown',
        dropdown_data: Sefaria._eras
    }
}
    
const AdminEditorButton = ({toggleAddingTopics, text, top=false, bottom=false}) => {
    const classes = classNames({button: 1, extraSmall: 1, topic: 1, top, bottom});
    return <div onClick={toggleAddingTopics}
                id="editTopic"
                className={classes}
                role="button">
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

const validateMarkdownLinks = async (input) => {
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

const AdminEditor = ({title, data, close, catMenu, pictureUploader, updateData, savingStatus,
                             validate, deleteObj, items = [], isNew = true,
                             extras = [], path = []}) => {
    const [validatingLinks, setValidatingLinks] = useState(false);
    const setInputValue = (e) => {
        if (data.hasOwnProperty(e.target.id)) {
            data[e.target.id] = sanitizeHtml(e.target.value, {allowedTags: [], disallowedTagsMode: 'discard'});
        }
        updateData({...data});
    }
    const handleTitleVariants = (newTitles, field) => {
        const newData = {...data};
        newData[field] = newTitles.map(x => Object.assign({}, x));
        updateData(newData);
    }
    const preprocess = async () => {
        setValidatingLinks(true);
        for (const x of items) {
            if (options_for_form[x]?.markdown) {
                const field = options_for_form[x].field;
                const valid_tags = await validateMarkdownLinks(data[field]);
                if (!valid_tags) {
                    setValidatingLinks(false);
                    return false;
                }
            }
        }
        validate();
        setValidatingLinks(false);
    }
    const getDropdown = (field, dropdown_data, placeholder) => {
        const chooseCat = <option key={`chooseCategory_${field}`} value={data.origEra}
                            selected={!dropdown_data.includes(data[field])}>{placeholder}</option>;
        return <div id={`dropdown_${field}`} className="categoryChooserMenu">
                          <select key={field} id={field} onChange={setInputValue}>
                              {chooseCat}
                              {dropdown_data.map(x =>
                                  <option key={`${field}_${x}`}
                                          value={x}
                                          selected={data[field] === x}>{x}</option>)}
                          </select>
                        </div>;
    }
    const item = ({label, field, placeholder, type, dropdown_data}) => {
        let obj;
        switch(type) {
            case 'dropdown':
                obj = getDropdown(field, dropdown_data, placeholder);
                break;
            case 'title variants':
                const titles = data[field];
                obj = <TitleVariants update={(newTitles) => handleTitleVariants(newTitles, field)} titles={titles} id={field}/>;
                break;
            case 'textarea':
                obj = <textarea className="default" id={field} onChange={setInputValue} defaultValue={data[field]}
                         placeholder={Sefaria._(placeholder)}/>;
                break;
            default:
                const inputType = field.includes('Year') ? 'number' : 'text';
                obj = <input type={inputType} id={field} onChange={setInputValue} defaultValue={data[field]}
                         placeholder={Sefaria._(placeholder)}/>;
        }

        return <div className="section">
                    <label><InterfaceText>{label}</InterfaceText>{(label==="Title" || label==="Tibetan Title") && <span className="asterisk"> *</span>}</label>
                    {obj}
               </div>;
    }
    const confirmDelete = () => {
        if (confirm("Are you sure you want to delete?")) {
            deleteObj();
        }
    }
    
    return <div className="editTextInfo">
        <div className="static">
            <div className="inner">
                {(savingStatus || validatingLinks) &&
                <div className="collectionsWidget">{Sefaria._("Saving...")}</div>}
                <div id="newIndex">
                    <AdminToolHeader title={title} close={close} validate={preprocess}/>
                    {items.map((x) => {
                        if (x.includes("Hebrew") && (!Sefaria._siteSettings.TORAH_SPECIFIC)) {
                            return null;
                        } else if (x === "Category Menu") {
                            return catMenu;
                        } else if (x === "Picture Uploader") {
                            return pictureUploader;
                        }
                        else {
                            return item({...options_for_form[x]});
                        }
                    })}
                    {extras}
                    {!isNew &&
                    <div onClick={confirmDelete} id="deleteTopic" className="button small deleteTopic" tabIndex="0"
                         role="button">
                        <InterfaceText>Delete</InterfaceText>
                    </div>}

                </div>
            </div>
        </div>
    </div>
}

export {AdminEditor, AdminEditorButton, useEditToggle, validateMarkdownLinks};
