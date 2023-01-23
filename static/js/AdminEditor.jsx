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

const TopicEditor = ({origData, onCreateSuccess, close}) => {
    const [origCategoryDescBool, setOrigCategoryDescBool] = useState(Object.keys(origData.origCategoryDesc || {}).length > 0);
    const [isTopicCategory, setIsTopicCategory] = useState(origCategoryDescBool);  // applicable when adding/editing Topic with children
    const [data, setData] = useState({...origData, catSlug: origData?.origCategorySlug, enTitle: origData?.origEn,
                                heTitle: origData?.origHe, heDescription: origData?.origDesc?.he,
                                enDescription: origData?.origDesc?.en,
                                enCategoryDescription: origData?.origCategoryDesc?.en,
                                heCategoryDescription: origData?.origCategoryDesc?.he,
                                });
    const [isNew, setIsNew] = useState(origData?.origEn === "");
    const [savingStatus, setSavingStatus] = useState(false);
    const toggle = function() {
      setSavingStatus(savingStatus => !savingStatus);
    }


    const handleCatChange = function(e) {
      data.catSlug = e.target.value;
      //logic is: if it starts out with origCategoryDesc, isTopicCategory should always be true, otherwise, it should depend solely on 'Main Menu'
      const newIsTopicCategory = origCategoryDescBool || e.target.value === Sefaria._("Main Menu");
      setIsTopicCategory(newIsTopicCategory);
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
        if (postData.isTopicCategory) {
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
          if (isTopicCategory) {
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

    return <AdminEditor title="Topic Editor" close={close} catMenu={catMenu} data={data} savingStatus={savingStatus}
                        validate={validate} deleteObj={deleteObj} updateData={setData} isNew={isNew} shortDescBool={isTopicCategory}/>;
}

const CategoryEditor = ({origData={}, close, origPath=[]}) => {
    const [path, setPath] = useState(origPath);
    const [data, setData] = useState({enTitle: origData?.origEn,
                                heTitle: origData.origHe || "", heDescription: origData?.origDesc?.he,
                                enDescription: origData?.origDesc?.en,
                                enCategoryDescription: origData?.origCategoryDesc?.en,
                                heCategoryDescription: origData?.origCategoryDesc?.he, isPrimary: !!origData.isPrimary});
    const [isNew, setIsNew] = useState(origData?.origEn === "");
    const [changed, setChanged] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [isPrimary, setIsPrimary] = useState(!!origData.isPrimary);


    const handleClick = function(event) {
        const newIsPrimary = event.target.value === 'true';
        setIsPrimary(newIsPrimary);
        setChanged(true);
        setIsPrimaryObj(primaryObj(newIsPrimary));
    }

    const primaryObj = function(newIsPrimary=false) {
        return <form onClick={handleClick}>
            <label><InterfaceText>Primary Status</InterfaceText></label>
            <label htmlFor="true"><InterfaceText>True</InterfaceText></label>
            <input type="radio" value='true' name="bool1" id="bool1" checked={newIsPrimary} />
            <label htmlFor="false"><InterfaceText>False</InterfaceText></label>
            <input type="radio" value='false' name="bool2" id="bool2" checked={!newIsPrimary}/>
        </form>;
    }

    const [isPrimaryObj, setIsPrimaryObj] = useState(() => primaryObj());

    const updateData = function(newData) {
        setChanged(true);
        setData(newData);
    }

    const toggle = function() {
      setSavingStatus(savingStatus => !savingStatus);
    }

    const updateCatMenu = function(newPath) {
        setChanged(true);
        setPath(newPath);
        setCatMenu(<div className="section">
                            <label><InterfaceText>Category</InterfaceText></label>
                            <CategoryChooser categories={newPath} update={updateCatMenu}/>
                    </div>);
    }

    const [catMenu, setCatMenu] = useState(<div className="section">
                                                <label><InterfaceText>Category</InterfaceText></label>
                                                <CategoryChooser categories={path} update={updateCatMenu}/>
                                        </div>);


    const validate = async function () {
        if (!changed) {
            alert("First, change one of the fields before saving.");
            return false;
        }

        if (data.heTitle !== origData.origHe && !!Sefaria.terms[data.enTitle] && data.heTitle.length > 0) { // Category title has corresponding term and there is a hebrew title to check
            await Sefaria.getTerm(data.enTitle);

            //check if data.heTitle is one of the term's primary or secondary titles
            if (Sefaria.terms[data.enTitle].he === data.heTitle || Sefaria.terms[data.enTitle]?.otherTitles.he.filter(x => data.heTitle === x)) {
                alert(Sefaria._(`English and Hebrew titles of category, ${data.enTitle} and ${data.heTitle} do not correspond to a term.  Please use the term editor.`));
                return false;
            }
        }

        if (data.enTitle.length === 0) {
          alert(Sefaria._("Title must be provided."));
          return false;
        }
        await save();
    }

    const postTerm = async function (name) {
        const termTitles = [{'lang': 'en', 'text': name, 'primary': true}, {
                'lang': 'he',
                'text': data.heTitle,
                'primary': true
            }];
        const postTermJSON = JSON.stringify({"name": name, "titles": termTitles});
        let success = false;
        await new Promise((resolve, reject) => {
            $.post(`/api/terms/${name}`, {"json": postTermJSON}, function (result) {
                if (result.error)  {
                    toggle();
                    alert(result.error);
                }
                else {
                    success = true;
                    resolve();
                }
            }).fail(function (xhr, status, errorThrown) {
                alert("Unfortunately, there may have been an error saving this topic information: " + errorThrown.toString());
            });
            })
        return success;
    }

    const redirect = function (newPath) {
        window.location.href = "/texts/"+newPath;
    }

    const save = async function () {
        toggle();
        const termName = data.enTitle;
        if (!Sefaria.terms[termName]) {
            //term doesn't exist so post it, but if postTerm, there was an error so exit function
            const success = await postTerm(termName);

            if (!success) {
                redirect("");
            }
        }

        let fullPath = [...path, data.enTitle];
        let postCategoryData = {
            "isPrimary": isPrimary,
            "sharedTitle": termName,
            "enDesc": data.enDescription,
            "heDesc": data.heDescription,
            "enShortDesc": data.enCatDescription,
            "heShortDesc": data.heCategoryDescription,
            "lastPath": data.enTitle,
            "path": fullPath
        };

        let url = "";
        if (isNew) {
            url = `/api/category/${fullPath.join("/")}`;
        } else {
            url += `/api/category/${[...origPath, data.origEn].join("/")}?update=1`;
            postCategoryData = {...postCategoryData, origEnDesc: data.origEnDesc, origHeDesc: data.origHeDesc,
                origLastPath: origData.origEn, origPath, origEnShortDesc: origData?.origCategoryDesc?.en,
                origHeShortDesc: origData?.origCategoryDesc?.he
            };
        }

        $.post(url, {"json": JSON.stringify(postCategoryData)}, function (result) {
            if (result.error) {
                toggle();
                alert(result.error);
            } else {
                redirect(result.path);
            }
        }).fail(function (xhr, status, errorThrown) {
            alert("Unfortunately, there may have been an error saving this topic information: " + errorThrown.toString());
        });
    }


    const deleteObj = function() {
      $.ajax({
        url: "/api/category/delete/"+origSlug,
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

    return <AdminEditor title="Category Editor" close={close} catMenu={catMenu} data={data} savingStatus={savingStatus}
                validate={validate} deleteObj={deleteObj} updateData={updateData} isNew={isNew} shortDescBool={true} extras={[isPrimaryObj]}/>;
}

const AdminEditor = ({title, data, close, catMenu, updateData, savingStatus,
                         validate, deleteObj, isNew=true, shortDescBool=false, extras=[]}) => {

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
                        {isNew ? null : catMenu}
                        <div className="section">
                            <label><InterfaceText>English Description</InterfaceText></label>
                            <textarea id="topicDesc" onBlur={setValues}
                                   defaultValue={data.enDescription} placeholder={Sefaria._("Add a description.")}/>
                        </div>
                        {Sefaria._siteSettings.TORAH_SPECIFIC ?
                            <div className="section">
                                <label><InterfaceText>Hebrew Description</InterfaceText></label>
                                <textarea id="topicHeDesc" onBlur={setValues}
                                       defaultValue={data.heDescription} placeholder={Sefaria._("Add a description.")}/>
                            </div> : null}
                       {shortDescBool ?  <div> <div className="section">
                                                     <label><InterfaceText>English Short Description for Table of Contents</InterfaceText></label>
                                                     <textarea
                                                         id="topicCatDesc"
                                                         onBlur={setValues}
                                                         defaultValue={data.enCatDescription}
                                                         placeholder={Sefaria._("Add a short description.")}/>
                                            </div>
                                            {Sefaria._siteSettings.TORAH_SPECIFIC ? <div className="section">
                                                    <label><InterfaceText>Hebrew Short Description for Table of Contents</InterfaceText></label>
                                                    <textarea
                                                        id="topicHeCatDesc"
                                                        onBlur={setValues}
                                                        defaultValue={data.heCategoryDescription}
                                                        placeholder={Sefaria._("Add a short description.")}/>
                                            </div> : null}
                                      </div> :
                       null}
                      {!isNew ? <div onClick={deleteObj} id="deleteTopic" className="button small deleteTopic" tabIndex="0" role="button">
                                      <InterfaceText>Delete</InterfaceText>
                                    </div> : null}
                      {extras.length > 0 ? extras : null}
                    </div>
                </div>
            </div>
     </div>
}

export {CategoryEditor, TopicEditor, AdminEditorButton, useEditToggle};