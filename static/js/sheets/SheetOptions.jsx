import React, {useEffect, useState} from "react";
import {DropdownMenu, DropdownMenuItem, DropdownMenuItemWithIcon} from "../common/DropdownMenu";
import {SaveButton} from "../Misc";
import Modal from "../shared/modal";
import {ShareBox, ToolsButton} from "../ConnectionsPanel";
import Sefaria from "../sefaria/sefaria";
import $ from "../sefaria/sefariaJquery";
import {SignUpModalKind} from "../sefaria/signupModalContent";

const SheetOptions = ({historyObject, toggleSignUpModal, sheetID}) => {
  const [isSharing, setSharing] = useState(false); // Share Modal open or closed
  const [isAdding, setAdding] = useState(false);  // Add to Collection Modal open or closed
  if (isSharing) {
    return <ShareModal sheetID={sheetID} isOpen={isSharing} close={() => setSharing(false)}/>;
  }
  else if (isAdding) {
    return <AddToCollectionsModal isOpen={isAdding} close={() => setAdding(false)}/>;
  }
  return (
    <DropdownMenu toggle={"..."}>
      <DropdownMenuItem>
        <SaveButton
            historyObject={historyObject}
            tooltip={true}
            toggleSignUpModal={toggleSignUpModal}
            shouldDisplayText={true}
        />
      </DropdownMenuItem>
      <DropdownMenuItem>
        <GoogleDocExportButton sheetID={sheetID} toggleSignUpModal={toggleSignUpModal}/>
      </DropdownMenuItem>
      <DropdownMenuItem>
        <CopyButton toggleSignUpModal={toggleSignUpModal} sheetID={sheetID}/>
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
                                  textEn={'Add to Collection'}
                                  textHe={'צירוף לאסופה'}
                                  descEn={""}
                                  descHe={""}
                                  onClick={() => setAdding(true)} />
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
const ShareModal = ({sheetID, isOpen, close}) => {
  return <Modal isOpen={true} close={close}>
          <ShareBox
              sheetID={sheetID}
              url={window.location.href}
          />
        </Modal>;
}
const AddToCollectionsModal = ({isOpen, close}) => {
  return <Modal isOpen={true} close={close}><SheetContentCollectionsEditor/></Modal>;

}

const CopyButton = ({toggleSignUpModal, sheetID}) => {
  const copyState = {
    copy: { en: "Copy", he: "העתקה" },
    copying: { en: "Copying...", he: "מעתיק..."},
    copied: { he: "צפייה בדף המקורות", en: "View Copy"},
    error: { en: "Sorry, there was an error.", he: "סליחה, ארעה שגיאה" }
  }
  const [copyText, setCopyText] = useState(copyState.copy);
  const [copiedSheetId, setCopiedSheetId] = useState(0);
  const sheet = Sefaria.sheets.loadSheetByID(sheetID);
  const filterAndSaveCopiedSheetData = (data) => {
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

    const postJSON = JSON.stringify(newSheet);
    $.post("/api/sheets/", { "json": postJSON }, (data) => {
      if (data.id) {
        setCopiedSheetId(data.id);
        setCopyText(copyState.copied);
      } else if ("error" in data) {
        setCopyText(copyState.error);
        console.log(data.error);
      }
    })
  }

  const copySheet = () => {
    if (!Sefaria._uid) {
      toggleSignUpModal(SignUpModalKind.AddToSheet);
    } else if (copyText.en === copyState.copy.en) {
      setCopyText(copyState.copying);
      filterAndSaveCopiedSheetData(sheet);
    } else if (copyText.en === copyState.copied.en) {
      window.location.href = `/sheets/${copiedSheetId}`
      // TODO: open copied sheet
    }
  }
  return <ToolsButton en={copyText.en} he={copyText.he} image="copy.png" greyColor={!!copyText.secondaryEn || copyText.greyColor} onClick={() => copySheet()} />;
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