import React, {useRef, useState} from "react";
import Sefaria from "./sefaria/sefaria";
import {AdminToolHeader, InterfaceText} from "./Misc";
import sanitizeHtml  from 'sanitize-html';
import MDEditor from '@uiw/react-md-editor';


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
                         validate, deleteObj, items=[], isNew=true, extras=[], path=[]}) => {

    const setValues = function(e) {
        if (data.hasOwnProperty(e.target.id)) {
            data[e.target.id] = e.target.value;
        }
        updateData(data);
    }
    const item = ({label, field, placeholder, textarea}) => {
        return  <div className="section">
                        <label><InterfaceText>{label}</InterfaceText></label>
                        {textarea ?
                            <MDEditor id={field} value={Sefaria._(placeholder)} onChange={setTextareaValue} />
                           : <input type='text' id={field} onBlur={setValues} defaultValue={data[field]} placeholder={Sefaria._(placeholder)}/>}
                    </div>;
    }
    const options_for_form = {
        "Title": {label: "Title", field: "enTitle", placeholder: "Add a title.", textarea: false},
        "Hebrew Title": {label: "Hebrew Title", field: "heTitle", placeholder: "Add a title.", textarea: false},
        "English Description": {label: "English Description", field: "enDescription", placeholder: "Add a description.", textarea: true},
        "Hebrew Description": {label: "Hebrew Description", field: "heDescription", placeholder: "Add a description.", textarea: true},
        "Prompt": {label: "Prompt", field: "prompt", placeholder:"Add a prompt.", textarea: true},
        "English Short Description": {label: "English Short Description for Table of Contents", field: "enCategoryDescription",
            placeholder: "Add a short description.", textarea: true},
        "Hebrew Short Description": {label: "Hebrew Short Description for Table of Contents", field: "heCategoryDescription",
            placeholder: "Add a short description.", textarea: true},
    }
    const preprocess = () => {
        // first look for markdown boxes and update data


        // sanitize markdown boxes
        items.map((x) => {
            if (options_for_form[x].textarea) {
                const field = options_for_form[x].field;
                data[field] = sanitizeHtml(data[field], {
                    allowedTags: [],
                    disallowedTagsMode: 'discard',
                });
            }
        });
        validate();
    }
    return <div className="editTextInfo">
            <div className="static">
                <div className="inner">
                    {savingStatus ?  <div className="collectionsWidget">{Sefaria._("Saving...")}</div> : null}
                    <div id="newIndex">
                        <AdminToolHeader title={title} close={close} validate={() => preprocess()}/>
                        {items.map((x) => {
                            if (x.includes("Hebrew") && (!Sefaria._siteSettings.TORAH_SPECIFIC)) {
                                return null;
                            }
                            else if (x === "Category Menu") {
                                return catMenu;
                            }
                            else {
                                return item({...options_for_form[x]});
                            }
                        })}
                        {extras}
                        {!isNew ? <div onClick={deleteObj} id="deleteTopic" className="button small deleteTopic" tabIndex="0" role="button">
                                      <InterfaceText>Delete</InterfaceText>
                                    </div> : null}

                    </div>
                </div>
            </div>
     </div>
}

export {AdminEditor, AdminEditorButton, useEditToggle};