import {CollectionStatement, FollowButton, InterfaceText, ProfilePic} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import React from "react";

const SheetSidebar = ({authorID, authorImage, authorStatement, authorUrl,
                      collectionImage, collectionSlug, collectionName}) => {
    return <div className="sheetSidebar">
                <ProfilePic
                    url={authorImage}
                    len={100}
                    name={authorStatement}
                />
                <a href={authorUrl} className="sheetAuthorName">
                    <InterfaceText>{authorStatement}</InterfaceText>
                </a>
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