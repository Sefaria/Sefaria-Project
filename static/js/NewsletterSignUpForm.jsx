import React, {useState} from 'react';
import Sefaria from './sefaria/sefaria';
import Util from './sefaria/util';

export function NewsletterSignUpForm({
                                         contextName,
                                         includeEducatorOption = true,
                                         emailPlaceholder = {en: 'Sign up for Newsletter', he: "הרשמו לניוזלטר"},
                                         subscribe=Sefaria.subscribeSefariaNewsletter,  // function which sends form data to API to subscribe
                                         additionalNewsletterMailingLists = [],
                                     }) {
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [educatorCheck, setEducatorCheck] = useState(false);
    const [subscribeMessage, setSubscribeMessage] = useState(null);
    const [showNameInputs, setShowNameInputs] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isFormDisabled = isSubscribed || isSubmitting;

    function handleSubscribe() {
        if (isFormDisabled) {
            return;
        }
        if (showNameInputs === true) { // submit
            if (firstName.length > 0 && lastName.length > 0) {
                setSubscribeMessage("common.subscribing");
                setIsSubmitting(true);
                subscribe(firstName, lastName, email, educatorCheck, additionalNewsletterMailingLists).then(res => {
                    setIsSubscribed(true);
                    setIsSubmitting(false);
                    setSubscribeMessage("common.subscribed_welcome_to_our_list");
                    Sefaria.track.event("Newsletter", "Subscribe from " + contextName, "");
                }).catch(error => {
                    setIsSubmitting(false);
                    setSubscribeMessage(error?.message || "common.sorry_there_was_an_error");
                    setShowNameInputs(false);
                });
            } else {
                setSubscribeMessage("newsletter_sign_up_form.please_enter_a_valid_first_and_last_name");
            }
        } else if (Sefaria.util.isValidEmailAddress(email)) {
            setShowNameInputs(true);
        } else {
            setShowNameInputs(false);
            setSubscribeMessage("common.please_enter_a_valid_email_address");
        }
    }

    return (
        <div className="newsletterSignUpBox">
            <span className="int-en">
              <input
                  className="newsletterInput"
                  placeholder={emailPlaceholder.en}
                  aria-label={Sefaria._("newsletter_sign_up_form.email_address")}
                  type="email"
                  value={email}
                  disabled={isFormDisabled}
                  onChange={e => setEmail(e.target.value)}
                  onKeyUp={(e) => Util.handleEnterKey(e, handleSubscribe)}/>
            </span>
            <span className="int-he">
        <input
            className="newsletterInput"
            placeholder={emailPlaceholder.he}
            aria-label="כתובת אימייל"
            type="email"
            value={email}
            disabled={isFormDisabled}
            onChange={e => setEmail(e.target.value)}
            onKeyUp={(e) => Util.handleEnterKey(e, handleSubscribe)}/>
      </span>
            {!showNameInputs && !isFormDisabled ? <img src="/static/img/circled-arrow-right.svg" alt={Sefaria._("newsletter_sign_up_form.submit")} onClick={handleSubscribe}/> : null}
            {showNameInputs ?
                <><span className="int-en">
        <input
            className="newsletterInput firstNameInput"
            placeholder="First Name"
            aria-label={Sefaria._("common.first_name")}
            type="text"
            value={firstName}
            autoFocus
            disabled={isFormDisabled}
            onChange={e => setFirstName(e.target.value)}
            onKeyUp={(e) => Util.handleEnterKey(e, handleSubscribe)}/>
      </span>
                    <span className="int-he">
        <input
            className="newsletterInput firstNameInput"
            placeholder="שם פרטי"
            aria-label="שם פרטי"
            type="text"
            value={firstName}
            disabled={isFormDisabled}
            onChange={e => setFirstName(e.target.value)}
            onKeyUp={(e) => Util.handleEnterKey(e, handleSubscribe)}/>
      </span>
                    <span className="int-en">
        <input
            className="newsletterInput"
            placeholder="Last Name"
            aria-label={Sefaria._("common.last_name")}
            type="text"
            value={lastName}
            disabled={isFormDisabled}
            onChange={e => setLastName(e.target.value)}
            onKeyUp={(e) => Util.handleEnterKey(e, handleSubscribe)}/>
      </span>
                    <span className="int-he">
        <input
            className="newsletterInput"
            placeholder="שם משפחה"
            aria-label="שם משפחה"
            type="text"
            value={lastName}
            disabled={isFormDisabled}
            onChange={e => setLastName(e.target.value)}
            onKeyUp={(e) => Util.handleEnterKey(e, handleSubscribe)}/>
      </span>
                    {includeEducatorOption ?
                        <EducatorCheckbox educatorCheck={educatorCheck} setEducatorCheck={setEducatorCheck} disabled={isFormDisabled}/> : null}
                    {!isFormDisabled && <img src="/static/img/circled-arrow-right.svg" alt={Sefaria._("newsletter_sign_up_form.submit")} onClick={handleSubscribe}/>}
                </>
                : null}
            {subscribeMessage ?
                <div className="subscribeMessage">{Sefaria._(subscribeMessage)}</div>
                : null}
        </div>
    );
}


const EducatorCheckbox = ({educatorCheck, setEducatorCheck, disabled}) => {
    return (
        <div className="newsletterEducatorOption">
          <span className="int-en">
            <input
                type="checkbox"
                className="educatorNewsletterInput"
                id="educator-check-en"
                checked={educatorCheck}
                disabled={disabled}
                onChange={e => setEducatorCheck(!!e.target.checked)}/>
            <label htmlFor="educator-check-en"> I am an educator</label>
          </span>
            <span className="int-he">
            <input
                type="checkbox"
                className="educatorNewsletterInput"
                id="educator-check-he"
                checked={educatorCheck}
                disabled={disabled}
                onChange={e => setEducatorCheck(!!e.target.checked)}/>
            <label htmlFor="educator-check-he"> מורים/ אנשי הוראה</label>
          </span>
        </div>
    );
};
