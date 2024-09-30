import {FollowButton, InterfaceText, ProfilePic} from "../Misc";
import Sefaria from "../sefaria/sefaria";
import React, {useEffect, useState} from "react";
import {ProfileSummary} from "../UserProfile";
const SheetSidebar = ({authorImage, authorStatement, authorUrl, toggleSignUpModal, collections}) => {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    useEffect(() => {
        Sefaria.profileAPI(authorUrl.replace("/profile/", "")).then(profile => {
            setProfile(profile);
            setLoading(false);
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
        {!loading && <ProfileSummary profile={profile} showFollowersAndFollowing={false} toggleSignUpModal={toggleSignUpModal} />}
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