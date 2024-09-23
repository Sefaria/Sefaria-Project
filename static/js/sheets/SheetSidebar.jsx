import {FollowButton, InterfaceText, ProfilePic} from "../Misc";
import Sefaria from "../sefaria/sefaria";
import React, {useEffect, useState} from "react";
const SheetSidebar = ({authorID, authorImage, authorStatement, authorUrl, summary, collections}) => {
    const [loadingFollowers, setLoadingFollowers] = useState(true);
    const [followers, setFollowers] = useState(0);
    useEffect(() => {
        Sefaria.followAPI(authorUrl.replace("/profile/", ""), "followers").then(data => {
            setFollowers(data.length);
            setLoadingFollowers(false);
        })
    });
    return <div className="sheetSidebar">
        <ProfilePic
            url={authorImage}
            len={100}
            name={authorStatement}
        />
        <a href={authorUrl} className="sheetAuthorName">
            {Sefaria._(authorStatement)}
        </a>
        {!loadingFollowers && <div className="sheetFollowers">{followers} {Sefaria._("followers")}</div>}
        <div className="summary">{summary}</div>
        <FollowButton
            large={true}
            uid={authorID}
            following={Sefaria.following.indexOf(authorID) > -1}
        />
        {collections.length > 0 &&
            <div>
                <h3 className="aboutSheetHeader"><InterfaceText>Part of Collections</InterfaceText></h3>
                <div>
                    <ul className="aboutSheetLinks">
                        {collections.map((collection, i) => (
                            <li key={i}><a
                                href={"/collections/" + collection.slug}><InterfaceText>{collection.name}</InterfaceText></a>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>}
        {/*<NavSidebar modules={sidebarModules} />*/}
    </div>;
}
export default SheetSidebar;