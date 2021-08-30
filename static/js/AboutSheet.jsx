import React, { useState, useEffect, useContext } from 'react';

const AboutSheet = (props) => {

    const [title, setTitle] = useState(null);

    useEffect(() => {
        const sheet = Sefaria.sheets.loadSheetByID(props.masterPanelSheetId)
        setTitle(sheet.title.stripHtmlConvertLineBreaks());
    })
    return(<div>
        <h2 className="aboutHeader">{title}</h2>
    </div>)

}


export default AboutSheet;