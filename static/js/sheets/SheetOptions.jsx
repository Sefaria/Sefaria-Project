import React, {useEffect, useState} from "react";
import {DropdownMenu, DropdownMenuItem, DropdownMenuItemWithIcon, DropdownMenuSeparator} from "../common/DropdownMenu";
import {InterfaceText, SaveButtonWithText, TitleVariants} from "../Misc";
import Modal from "../common/modal";
import {ShareBox} from "../ConnectionsPanel";
import Sefaria from "../sefaria/sefaria";
import $ from "../sefaria/sefariaJquery";
import {SignUpModalKind} from "../sefaria/signupModalContent";
import {AddToSourceSheetBox} from "../AddToSourceSheet";
import {CollectionsWidget} from "../CollectionsWidget";
import Button from "../common/Button";
import ReactTags from "react-tag-autocomplete";
const modifyHistoryObjectForSheetOptions = (historyObject) => {
  // we want the 'ref' property to be for the sheet itself and not its segments, as in "Sheet 3" not "Sheet 3:4"
  let newHistoryObject = Object.assign({}, historyObject);
  const refParts = newHistoryObject.ref.split(":");
  newHistoryObject.ref = refParts[0];
  return newHistoryObject;
}
const getExportingStatus = () => {
  const urlHashObject = Sefaria.util.parseHash(Sefaria.util.parseUrl(window.location).hash).afterLoading;
  return urlHashObject === "exportToDrive";
}

const SheetOptions = ({historyObject, toggleSignUpModal, sheetID, authorUrl, editable, postSheet, status}) => {
  // `editable` -- whether the sheet belongs to the current user
  const [sharingMode, setSharingMode] = useState(false); // Share Modal open or closed
  const [collectionsMode, setCollectionsMode] = useState(false);  // Collections Modal open or closed
  const [copyingMode, setCopyingMode] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [exportingMode, setExportingMode] = useState(getExportingStatus());
  const [deletingMode, setDeletingMode] = useState(false);  
  const [publishingMode, setPublishingMode] = useState(false);
  const historyObjectForSheet = modifyHistoryObjectForSheetOptions(historyObject);
  const getSignUpModalKind = () => {
    if (savingMode) {
      return SignUpModalKind.Save;
    }
    else if (collectionsMode) {
      return SignUpModalKind.AddToSheet;
    }
    else if (copyingMode) {
      return SignUpModalKind.AddToSheet;
    }
    else if (exportingMode) {
      return SignUpModalKind.Default;
    }
  }
  useEffect(() => {
    if ((collectionsMode || savingMode || copyingMode || exportingMode) && !Sefaria._uid) {
      toggleSignUpModal(getSignUpModalKind());
      setCopyingMode(false);
      setCollectionsMode(false);
      setSavingMode(false);
      setExportingMode(false);
    }
  }, [collectionsMode, savingMode, copyingMode, exportingMode]);
  if (sharingMode) {
    return <ShareModal sheetID={sheetID} isOpen={sharingMode} close={() => setSharingMode(false)}/>;
  }
  else if (collectionsMode) {
    return <CollectionsModal isOpen={collectionsMode} close={() => setCollectionsMode(false)} sheetID={sheetID}/>;
  }
  else if (copyingMode) {
    return <CopyModal close={() => setCopyingMode(false)} sheetID={sheetID}/>;
  }
  else if (savingMode) {
    return <SaveModal historyObject={historyObjectForSheet} close={() => setSavingMode(false)}/>;
  }
  else if (exportingMode) {
    return <GoogleDocExportModal close={() => setExportingMode(false)} sheetID={sheetID}/>;
  }
  else if (deletingMode) {
    return <DeleteModal close={() => setDeletingMode(false)} sheetID={sheetID} authorUrl={authorUrl}/>;
  }
  else if (publishingMode) {
    return <PublishModal close={() => setPublishingMode(false)}
                         sheetID={sheetID}
                         status={status}
                         postSheet={postSheet}/>;
  }
  const publishModalButton = <Button className="small publish" onClick={() => setPublishingMode(true)}>Publish</Button>;
  return (
        <>
        {editable && status === 'unlisted' && publishModalButton}
        <DropdownMenu menuIconComponent={<img src="/static/icons/ellipses.svg" alt="Options"/>}>
          <DropdownMenuItem>
            <SaveButtonWithText
                historyObject={historyObjectForSheet}
                onClick={() => setSavingMode(true)}
            />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CopyButton onClick={() => setCopyingMode(true)}/>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CollectionsButton setCollectionsMode={setCollectionsMode} editable={editable}/>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <GoogleDocExportButton sheetID={sheetID} onClick={() => setExportingMode(true)}/>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ShareButton onClick={() => setSharingMode(true)}/>
          </DropdownMenuItem>
          {editable && status === 'public' && <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem>
                                                  <UnpublishButton onClick={() => setPublishingMode(true)}/>
                                                </DropdownMenuItem>
                                              </>
          }
          {editable && <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <DeleteButton onClick={() => setDeletingMode(true)}/>
                        </DropdownMenuItem>
                      </>
          }
        </DropdownMenu>
        </>
    );
}

