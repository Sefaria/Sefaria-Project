import React, {useState} from 'react';
import Sefaria from './sefaria/sefaria';

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

    function handleSubscribeKeyUp(e) {
        if (e.keyCode === 13) {
            handleSubscribe();
        }
    }

    function handleSubscribe() {
        if (showNameInputs === true) { // submit
            if (firstName.length > 0 && lastName.length > 0) {
                setSubscribeMessage("Subscribing...");
                subscribe(firstName, lastName, email, educatorCheck, additionalNewsletterMailingLists).then(res => {
                    setSubscribeMessage("Subscribed! Welcome to our list.");
                    Sefaria.track.event("Newsletter", "Subscribe from " + contextName, "");
                }).catch(error => {
                    setSubscribeMessage(error?.message || "Sorry, there was an error.");
                    setShowNameInputs(false);
                });
            } else {
                setSubscribeMessage("Please enter a valid first and last name");
            }
        } else if (Sefaria.util.isValidEmailAddress(email)) {
            setShowNameInputs(true);
        } else {
            setShowNameInputs(false);
            setSubscribeMessage("Please enter a valid email address.");
        }
    }

    return (
        <div className="newsletterSignUpBox">
      <span className="int-en">
        <input
            className="newsletterInput"
            placeholder={emailPlaceholder.en}
            aria-label="Email address"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyUp={handleSubscribeKeyUp}/>
      </span>
            <span className="int-he">
        <input
            className="newsletterInput"
            placeholder={emailPlaceholder.he}
            aria-label="כתובת אימייל"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyUp={handleSubscribeKeyUp}/>
      </span>
            {!showNameInputs ? <img src="/static/img/circled-arrow-right.svg" alt="Submit" onClick={handleSubscribe}/> : null}
            {showNameInputs ?
                <><span className="int-en">
        <input
            className="newsletterInput firstNameInput"
            placeholder="First Name"
            aria-label="First Name"
            type="text"
            value={firstName}
            autoFocus
            onChange={e => setFirstName(e.target.value)}
            onKeyUp={handleSubscribeKeyUp}/>
      </span>
                    <span className="int-he">
        <input
            className="newsletterInput firstNameInput"
            placeholder="שם פרטי"
            aria-label="שם פרטי"
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            onKeyUp={handleSubscribeKeyUp}/>
      </span>
                    <span className="int-en">
        <input
            className="newsletterInput"
            placeholder="Last Name"
            aria-label="Last Name"
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            onKeyUp={handleSubscribeKeyUp}/>
      </span>
                    <span className="int-he">
        <input
            className="newsletterInput"
            placeholder="שם משפחה"
            aria-label="שם משפחה"
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            onKeyUp={handleSubscribeKeyUp}/>
      </span>
                    {includeEducatorOption ?
                        <EducatorCheckbox educatorCheck={educatorCheck} setEducatorCheck={setEducatorCheck}/> : null}
                    <img src="/static/img/circled-arrow-right.svg" alt="Submit" onClick={handleSubscribe}/>
                </>
                : null}
            {subscribeMessage ?
                <div className="subscribeMessage">{Sefaria._(subscribeMessage)}</div>
                : null}
        </div>
    );
}


const EducatorCheckbox = ({educatorCheck, setEducatorCheck}) => {
    return (
        <div className="newsletterEducatorOption">
          <span className="int-en">
            <input
                type="checkbox"
                className="educatorNewsletterInput"
                checked={educatorCheck}
                onChange={e => setEducatorCheck(!!e.target.checked)}/>
            <span> I am an educator</span>
          </span>
            <span className="int-he">
            <input
                type="checkbox"
                className="educatorNewsletterInput"
                checked={educatorCheck}
                onChange={e => setEducatorCheck(!!e.target.checked)}/>
            <span> מורים/ אנשי הוראה</span>
          </span>
        </div>
    );
};
