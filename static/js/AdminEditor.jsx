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
                         validate, deleteObj, isNew=true, shortDescBool=false, extras=[], path=[]}) => {

    const setValues = function(e) {
        if (e.target.id === "topicTitle") {
            data.enTitle = e.target.value;
        }
        else if (e.target.id === "topicDesc") {
            data.enDescription = e.target.value;
        }
        else if (e.target.id === "topicCatDesc") {
            data.enCategoryDescription = e.target.value;
        }
        else if (e.target.id === "topicHeTitle") {
            data.heTitle = e.target.value;
        }
        else if (e.target.id === "topicHeDesc") {
            data.heDescription = e.target.value;
        }
        else if (e.target.id === "topicHeCatDesc") {
            data.heCategoryDescription = e.target.value;
        }
        updateData(data);
    }
    return <div className="editTextInfo">
            <div className="static">
                <div className="inner">
                    {savingStatus ?  <div className="collectionsWidget">{Sefaria._("Saving...")}</div> : null}
                    <div id="newIndex">
                        <AdminToolHeader title={title} close={close} validate={() => validate()}/>
                        <div className="section">
                            <label><InterfaceText>English Title</InterfaceText></label>
                            <input type='text' id="topicTitle" onBlur={setValues} defaultValue={data.enTitle} placeholder={Sefaria._("Add a title.")}/>
                        </div>
                        {Sefaria._siteSettings.TORAH_SPECIFIC ?
                            <div className="section">
                                <label><InterfaceText>Hebrew Title</InterfaceText></label>
                                <input type='text' id="topicHeTitle" onBlur={setValues} defaultValue={data.heTitle} placeholder={Sefaria._("Add a title.")}/>
                            </div> : null}
                        {catMenu}
                        <div className="section">
                            <label><InterfaceText>English Description</InterfaceText></label>
                            <textarea id="topicDesc" onBlur={setValues} className="default"
                                   defaultValue={data.enDescription} placeholder={Sefaria._("Add a description.")}/>
                        </div>
                        {Sefaria._siteSettings.TORAH_SPECIFIC ?
                            <div className="section">
                                <label><InterfaceText>Hebrew Description</InterfaceText></label>
                                <textarea id="topicHeDesc" onBlur={setValues} className="default"
                                       defaultValue={data.heDescription} placeholder={Sefaria._("Add a description.")}/>
                            </div> : null}
                       {shortDescBool ?  <div> <div className="section">
                                                     <label><InterfaceText>English Short Description for Table of Contents</InterfaceText></label>
                                                     <textarea
                                                         className="default"
                                                         id="topicCatDesc"
                                                         onBlur={setValues}
                                                         defaultValue={data.enCategoryDescription}
                                                         placeholder={Sefaria._("Add a short description.")}/>
                                            </div>
                                            {Sefaria._siteSettings.TORAH_SPECIFIC ? <div className="section">
                                                    <label><InterfaceText>Hebrew Short Description for Table of Contents</InterfaceText></label>
                                                    <textarea
                                                        className="default"
                                                        id="topicHeCatDesc"
                                                        onBlur={setValues}
                                                        defaultValue={data.heCategoryDescription}
                                                        placeholder={Sefaria._("Add a short description.")}/>
                                            </div> : null}
                                      </div> :
                       null}
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