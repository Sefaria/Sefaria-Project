import Sefaria from "./sefaria/sefaria";
import {InterfaceText, requestWithCallBack, TitleVariants, ToggleSet} from "./Misc";
import $ from "./sefaria/sefariaJquery";
import {AdminEditor} from "./AdminEditor";
import {Reorder} from "./CategoryEditor";
import React, {useState, useEffect} from "react";


const TopicEditor = ({origData, onCreateSuccess, close, origWasCat}) => {
    const [data, setData] = useState({...origData, catSlug: origData.origCategorySlug || "",
                                enTitle: origData.origEn, heTitle: origData.origHe || "", heDescription: origData?.origDesc?.he || "",
                                enDescription: origData?.origDesc?.en || "",
                                enCategoryDescription: origData?.origCategoryDesc?.en,
                                heCategoryDescription: origData?.origCategoryDesc?.he,
                                enAltTitles: origData?.origEnAltTitles || [],
                                heAltTitles: origData?.origHeAltTitles || [],
                                birthPlace: origData.origBirthPlace || "", heBirthPlace: origData.origHeBirthPlace || "",
                                birthYear: origData.origBirthYear || "", heDeathPlace: origData.origHeDeathPlace || "",
                                deathYear: origData.origDeathYear || "", era: origData.origEra || "",
                                deathPlace: origData.origDeathPlace || ""
                                });
    const isNew = !('origSlug' in origData);
    const [savingStatus, setSavingStatus] = useState(false);
    const [isAuthor, setIsAuthor] = useState(origData.origCategorySlug === 'authors');
    const [isCategory, setIsCategory] = useState(origWasCat);  // initialize to True if the topic originally was a category
                                                                  // isCategory determines whether user can edit categoryDescriptions of topic
    const subtopics = Sefaria.topicTocPage(origData.origSlug);
    const [sortedSubtopics, setSortedSubtopics] = useState(subtopics?.sort(Sefaria.sortTopicsCompareFn)
                                                                                .filter(x => x.slug !== origData.origSlug) // dont include topics that are self-linked
                                                                                || []);
    const [isChanged, setIsChanged] = useState(false);
    useEffect(() => {
      console.log('Y has changed', data.enAltTitles);
    }, [data.enAltTitles]);

    const toggle = function() {
      setSavingStatus(savingStatus => !savingStatus);
    }


    const handleCatChange = function(e) {
      data.catSlug = e.target.value;
      //logic is: if it starts out originally a category, isCategory should always be true, otherwise, it should depend solely on 'Main Menu'
      const newIsCategory = origWasCat || e.target.value === Sefaria._("Main Menu");
      setIsCategory(newIsCategory);
      setIsAuthor(data.catSlug === 'authors');
      setData({...data});
    }

    let slugsToTitles = Sefaria.slugsToTitles();
    let specialCases = {
        "": {"en": "Choose a Parent Topic", "he": Sefaria.translation('he', "Choose a Parent Topic")},
        "Main Menu": {"en": "Main Menu", "he": Sefaria.translation('he', "Main Menu")}
    };
    slugsToTitles = Object.assign(specialCases, slugsToTitles);
    const [catMenu, setCatMenu] =   useState(<div className="section">
                                            <label><InterfaceText>Parent Topic</InterfaceText></label>
                                            <div className="categoryChooserMenu">
                                                <select key="topicCats" id="topicCats" onChange={handleCatChange}>
                                                    {Object.keys(slugsToTitles).map(function (tempSlug, i) {
                                                        const tempTitle = Sefaria.interfaceLang === 'english' ? slugsToTitles[tempSlug].en : slugsToTitles[tempSlug].he;
                                                        return <option key={i} value={tempSlug} selected={data.catSlug === tempSlug}>{tempTitle}</option>;
                                                    })}
                                                </select>
                                            </div>
                                    </div>);

    const updateData = function(newData) {
        setIsChanged(true);
        setData(newData);
    }
    const validate = async function () {
        if (!isChanged) {
            alert("You haven't changed any of the fields.");
            return false;
        }
        if (data.catSlug === "") {
          alert(Sefaria._("Please choose a category."));
          return false;
        }
        if (data.enTitle.length === 0) {
          alert(Sefaria._("Title must be provided."));
          return false;
        }
        if (data?.era && Sefaria.util.inArray(data.era, Sefaria._eras) === -1) {
            alert(`Era ${data.era} is invalid.`);
            return false;
        }
        if (sortedSubtopics.length > 0 && !isNew) {
            await saveReorderedSubtopics();  // make sure subtopics reordered before saving topic information below
        }
        saveTopic();
    }
    const saveReorderedSubtopics = function () {
         const url = `/api/topic/reorder`;
         const postCategoryData = {topics: sortedSubtopics};
         requestWithCallBack({url, data: postCategoryData, setSavingStatus, redirect: () => window.location.href = "/topics"});
    }
    const authorItems = (type) => {
        switch(type) {
            case 'labels':
                return Sefaria._siteSettings.TORAH_SPECIFIC ?
                            ["Birth Place", "Hebrew Birth Place", "Birth Year", "Place of Death", "Hebrew Place of Death", "Death Year", "Era"]
                            :  ["Birth Place", "Birth Year", "Place of Death", "Death Year"];
            case 'keys':
                return Sefaria._siteSettings.TORAH_SPECIFIC ?
                            ["birthPlace", "heBirthPlace", "birthYear", "deathPlace", "heDeathPlace", "era"]
                            : ["birthPlace", "birthYear", "deathPlace", "deathYear"];
        }
    }
    const prepData = () => {
        let postData = {...data, "description": {"en": data.enDescription, "he": data.heDescription}, "title": data.enTitle,
            "heTitle": data.heTitle};
        if (isCategory) {
            postData = {...postData, "catDescription": {"en": data.enCategoryDescription, "he": data.heCategoryDescription}};
        }
        postData.altTitles = {};
        postData.altTitles.en = postData.enAltTitles.map(x => x.name);
        postData.altTitles.he = postData.heAltTitles.map(x => x.name);
        postData.category = data.catSlug;
        let url = "";
        if (isNew) {
          url = "/api/topic/new";
        }
        else {
          url = `/api/topics/${data.origSlug}`;
          postData = {...postData, origCategory: data.origCategorySlug, origDescription: data.origDesc,
                    origSlug: data.origSlug};
          if (isCategory) {
            postData.origCatDescription = data.origCategoryDesc;
          }
        }

        return [postData, url];
    }

    const saveTopic = function () {
        toggle();
        const [postData, url] = prepData();
        if (onCreateSuccess) {  // used by TopicSearch.jsx
            const postJSON = JSON.stringify(postData);
            $.post(url, {"json": postJSON}, function (result) {
                if (result.error) {
                    toggle();
                    alert(result.error);
                } else {
                    const newSlug = result.slug;
                    onCreateSuccess(newSlug);
                }
            }).fail(function (xhr, status, errorThrown) {
                alert("Unfortunately, there may have been an error saving this topic information: " + errorThrown.toString());
            });
        }
        else {
            requestWithCallBack({
                url,
                data: postData,
                setSavingStatus,
                redirect: () => window.location.href = `/topics/${postData.slug}`
            });
        }
    }

    const deleteObj = function() {
        const url = `/api/topic/delete/${data.origSlug}`;
        requestWithCallBack({url, type: "DELETE", redirect: () => window.location.href = "/topics"});
    }
    // const handleTitleVariants = (newTitles, field) => {
    //     const newData = {...data};
    //     newData[field] = [...newTitles];
    //     updateData(newData);
    // }
    let items = ["Title", "Hebrew Title", "English Alternate Titles", "Hebrew Alternate Titles", "Category Menu", "English Description", "Hebrew Description"];
    if (isCategory) {
        items.push("English Short Description");
        items.push("Hebrew Short Description");
    }
    if (isAuthor) {
        authorItems('labels').forEach(x => items.push(x));
    }
    return <AdminEditor title="Topic Editor" close={close} catMenu={catMenu} data={data} savingStatus={savingStatus}
                        validate={validate} deleteObj={deleteObj} updateData={updateData} isNew={isNew}
                        items={items} extras={
                            [isNew ? null :
                                <Reorder subcategoriesAndBooks={sortedSubtopics}
                                         updateOrder={setSortedSubtopics}
                                         displayType="topics"/>,
                             // <TitleVariants update={(newTitles) => handleTitleVariants(newTitles, field)} titles={titles} id={field}/>
                            ]
                        } />;
}


export {TopicEditor};