import { useState, useEffect } from "react";
import {SheetAuthorStatement, InterfaceText, ProfilePic, EnglishText, HebrewText} from "./Misc";
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
    const [userPlans, setUserPlans] = useState([]);
    const [checkedPlans, setCheckedPlans] = useState({});
    const [selectedDays, setSelectedDays] = useState({});
    const [suggestions, setSuggestions] = useState([]);
    const [lastModified, setLastModified] = useState(sheet.dateModified)
    const [isPublished, setIsPublished] = useState(sheet.status === "public");
    const [validation, setValidation] = useState({
        validationMsg: "",
        validationFailed: "none"
    });
    const [summary, setSummary] = useState(sheet.summary);
    const getRefSavedHistory = Sefaria.makeCancelable(Sefaria.getRefSavedHistory("Sheet " + masterPanelSheetId));
    const debouncedSummary = Sefaria._uid == sheet.owner ? useDebounce(summary, 250) : null;
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
        if (debouncedSummary == null) {return}
        saveSummary();
    }, [debouncedSummary])

    useEffect(() => {
        // Fetch user's plans when component mounts
        if (Sefaria._uid) {
            $.get("/api/plans", { creator: Sefaria._uid }, function(data) {
                if (data.plans) {
                    setUserPlans(data.plans);
                    // Initialize checked state for each plan
                    const initialCheckedState = {};
                    data.plans.forEach(plan => {
                        initialCheckedState[plan.id] = false;
                    });
                    setCheckedPlans(initialCheckedState);
                }
            });
        }
    }, []);

    const handleSummaryChange = (event) => {
        const newSummary = event.target.value
        if (event.target.value.length > 280) {
            setValidation({
                validationMsg: Sefaria._("sheet.message.summary_limit"),
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
        console.log("topic:  ", topics)
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
        if (!summary || summary.trim() == '') {
            setValidation({
                validationMsg: Sefaria._("sheet.add_description"),
                validationFailed: "summary"
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
            if (!(isFormValidated())) { return }

            // Check if a plan and day are selected
            const selectedPlanId = Object.entries(checkedPlans).find(([_, isChecked]) => isChecked)?.[0];
            const selectedDay = selectedPlanId ? selectedDays[selectedPlanId] : null;

            if (selectedPlanId && !selectedDay) {
                setValidation({
                    validationMsg: Sefaria._("Please select a day for the plan"),
                    validationFailed: "plan"
                });
                return;
            }
        }

        const newPublishState = isPublished ? "unlisted" : "public";
        let updatedSheet = await (new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(sheet.id, sheet => resolve(sheet))));
        updatedSheet.status = newPublishState;
        updatedSheet.lastModified = lastModified;
        delete updatedSheet._id;
        setIsPublished(!isPublished);
        const postJSON = JSON.stringify(updatedSheet);
        
        // First update the sheet
        const response = await new Promise((resolve) => {
            $.post("/api/sheets/", { "json": postJSON }, (data) => {
                if (data.id) {
                    setLastModified(data.dateModified);
                    Sefaria.sheets._loadSheetByID[data.id] = data;
                    resolve(data);
                } else {
                    console.log(data);
                    resolve(null);
                }
            });
        });

        // If sheet was published successfully and a plan/day were selected, update the plan
        if (response && response.id && !isPublished) {
            const selectedPlanId = Object.entries(checkedPlans).find(([_, isChecked]) => isChecked)?.[0];
            const selectedDay = selectedPlanId ? selectedDays[selectedPlanId] : null;

            if (selectedPlanId && selectedDay) {
                // Update plan content
                $.post("/api/plans/update_content", {
                    plan_id: selectedPlanId,
                    day: selectedDay,
                    sheet_id: response.id
                }, (data) => {
                    if (data.error) {
                        console.error("Error updating plan:", data.error);
                    }
                });
            }
        }
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
                setLastModified(data.dateModified)
                Sefaria.sheets._loadSheetByID[data.id] = data;
            } else {
                console.log(data);
            }
        })
    }

    const handlePlanCheck = (planId) => {
        setCheckedPlans(prev => {
            const newState = { ...prev };
            
            // If trying to check a new plan, first check if any other plan is checked
            if (!prev[planId]) {
                const hasCheckedPlan = Object.values(prev).some(isChecked => isChecked);
                if (hasCheckedPlan) {
                    return prev; // Don't allow checking if another plan is already checked
                }
            }
            
            // Toggle the current plan
            newState[planId] = !prev[planId];
            
            // Reset selected day when unchecking
            if (!newState[planId]) {
                setSelectedDays(prevDays => {
                    const newDays = { ...prevDays };
                    delete newDays[planId];
                    return newDays;
                });
            }
            
            return newState;
        });
    };

    const handleDaySelect = (planId, day) => {
        setSelectedDays(prev => ({
            ...prev,
            [planId]: day
        }));
    };

    const DayDropdown = ({ plan }) => {
        if (!checkedPlans[plan.id]) return null;
        
        const days = Array.from({ length: plan.total_days }, (_, i) => i + 1);
        
        return (
            <div className="dayDropdown" style={{ marginLeft: 'auto', position: 'relative' }}>
                <select 
                    value={selectedDays[plan.id] || ''} 
                    onChange={(e) => handleDaySelect(plan.id, e.target.value)}
                    style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        backgroundColor: '#fff'
                    }}
                >
                    <option value="">Which day</option>
                    {days.map(day => (
                        <option key={day} value={day}>Day {day}</option>
                    ))}
                </select>
            </div>
        );
    };

    const publishSettingsReadOnly = <div> {sheet.summary ? <div className="description" dangerouslySetInnerHTML={{ __html: sheet.summary }}></div> : null}
        {sheet.collections.length > 0 ?
            <div className="aboutLinks">
                <h3 className="aboutSheetHeader"><InterfaceText>Public Collections</InterfaceText></h3>
                <div>
                    <ul className="aboutSheetLinks">
                        {sheet.collections.map((collection, i) => (
                            <li key={i}><a href={"/collections/" + collection.slug}><InterfaceText>{collection.name}</InterfaceText></a></li>
                        ))}
                    </ul>
                </div>
            </div> : null
        }
        {!!Sefaria._uid ? <CollectionsEditor sheetId={sheet.id}/> : null }

        {!!Sefaria._uid && userPlans.length > 0 ? 
            <div className="aboutLinks">
                <h3 className="aboutSheetHeader"><InterfaceText>My Plans</InterfaceText></h3>
                <div>
                    <ul className="aboutSheetLinks">
                        {userPlans.map((plan, i) => (
                            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    checked={checkedPlans[plan.id] || false}
                                    onChange={() => handlePlanCheck(plan.id)}
                                    style={{ margin: '0' }}
                                    disabled={Object.values(checkedPlans).some(isChecked => isChecked) && !checkedPlans[plan.id]}
                                />
                                <a href={"/plans/" + plan.id}>
                                    <InterfaceText>{plan.title}</InterfaceText>
                                </a>
                                <DayDropdown plan={plan} />
                            </li>
                        ))}
                    </ul>
                </div>
            </div> 
        : null}
    </div>;

    const publishSettingsEditMode = <div className="publishSettingsEditMode"><div className={isPublished ? "publishBox transparentBackground sans-serif" : "publishBox sans-serif"}>
        {!isPublished ? <p><InterfaceText>sheet.publish_sheet_on_pecha</InterfaceText></p> : null}
        <h3 className="aboutSheetHeader"><InterfaceText>summary</InterfaceText></h3>
        <textarea
            className={validation.validationFailed === "both" || validation.validationFailed === "summary" ? "error" : ""}
            rows="3"
            maxLength="281"
            placeholder={Sefaria._("write_short_description")}
            value={summary} onChange={handleSummaryChange}></textarea>
        
        {validation.validationFailed === "none" ? null : <p className="error"><InterfaceText>{validation.validationMsg}</InterfaceText></p>}

        {!!Sefaria._uid && userPlans.length > 0 ? 
            <div>
                <h3 className="aboutSheetHeader"><InterfaceText>My Plans</InterfaceText></h3>
                <div>
                    <ul className="aboutSheetLinks">
                        {userPlans.map((plan, i) => (
                            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    checked={checkedPlans[plan.id] || false}
                                    onChange={() => handlePlanCheck(plan.id)}
                                    style={{ margin: '0' }}
                                    disabled={Object.values(checkedPlans).some(isChecked => isChecked) && !checkedPlans[plan.id]}
                                />
                                <a href={"/plans/" + plan.id}>
                                    <InterfaceText>{plan.title}</InterfaceText>
                                </a>
                                <DayDropdown plan={plan} />
                            </li>
                        ))}
                    </ul>
                </div>
            </div> 
        : null}

        {!isPublished ? <div className={"publishButton"}>
            <button className="button notPublished" onClick={togglePublish}>
                <InterfaceText>publish</InterfaceText>
            </button>
        </div> : null}
        {isPublished ?
            <div className={"publishButton"}>
                <div className="publishedText">
                    {Sefaria._("sheet.your_sheet_is")}<span className="publishedTextBold">{ Sefaria._("sheet.published")} </span> { Sefaria._("topic.visible_to_other")}
                </div>
                <button className="button published" onClick={togglePublish}>
                    <InterfaceText>unpublish</InterfaceText>
                </button>
            </div>
            : null
        }
    </div>
        <CollectionsEditor sheetId={sheet.id}/>
    </div>

    return (<div className="aboutSheetPanel">
        <div className="aboutSheetTopHeaders">
            <h2 className="aboutHeader">{title}</h2>
            <h3 className="aboutSheetSubtitle"><InterfaceText>profile.tab.sheets</InterfaceText></h3>
        </div>
        <SheetAuthorStatement
            authorUrl={sheet.ownerProfileUrl}
            authorStatement={sheet.ownerName}
        >
            <ProfilePic
                url={sheet.ownerImageUrl}
                len={30}
                name={sheet.ownerName}
                outerStyle={{ width: "30px", height: "30px", display: "inline-block", verticalAlign: "middle", marginInlineEnd: "10px" }}
            />
            <a href={sheet.ownerProfileUrl}>
                <InterfaceText>{sheet.ownerName}</InterfaceText>
            </a>
        </SheetAuthorStatement>
        <div className="aboutSheetMetadata">
            <div>
                <div
                    dangerouslySetInnerHTML={{ __html: Sefaria.util.localeDate(sheet.dateCreated)}}
                />
                <span>{Sefaria.interfaceLang == 'hebrew'? Sefaria.hebrew.tibetanNumeral(sheet.views) : sheet.views}</span>
                <span>{Sefaria.interfaceLang == 'hebrew'? Sefaria.hebrew.tibetanNumeral(sheetSaves.length ) : sheetSaves.length } {Sefaria._("common.saves")}</span>
            </div>
            {/* {sheet.status !== 'public' ? (<div><span className="unlisted"><img src="/static/img/eye-slash.svg"/><span>{Sefaria._("profile.tab.sheet.tag.not_published")}</span></span></div>) : undefined} */}
        </div>
        {
            canEdit ? publishSettingsEditMode : publishSettingsReadOnly
        }


    </div>
    )

}


