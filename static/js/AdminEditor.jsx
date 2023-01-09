import React, {useRef, useState} from "react";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminToolHeader, CategoryChooser, InterfaceText} from "./Misc";

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


const AdminEditor = ({origData, toolType, onCreateSuccess, close}) => {
    const [savingStatus, setSavingStatus] = useState(false);
    const [isTopicCategory, setIsTopicCategory] = useState(Object.keys(origData?.origCategoryDesc).length > 0 && toolType === "topic");  // applicable when adding/editing Topic with children
    const [path, setPath] = useState(origData?.categories); // only applicable when editing/adding Categories
    const isNew = origData?.origEn === "";
    const [data, setData] = useState({...origData, catSlug: origData?.origCategorySlug, enTitle: origData?.origEn,
                                    heTitle: origData?.origHe, heDescription: origData?.origDesc?.he,
                                    enDescription: origData?.origDesc?.en,
                                    enCategoryDescription: origData?.origCategoryDesc?.en,
                                    heCategoryDescription: origData?.origCategoryDesc?.he});
    let catMenu = null;
    const handleCatChange = function(e) {
      data.catSlug = e.target.value;
      //logic is: if it starts out with origCategoryDesc, isCategory should always be true, otherwise, it should depend solely on 'Main Menu'
      const newIsTopicCategory = Object.keys(origData?.origCategoryDesc).length > 0 || e.target.value === Sefaria._("Main Menu");
      setIsTopicCategory(newIsTopicCategory);
      setData(data);
    }
    if (toolType === "topic") {
        let slugsToTitles = Sefaria.slugsToTitles();
        let specialCases = {
            "": {"en": "Choose a Category", "he": Sefaria.translation('he', "Choose a Category")},
            "Main Menu": {"en": "Main Menu", "he": Sefaria.translation('he', "Main Menu")}
        };
        slugsToTitles = Object.assign(specialCases, slugsToTitles);
        catMenu = <div className="section">
                        <label><InterfaceText>Category</InterfaceText></label>
                        <div id="categoryChooserMenu">
                            <select key="topicCats" id="topicCats" onChange={handleCatChange}>
                                {Object.keys(slugsToTitles).map(function (tempSlug, i) {
                                    const tempTitle = Sefaria.interfaceLang === 'english' ? slugsToTitles[tempSlug].en : slugsToTitles[tempSlug].he;
                                    return <option key={i} value={tempSlug} selected={data.catSlug === tempSlug}>{tempTitle}</option>;
                                })}
                            </select>
                        </div>
                </div>;
    } else if (toolType === "category") {
        catMenu = <div className="section">
                    <label><InterfaceText>Category</InterfaceText></label>
                    <CategoryChooser categories={path} update={setPath}/>
                </div>;
    }

    const validate = function () {
        if (data.catSlug === "") {
          alert(Sefaria._("Please choose a category."));
          return false;
        }
        if (data.enTitle.length === 0) {
          alert(Sefaria._("Title must be provided."));
          return false;
        }
        save();
    }
    const save = function () {
        toggleInProgress();
        let url = "";
        let postData = {...data, "description": {"en": data.enDescription, "he": data.heDescription}, "title": data.enTitle,
            "heTitle": data.heTitle};
        if (postData.isTopicCategory) {
            postData = {...postData, "catDescription": {"en": data.enCatDescription, "he": data.heCategoryDescription}};
        }
        postData.category = toolType === "topic" ? data.catSlug : path;  // use `path` when this editing/adding a Category

        if (isNew) {
          url = "/api/topic/new";
        }
        else {
          url = `/api/topics/${data.origSlug}`;
          postData = {...postData, origCategory: data.origCategorySlug, origDescription: data.origDesc,
                    origTitle: data.origEn, origHeTitle: data.origHe, origSlug: data.origSlug};
          if (isTopicCategory) {
            postData.origCatDescription = data.origCategoryDesc;
          }
        }

        const postJSON = JSON.stringify(postData);
        $.post(url,  {"json": postJSON}, function(result) {
          if (result.error) {
            toggleInProgress();
            alert(result.error);
          } else {
            const newSlug = result.slug;
            onCreateSuccess(newSlug);
          }
          }).fail( function(xhr, status, errorThrown) {
            alert("Unfortunately, there may have been an error saving this topic information: "+errorThrown);
          });
    }
    const toggleInProgress = function() {
      setSavingStatus(savingStatus => !savingStatus);
    }
    const deleteTopic = function() {
      $.ajax({
        url: "/api/topic/delete/"+origSlug,
        type: "DELETE",
        success: function(result) {
          if ("error" in result) {
            alert(result.error);
          } else {
            alert(Sefaria._("Topic Deleted."));
            window.location = "/topics";
          }
        }
      }).fail(function() {
        alert(Sefaria._("Something went wrong. Sorry!"));
      });
    }


    const setValues = function(e) {
        if (e.target.id === "topicTitle") {
            data.enTitle = e.target.value;
        }
        else if (e.target.id === "topicDesc") {
            data.enDescription = e.target.value;
        }
        else if (e.target.id === "topicCatDesc") {
            data.enCatDescription = e.target.value;
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
        setData(data);
    }
    return <div className="editTextInfo">
            <div className="static">
                <div className="inner">
                    {savingStatus ?
                        <div className="collectionsWidget">{Sefaria._("Saving topic information.")}
                        <br/><br/>{Sefaria._("Processing title changes may take some time.")})</div> : null}
                    <div id="newIndex">
                        <AdminToolHeader title="Topic Editor" close={close} validate={validate}/>
                        <div className="section">
                            <label><InterfaceText>English Topic Title</InterfaceText></label>
                            <input id="topicTitle" onBlur={setValues} defaultValue={data.enTitle} placeholder={Sefaria._("Add a title.")}/>
                        </div>
                        {Sefaria._siteSettings.TORAH_SPECIFIC ?
                            <div className="section">
                                <label><InterfaceText>Hebrew Topic Title</InterfaceText></label>
                                <input id="topicHeTitle" onBlur={setValues} defaultValue={data.heTitle} placeholder={Sefaria._("Add a title.")}/>
                            </div> : null}
                        {catMenu}
                        <div className="section">
                            <label><InterfaceText>English Topic Description</InterfaceText></label>
                            <textarea id="topicDesc" onBlur={setValues}
                                   defaultValue={data.enDescription} placeholder={Sefaria._("Add a description.")}/>
                        </div>
                        {Sefaria._siteSettings.TORAH_SPECIFIC ?
                            <div className="section">
                                <label><InterfaceText>Hebrew Topic Description</InterfaceText></label>
                                <textarea id="topicHeDesc" onBlur={setValues}
                                       defaultValue={data.heDescription} placeholder={Sefaria._("Add a description.")}/>
                            </div> : null}
                       {isTopicCategory ?  <div> <div className="section">
                                                     <label><InterfaceText>English Short Description for Topic Table of Contents</InterfaceText></label>
                                                     <textarea
                                                         id="topicCatDesc"
                                                         onBlur={setValues}
                                                         defaultValue={data.enCatDescription}
                                                         placeholder={Sefaria._("Add a short description.")}/>
                                            </div>
                                            {Sefaria._siteSettings.TORAH_SPECIFIC ? <div className="section">
                                                    <label><InterfaceText>Hebrew Short Description for Topic Table of Contents</InterfaceText></label>
                                                    <textarea
                                                        id="topicHeCatDesc"
                                                        onBlur={setValues}
                                                        defaultValue={data.heCategoryDescription}
                                                        placeholder={Sefaria._("Add a short description.")}/>
                                            </div> : null}
                                      </div> :
                       null}
                      {!isNew ? <div onClick={deleteTopic} id="deleteTopic" className="button small deleteTopic" tabIndex="0" role="button">
                                      <InterfaceText>Delete Topic</InterfaceText>
                                    </div> : null}
                    </div>
                </div>
            </div>
     </div>
}

export {AdminEditor, AdminEditorButton, useEditToggle};