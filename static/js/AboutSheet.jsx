import { useState, useEffect } from "react";
import { SheetAuthorStatement, InterfaceText, ProfilePic } from "./Misc";
import Sefaria from "./sefaria/sefaria";
import ReactTags from 'react-tag-autocomplete'
import { useDebounce } from "./Hooks";

const AboutSheet = ({ masterPanelSheetId, toggleSignUpModal }) => {

    const sheet = Sefaria.sheets.loadSheetByID(masterPanelSheetId);
    const canEdit = sheet.owner === Sefaria._uid;
    const reactTags = React.createRef()

    const title = sheet.title.stripHtmlConvertLineBreaks();
    const [tags, setTags] = useState(
        sheet.topics.map((topic, i) => ({
            id: i,
            name: topic["asTyped"],
            slug: topic["slug"],
        })
        )
    )
    const [sheetSaves, setSheetSaves] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [lastModified, setLastModified] = useState(sheet.dateModified)
    const [isPublished, setIsPublished] = useState(sheet.status === "public");
    const [validation, setValidation] = useState({
        validationMsg: "",
        validationFailed: "none"
    });
    const [summary, setSummary] = useState(sheet.summary);
    const getRefSavedHistory = Sefaria.makeCancelable(Sefaria.getRefSavedHistory("Sheet " + masterPanelSheetId));
    const debouncedSummary = useDebounce(summary, 250);
    useEffect(() => {
        getRefSavedHistory.promise.then(data => {
            for (let hist of data) {
                setSheetSaves([...sheetSaves, hist["uid"]]);
            }
        }).catch((reason) => {
            console.log('Error', reason.isCanceled ? 'canceled' : reason);
        });
        return () => {
            getRefSavedHistory.cancel();
        };
    }, [masterPanelSheetId]);

    useEffect(() => {
        saveSummary();
    }, [debouncedSummary])

    const handleSummaryChange = (event) => {
        const newSummary = event.target.value
        if (event.target.value.length > 280) {
            setValidation({
                validationMsg: Sefaria._("The summary description is limited to 280 characters."),
                validationFailed: "summary"
            });
        }
        else {
            setValidation({
                validationMsg: "",
                validationFailed: "none"
            });
        }
        setSummary(newSummary)
    }

    const updateSuggestedTags = (input) => {
        if (input == "") return
        Sefaria.getName(input, false, 0).then(d => {
            const topics = d.completion_objects
                .filter(obj => obj.type === "Topic")
                .map((filteredObj, index) => ({
                    id: index,
                    name: filteredObj.title,
                    slug: filteredObj.key
                })
                )
            return topics
        }).then(topics => setSuggestions(topics))
    }


    const updateTopics = async (newTags) => {
        let updatedSheet = await (new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(sheet.id, sheet => resolve(sheet))));

        const topics = newTags.map(tag => ({
            asTyped: tag.name,
            slug: tag.slug,
        })
        )
        updatedSheet.topics = topics;
        updatedSheet.lastModified = lastModified;
        delete updatedSheet._id;
        delete updatedSheet.error;
        const postJSON = JSON.stringify(updatedSheet);
        postSheet(postJSON)
    }


    const saveSummary = async () => {
        let updatedSheet = await (new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(sheet.id, sheet => resolve(sheet))));
        updatedSheet.summary = summary;
        updatedSheet.lastModified = lastModified;
        delete updatedSheet._id;
        const postJSON = JSON.stringify(updatedSheet);
        postSheet(postJSON)
    }


    const isFormValidated = () => {
        if ((!summary || summary.trim() == '') && tags.length == 0) {
          setValidation({
            validationMsg: Sefaria._("Please add a description and topics to publish your sheet."),
            validationFailed: "both"
          });
          return false
        }
        else if (!summary || summary.trim() == '') {
          setValidation({
            validationMsg: Sefaria._("Please add a description to publish your sheet."),
            validationFailed: "summary"
          });
          return false
        }
    
        else if (tags.length == 0) {
          setValidation({
            validationMsg: Sefaria._("Please add topics to publish your sheet."),
            validationFailed: "topics"
          });
          return false
        }
    
        else {
          setValidation({
            validationMsg: "",
            validationFailed: "none"
          });
          return true
        }
      }

    const togglePublish = async () => {
        if (!isPublished) {
            if (!(this.isFormValidated())) { return }
        }

        const newPublishState = isPublished ? "unlisted" : "public";
        let updatedSheet = await (new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(sheet.id, sheet => resolve(sheet))));
        updatedSheet.status = newPublishState;
        updatedSheet.lastModified = lastModified;
        delete updatedSheet._id;
        setIsPublished(isPublished);
        const postJSON = JSON.stringify(updatedSheet);
        this.postSheet(postJSON);

    }

    const onTagDelete = (i) => {
        const newTags = tags.slice(0);
        newTags.splice(i, 1);
        setTags(newTags);
        updateTopics(newTags);
    }


    const onTagAddition = (tag) => {
        const newTags = [].concat(tags, tag);
        setTags(newTags);
        updateTopics(newTags);
    }

    const onTagValidate = (tag) => {
        return tags.every((item) => item.name !== tag.name)
    }

    const postSheet = (postJSON) => {
        $.post("/api/sheets/", { "json": postJSON }, (data) => {
            if (data.id) {
                console.log('saved...')
                setLastModified(data.dateModified)
                Sefaria.sheets._loadSheetByID[data.id] = data;
            } else {
                console.log(data);
            }
        })
    }

    const publishSettingsReadOnly = <div> {sheet.summary ? <div className="description" dangerouslySetInnerHTML={{ __html: sheet.summary }}></div> : null}
        {sheet.collections.length > 0 ?
            <div className="aboutLinks">
                <h3 className="aboutSheetHeader"><InterfaceText>Collections</InterfaceText></h3>
                <hr />
                <div>
                    <ul className="aboutSheetLinks">
                        {sheet.collections.map((collection, i) => (
                            <li key={i}><a href={"/collections/" + collection.slug}><InterfaceText>{collection.name}</InterfaceText></a></li>
                        ))}
                    </ul>
                </div>
            </div> : null

        }

        {sheet.topics && sheet.topics.length > 0 ?
            <div className="readings">
                <h3 className="aboutSheetHeader"><InterfaceText>Topics</InterfaceText></h3>
                <hr />
                <div>
                    <ul className="aboutSheetLinks">
                        {sheet.topics.map((topic, i) => (
                            <li key={i}><a href={"/topics/" + topic.slug}
                                target="_blank"

                            >
                                <InterfaceText text={{ en: topic.en, he: topic.he }} />
                            </a></li>
                        ))
                        }
                    </ul>
                </div>
            </div> : null}

    </div>;

    const publishSettingsEditMode = <div className={isPublished ? "publishBox transparentBackground sans-serif" : "publishBox sans-serif"}>
        {!isPublished ? <p><InterfaceText>Publish your sheet on Sefaria for others to discover.</InterfaceText></p> : null}
        <h3 className="aboutSheetHeader"><InterfaceText>Summary</InterfaceText></h3>
        <hr></hr>
        <textarea
            className={validation.validationFailed === "both" || validation.validationFailed === "summary" ? "error" : ""}
            rows="3"
            maxLength="281"
            placeholder={Sefaria._("Write a short description of your sheet...")}
            value={summary} onChange={handleSummaryChange}></textarea>
        <h3 className="aboutSheetHeader"><InterfaceText>Topics</InterfaceText></h3>
        <hr></hr>
        <div className={validation.validationFailed == "both" || validation.validationFailed == "topics" ? "error" : ""}>
            <ReactTags
                ref={reactTags}
                allowNew={true}
                tags={tags}
                suggestions={suggestions}
                onDelete={onTagDelete}
                placeholderText={Sefaria._("Add a topic...")}
                delimiters={["Enter", "Tab", ","]}
                onAddition={onTagAddition}
                onValidate={onTagValidate}
                onInput={updateSuggestedTags}
            />
        </div>
        {validation.validationFailed == "none" ? null :  <p className="error"><InterfaceText>{validation.validationMsg}</InterfaceText></p> }

        <div className={"publishButton"}>
            <button className={isPublished ? "button published" : "button"} onClick={togglePublish}>
                <InterfaceText>{isPublished ? "Unpublish" : "Publish"}</InterfaceText>
            </button>
        </div>

    </div>

    return (<div className="aboutSheetPanel">
        <div className="aboutSheetTopHeaders">
            <h2 className="aboutHeader">{title}</h2>
            <h3 className="aboutSheetSubtitle">Sheet</h3>
        </div>
        <SheetAuthorStatement
            authorUrl={sheet.ownerProfileUrl}
            authorStatement={sheet.ownerName}
        >
            <ProfilePic
                url={sheet.ownerImageUrl}
                len={30}
                name={sheet.ownerName}
                outerStyle={{ width: "30px", height: "30px", display: "inline-block", verticalAlign: "middle", marginRight: "10px" }}
            />
            <a href={sheet.ownerProfileUrl}>
                <InterfaceText>{sheet.ownerName}</InterfaceText>
            </a>
        </SheetAuthorStatement>
        <div className="aboutSheetMetadata">
            <div>{Sefaria.util.localeDate(sheet.dateCreated)}</div>
            <div>{sheet.views} views, {sheetSaves.length} Saves</div>
            {/* {sheet.status !== 'public' ? (<div><span className="unlisted"><img src="/static/img/eye-slash.svg"/><span>{Sefaria._("Not Published")}</span></span></div>) : undefined} */}
        </div>
        {
            canEdit ? publishSettingsEditMode : publishSettingsReadOnly
        }


    </div>
    )

}

export default AboutSheet;
