import Sefaria from "./sefaria/sefaria";
import {InterfaceText} from "./Misc";
import $ from "./sefaria/sefariaJquery";
import {AdminEditor} from "./AdminEditor";
import React, {useState} from "react";


const TopicEditor = ({origData, onCreateSuccess, close, origWasCat}) => {
    const [data, setData] = useState({...origData, catSlug: origData.origCategorySlug, enTitle: origData.origEn,
                                heTitle: origData.origHe, heDescription: origData?.origDesc?.he,
                                enDescription: origData?.origDesc?.en,
                                enCategoryDescription: origData?.origCategoryDesc?.en,
                                heCategoryDescription: origData?.origCategoryDesc?.he,
                                });
    const [isNew, setIsNew] = useState(origData?.origEn === "");
    const [savingStatus, setSavingStatus] = useState(false);
   const [isCategory, setIsCategory] = useState(origWasCat);  // initialize to True if the topic originally was a category
                                                               // isCategory determines whether user can edit categoryDescriptions of topic
    const toggle = function() {
      setSavingStatus(savingStatus => !savingStatus);
    }


    const handleCatChange = function(e) {
      data.catSlug = e.target.value;
      //logic is: if it starts out with origCategoryDesc, isCategory should always be true, otherwise, it should depend solely on 'Main Menu'
      const newisCategory = origCategoryDescBool || e.target.value === Sefaria._("Main Menu");
      setIsCategory(newisCategory);
      setData(data);
    }

    let slugsToTitles = Sefaria.slugsToTitles();
    let specialCases = {
        "": {"en": "Choose a Category", "he": Sefaria.translation('he', "Choose a Category")},
        "Main Menu": {"en": "Main Menu", "he": Sefaria.translation('he', "Main Menu")}
    };
    slugsToTitles = Object.assign(specialCases, slugsToTitles);
    const [catMenu, setCatMenu] =   useState(<div className="section">
                                            <label><InterfaceText>Category</InterfaceText></label>
                                            <div id="categoryChooserMenu">
                                                <select key="topicCats" id="topicCats" onChange={handleCatChange}>
                                                    {Object.keys(slugsToTitles).map(function (tempSlug, i) {
                                                        const tempTitle = Sefaria.interfaceLang === 'english' ? slugsToTitles[tempSlug].en : slugsToTitles[tempSlug].he;
                                                        return <option key={i} value={tempSlug} selected={data.catSlug === tempSlug}>{tempTitle}</option>;
                                                    })}
                                                </select>
                                            </div>
                                    </div>);

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
        toggle();
        let url = "";
        let postData = {...data, "description": {"en": data.enDescription, "he": data.heDescription}, "title": data.enTitle,
            "heTitle": data.heTitle};
        if (postData.isCategory) {
            postData = {...postData, "catDescription": {"en": data.enCatDescription, "he": data.heCategoryDescription}};
        }
        postData.category = data.catSlug;

        if (isNew) {
          url = "/api/topic/new";
        }
        else {
          url = `/api/topics/${data.origSlug}`;
          postData = {...postData, origCategory: data.origCategorySlug, origDescription: data.origDesc,
                    origTitle: data.origEn, origHeTitle: data.origHe, origSlug: data.origSlug};
          if (isCategory) {
            postData.origCatDescription = data.origCategoryDesc;
          }
        }

        const postJSON = JSON.stringify(postData);
        $.post(url,  {"json": postJSON}, function(result) {
          if (result.error) {
            toggle();
            alert(result.error);
          } else {
            const newSlug = result.slug;
            onCreateSuccess(newSlug);
          }
          }).fail( function(xhr, status, errorThrown) {
            alert("Unfortunately, there may have been an error saving this topic information: "+errorThrown.toString());
          });
    }

    const deleteObj = function() {
      $.ajax({
        url: "/api/topic/delete/"+data.origSlug,
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

    return <AdminEditor title="Topic Editor" close={close} catMenu={catMenu} data={data} savingStatus={savingStatus}
                        validate={validate} deleteObj={deleteObj} updateData={setData} isNew={isNew} shortDescBool={isCategory}/>;
}

export {TopicEditor};