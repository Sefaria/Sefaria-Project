import {FollowButton, InterfaceText, ProfilePic} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import React, {useEffect, useState} from "react";
const SheetSidebar = ({authorID, authorImage, authorStatement, authorUrl, summary,
                      collectionImage, collectionSlug, collectionName, collections}) => {
    const [loading, setLoading] = useState(true);
    const [followers, setFollowers] = useState(0);
    useEffect(() => {
        Sefaria.followAPI(authorUrl.replace("/profile/", ""), "followers").then(data => {
            setFollowers(data.length);
            setLoading(false);
        })
    });
    return <div className="sheetSidebar">
                <ProfilePic
                    url={authorImage}
                    len={100}
                    name={authorStatement}
                    outerStyle={{"display": "block", "margin-block-end": "20px"}}
                />
                <a href={authorUrl} className="sheetAuthorName">
                    <InterfaceText>{authorStatement}</InterfaceText>
                </a>
                <div className="description">{summary}</div>
                {!loading && <div className="sheetFollowers">{followers} {Sefaria._("followers")}</div>}
                <FollowButton
                    large={true}
                    uid={authorID}
                    following={Sefaria.following.indexOf(authorID) > -1}
                />
                {collections.length > 0 &&
                <div className="aboutLinks">
                    <h3 className="aboutSheetHeader"><InterfaceText>Public Collections</InterfaceText></h3>
                    <div>
                        <ul className="aboutSheetLinks">
                            {collections.map((collection, i) => (
                                <li key={i}><a href={"/collections/" + collection.slug}><InterfaceText>{collection.name}</InterfaceText></a></li>
                            ))}
                        </ul>
                    </div>
                </div>}
                {/*<NavSidebar modules={sidebarModules} />*/}
        </div>;
}
export default SheetSidebar;