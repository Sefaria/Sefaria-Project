import {CategoryChooser, InterfaceText, ToggleSet} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminEditor} from "./AdminEditor";
import {requestWithCallBack, AdminToolHeader} from "./Misc";
import React, {useState, useRef} from "react";

const displayOptionForSources = (child) => {
    if (Sefaria.interfaceLang === 'english') {
        return child?.descriptions?.en ? `${child?.descriptions?.en?.title} - ${child.ref}` : child.ref;
    } else {
        const refInCache = Sefaria.getRefFromCache(child.ref);
        const displayRef = refInCache ? refInCache.heRef : child.ref;
        return child?.descriptions?.he ? `${child?.descriptions?.he?.title} - ${displayRef}` : displayRef;
    }
}
const displayOptions = {
    "cats": (child) => child.title || child.category,
    "topics": (child) => child.en,
    "sources": (child) => displayOptionForSources(child)
};
const Reorder = ({subcategoriesAndBooks, updateOrder, displayType, updateParentChangedStatus = null}) => {
    const clickHandler = (dir, child) => {
        const index = subcategoriesAndBooks.indexOf(child);
        let index_to_swap = -1;
        if (dir === 'down' && index < subcategoriesAndBooks.length - 1) {
            index_to_swap = index + 1;
        } else if (dir === 'up' && index > 0) {
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
            <div id="title">{displayOptions[displayType](child)}</div>
            <img src="/static/img/arrow-up.png" id="up" onClick={() => clickHandler('up', child)}/>
            <img src="/static/img/arrow-down.png" id="down" onClick={() => clickHandler('down', child)}/>
        </div>;
    })
}

const ReorderEditor = ({close, type = "", postURL = "", redirect = "", origItems = []}) => {
    /*
    Wrapper for Reorder that allows a full-screen view of `origItems` elements to be reordered.
    This is currently used when admin edits the root of the topic TOC or category TOC, as well
    as when an admin reorders sources.
     */
    const [tocItems, setTocItems] = useState(origItems);
    const [savingStatus, setSavingStatus] = useState(false);
    const [isChanged, setIsChanged] = useState(false);
    const update = (newTocItems) => {
        setTocItems(newTocItems);
        setIsChanged(true);
    }
    const validate = () => {
        if (!isChanged) {
            alert(Sefaria._("category.message.no_reordered_categories"))
        } else {
            save();
        }
    }
    const save = () => {
        setSavingStatus(true);
        let postCategoryData = {};
        if (type === "cats") {
            // use displayOptions to map toc objects to titles of category/book
            postCategoryData = {subcategoriesAndBooks: tocItems.map(x => displayOptions["cats"](x)), path: []};
        } else if (type === "topics") {
            postCategoryData = {topics: tocItems};
        } else if (type === 'sources') {
            postCategoryData = {sources: tocItems};
        }
        requestWithCallBack({
            url: postURL,
            data: postCategoryData,
            setSavingStatus,
            redirect: () => window.location.href = redirect
        })
    }
    return <div className="editTextInfo">
        <div className="static">
            <div className="inner">
                {savingStatus ? <div className="collectionsWidget">{Sefaria._("Saving...")}</div> : null}
                <div id="newIndex">
                    <AdminToolHeader title={"Reorder Editor"} close={close} validate={() => validate()}/>
                    <Reorder subcategoriesAndBooks={tocItems} updateOrder={update} displayType={type}/>
                </div>
            </div>
        </div>
    </div>
}

