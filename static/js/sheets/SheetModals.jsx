import Modal from "../common/modal";
import { ShareBox } from "../ConnectionsPanel";
import { CollectionsWidget } from "../CollectionsWidget";
import { AddToSourceSheetBox } from "../AddToSourceSheet";
import React, { useEffect, useState } from "react";
import Sefaria from "../sefaria/sefaria";
import { InterfaceText } from "../Misc";

const ShareModal = ({sheetID, close}) => {
  return <Modal close={close}>
          <ShareBox
              sheetID={sheetID}
              url={window.location.href}
          />
        </Modal>;
}

const CollectionsModal = ({close, sheetID, handleCollectionsChange, editable}) => {
  return <Modal close={close}>
            <CollectionsWidget
                sheetID={sheetID}
                close={close}
                handleCollectionsChange={handleCollectionsChange}/>
        </Modal>;
}

const AddToSourceSheetModal = ({nodeRef, srefs, close}) => {
  return <Modal close={close}><AddToSourceSheetBox nodeRef={nodeRef} srefs={srefs} hideGDocAdvert={true}/></Modal>
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
    return <><InterfaceText>Success!</InterfaceText>
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
  return <Modal close={close}>
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

const GoogleDocExportModal = ({ sheetID, close }) => {
  const googleDriveState = {
    exporting: {en: "Exporting to Google Docs...", he: "מייצא לגוגל דוקס..."},
    exportComplete: {en: "Success!", he: "ייצוא הסתיים"}
  }
  const [googleDriveText, setGoogleDriveText] = useState(googleDriveState.exporting);
  const [googleDriveLink, setGoogleDriveLink] = useState("");
  const exportToDrive = async () => {
    if (googleDriveText.en === googleDriveState.exporting.en) {
      history.replaceState("", document.title, window.location.pathname + window.location.search); // remove exportToDrive hash once it's used to trigger export
      try {
        const response = await Sefaria.apiRequestWithBody(`/api/sheets/${sheetID}/export_to_drive`, null, {}, "POST", false);
        if (response.status === 401) {
          // couldn't authenticate, so forward to google authentication
          window.location.href = `/gauth?next=${encodeURIComponent(window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + "#afterLoading=exportToDrive")}`;
          return;
        }
        const data = await response.json();
        if ("error" in data) {
          setGoogleDriveText(data.error.message);
        } else {
          // Export succeeded
          setGoogleDriveLink(data.webViewLink);
          setGoogleDriveText(googleDriveState.exportComplete);
        }
      } catch (error) {
        setGoogleDriveText(error);
      }
    }
  }

  useEffect(() => {
    exportToDrive();
  }, [googleDriveText]);
  const getExportMessage = () => {
    if (googleDriveText.en === googleDriveState.exporting.en) {
      return <InterfaceText text={googleDriveText}/>;
    } else {
      return <>
        <InterfaceText text={googleDriveText}/>&nbsp;
        <a href={googleDriveLink} target="_blank" className="successMessage"><InterfaceText>View in Google
          Docs</InterfaceText></a>
      </>
    }
  }
  return <GenericSheetModal title={<InterfaceText>Export</InterfaceText>}
                            message={getExportMessage()}
                            close={close}/>;
}

const DeleteModal = ({close, sheetID, authorUrl}) => {
  useEffect( () => {
    Sefaria.sheets.deleteSheetById(sheetID).then(() => {
      window.location.href = authorUrl;
    });
  });
  return <GenericSheetModal title={<InterfaceText>Deleting...</InterfaceText>} close={close}/>;
}

export { ShareModal, CollectionsModal, AddToSourceSheetModal, CopyModal, SaveModal, GoogleDocExportModal, DeleteModal };