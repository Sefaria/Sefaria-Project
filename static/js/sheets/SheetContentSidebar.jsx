import { FollowButton, InterfaceText } from "../Misc";
import { ProfilePic } from "../ProfilePic";
import Sefaria from "../sefaria/sefaria";
import React, { useEffect, useState } from "react";
import { UserBackground } from "../UserProfile";

const SheetContentSidebar = ({authorImage, authorStatement, authorUrl, toggleSignUpModal, collections}) => {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    useEffect(() => {
        Sefaria.profileAPI(authorUrl.replace("/profile/", "")).then(profile => {
            setProfile(profile);
            setLoading(false);
        })
    });
    const authorName = <a href={authorUrl} className="sheetAuthorName">
                                    {Sefaria._(authorStatement)}
                                </a>;
    return <div className="sheetContentSidebar">
            <ProfilePic
                url={authorImage}
                len={100}
                name={authorStatement}
            />
            {authorName}
            {!loading && <SheetProfileInfo profile={profile} toggleSignUpModal={toggleSignUpModal}/>}
            {<SheetCollectionsList collections={collections}/>}
    </div>;
}

const SheetProfileInfo = ({profile, toggleSignUpModal}) => {
    const profileFollowers = <div className="profileFollowers">
                                             <InterfaceText>{String(profile.followers.length)}</InterfaceText>&nbsp;
                                             <InterfaceText>followers</InterfaceText>
                                         </div>;
    return <span className="profile-summary">
             {profileFollowers}
             <UserBackground profile={profile} showBio={true}/>
             {Sefaria._uid !== profile.id && <FollowButton
                                                large={true}
                                                uid={profile.id}
                                                following={Sefaria.following.indexOf(profile.id) > -1}
                                                toggleSignUpModal={toggleSignUpModal}/>
             }
           </span>;
}
const SheetCollectionsList = ({collections}) => {
    return collections.length > 0 &&
                <div>
                    <h3 className="sheetCollections"><InterfaceText>Part of Collections</InterfaceText></h3>
                    <div>
                        <ul className="sheetCollectionsLinks">
                            {collections.map((collection, i) => (
                                <li key={i}><a
                                    href={"/collections/" + collection.slug}><InterfaceText>{collection.name}</InterfaceText></a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>;
}
export default SheetContentSidebar;
