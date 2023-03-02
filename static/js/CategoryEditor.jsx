import {CategoryChooser, InterfaceText, ToggleSet} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminEditor} from "./AdminEditor";
import {postWithCallBack, AdminToolHeader} from "./Misc";
import React, {useState, useRef} from "react";

const Reorder = ({subcategoriesAndBooks, updateOrder, updateParentChangedStatus=null}) => {
    const clickHandler = (dir, child) => {
        const index = subcategoriesAndBooks.indexOf(child);
        let index_to_swap = -1;
        if (dir === 'down' && index < subcategoriesAndBooks.length)
        {
            index_to_swap = index + 1;
        }
        else if (dir === 'up' && index > 0)
        {
            index_to_swap = index - 1;
        }
        if (index_to_swap >= 0) {
            let temp = subcategoriesAndBooks[index_to_swap];
            subcategoriesAndBooks[index_to_swap] = subcategoriesAndBooks[index];
            subcategoriesAndBooks[index] = temp;
            updateOrder([...subcategoriesAndBooks]);
            if (updateParentChangedStatus) {
                updateParentChangedStatus(true);
            }
        }
    }

    return subcategoriesAndBooks.map((child, i) => {
                return <div id={`reorder-${i}`} className="reorderTool">
                            <div id="title">{child}</div>
                            <img src="/static/img/arrow-up.png" id="up" onClick={() => clickHandler('up', child)}/>
                            <img src="/static/img/arrow-down.png" id="down" onClick={() => clickHandler('down', child)}/>
                      </div>;
            })
}

const ReorderEditor = ({close, path=[], type=""}) => {
    const determineOrigItems = () => {
        if (type === "books")
        {
            if (path.length === 0) {
                return Sefaria.toc.map(child => child.category);
            }
            else {
                 return Sefaria.tocItemsByCategories(path).map(child => child.title || child.category);
            }
        }
        else if (type === "topics") {
            if (path.length === 0) {
                return Sefaria.topic_toc.map(child => child.en);
            }
            else {
                return Sefaria.topicTocPage(path).map(child => child.en);
            }
        }
    }
    const [tocItems, setTocItems] = useState(determineOrigItems());
    const [savingStatus, setSavingStatus] = useState(false);
    const [isChanged, setIsChanged] = useState(false);
    const update = (newTocItems) => {
        setTocItems(newTocItems);
        setIsChanged(true);
    }
    const validate = () => {
        if (!isChanged) {
            alert("You haven't reordered the categories.")
        }
        else {
            save();
        }
    }
    const save = () => {
        let postCategoryData = {};
        let url = "";
        if (type !== "topics") {
            postCategoryData = {subcategoriesAndBooks: tocItems, path};
            url = `/api/category?reorder=1`;
            postWithCallBack({url, data: postCategoryData, setSavingStatus, redirect: () => window.location.href = "/texts/"+path.join("/")});
        }
        else {
             url = `api/topic/reorder`;
             postCategoryData = {topics: tocItems};
             postWithCallBack({url, data: postCategoryData, setSavingStatus, redirect: () => window.location.href = "/topics"});
        }
    }
    return <div className="editTextInfo">
            <div className="static">
                <div className="inner">
                    {savingStatus ?  <div className="collectionsWidget">{Sefaria._("Saving...")}</div> : null}
                    <div id="newIndex">
                        <AdminToolHeader title={"Reorder Editor"} close={close} validate={() => validate()}/>
                        <Reorder subcategoriesAndBooks={tocItems} updateOrder={update}/>
                    </div>
                </div>
            </div>
    </div>
}