const ShareButton = ({onClick}) => {
  return <DropdownMenuItemWithIcon icon={"/static/img/share.svg"}
              textEn={'Share'}
              textHe={'שיתוף'}
              descEn={""}
              descHe={""}
              onClick={onClick}/>
}

const DeleteButton = ({onClick}) => {
    const handleClick = () => {
      if (confirm(Sefaria._("Are you sure you want to delete this sheet? There is no way to undo this action."))) {
        onClick();
      }
    }
    return <DropdownMenuItemWithIcon icon={"/static/icons/trash.svg"}
              textEn={'Delete Sheet'}
              textHe={''}
              descEn={""}
              descHe={""}
              onClick={handleClick}/>
}

const UnpublishButton = ({onClick}) => {
  return <DropdownMenuItemWithIcon icon={"/static/icons/unpublish.svg"}
                                   textEn={'Unpublish'}
                                   textHe={""}
                                   descEn={""}
                                   descHe={""}
                                   onClick={onClick}/>
}

const CollectionsButton = ({setCollectionsMode, editable}) => {
  const label = editable ? "Edit Collections" : "Add to Collection";
  return <DropdownMenuItemWithIcon icon={"/static/icons/collection.svg"}
                                      textEn={label}
                                      textHe={Sefaria._(label)}
                                      descEn={""}
                                      descHe={""}
                                      onClick={() => setCollectionsMode(true)}/>
}
const ShareModal = ({sheetID, close}) => {
  return <Modal isOpen={true} close={close}>
          <ShareBox
              sheetID={sheetID}
              url={window.location.href}
          />
        </Modal>;
}
const CollectionsModal = ({close, sheetID}) => {
  return <Modal isOpen={true} close={close}>
            <CollectionsWidget sheetID={sheetID} close={close} />
        </Modal>;
}

