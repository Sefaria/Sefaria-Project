import {FollowButton, InterfaceText, ProfilePic} from "../Misc";
import Sefaria from "../sefaria/sefaria";
import React, {useEffect, useState} from "react";
import {ProfileBio} from "../UserProfile";
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
            {!loading && <SheetProfileInfo profile={profile}/>}
            {<PartOfCollections collections={collections}/>}
    </div>;
}

const SheetProfileInfo = ({profile}) => {
    const profileFollowers = <div className="profileFollowers">
                                             <InterfaceText>{String(profile.followers.length)}</InterfaceText>&nbsp;
                                             <InterfaceText>followers</InterfaceText>
                                         </div>;
    return <span className="profile-summary">
             {profileFollowers}
             <ProfileBio profile={profile}/>
             {Sefaria._uid !== profile.id && <FollowButton
                                                large={true}
                                                uid={profile.id}
                                                following={Sefaria.following.indexOf(profile.id) > -1}/>
             }
           </span>;
}
const PartOfCollections = ({collections}) => {
    return collections.length > 0 &&
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
                </div>;
}
export default SheetContentSidebar;