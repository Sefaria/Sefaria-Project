import React, {useEffect, useState} from "react";
import {DropdownMenu, DropdownMenuItem, DropdownMenuItemWithIcon} from "../common/DropdownMenu";
import {InterfaceText, SaveButton, SaveButtonWithText} from "../Misc";
import Modal from "../shared/modal";
import {ShareBox, ToolsButton} from "../ConnectionsPanel";
import Sefaria from "../sefaria/sefaria";
import $ from "../sefaria/sefariaJquery";
import {SignUpModalKind} from "../sefaria/signupModalContent";
import {CollectionsWidget} from "../CollectionsWidget";

const SheetOptions = ({historyObject, toggleSignUpModal, sheetID}) => {
  const [isSharing, setSharing] = useState(false); // Share Modal open or closed
  const [isAdding, setAdding] = useState(false);  // Edit Collections Modal open or closed
  const [isCopying, setCopying] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [isExporting, setExporting] = useState(false);
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
    return <SaveModal historyObject={historyObject} toggleSignUpModal={toggleSignUpModal} close={() => setSaving(false)}/>;
  }
  return (
        <DropdownMenu toggle={"..."}>
          <DropdownMenuItem>
            <SaveButtonWithText
                historyObject={historyObject}
                toggleSignUpModal={toggleSignUpModal}
                onClick={() => setSaving(true)}
            />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <GoogleDocExportButton sheetID={sheetID} toggleSignUpModal={toggleSignUpModal}/>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CopyButton toggleSignUpModal={toggleSignUpModal}
                        onCopy={() => setCopying(true)}/>
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

const CopyButton = ({toggleSignUpModal, onCopy}) => {
  const copySheet = async () => {
    if (!Sefaria._uid) {
      toggleSignUpModal(SignUpModalKind.AddToSheet);
    } else {
      onCopy();
    }
  }
  return <>
          <ToolsButton
              en={"Copy"}
              he={"העתקה"}
              image="copy.png"
              onClick={() => copySheet()} />
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
    return <>Success! <a className="copySuccessMessage" href={`/sheets/${copiedSheetId}`} target='_blank'>
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

  return <Modal isOpen={true} close={handleClose}>
            <div className="modalTitle">Copy</div>
            <div className="modalMessage">{copyMessage}</div>
        </Modal>;
}

const SaveModal = ({historyObject, toggleSignUpModal, close}) => {
  const isSaved = !!Sefaria.getSavedItem(historyObject);
  const savingMessage = "Saving...";
  const [message, setMessage] = useState(savingMessage);
  const savedMessage = isSaved ? "Sheet no longer saved." : "Saved sheet.";
  useEffect(() => {
    if (message === savingMessage) {
      Sefaria.toggleSavedItem(historyObject)
          .catch(e => {
            if (e === 'notSignedIn') {
              toggleSignUpModal(SignUpModalKind.Save);
            }
          })
          .finally(() => {
            setMessage(savedMessage);
          });
    }
  });
  return <Modal isOpen={true} close={close}>
            <div className="modalTitle">Save</div>
            <div className="modalMessage">{message}</div>
        </Modal>;
}

const GoogleDocExportButton = ({ toggleSignUpModal, sheetID }) => {
  const googleDriveState = {
    export: { en: "Export to Google Docs", he: "ייצוא לגוגל דוקס" },
    exporting: {en: "Exporting to Google Docs...", he: "מייצא לגוגל דוקס...", greyColor: true},
    exportComplete: { en: "Export Complete", he: "ייצוא הסתיים", secondaryEn: "Open in Google", secondaryHe: "לפתיחה בגוגל דוקס", greyColor: true}
  }
  const urlHashObject = Sefaria.util.parseHash(Sefaria.util.parseUrl(window.location).hash).afterLoading;
  const [googleDriveText, setGoogleDriveText] = urlHashObject === "exportToDrive" ? useState(googleDriveState.exporting) : useState(googleDriveState.export);
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
  }, [googleDriveText])
  const googleDriveExport = () => {
    // $("#overlay").show();
    // sjs.alert.message('<span class="int-en">Syncing with Google Docs...</span><span class="int-he">מייצא לגוגל דרייב...</span>');
    if (!Sefaria._uid) {
      toggleSignUpModal();
    }
    else if (googleDriveText.en === googleDriveState.exportComplete.en) {
      Sefaria.util.openInNewTab(googleDriveLink);
    } else {
      Sefaria.track.sheets("Export to Google Docs");
      setGoogleDriveText(googleDriveState.exporting);
    }
  }
  return <div>
            <ToolsButton en={googleDriveText.en} he={googleDriveText.he} greyColor={!!googleDriveText.secondaryEn || googleDriveText.greyColor} secondaryEn={googleDriveText.secondaryEn} secondaryHe={googleDriveText.secondaryHe} image="googledrive.svg" onClick={() => googleDriveExport()} />
          </div>;
}


export {SheetOptions};