const AddToSourceSheetModal = ({nodeRef, srefs, close}) => {
  return <Modal isOpen={true} close={close}><AddToSourceSheetBox nodeRef={nodeRef} srefs={srefs} hideGDocAdvert={true}/></Modal>
}
const CopyButton = ({onClick}) => {
  return <DropdownMenuItemWithIcon
              textEn={"Copy"}
              textHe={"העתקה"}
              descEn={""}
              descHe={""}
              icon="/static/img/copy.png"
              onClick={() => onClick()} />
}
const CopyModal = ({close, sheetID}) => {
  const copyState = {
    copying: { en: "Copying Sheet...", he: "מעתיק..."},
    copied: { he: "צפייה בדף המקורות", en: "View Copy"},
    error: { en: "Sorry, there was an error.", he: "סליחה, ארעה שגיאה" }
  }
  const [copyText, setCopyText] = useState(copyState.copying);
  const [copiedSheetId, setCopiedSheetId] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const filterAndSaveCopiedSheetData = async (data) => {
    let newSheet = Sefaria.util.clone(data);
    newSheet.status = "unlisted";
    newSheet.title = newSheet.title + " (Copy)";
    if (Sefaria._uid !== newSheet.owner) {
      newSheet.via = newSheet.id;
      newSheet.viaOwner = newSheet.owner;
      newSheet.owner = Sefaria._uid
    }
    delete newSheet.id;
    delete newSheet.ownerName;
    delete newSheet.views;
    delete newSheet.dateCreated;
    delete newSheet.dateModified;
    delete newSheet.displayedCollection;
    delete newSheet.collectionName;
    delete newSheet.collectionImage;
    delete newSheet.likes;
    delete newSheet.promptedToPublish;
    delete newSheet._id;

    return await Sefaria.apiRequestWithBody("/api/sheets/", null, newSheet);
  }
  useEffect( () => {
    async function fetchData() {
      let loadedSheet = Sefaria.sheets.loadSheetByID(sheetID);
      return await filterAndSaveCopiedSheetData(loadedSheet);
    }
    if (!loaded) {
      setLoaded(true);
      fetchData().then((response) => {
        if (response.id) {
          setCopyText(copyState.copied);
          setCopiedSheetId(response.id);
        } else {
          setCopyText(copyState.error);
        }
      })
    }
  })
  const getCopySuccessMessage = () => {
    return <><InterfaceText>Success!</InterfaceText>&nbsp;
              <a className="successMessage" href={`/sheets/${copiedSheetId}`} target='_blank'>
              <InterfaceText>View your Copy</InterfaceText>
              </a>
          </>;
  }
  const handleClose = () => {
    if (copyText.en !== copyState.copying) { // don't allow user to close modal while copying is taking place
      setLoaded(false);
      close();
    }
  }

  const copyMessage = copyText.en === copyState.copied.en ? getCopySuccessMessage() : <InterfaceText>{copyText.en}</InterfaceText>;
  return <GenericSheetModal title={<InterfaceText>Copy</InterfaceText>} message={copyMessage} close={handleClose}/>;
}

const DeleteModal = ({close, sheetID, authorUrl}) => {
  useEffect( () => {
    Sefaria.sheets.deleteSheetById(sheetID).then(() => {
      window.location.href = authorUrl;
    });
  });
  return <GenericSheetModal title={<InterfaceText>Deleting...</InterfaceText>} close={close}/>;
}

const GenericSheetModal = ({title, message, close}) => {
  return <Modal isOpen={true} close={close}>
            <div className="modalTitle">{title}</div>
            <div className="modalMessage">{message}</div>
        </Modal>;
}

const PublishModal = ({close, status, sheetID, postSheet}) => {
  // `status` is 'public' or 'unlisted'.  we are going to toggle the status.  if it's 'public' we want to unlist it
  // so this modal simply posts the new status.  If it's 'unlisted', we want to give the user the PublishMenu component
  // allowing them to specify title, summary, and tags and from there the user can choose to make the sheet public
  const sheet = Sefaria.sheets.loadSheetByID(sheetID);
  const publishState = {
    notPosting: "",
    posting: "Updating sheet...",
    posted: "Success!",
  }

  // if it's not yet public, show PublishMenu and don't yet post it; if it's public, start posting it
  const initState = status === 'unlisted' ? publishState.notPosting : publishState.posting;
  const [publishText, setPublishText] = useState(initState);

  const handleClose = () => {
    if (publishText !== publishText.posting) {
      // don't allow user to close modal while posting is taking place
      close();
    }
  }
  const togglePublishStatus = async () => {
      sheet.status = status === 'public' ? "unlisted" : "public";
      sheet.lastModified = sheet.dateModified;
      delete sheet._id;
      try {
        await postSheet(sheet);
        setPublishText(publishState.posted);
      } catch (error) {
        setPublishText(`Error: ${error.message}`);
      }
  }
  useEffect( () => {
      const toggle = async () => {
          if (publishText === publishState.posting) {
              await togglePublishStatus();
          }
      }
      toggle();
  }, [publishText])
  let contents;
  if (publishText === publishState.notPosting) {
      contents = <PublishMenu sheet={sheet} publishCallback={() => setPublishText(publishState.posting)}/>;
  }
  else {
      contents = <div className="modalMessage"><InterfaceText>{publishText}</InterfaceText></div>;
  }
  return <Modal isOpen={true} close={handleClose}>
              <div className="modalTitle"><InterfaceText>Publish</InterfaceText></div>
              {contents}
          </Modal>;
}