const CategoryEditor = ({origData={}, close, origPath=[]}) => {
    const [path, setPath] = useState(origPath);
    const [data, setData] = useState({enTitle: origData.origEn,
                                heTitle: origData.origHe || "", heDescription: origData?.origDesc?.he || "",
                                enDescription: origData?.origDesc?.en || "",
                                enCategoryDescription: origData?.origCategoryDesc?.en,
                                heCategoryDescription: origData?.origCategoryDesc?.he});
    const [isNew, setIsNew] = useState(origData?.origEn === "");
    const [changed, setChanged] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [isPrimary, setIsPrimary] = useState(origData.isPrimary ? 'true' : 'false');
    const origSubcategoriesAndBooks = useRef((Sefaria.tocItemsByCategories([...origPath, origData.origEn]) || []).map(child => child.title || child.category));
    const [subcategoriesAndBooks, setSubcategoriesAndBooks] = useState(origSubcategoriesAndBooks.current);

    const handlePrimaryClick = function(type, status) {
        setIsPrimary(status);
        setChanged(true);
    }

    const populateCatMenu = (update) => (
        <div className="section">
            <label><InterfaceText>Parent Category</InterfaceText></label>
            <CategoryChooser categories={path} update={update}/>
        </div>
    )

    const updateCatMenu = function(newPath) {
        if (newPath !== path && !changed) {
            setChanged(true);
        }
        setPath(newPath);
    }

    let catMenu = populateCatMenu(updateCatMenu);

    const updateData = function(newData) {
        setChanged(true);
        setData(newData);
    }

    const validate = async function () {
        if (!changed) {
            alert("Please change one of the fields before saving.");
            return false;
        }

        if (data.enTitle.length === 0) {
          alert(Sefaria._("Title must be provided."));
          return false;
        }
        await save();
    }

    const save = async function () {
        setSavingStatus(true);
        const fullPath = [...path, data.enTitle];
        const origFullPath = [...origPath, origData.origEn];
        let postCategoryData = {
            "isPrimary": isPrimary === 'true',
            "enDesc": data.enDescription,
            "heDesc": data.heDescription,
            "enShortDesc": data.enCategoryDescription,
            "heShortDesc": data.heCategoryDescription,
            "heSharedTitle": data.heTitle,
            "sharedTitle": data.enTitle,
            "path": fullPath
        };

        if (Sefaria._siteSettings.SITE_NAME["en"] === "ContextUS") {
            postCategoryData["heSharedTitle"] = data.enTitle.slice(0, -1);  // there needs to be a hebrew title for the category's term
        }

        let url = `/api/category/${fullPath.join("/")}`;
        let urlParams = []
        if (!isNew) {
            urlParams.push("update=1");
            postCategoryData = {...postCategoryData, origPath: origFullPath}
        }
        if (origSubcategoriesAndBooks.current !== subcategoriesAndBooks && !isNew) {  // only reorder children when category isn't new
            postCategoryData["subcategoriesAndBooks"] = subcategoriesAndBooks;
            urlParams.push("reorder=1");
        }
        if (urlParams.length > 0) {
            url += `?${urlParams.join('&')}`;
        }
        postWithCallBack({url, data: postCategoryData, setSavingStatus, redirect: () => window.location.href = "/texts/"+fullPath});
    }


    const deleteObj = function() {
      if (subcategoriesAndBooks.length > 0) {
          alert("Cannot delete a category with contents.");
          return;
      }
      $.ajax({
        url: "/api/category/"+origPath.concat(origData.origEn).join("/"),
        type: "DELETE",
        success: function(result) {
          if ("error" in result) {
            alert(result.error);
          } else {
            alert(Sefaria._("Category Deleted."));
            window.location = "/texts";
          }
        }
      }).fail(function() {
        alert(Sefaria._("Something went wrong. Sorry!"));
      });
    }
    const primaryOptions = [
                          {name: "true",   content: Sefaria._("True"), role: "radio", ariaLabel: Sefaria._("Set Primary Status to True") },
                          {name: "false", content: Sefaria._("False"), role: "radio", ariaLabel: Sefaria._("Set Primary Status to False") },
                        ];
    return <div>
        <AdminEditor title="Category Editor" close={close} catMenu={catMenu} data={data} savingStatus={savingStatus}
                validate={validate} deleteObj={deleteObj} updateData={updateData} isNew={isNew} shortDescBool={true} path={path}
                extras={
                    [isNew ? null :
                        <Reorder subcategoriesAndBooks={subcategoriesAndBooks} updateParentChangedStatus={setChanged} updateOrder={setSubcategoriesAndBooks}/>,
                        <ToggleSet
                          blueStyle={true}
                          ariaLabel="Primary Status (If true, this category will display its contents on its own category page.)"
                          label={Sefaria._("Primary Status (If true, this category will display its contents on its own category page.)")}
                          name="primary"
                          separated={false}
                          options={primaryOptions}
                          setOption={handlePrimaryClick}
                          currentValue={isPrimary} />,
                    ]
                }/>

    </div>;
}

export {CategoryEditor, ReorderEditor};