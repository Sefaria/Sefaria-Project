import React, {useRef, useState} from "react";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminToolHeader, InterfaceText} from "./Misc";

const TopicEditorButton = ({toggleAddingTopics, text}) => {
    return <div onClick={toggleAddingTopics} id="editTopic" className="button extraSmall topic" role="button">
        <InterfaceText>{text}</InterfaceText>
    </div>;
}

function useTopicToggle() {
  const [addingTopics, setAddingTopics] = useState(false);
  const toggleAddingTopics = function(e) {
      if (e.currentTarget.id === "editTopic") {
        setAddingTopics(true);
      }
      else if(e.currentTarget.id === "cancel") {
        setAddingTopics(false);
     }
  }
  return [addingTopics, toggleAddingTopics];
}

const TopicEditor = ({origEn="", origHe="", origSlug="", origDesc={},
                      origCategoryDesc={}, origCategorySlug="",
                      onCreateSuccess, close}) => {
    const [savingStatus, setSavingStatus] = useState(false);
    const [catSlug, setCatSlug] = useState(origCategorySlug);
    const [description, setDescription] = useState(origDesc?.en);
    const [catDescription, setCatDescription] = useState(origCategoryDesc?.en);
    const [enTitle, setEnTitle] = useState(origEn);
    const [heTitle, setHeTitle] = useState(origHe);
    const [heDescription, setHeDescription] = useState(origDesc?.he);
    const [heCategoryDescription, setHeCategoryDescription] = useState(origCategoryDesc?.he);
    const isNewTopic = origSlug === "";
    const [isCategory, setIsCategory] = useState(!!origCategoryDesc);

    const slugsToTitles = Sefaria.slugsToTitles();
    let catMenu = Object.keys(slugsToTitles).map(function (tempSlug, i) {
      const tempTitle = slugsToTitles[tempSlug];
      return <option key={i} value={tempSlug} selected={catSlug === tempSlug}>{tempTitle}</option>;
    });

    const validate = function () {
        if (catSlug === "") {
          alert("Please choose a category.");
          return false;
        }
        if (enTitle.length === 0) {
          alert("Title must be provided.");
          return false;
        }
        save();
    }
    const save = function () {
        toggleInProgress();
        let url = "";
        let data = {"description": {"en": description, "he": heDescription}, "title": enTitle, "heTitle": heTitle, "category": catSlug};
        if (isCategory) {
            data["catDescription"] = {"en": catDescription, "he": heCategoryDescription};
        }

        if (isNewTopic) {
          url = "/api/topic/new";
        }
        else {
          url = `/api/topics/${origSlug}`;
          data = {...data, origCategory: origCategorySlug, origDescription: origDesc,
                    origTitle: origEn,origHeTitle: origHe,origSlug: origSlug}
          if (isCategory) {
            data["origCatDescription"] = origCategoryDesc;
          }
        }

        const postJSON = JSON.stringify(data);
        $.post(url,  {"json": postJSON}, function(data) {
          if (data.error) {
            toggleInProgress();
            alert(data.error);
          } else {
            const newSlug = data["slug"];
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
        success: function(data) {
          if ("error" in data) {
            alert(data.error);
          } else {
            alert("Topic Deleted.");
            window.location = "/topics";
          }
        }
      }).fail(function() {
        alert("Something went wrong. Sorry!");
      });
    }
    const handleCatChange = function(e) {
      setCatSlug(e.target.value);
      const newIsCategory = isCategory || e.target.value === "Main Menu";
      setIsCategory(newIsCategory);
    }
    const setValues = function(e) {
        if (e.target.id === "topicTitle") {
            setEnTitle(e.target.value);
        }
        else if (e.target.id === "topicDesc") {
            setDescription(e.target.value);
        }
        else if (e.target.id === "topicCatDesc") {
            setCatDescription(e.target.value);
        }
        else if (e.target.id === "topicHeTitle") {
            setHeTitle(e.target.value);
        }
        else if (e.target.id === "topicHeDesc") {
            setHeDescription(e.target.value);
        }
        else if (e.target.id === "topicHeCatDesc") {
            setHeCategoryDescription(e.target.value);
        }
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
                            <input id="topicTitle" onBlur={setValues} defaultValue={enTitle} placeholder={Sefaria._("Add a title.")}/>
                        </div>
                        {Sefaria._siteSettings.TORAH_SPECIFIC ?
                            <div className="section">
                                <label><InterfaceText>Hebrew Topic Title</InterfaceText></label>
                                <input id="topicHeTitle" onBlur={setValues} defaultValue={heTitle} placeholder={Sefaria._("Add a title.")}/>
                            </div> : null}
                        <div className="section">
                          <label><InterfaceText>Category</InterfaceText></label>
                          <div id="categoryChooserMenu">
                              <select key="topicCats" id="topicCats" onChange={handleCatChange}>
                                {catMenu}
                              </select>
                          </div>
                        </div>
                        <div className="section">
                            <label><InterfaceText>English Topic Description</InterfaceText></label>
                            <textarea id="topicDesc" onBlur={setValues}
                                   defaultValue={description} placeholder={Sefaria._("Add a description.")}/>
                        </div>
                        {Sefaria._siteSettings.TORAH_SPECIFIC ?
                            <div className="section">
                                <label><InterfaceText>Hebrew Topic Description</InterfaceText></label>
                                <textarea id="topicHeDesc" onBlur={setValues}
                                       defaultValue={heDescription} placeholder={Sefaria._("Add a description.")}/>
                            </div> : null}
                       {isCategory ?  <div> <div className="section">
                                                     <label><InterfaceText>English Short Description for Topic Table of Contents</InterfaceText></label>
                                                     <textarea
                                                         id="topicCatDesc"
                                                         onBlur={setValues}
                                                         defaultValue={catDescription}
                                                         placeholder={Sefaria._("Add a short description.")}/>
                                            </div>
                                            {Sefaria._siteSettings.TORAH_SPECIFIC ? <div className="section">
                                                    <label><InterfaceText>Hebrew Short Description for Topic Table of Contents</InterfaceText></label>
                                                    <textarea
                                                        id="topicHeCatDesc"
                                                        onBlur={setValues}
                                                        defaultValue={heCategoryDescription}
                                                        placeholder={Sefaria._("Add a short description.")}/>
                                            </div> : null}
                                      </div> :
                       null}
                      {!isNewTopic ? <div onClick={deleteTopic} id="deleteTopic" className="button small deleteTopic" tabIndex="0" role="button">
                                      <InterfaceText>Delete Topic</InterfaceText>
                                    </div> : null}
                    </div>
                </div>
            </div>
     </div>
}

export {TopicEditor, TopicEditorButton, useTopicToggle};