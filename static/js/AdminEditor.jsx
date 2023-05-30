import React, {useRef, useState} from "react";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminToolHeader, InterfaceText} from "./Misc";

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
    const item = (label, id, placeholder, textarea=false) => {
        return  <div className="section">
                        <label><InterfaceText>{label}</InterfaceText></label>
                        {textarea ?
                            <textarea id={id} onBlur={setValues} className="default" defaultValue={data[id]} placeholder={Sefaria._(placeholder)}/>
                           : <input type='text' id={id} onBlur={setValues} defaultValue={data[id]} placeholder={Sefaria._(placeholder)}/>}
                    </div>;
    }
    const options_for_form = {
        "Title": item("Title", "enTitle", "Add a title."),
        "Hebrew Title": Sefaria._siteSettings.TORAH_SPECIFIC ?
            item("Hebrew Title", 'heTitle', 'Add a title.') : null,
        "Category Menu": catMenu,
        "English Description": item("English Description", "enDescription", "Add a description."),
        "Hebrew Description": Sefaria._siteSettings.TORAH_SPECIFIC ?
            item("Hebrew Description", "heDescription", "Add a description.") : null,
        "Prompt": item("Prompt", "prompt", "Add a prompt."),
        "English Short Description": item("English Short Description for Table of Contents", "enCategoryDescription", "Add a short description."),
        "Hebrew Short Description": item("Hebrew Short Description for Table of Contents", "heCategoryDescription", "Add a short description."),

    }
    return <div className="editTextInfo">
            <div className="static">
                <div className="inner">
                    {savingStatus ?  <div className="collectionsWidget">{Sefaria._("Saving...")}</div> : null}
                    <div id="newIndex">
                        <AdminToolHeader title={title} close={close} validate={() => validate()}/>
                        {items.map((x) => options_for_form[x])}
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