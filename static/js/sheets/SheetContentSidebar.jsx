import { FollowButton, InterfaceText } from "../Misc";
import { ProfilePic } from "../ProfilePic";
import Sefaria from "../sefaria/sefaria";
import {ProfilePic} from "../ProfilePic";
import React, { useEffect, useState } from "react";
import { UserBackground } from "../UserProfile";

const SheetContentSidebar = ({authorImage, authorStatement, authorUrl, toggleSignUpModal, collections, topics}) => {
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
            {topics.length > 0 && <SheetSidebarList items={topics} type={"topics"}/>}
            {collections.length > 0 && <SheetSidebarList items={collections} type={"collections"}/>}
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
const SheetSidebarList = ({items, type}) => {
    const title = type === "topics" ? "Topics" : "Part of Collections";
    const styleClass = type === "topics" ? "sheetTopicsList" : "sheetCollectionsList";
    const renderItems = () => {
      if (type === "topics") {
        return items.map((item, i) => (
            <li key={i}><a
                href={"/topics/" + item.slug}><InterfaceText text={{en: item.en, he: item.he}}></InterfaceText></a>
            </li>
        ))
      } else {
        return items.map((item, i) => (
            <li key={i}><a
                href={"/collections/" + item.slug}><InterfaceText>{item.name}</InterfaceText></a>
            </li>
        ))
      }
    }
    return <div>
              <h3><InterfaceText>{title}</InterfaceText></h3>
              <div className={styleClass}>
                  <ul>
                    {renderItems()}
                  </ul>
              </div>
          </div>;
}
export default SheetContentSidebar;
