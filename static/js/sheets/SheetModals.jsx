import Modal from "../common/modal";
import { ShareBox } from "../ConnectionsPanel";
import { CollectionsWidget } from "../CollectionsWidget";
import { AddToSourceSheetBox } from "../AddToSourceSheet";
import React, {useContext, useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import { InterfaceText } from "../Misc";

import ReactTags from "react-tag-autocomplete";
import {layoutOptions} from "../constants";
import {ReaderPanelContext} from "../context";

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
    delete newSheet.ownerImageUrl;
    delete newSheet.ownerProfileUrl;
    delete newSheet.ownerOrganization;
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
              <a className="successMessage" href={`/sheets/${copiedSheetId}`} data-target-module={Sefaria.VOICES_MODULE} target='_blank'>
              <InterfaceText>View your Copy</InterfaceText>
              </a>
          </>;
  }
  const handleClose = () => {
    if (copyText.en !== copyState.copying.en) { // don't allow user to close modal while copying is taking place
      setLoaded(false);  // allow for another copy attempt
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

  const currentlySaving = () => message === savingMessage;

  const handleClose = () => {
    if (!currentlySaving())
    {
      close();
    }
  }

  useEffect(() => {
    if (currentlySaving()) {
      Sefaria.toggleSavedItem(historyObject)
          .finally(() => {
            setMessage(savedMessage);
          });
    }
  });
  return <GenericSheetModal title={<InterfaceText>Save</InterfaceText>} message={<InterfaceText>{message}</InterfaceText>} close={handleClose}/>;
}

// Error messages for different Google OAuth failure scenarios
const GAUTH_ERROR_MESSAGES = {
  access_denied: {
    en: "You declined permission to connect with Google. Export requires Google Drive access.",
    he: "סירבת לתת הרשאה להתחבר לגוגל. הייצוא דורש גישה ל-Google Drive."
  },
  invalid_grant: {
    en: "The authorization expired or was already used. Please try again.",
    he: "ההרשאה פגה או כבר נוצלה. אנא נסה שוב."
  },
  scope_mismatch: {
    en: "There was a permission mismatch. Please try again.",
    he: "הייתה אי התאמה בהרשאות. אנא נסה שוב."
  },
};

const GoogleDocExportModal = ({ sheetID, close }) => {
  const googleDriveState = {
    exporting: {en: "Exporting to Google Docs...", he: "מייצא לגוגל דוקס..."},
    exportComplete: {en: "Success!", he: "ייצוא הסתיים"}
  }
  const {language, layout} = useContext(ReaderPanelContext);
  const [googleDriveText, setGoogleDriveText] = useState(googleDriveState.exporting);
  const [googleDriveLink, setGoogleDriveLink] = useState("");

  const currentlyExporting = () => googleDriveText.en === googleDriveState.exporting.en;
  const exportToDrive = async () => {
    if (currentlyExporting()) {
      // Parse the hash to check for gauth_error (error is passed in fragment to avoid makeHistoryState issues)
      const hashParams = Sefaria.util.parseHash(window.location.hash);
      const gauthError = hashParams.gauth_error;
      
      if (gauthError) {
        // Found a gauth_error in the hash, get the appropriate error message
        // Remove gauth_error from hash, keeping other hash params like afterLoading
        delete hashParams.gauth_error;
        const remainingHash = Object.entries(hashParams)
          .map(([k, v]) => `${k}=${v}`)
          .join('&');
        const newHash = remainingHash ? '#' + remainingHash : '';
        history.replaceState("", document.title, window.location.pathname + window.location.search + newHash);
        const errorMessage = GAUTH_ERROR_MESSAGES[gauthError];
        setGoogleDriveText(errorMessage);
      }
      else {
        // No gauth_error parameter, so proceed with export
        history.replaceState("", document.title, window.location.pathname + window.location.search); // remove exportToDrive hash once it's used to trigger export
        try {
          const response = await Sefaria.apiRequestWithBody(`/api/sheets/${sheetID}/export_to_drive?language=${language}&layout=${layout}`, null, {}, "POST", false);
          if (response.status === 401) {
            // couldn't authenticate, so forward to google authentication
            window.location.href = `/gauth?next=${encodeURIComponent(window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + "#afterLoading=exportToDrive")}`;
            return;
          }
          const data = await response.json();
          if ("error" in data) {
            setGoogleDriveText(Sefaria._(data.error.message));
          } else {
            // Export succeeded
            setGoogleDriveLink(data.webViewLink);
            setGoogleDriveText(googleDriveState.exportComplete);
          }
        } catch (error) {
          setGoogleDriveText({
            en: "A network error occurred. Please check your connection and try again.",
            he: "אירעה שגיאת רשת. אנא בדוק את החיבור שלך ונסה שוב."
          });
        }
      }
    }
  }

  useEffect(() => {
    exportToDrive();
  }, [googleDriveText]);
  const getExportMessage = () => {
    if (currentlyExporting()) {
      return <InterfaceText text={googleDriveText}/>;
    } else if (googleDriveLink) {
      // Success - show link
      return <>
        <InterfaceText text={googleDriveText}/>&nbsp;
        <a href={googleDriveLink} target="_blank" className="successMessage"><InterfaceText>View in Google
          Docs</InterfaceText></a>
      </>
    } else {
      // Error - just show the error message, no link
      return <InterfaceText text={googleDriveText}/>;
    }
  }
  const handleClose = () => {
    if (!currentlyExporting()) {
      close();
    }
  }
  return <GenericSheetModal title={<InterfaceText>Export</InterfaceText>}
                            message={getExportMessage()}
                            close={handleClose}/>;
}

const DeleteModal = ({close, sheetID, authorUrl}) => {
  useEffect( () => {
    Sefaria.sheets.deleteSheetById(sheetID).then(() => {
      window.location.href = authorUrl;
    });
  });
  return <GenericSheetModal title={<InterfaceText>Deleting...</InterfaceText>} close={() => {}}/>; // don't allow user to close modal while deleting
}

export { ShareModal, CollectionsModal, AddToSourceSheetModal, CopyModal, SaveModal, GoogleDocExportModal, DeleteModal};