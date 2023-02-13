import {CategoryChooser, InterfaceText, ToggleSet} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminEditor} from "./AdminEditor";
import React, {useState} from "react";


const CategoryEditor = ({origData={}, close, origPath=[]}) => {
    const [path, setPath] = useState(origPath);
    const [data, setData] = useState({enTitle: origData?.origEn,
                                heTitle: origData.origHe || "", heDescription: origData?.origDesc?.he,
                                enDescription: origData?.origDesc?.en,
                                enCategoryDescription: origData?.origCategoryDesc?.en,
                                heCategoryDescription: origData?.origCategoryDesc?.he});
    const [isNew, setIsNew] = useState(origData?.origEn === "");
    const [changed, setChanged] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [isPrimary, setIsPrimary] = useState(origData.isPrimary ? 'true' : 'false');
    const origSubcategoriesAndBooks = Sefaria.tocItemsByCategories([...path, origData.origEn]).map(child => child.title || child.category);
    const [subcategoriesAndBooks, setSubcategoriesAndBooks] = useState(origSubcategoriesAndBooks);
    const reorderClickHandler = (e) => {
        const pos = (100*e.clientX/e.currentTarget.getBoundingClientRect().right);
        const index = subcategoriesAndBooks.indexOf(e.currentTarget.value);
        let index_to_swap = -1;
        if (pos > 96 && index < subcategoriesAndBooks.length) { //click down
            index_to_swap = index + 1;
        }
        else if (pos > 90 && index > 0) { //click up
            index_to_swap = index - 1;
        }
        if (index_to_swap >= 0) {
            let temp = subcategoriesAndBooks[index_to_swap];
            subcategoriesAndBooks[index_to_swap] = subcategoriesAndBooks[index];
            subcategoriesAndBooks[index] = temp;
            setSubcategoriesAndBooks([...subcategoriesAndBooks]);
        }
        setChanged(true);
    }

    const handlePrimaryClick = function(type, status) {
        setIsPrimary(status);
        setChanged(true);
    }

    let catMenu = null;

    const populateCatMenu = (newPath, update) => (
        <div className="section">
            <label><InterfaceText>Category</InterfaceText></label>
            <CategoryChooser categories={newPath} update={update}/>
        </div>
    )

    const updateCatMenu = function(newPath) {
        if (newPath !== path) {
            setChanged(true);
        }
        setPath(newPath);
        catMenu = populateCatMenu(newPath);
    }

    catMenu = populateCatMenu(path, updateCatMenu);

    const updateData = function(newData) {
        setChanged(true);
        setData(newData);
    }

    const toggle = function() {
      setSavingStatus(savingStatus => !savingStatus);
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


    const redirect = function (newPath) {
        window.location.href = "/texts/"+newPath;
    }

    const save = async function () {
        toggle();
        let fullPath = [...path, data.enTitle];
        let postCategoryData = {
            isPrimary,
            "enDesc": data.enDescription,
            "heDesc": data.heDescription,
            "enShortDesc": data.enCatDescription,
            "heShortDesc": data.heCategoryDescription,
            "heSharedTitle": data.heTitle,
            "sharedTitle": data.enTitle,
            "path": fullPath
        };

        if (origSubcategoriesAndBooks !== subcategoriesAndBooks) {
            postCategoryData["subcategoriesAndBooks"] = subcategoriesAndBooks;
        }
        let url = `/api/category/${fullPath.join("/")}?category_editor=1`;
        if (!isNew) {
            url += "&update=1";
            postCategoryData = {...postCategoryData, origPath: origPath.concat(origData.origEn)}
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
        url: "/api/category/"+origPath.join("/"),
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
                    [subcategoriesAndBooks.map((child, i) => {
                        return <input type="text" id={`reorder-${i}`} className="reorderTool"
                                      onClick={(e) => reorderClickHandler(e)} readOnly value={child}/>;
                    }),
                    <ToggleSet
                      blueStyle={true}
                      ariaLabel="Primary Status"
                      label={Sefaria._("Primary Status")}
                      name="primary"
                      separated={false}
                      options={primaryOptions}
                      setOption={handlePrimaryClick}
                      currentValue={isPrimary} />,
                    ]
                }/>

    </div>;
}

export {CategoryEditor};