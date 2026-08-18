import React, { useState, useEffect } from "react";
import Sefaria from "./sefaria/sefaria";
import { InterfaceText, CloseButton } from "./Misc";
import Cookies from "js-cookie";

const HAZAK_HALAKHA_REF = "Shulchan Arukh, Orach Chayim 139.11";

const HazakCelebration = ({ bookTitle, heBookTitle }) => {
    const cookieName = `hazak_seen_${bookTitle}`;
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (Cookies.get(cookieName) || !Sefaria._uid || !Sefaria.titleIsTorah(bookTitle)) {
            return;
        }
        Sefaria.checkBookCompletion(bookTitle).then(data => {
            if (data.complete) {
                setShow(true);
                Cookies.set(cookieName, "1", { path: "/", expires: 20 * 365 });
                gtag("event", "hazak_celebration", {
                    book: bookTitle,
                    feature_name: "Hazak Celebration"
                });
            }
        });
    }, [bookTitle]);

    if (!show) return null;

    return (
        <div className="hazakCelebration">
            <div className="hazakDecorationTop" />
            <div className="hazakContent">
                <CloseButton onClick={() => setShow(false)} />
                <div className="hazakText" dir="rtl">
                    חזק חזק ונתחזק
                </div>
                <div className="hazakTranslation">
                    Be strong, be strong, and may we be strengthened!
                </div>
                <div className="hazakBookName">
                    <InterfaceText text={{ en: bookTitle, he: heBookTitle }} />
                </div>
                <a
                    className="hazakSourceLink"
                    href={`/${Sefaria.normRef(HAZAK_HALAKHA_REF)}`}
                >
                    <InterfaceText
                        text={{
                            en: "Learn about this custom",
                            he: "למדו על המנהג"
                        }}
                    />
                </a>
            </div>
            <div className="hazakDecorationBottom" />
        </div>
    );
};

export default HazakCelebration;
