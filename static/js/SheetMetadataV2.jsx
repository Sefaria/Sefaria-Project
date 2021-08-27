import React, { Component, useEffect, useState } from 'react';
import { ToolsButton } from './ConnectionsPanel.jsx';
import Sefaria from './sefaria/sefaria.js';

const SheetMetadataV2 = (props) => {

    const [tags, setTags] = useState([]);
    const [summary, setSummary] = useState("");
    const [status, setStatus] = useState("public");
    const [lastModified, setLastModified] = useState(null);

    useEffect(() => {
        const sheet = Sefaria.sheets.loadSheetByID(props.masterPanelSheetId);
        setTags(sheet.topics.map((topic, i) => ({
            id: i,
            name: topic["asTyped"],
            slug: topic["slug"]
        })));
        setSummary(sheet.summary);
        setLastModified(sheet.dateModified);
    }, []);


    return (<div><ToolsButton en="About this Sheet" he="תרגומים" image="about-text.svg" onClick={() => props.setConnectionsMode("AboutSheet")} />
        <ToolsButton en="Publish" he="תרגומים" image="publish.png" onClick={() => props.setConnectionsMode("Publish")} />
        <ToolsButton en="Copy" he="תרגומים" image="copy.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        <ToolsButton en="Add to Collection" he="תרגומים" image="add-to-collection.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        <ToolsButton en="Print" he="תרגומים" image="print.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        <ToolsButton en="Export to Google Docs" he="תרגומים" image="googledrive.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        {tags.toString()}
        {summary}
        {status}
        {lastModified}
    </div>
    )
}

// class SheetMetadataV2 extends Component {
//     constructor(props) {
//         super(props);
//     }

//     componentDidMount() {

//     }
//     render() {
//         return(<div>
//         Hi
//         {/* <ToolsButton en="About this Sheet" image="about-text.svg" onClick={() => console.log('clicked')} /> 
//         <ToolsButton en="Publish" image="about-text.svg" onClick={() => console.log('clicked')} />  */}
//         </div>)
//     }

//     loadSaved() {
//         Sefaria.getRefSavedHistory("Sheet " + props.id).then(data => {
//           const sheetSaves = [];
//           for (let hist of data) {
//             sheetSaves.push(hist["uid"]);
//           }
//           if (this._isMounted) {
//             this.setState({ sheetSaves });
//           }
//         });
//       }
// }

export default SheetMetadataV2;