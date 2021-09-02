import { useState, useEffect } from "react";

const AboutSheet = ({masterPanelSheetId}) => {

    const [title, setTitle] = useState(null);

    useEffect(() => {
        const sheet = Sefaria.sheets.loadSheetByID(masterPanelSheetId)
        setTitle(sheet.title.stripHtmlConvertLineBreaks());
    })
    return(<div>
        <h2 className="aboutHeader">{title}</h2>
    </div>)

}

export default AboutSheet;
