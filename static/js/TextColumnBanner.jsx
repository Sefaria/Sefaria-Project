import React, {useState} from "react";
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import {
    CloseButton, InterfaceText, EnglishText, HebrewText
} from './Misc';

const cookie = Sefaria._inBrowser ? $.cookie : Sefaria.util.cookie;
const { translation_language_preference_suggestion } = Sefaria;

export const TextColumnBannerChooser = ({ setTranslationLanguagePreference, openTranslations, transCallToActionApplies }) => {
    const [bannerAccepted, setBannerAccepted] = useState(false);
    const shouldTransPrefBannerRender = () => {
        // we haven't suggested yet and we have a suggestion
        return !cookie("translation_language_preference_suggested") && translation_language_preference_suggestion
    };
    const shouldTransCallToActionRender = () => {
        return transCallToActionApplies() && !cookie("translation_call_to_action_shown"); // && textMode in (bilingual, english) && category in (Tanakh, Mishnah, Bavli)
    }
    if (shouldTransPrefBannerRender())  {
        return (<TransLangPrefBanner
            setAccepted={setBannerAccepted}
            setTranslationLanguagePreference={setTranslationLanguagePreference}
        />);
    } else if (bannerAccepted) {
        return <TransLangPrefAcceptedBanner />;
    }
    if (shouldTransCallToActionRender()) {
        return <TransCallToActionBanner openTranslations={openTranslations} />;
    }
    return null;
};


const TransLangPrefAcceptedBanner = () => {
    const lang = Sefaria.translateISOLanguageCode(translation_language_preference_suggestion);
    const textElement = (
        <InterfaceText>
            <EnglishText> Thanks! We'll show you {lang} translations first when we have them. </EnglishText>
            <HebrewText>תודה! כשנוכל, נציג לכם תרגומים בשפה ה<span className="bold">{Sefaria._(lang)}</span> כאשר אלו יהיו זמינים. </HebrewText>
        </InterfaceText>
    );
    return (
        <TextColumnBanner textElement={textElement} />
    );
}


const TransLangPrefBanner = ({ setAccepted, setTranslationLanguagePreference }) => {
    const reject = () => {
        cookie("translation_language_preference_suggested", JSON.stringify(1), {path: "/"});
        Sefaria.editProfileAPI({settings: {translation_language_preference_suggested: true}});
    }
    const accept = () => {
        setAccepted(true);
        setTranslationLanguagePreference(translation_language_preference_suggestion);
    }
    const lang = Sefaria.translateISOLanguageCode(translation_language_preference_suggestion);
    const textElement = (
        <InterfaceText>
            <EnglishText> Prefer to see <span className="bold"> {lang} </span> translations when available? </EnglishText>
            <HebrewText>האם תעדיפו לראות תרגומים בשפה ה<span className="bold">{Sefaria._(lang)}</span> כאשר הם זמינים?</HebrewText>
        </InterfaceText>
    );
    const buttons = [{text: "Yes", onClick: accept}, {text: "No", onClick: reject, sideEffect: "close" }];

    return (
        <TextColumnBanner textElement={textElement} buttons={buttons} onClose={reject}/>
    );
}


const TransCallToActionBanner = ({ openTranslations }) => {
    const textElement = (
        <InterfaceText>
            <EnglishText> Want to <span className="bold">change</span> the translation?</EnglishText>
            <HebrewText> Want to <span className="bold">change</span> the translation?</HebrewText>
        </InterfaceText>
    );
    const buttons = [
        {
            text: "Go to translations",
            onClick: () => {
                openTranslations();
                // setConnectionsMode("Translations");
            }
    }];
    const reject = () => {};
    return (
        <TextColumnBanner textElement={textElement} buttons={buttons} onClose={reject} />
    );
};



/**
 * Banner which appears right above text column and informs a user of an action they can take
 * @param textElement: React element to display the call-to-action text.
 * @param buttons: List of objects. Each object should have keys "text" and "onClick". Can optionally have key "sideEffect" whose value can be "close" if the button should close the banner.
 * @param onClose: Optional callback that gets called when the banner is closed.
 * @returns {JSX.Element|null}
 * @constructor
 */
const TextColumnBanner = ({ textElement, buttons, onClose }) => {
    const [closed, setClosed] = useState(false);
    const closeBanner = () => {
        setClosed(true);
        onClose?.();
    };
    if (closed) { return null; }
    return (
        <div className="readerControls transLangPrefSuggBann">
            <div className="readerControlsInner transLangPrefSuggBannInner sans-serif">
                <div className="transLangPrefCentered">
                    { textElement }
                    <div className="yesNoGroup">
                        { buttons?.map(button => <TextColumnBannerButton key={button.text} button={button} setBannerClosed={setClosed}/>) }
                    </div>
                </div>
                <CloseButton onClick={closeBanner} />
            </div>
        </div>
    );
}

const TextColumnBannerButton = ({ button, setBannerClosed }) => {
    const onClick = () => {
        button.onClick();
        if (button.sideEffect === "close") { setBannerClosed(true); }
    }
    return (
        <a className="yesNoButton" onClick={onClick}>
            <InterfaceText>{button.text}</InterfaceText>
        </a>
    );
}
