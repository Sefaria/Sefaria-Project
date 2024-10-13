import React, {useEffect, useState} from "react";
import {DropdownMenu, DropdownMenuItem, DropdownMenuItemWithIcon} from "../common/DropdownMenu";
import {InterfaceText, SaveButton, SaveButtonWithText} from "../Misc";
import Modal from "../shared/modal";
import {ShareBox, ToolsButton} from "../ConnectionsPanel";
import Sefaria from "../sefaria/sefaria";
import $ from "../sefaria/sefariaJquery";
import {SignUpModalKind} from "../sefaria/signupModalContent";
import {CollectionsWidget} from "../CollectionsWidget";
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

const SheetOptions = ({historyObject, toggleSignUpModal, sheetID}) => {
  const [isSharing, setSharing] = useState(false); // Share Modal open or closed
  const [isAdding, setAdding] = useState(false);  // Edit Collections Modal open or closed
  const [isCopying, setCopying] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [isExporting, setExporting] = useState(getExportingStatus());
  const historyObjectForSheet = modifyHistoryObjectForSheetOptions(historyObject);
  useEffect(() => {
    if ((isAdding || isSaving || isCopying || isExporting) && !Sefaria._uid) {
      toggleSignUpModal();
      setCopying(false);
      setAdding(false);
      setSaving(false);
      setExporting(false);
    }
  }, [isAdding, isSaving, isCopying, isExporting]);
  if (isSharing) {
    return <ShareModal sheetID={sheetID} isOpen={isSharing} close={() => setSharing(false)}/>;
  }
  else if (isAdding) {
    return <EditCollectionsModal isOpen={isAdding} close={() => setAdding(false)} sheetID={sheetID}/>;
  }
  else if (isCopying) {
    return <CopyModal close={() => setCopying(false)} sheetID={sheetID}/>;
  }
  else if (isSaving) {
    return <SaveModal historyObject={historyObjectForSheet} close={() => setSaving(false)}/>;
  }
  else if (isExporting) {
    return <GoogleDocExportModal close={() => setExporting(false)} sheetID={sheetID}/>;
  }
  return (
        <DropdownMenu menu_icon={"/static/icons/ellipses.svg"}>
          <DropdownMenuItem>
            <SaveButtonWithText
                historyObject={historyObjectForSheet}
                onClick={() => setSaving(true)}
            />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <GoogleDocExportButton sheetID={sheetID} onClick={() => setExporting(true)}/>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CopyButton onClick={() => setCopying(true)}/>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <DropdownMenuItemWithIcon icon={"/static/img/share.svg"}
                                      textEn={'Share'}
                                      textHe={'שיתוף'}
                                      descEn={""}
                                      descHe={""}
                                      onClick={() => setSharing(true)}/>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <DropdownMenuItemWithIcon icon={"/static/icons/collection.svg"}
                                      textEn={'Edit Collections'}
                                      textHe={'צירוף לאסופה'}
                                      descEn={""}
                                      descHe={""}
                                      onClick={() => setAdding(true)}/>
          </DropdownMenuItem>
        </DropdownMenu>
    );
}
const ShareModal = ({sheetID, close}) => {
  return <Modal isOpen={true} close={close}>
          <ShareBox
              sheetID={sheetID}
              url={window.location.href}
          />
        </Modal>;
}
const EditCollectionsModal = ({close, sheetID}) => {
  return <Modal isOpen={true} close={close}>
            <CollectionsWidget sheetID={sheetID} close={close} />
        </Modal>;
}

const CopyButton = ({onClick}) => {
  return <>
          <ToolsButton
              en={"Copy"}
              he={"העתקה"}
              image="copy.png"
              onClick={() => onClick()} />
        </>
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

const GenericSheetModal = ({title, message, close}) => {
  return <Modal isOpen={true} close={close}>
            <div className="modalTitle">{title}</div>
            <div className="modalMessage">{message}</div>
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
  return <div>
            <ToolsButton en={googleDriveText.en}
                         he={googleDriveText.he}
                         image="googledrive.svg"
                         onClick={() => onClick()} />
          </div>;
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
        url: "/api/sheets/" + sheet.id + "/export_to_drive",
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

export {SheetOptions};