import { useState, useEffect } from "react";
import { SheetAuthorStatement, InterfaceText, ProfilePic } from "./Misc";
import Sefaria from "./sefaria/sefaria";
const AboutSheet = ({ masterPanelSheetId, toggleSignUpModal }) => {

    const sheet = Sefaria.sheets.loadSheetByID(masterPanelSheetId);
    const title = sheet.title.stripHtmlConvertLineBreaks();
    const [sheetSaves, setSheetSaves] = useState([]);
    const getRefSavedHistory = Sefaria.makeCancelable(Sefaria.getRefSavedHistory("Sheet " + masterPanelSheetId));
    useEffect(() => {
        getRefSavedHistory.promise.then(data => {
            for (let hist of data) {
                setSheetSaves([...sheetSaves, hist["uid"]]);
            }
        }).catch((reason) => {
            console.log('Error',reason.isCanceled ? 'canceled': reason);
        });
        return () => {
            getRefSavedHistory.cancel();
        };
    }, [masterPanelSheetId]);
    return (<div>
        <h2 className="aboutHeader">{title}</h2>
        <div>Sheet</div>
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
        {sheet.summary ? <div className="description" dangerouslySetInnerHTML={{ __html: sheet.summary }}></div> : null}
        <div>
            Created: {Sefaria.util.naturalTime(sheet.dateCreated, "en")}
            {sheet.views} views, {sheetSaves.length} saves.
        </div>
    </div>)

}

export default AboutSheet;
