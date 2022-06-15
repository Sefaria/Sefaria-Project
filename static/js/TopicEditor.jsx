import React, {useRef, useState} from "react";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminToolHeader, InterfaceText} from "./Misc";

const TopicEditor = ({origEn="", origHe="", origSlug="", origDesc="", origCategoryDesc="", origCategorySlug="", close}) => {
    const [savingStatus, setSavingStatus] = useState(false);
    const [catSlug, setCatSlug] = useState(origCategorySlug);
    const [description, setDescription] = useState(origDesc);
    const [catDescription, setCatDescription] = useState(origCategoryDesc);
    const [enTitle, setEnTitle] = useState(origEn);
    const [heTitle, setHeTitle] = useState(origHe);
    const isNewTopic = useRef(origEn === "");
    const [isCategory, setIsCategory] = useState(catSlug === "Main Menu");

    if (!Sefaria._topicSlugsToTitles) { Sefaria._initTopicSlugsToTitles();}
    let slugsToTitles = {"": "Choose a Category", "Main Menu": "Main Menu"};
    slugsToTitles = Object.assign(slugsToTitles, Sefaria._topicSlugsToTitles);
    let catMenu = Object.keys(slugsToTitles).map(function (tempSlug, i) {
      const tempTitle = slugsToTitles[tempSlug];
      if (catSlug === tempSlug) {
        return <option key={i} value={tempSlug} selected>{tempTitle}</option>;
      } else {
        return <option key={i} value={tempSlug}>{tempTitle}</option>;
      }
    });

    const validate = async function () {
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
        let data = {"description": description, "title": enTitle, "category": catSlug};
        if (isNewTopic.current) {
          url = "/api/topic/new";
          if (isCategory) {
            data["catDescription"] = catDescription;
          }
        }
        else {
          url = `/api/topics/${origSlug}`;
          data["origCategory"] = origCategorySlug;
          data["origDescription"] = origDesc;
          data["origTitle"] = origEn;
          data["origSlug"] = origSlug;
          if (isCategory) {
            data["catDescription"] = catDescription;
            data["origCatDescription"] = origCategoryDesc;
          }
        }

        const postJSON = JSON.stringify(data);
        $.post(url,  {"json": postJSON}, function(data) {
          if (data.error) {
            toggleInProgress();
            alert(data.error);
          } else {
            alert("Text information saved.");
            const newSlug = data["slug"];
            $.get("/admin/reset/toc", function(data) {
                if (data.error) {
                    alert(data.error);
                } else {
                    window.location.href = "/topics/" + newSlug;
                }
            }).fail(function(xhr, status, errorThrown) {
                alert("Please reset TOC manually: "+errorThrown);
              });
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
      setIsCategory(e.target.value === "Main Menu");
    }
    return <div className="editTextInfo">
            <div className="static">
                <div className="inner">
                    {savingStatus ?
                        <div className="collectionsWidget">Saving topic information...<br/><br/>(processing title changes
                            may take some time)</div> : null}
                    <div id="newIndex">
                        <AdminToolHeader en="Topic Editor" he="Topic Editor" close={close} validate={validate}/>
                        <div className="section">
                            <label><InterfaceText>Topic Title</InterfaceText></label>
                            <input id="topicTitle" onBlur={(e) => setEnTitle(e.target.value)} defaultValue={enTitle} placeholder="Add a title."/>
                        </div>
                        <div className="section">
                          <label><InterfaceText>Category</InterfaceText></label>
                          <div id="categoryChooserMenu">
                              <select key="topicCats" id="topicCats" onChange={handleCatChange}>
                                {catMenu}
                              </select>
                          </div>
                        </div>
                        <div className="section">
                            <label><InterfaceText>Topic Description</InterfaceText></label>
                            <textarea id="topicDesc" onBlur={(e) => setDescription(e.target.value)}
                                   defaultValue={description} placeholder="Add a description."/>
                        </div>
                       {isCategory ? <div className="section">
                                      <label><InterfaceText>Short Description for Topic Table of Contents</InterfaceText></label>
                                      <textarea id="topicDesc" onBlur={(e) => setCatDescription(e.target.value)}
                                             defaultValue={catDescription} placeholder="Add a short description."/>
                                  </div> : null}
                      {!isNewTopic.current ? <div onClick={deleteTopic} id="deleteTopic" className="button small deleteTopic" tabIndex="0" role="button">
                                      <InterfaceText>Delete Topic</InterfaceText>
                                    </div> : null}
                    </div>
                </div>
            </div>
     </div>
}

export default TopicEditor;