const CollectionsEditor = ({ sheetId }) => {
    // A box that lets you control which of your collections `sheetId` belongs to

    const initialCollectionsSort = (cs, csSelected) => {
        // When first opened, sort checked collections to top, but don't reshuffle when user clicks check of open modal
        if (!cs || !csSelected) { return null; }
        return cs.sort((a, b) => {
            let aSel, bSel;
            [aSel, bSel] = [a, b].map(x => !!csSelected.filter(y => y.slug === x.slug).length)
            if (aSel == bSel) { return a.lastModified > b.lastModified ? -1 : 1; }
            else { return aSel ? -1 : 1; }
        });
    };
    const [collectionsSelected, setCollectionsSelected] = useState(Sefaria.getUserCollectionsForSheetFromCache(sheetId));
    let initialCollections = Sefaria.getUserCollectionsFromCache(Sefaria._uid);
    initialCollections = initialCollections ? initialCollectionsSort(initialCollections.slice(), collectionsSelected) : null;
    const [collections, setCollections] = useState(initialCollections);
    const [dataLoaded, setDataLoaded] = useState(!!collections && !!collectionsSelected);
    const [newName, setNewName] = useState("");
    const [changed, setChanged] = useState(false);

    // Make sure we have loaded the user's list of collections, 
    // and which collections this sheet belongs to for this user
    useEffect(() => {
        if (!dataLoaded) {
            Promise.all([
                Sefaria.getUserCollections(Sefaria._uid),
                Sefaria.getUserCollectionsForSheet(sheetId)
            ])
                .then(() => {
                    const initialCollectionsSelected = Sefaria.getUserCollectionsForSheetFromCache(sheetId);
                    const initialSortedCollections = initialCollectionsSort(Sefaria.getUserCollectionsFromCache(Sefaria._uid), initialCollectionsSelected);
                    setCollections(initialSortedCollections);
                    setCollectionsSelected(initialCollectionsSelected);
                    setDataLoaded(true);
                });
        }
    }, []);

    const onCheckChange = (collection, checked) => {
        // When a checkmark changes, add or remove this sheet from that collection
        let url, newCollectionsSelected;
        if (checked) {
            newCollectionsSelected = [...collectionsSelected, collection];
            url = `/api/collections/${collection.slug}/add/${sheetId}`;
        } else {
            newCollectionsSelected = collectionsSelected.filter(x => x.slug !== collection.slug);
            url = `/api/collections/${collection.slug}/remove/${sheetId}`;
        }

        $.post(url, data => handleCollectionInclusionChange(data));
        Sefaria._userCollectionsForSheet[sheetId] = newCollectionsSelected;
        setCollectionsSelected(newCollectionsSelected);
    };

    const handleCollectionInclusionChange = (data) => {
        // When a sheet has been added or removed, update collections list data in cache
        let newCollections = Sefaria.getUserCollectionsFromCache(Sefaria._uid).filter(c => c.slug != data.collection.slug);
        // Put the new collection first since it's just been modified
        newCollections = [data.collectionListing, ...newCollections];
        // Update in cache, but not in Component state -- prevents the list from jumping around
        // while you're looking at it, but show this collection first next time you see the list.
        Sefaria._userCollections[Sefaria._uid] = newCollections;
        // Update cache for this collection's full listing, which has now changed
        Sefaria._collections[data.collection.slug] = data.collection;
        // Update sheet cache
        Sefaria.sheets._loadSheetByID[sheetId] = data.sheet;
        Sefaria.sheets.updateUserSheets(data.sheetListing, Sefaria._uid, true, true);
        setChanged(true);
    };

    const onNameChange = event => setNewName(event.target.value);

    const onCreateClick = () => {
        const collection = { name: newName };
        $.post("/api/collections", { json: JSON.stringify(collection) }, (data) => {
            if ("error" in data) {
                alert(data.error);
                return;
            }
            setNewName("");
            const newCollections = [data.collection, ...collections];
            Sefaria._userCollections[Sefaria._uid] = newCollections;
            setCollections(newCollections);
            onCheckChange(data.collection, true);
        });
    };

    return <div>      <div className="collectionsEditorTop">
        <h3 className="aboutSheetHeader"><InterfaceText>collection.editor.my_collection</InterfaceText></h3>
    </div><div className="collectionsWidget">
            <div className="collectionsWidgetList serif">
                {!dataLoaded ? null :
                    collections.map((collection, i) => {
                        return <label className="checkmarkLabel" key={i + collection.name}>
                            <input
                                type="checkbox"
                                onChange={event => onCheckChange(collection, event.target.checked)}
                                checked={collectionsSelected.filter(x => x.slug === collection.slug).length ? "checked" : ""} />
                            <span className="checkmark"></span>
                            {collection.name}
                        </label>
                    })}
                {dataLoaded && collections.length === 0 ?
                    <span className={"emptyMessage"}>
                        <InterfaceText>
                           {Sefaria._("profile.collection_description")}
                        </InterfaceText>
                    </span> : null}
            </div>
            <div className="collectionsEditorCreate">
                <span className="collectionsWidgetPlus">+</span>
                <div className="collectionsWidgetCreateInputBox">
                    <input className="collectionsWidgetCreateInput" placeholder={Sefaria._("collection.create_new_collection")} value={newName} onChange={onNameChange} />
                </div>
                {newName.length ?
                    <div className="button extraSmall white collectionsWidgetCreateButton" onClick={onCreateClick}>
                        <InterfaceText>create</InterfaceText>
                    </div>
                    : null}
            </div>
        </div>
    </div>
};


export default AboutSheet;
