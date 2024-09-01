import {CollectionStatement, FollowButton, InterfaceText, ProfilePic} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import React, {useEffect, useState} from "react";

const SheetSidebar = ({authorID, authorImage, authorStatement, authorUrl,
                      collectionImage, collectionSlug, collectionName}) => {
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
                {!loading && <div className="sheetFollowers">{followers} followers</div>}
                <FollowButton
                    large={true}
                    uid={authorID}
                    following={Sefaria.following.indexOf(authorID) > -1}
                />
                <CollectionStatement
                    name={collectionName}
                    slug={collectionSlug}
                    image={collectionImage}
                />
        </div>;
}
export default SheetSidebar;