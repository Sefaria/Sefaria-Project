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
            console.log('Error', reason.isCanceled ? 'canceled' : reason);
        });
        return () => {
            getRefSavedHistory.cancel();
        };
    }, [masterPanelSheetId]);
    return (<div className="aboutSheetPanel">
    <div className="aboutSheetTopHeaders">
        <h2 className="aboutHeader">{title}</h2>
        <h3 className="aboutSheetSubtitle">Sheet</h3>
    </div>
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
        <div className="aboutSheetMetadata">
            <div>Created: {Sefaria.util.localeDate(sheet.dateCreated)}</div>
            <div>{sheet.views} views, {sheetSaves.length} Saves</div>
            {sheet.status !== 'public' ? (<div><span className="unlisted"><img src="/static/img/eye-slash.svg"/><span>{Sefaria._("Not Published")}</span></span></div>) : undefined}
        </div>
        {sheet.collections.length > 0 ?
            <div className="aboutLinks">
                <h3 className="aboutSheetHeader"><InterfaceText>Collections</InterfaceText></h3>
                <hr/>
                <div>
                <ul className="aboutSheetLinks">
                {sheet.collections.map((collection, i) => (
                    <li key={i}><a href={"/collections/"+collection.slug}><InterfaceText>{collection.name}</InterfaceText></a></li>
                ))}
                </ul>
                </div>
            </div> : null

        }

        {sheet.topics && sheet.topics.length > 0 ?
                    <div className="readings">
                      <h3 className="aboutSheetHeader"><InterfaceText>Topics</InterfaceText></h3>
                      <hr/>
                      <div>
                      <ul className="aboutSheetLinks">
                      {sheet.topics.map((topic, i) => (
                            <li key={i}><a href={"/topics/" + topic.slug}
                              target="_blank"

                            >
                              <InterfaceText text={{en:topic.en, he:topic.he}} />
                            </a></li>
                          ))
                        }
                      </ul>
                      </div>
                    </div> : null }
    </div>
    )

}

export default AboutSheet;
