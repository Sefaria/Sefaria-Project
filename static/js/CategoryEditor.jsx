import {CategoryChooser, InterfaceText} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import {AdminEditor} from "./AdminEditor";

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
            "isPrimary": isPrimary,
            "enDesc": data.enDescription,
            "heDesc": data.heDescription,
            "enShortDesc": data.enCatDescription,
            "heShortDesc": data.heCategoryDescription,
            "heSharedTitle": data.heTitle,
            "sharedTitle": data.enTitle,
            "path": fullPath,
        };

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

    return <AdminEditor title="Category Editor" close={close} catMenu={catMenu} data={data} savingStatus={savingStatus}
                validate={validate} deleteObj={deleteObj} updateData={updateData} isNew={isNew} shortDescBool={true} extras={[isPrimaryObj]} path={path}/>;
}

export {CategoryEditor};