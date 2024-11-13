import React, {useEffect, useState} from "react";
import {DropdownMenu, DropdownMenuItem, DropdownMenuItemWithIcon, DropdownMenuSeparator} from "../common/DropdownMenu";
import {InterfaceText, SaveButtonWithText, TitleVariants} from "../Misc";
import Modal from "../shared/modal";
import {ShareBox} from "../ConnectionsPanel";
import Sefaria from "../sefaria/sefaria";
import $ from "../sefaria/sefariaJquery";
import {SignUpModalKind} from "../sefaria/signupModalContent";
import {AddToSourceSheetBox} from "../AddToSourceSheet";
import {CollectionsWidget} from "../CollectionsWidget";
import Button from "../shared/Button";

const togglePublish = async (sheet, shouldPublish, lastModified) => {
  sheet.status = shouldPublish ? "public" : "unlisted";
  sheet.lastModified = lastModified;
  console.log(lastModified, sheet.dateModified);
  delete sheet._id;
  Sefaria.apiRequestWithBody("/api/sheets/", null, sheet, "POST").then(data => {
    if (data.id) {
      Sefaria.sheets._loadSheetByID[data.id] = data;
    }
  })
}

const PublishButton = ({onClick}) => {
  return <Button className="small publish" onClick={onClick}>Publish</Button>
}

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

const SheetOptions = ({historyObject, toggleSignUpModal, sheet, sheetID, authorUrl, editable, lastModified}) => {
  // `editable` -- whether the sheet belongs to the current user
  const [sharingMode, setSharingMode] = useState(false); // Share Modal open or closed
  const [collectionsMode, setCollectionsMode] = useState(false);  // Collections Modal open or closed
  const [copyingMode, setCopyingMode] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [exportingMode, setExportingMode] = useState(getExportingStatus());
  const [deletingMode, setDeletingMode] = useState(false);  
  const [publishingMode, setPublishingMode] = useState(false);
  const [sheetIsPublished, setSheetIsPublished] = useState(sheet?.status === "public");
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
    return <PublishModal close={() => setPublishingMode(false)} sheet={sheet}/>;
  }
  return (
        <>
        {editable && !sheetIsPublished && <PublishButton onClick={() => togglePublish(sheet,true, lastModified)}/>}
        <DropdownMenu menu_icon={"/static/icons/ellipses.svg"}>
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
          {editable && sheetIsPublished && <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem>
                                          <UnpublishButton onClick={() => togglePublish(sheetID, false)}/>
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

const PublishModal = ({sheet, close}) => {
  const [topics, setTopics] = useState(sheet.map((item, i) =>({["name"]: item, ["id"]: i})));
  return <Modal isOpen={true} close={close}>
            <div className="modalTitle"><InterfaceText>Publish</InterfaceText></div>
            <label>Title</label>
            <input type="text"></input>
            <label>Description (max 140 characters)</label>
            <input type="text"></input>
            <label>Add topics related to your sheet</label>
            <TitleVariants update={setTopics} titles={topics}/>
        </Modal>;
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
  return <GenericSheetModal title={<InterfaceText>Save</InterfaceText>} message={<InterfaceText>{message}</InterfaceText>} close={close}/>;
}

const GoogleDocExportButton = ({ onClick }) => {
  const googleDriveText = { en: "Export to Google Docs", he: "ייצוא לגוגל דוקס" };
  return <DropdownMenuItemWithIcon
                         textEn={googleDriveText.en}
                         textHe={googleDriveText.he}
                         descEn={""}
                         descHe={""}
                         icon="/static/img/googledrivecolor.png"
                         onClick={() => onClick()} />;
}

const GoogleDocExportModal = ({ sheetID, close }) => {
  const googleDriveState = {
    exporting: {en: "Exporting to Google Docs...", he: "מייצא לגוגל דוקס..."},
    exportComplete: { en: "Success!", he: "ייצוא הסתיים"}
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