const PublishMenu = ({sheet, publishCallback}) => {
  const reactTags = React.createRef();
  const [title, setTitle] = useState(sheet.title.stripHtmlConvertLineBreaks() || "");
  const [summary, setSummary] = useState(sheet.summary || "");
  const [suggestions, setSuggestions] = useState([]);
  const [validation, setValidation] = useState({
          validationMsg: "",
          validationFailed: "none"
      });
  const [tags, setTags] = useState(
      sheet.topics.map((topic, i) => ({
          id: i,
          name: topic["asTyped"],
          slug: topic["slug"],
      })
      )
  )
  const isFormValidated = () => {
        if ((!summary || summary.trim() === '') && tags.length === 0) {
            setValidation({
                validationMsg: Sefaria._("Please add a description and topics to publish your sheet."),
                validationFailed: "both"
            });
            return false
        }
        else if (!summary || summary.trim() === '') {
            setValidation({
                validationMsg: Sefaria._("Please add a description to publish your sheet."),
                validationFailed: "summary"
            });
            return false
        }

        else if (tags.length === 0) {
            setValidation({
                validationMsg: Sefaria._("Please add topics to publish your sheet."),
                validationFailed: "topics"
            });
            return false;
        }

        else {
            setValidation({
                validationMsg: "",
                validationFailed: "none"
            });
            return true;
        }
    }
    const updateSuggestedTags = (input) => {
    if (input === "") return
    Sefaria.getName(input, false, 0).then(d => {
        const topics = d.completion_objects
            .filter(obj => obj.type === "Topic")
            .map((filteredObj, index) => ({
                id: index,
                name: filteredObj.title,
                slug: filteredObj.key
            })
            )
        return topics;
    }).then(topics => setSuggestions(topics))
  }
  const onTagDelete = (i) => {
    const newTags = tags.slice(0);
    newTags.splice(i, 1);
    setTags(newTags);
  }
  const onTagAddition = (tag) => {
    const newTags = [].concat(tags, tag);
    setTags(newTags);
  }
  const onTagValidate = (tag) => {
      return tags.every((item) => item.name !== tag.name)
  }
  const handleSummaryChange = (event) => {
    const newSummary = event.target.value;
    if (event.target.value.length > 140) {
        setValidation({
            validationMsg: Sefaria._("The summary description is limited to 140 characters."),
            validationFailed: "summary"
        });
    }
    else {
        setValidation({
            validationMsg: "",
            validationFailed: "none"
        });
    }
    setSummary(newSummary);
  }
  const handlePublish = () => {
    sheet.title = title === "" ? "Untitled" : title;
    sheet.summary = summary;
    sheet.topics = tags.map(tag => ({
          asTyped: tag.name,
          slug: tag.slug,
        })
    );
    if ((isFormValidated())) {
      publishCallback(true);
    }
  }
  return <div>
        <div className={"publishBox sans-serif"}>
            <div className="publishLabel">
                <InterfaceText>Title</InterfaceText>
            </div>
            <input type="text"
                   value={title}
                   placeholder={Sefaria._("Untitled")}
                   onChange={(e) => setTitle(e.target.value)}></input>
            <div className="publishLabel">
                <InterfaceText>Description (max 140 characters)</InterfaceText>
            </div>
            <textarea
                className={validation.validationFailed === "both" || validation.validationFailed === "summary" ? "error" : ""}
                rows="3"
                maxLength="140"
                placeholder={Sefaria._("Write a short description of your sheet...")}
                value={summary}
                onChange={handleSummaryChange}></textarea>
            <div className="publishLabel">
                <InterfaceText>Add topics related to your sheet</InterfaceText>
            </div>
            <div
                className={validation.validationFailed === "both" || validation.validationFailed === "topics" ? "error" : ""}>
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
            {validation.validationFailed !== "none" &&
                <p className="error"><InterfaceText>{validation.validationMsg}</InterfaceText></p>}
            <Button className="small" onClick={handlePublish}>Publish</Button>
        </div>
    </div>
}