const CategoryEditor = ({origData = {}, close, origPath = []}) => {
    const [path, setPath] = useState(origPath);
    const [data, setData] = useState({
        enTitle: origData.origEn,
        heTitle: origData.origHe || "", heDescription: origData?.origDesc?.he || "",
        enDescription: origData?.origDesc?.en || "",
        enCategoryDescription: origData?.origCategoryDesc?.en,
        heCategoryDescription: origData?.origCategoryDesc?.he
    });
    const [isNew, setIsNew] = useState(origData?.origEn === "");
    const [changed, setChanged] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [isPrimary, setIsPrimary] = useState(origData.isPrimary ? 'true' : 'false');
    const origSubcategoriesAndBooks = useRef((Sefaria.tocItemsByCategories([...origPath, origData.origEn]) || []));
    const [subcategoriesAndBooks, setSubcategoriesAndBooks] = useState([...origSubcategoriesAndBooks.current]);

    const handlePrimaryClick = function (type, status) {
        setIsPrimary(status);
        setChanged(true);
    }

    const populateCatMenu = (update) => (
        <div className="section">
            <label><InterfaceText>{Sefaria._("category.parent_category")} </InterfaceText></label>
            <CategoryChooser categories={path} update={update}/>
        </div>
    )

    const updateCatMenu = function (newPath) {
        if (newPath !== path && !changed) {
            setChanged(true);
        }
        setPath(newPath);
    }

    let catMenu = populateCatMenu(updateCatMenu);

    const updateData = function (newData) {
        setChanged(true);
        setData(newData);
    }

    const validate = async function () {
        if (!changed) {
            alert(Sefaria._("message.change_field_before_saving"));
            return false;
        }

        if (data.enTitle.length === 0) {
            alert(Sefaria._("topic.admin.title_must_be_provided"));
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

        if (!Sefaria._siteSettings.TORAH_SPECIFIC) {
            postCategoryData["heSharedTitle"] = data.enTitle.slice(0, -1);  // there needs to be a hebrew title for the category's term
        }

        let url = `/api/category/${fullPath.join("/")}`;
        let urlParams = []
        if (!isNew) {
            urlParams.push("update=1");
            postCategoryData = {...postCategoryData, origPath: origFullPath};
        }
        const origSubcategoryTitles = origSubcategoriesAndBooks.current.map(displayOptions["cats"]);
        const newSubcategoryTitles = subcategoriesAndBooks.map(displayOptions["cats"]);
        const reordered = origSubcategoryTitles.some((val, index) => val !== newSubcategoryTitles[index]);
        if (reordered && !isNew) {  // only reorder children when category isn't new
            postCategoryData["subcategoriesAndBooks"] = newSubcategoryTitles;
            urlParams.push("reorder=1");
        }
        if (urlParams.length > 0) {
            url += `?${urlParams.join('&')}`;
        }
        requestWithCallBack({
            url,
            data: postCategoryData,
            setSavingStatus,
            redirect: () => window.location.href = "/texts/" + fullPath
        });
    }


    const deleteObj = function () {
        if (subcategoriesAndBooks.length > 0) {
            alert(Sefaria._("category.message.cannot_delete_content"));
            return;
        }
        const url = `/api/category/${origPath.concat(origData.origEn).join("/")}`;
        requestWithCallBack({url, type: "DELETE", redirect: () => window.location.href = `/texts`});
    }
    const primaryOptions = [
        {name: "true", content: Sefaria._("True"), role: "radio", ariaLabel: Sefaria._("Set Primary Status to True")},
        {
            name: "false",
            content: Sefaria._("false"),
            role: "radio",
            ariaLabel: Sefaria._("Set Primary Status to False")
        },
    ];
    const items = ["Title", "Hebrew Title", "English Description", "Hebrew Description",
        "Category Menu", "English Short Description", "Hebrew Short Description"];
    return <div>
        <AdminEditor title={Sefaria._("category.admin.editor")} close={close} catMenu={catMenu} data={data} savingStatus={savingStatus}
                     validate={validate} deleteObj={deleteObj} updateData={updateData} isNew={isNew} items={items}
                     path={path}
                     extras={
                         [isNew ? null :
                             <Reorder subcategoriesAndBooks={subcategoriesAndBooks}
                                      updateParentChangedStatus={setChanged}
                                      updateOrder={setSubcategoriesAndBooks} displayType="cats"/>,
                             <div className="section">
                                 <br/>
                                 <label>
                                     <InterfaceText>category.admin.editor</InterfaceText>
                                 </label>
                                 <ToggleSet
                                     blueStyle={true}
                                     ariaLabel="category.admin.editor"
                                     label=""
                                     name="primary"
                                     separated={false}
                                     options={primaryOptions}
                                     setOption={handlePrimaryClick}
                                     currentValue={isPrimary}/>
                             </div>,
                         ]
                     }/>

    </div>;
}

export {CategoryEditor, ReorderEditor, Reorder};