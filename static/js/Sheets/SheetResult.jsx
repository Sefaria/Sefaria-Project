import Sefaria from "../sefaria/sefaria";
import classNames from "classnames";
import {ColorBarBox, ProfilePic} from "../Misc";
import React from "react";

const SheetResult = ({href, handleSheetClick, clean_title, snippetMarkup, profile_url,
                     handleProfileClick, owner_name, owner_image}) => {
    const ownerIsHe = Sefaria.hebrew.isHebrew(owner_name);
    const titleIsHe = Sefaria.hebrew.isHebrew(clean_title);
    const snippetClasses = classNames({snippet: 1, en: snippetMarkup.lang === "en", he: snippetMarkup.lang === "he"});
    return <div className='result sheetResult'>
            <a href={href} onClick={handleSheetClick}>
                <div className={classNames({'result-title': 1, 'in-en': !titleIsHe, 'in-he': titleIsHe})}>
                    <span dir={titleIsHe ? "rtl" : "ltr"}>{clean_title}</span>
                </div>
                <ColorBarBox tref={"Sheet 1"}>
                    <div className={snippetClasses}>
                        <span dir={snippetMarkup.lang === 'he' ? "rtl" : "ltr"}
                              dangerouslySetInnerHTML={snippetMarkup.markup}></span>
                    </div>
                </ColorBarBox>
            </a>
            <div className="sheetData sans-serif">
                <a className="ownerData sans-serif" href={profile_url} onClick={handleProfileClick}>
                    <ProfilePic
                        url={owner_image}
                        name={owner_name}
                        len={30}
                    />
                    <span className={classNames({
                        'ownerName': 1,
                        'in-en': !ownerIsHe,
                        'in-he': ownerIsHe
                    })}>{owner_name}</span>
                </a>
            </div>
        </div>
}
export default SheetResult;