const SaveModal = ({historyObject, close}) => {
    const isSaved = !!Sefaria.getSavedItem(historyObject);
    const savingMessage = "Saving...";
    const [message, setMessage] = useState(savingMessage);
    const savedMessage = isSaved ? "Sheet no longer saved." : "Saved sheet.";
    useEffect(() => {
        if (message === savingMessage) {
            Sefaria.toggleSavedItem(historyObject)
                .finally(() => {
                    setMessage(savedMessage);
                });
        }
    });
    return <GenericSheetModal title={<InterfaceText>Save</InterfaceText>}
                              message={<InterfaceText>{message}</InterfaceText>} close={close}/>;
}

const GoogleDocExportButton = ({onClick}) => {
    const googleDriveText = {en: "Export to Google Docs", he: "ייצוא לגוגל דוקס"};
    return <DropdownMenuItemWithIcon
        textEn={googleDriveText.en}
        textHe={googleDriveText.he}
        descEn={""}
        descHe={""}
        icon="/static/img/googledrivecolor.png"
        onClick={() => onClick()}/>;
}

const GoogleDocExportModal = ({sheetID, close}) => {
    const googleDriveState = {
        exporting: {en: "Exporting to Google Docs...", he: "מייצא לגוגל דוקס..."},
        exportComplete: {en: "Success!", he: "ייצוא הסתיים"}
    }
    const [googleDriveText, setGoogleDriveText] = useState(googleDriveState.exporting);

    const [googleDriveLink, setGoogleDriveLink] = useState("");
    const sheet = Sefaria.sheets.loadSheetByID(sheetID);

    useEffect(() => {
        if (googleDriveText.en === googleDriveState.exporting.en) {
            history.replaceState("", document.title, window.location.pathname + window.location.search); // remove exportToDrive hash once it's used to trigger export
            $.ajax({
                type: "POST",
                url: "/api/sheets/" + sheetID + "/export_to_drive",
                success: function (data) {
                    if ("error" in data) {
                        console.log(data.error.message);
                        // Export Failed
                    } else {
                        // Export succeeded
            setGoogleDriveLink(data.webViewLink);
            setGoogleDriveText(googleDriveState.exportComplete)
          }
        },
        statusCode: {
          401: function () {
            window.location.href = "/gauth?next=" + encodeURIComponent(window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + "#afterLoading=exportToDrive");
          }
        }
      });
    }
  }, [googleDriveText]);
  const getExportMessage = () => {
    if (googleDriveText.en === googleDriveState.exporting.en) {
      return <InterfaceText text={googleDriveText}/>;
    }
    else {
      return <>
                <InterfaceText text={googleDriveText}/>&nbsp;
                <a href={googleDriveLink} target="_blank" className="successMessage"><InterfaceText>View in Google Docs</InterfaceText></a>
             </>
    }
  }
  return <GenericSheetModal title={<InterfaceText>Export</InterfaceText>}
                            message={getExportMessage()}
                            close={close}/>;

}


export {SheetOptions, AddToSourceSheetModal};