import React, { useRef, useState } from 'react';
import Sefaria from '../sefaria/sefaria';
import {InterfaceText} from "../Misc";

export const TopicLandingNewsletter = () => {
    const firstNameRef = useRef();
    const lastNameRef = useRef();
    const emailRef = useRef();
    const [subscribeMessage, setSubscribeMessage] = useState(null);
    const [subscribeErrorMessage, setSubscribeErrorMessage] = useState(null);

    function handleSubscribeKeyUp(e) {
        if (e.keyCode === 13) {
            handleSubscribe();
        }
    }

    function validateInputs() {
        if (firstNameRef.current?.value.length === 0 || lastNameRef.current?.value.length === 0) {
            setSubscribeMessage(Sefaria._("Please enter a valid first and last name"));
            return false;
        }
        if (!Sefaria.util.isValidEmailAddress(emailRef.current?.value)) {
            setSubscribeMessage("Please enter a valid email address.");
            return false;
        }
        return true;
    }

    function handleSubscribe() {
        if (!validateInputs()) { return; }
        setSubscribeMessage("Subscribing...");
        Sefaria.subscribeSefariaNewsletter(firstNameRef.current?.value, lastNameRef.current?.value, emailRef.current?.value, false, []).then(res => {
            setSubscribeMessage("Subscribed! Welcome to our list.");
        }).catch(error => {
            setSubscribeErrorMessage(error?.message || "Sorry, there was an error.");
            setSubscribeMessage(null);
        });
    }
    return (
        <div className="topic-landing-newsletter-wrapper">
            <div className="topic-landing-newsletter">
                <h3 className="topic-landing-newsletter-text">
                    <InterfaceText>Stay curious. Sign up for our free Topic of the Week Newsletter.</InterfaceText>
                </h3>
                <div className="topic-landing-newsletter-input-wrapper">
                    <div className="topic-landing-newsletter-input-row">
                        <input
                            type="text"
                            placeholder={Sefaria._("First Name")}
                            ref={firstNameRef}
                            onKeyUp={handleSubscribeKeyUp}
                        />
                        <input
                            type="text"
                            placeholder={Sefaria._("Last Name")}
                            ref={lastNameRef}
                            onKeyUp={handleSubscribeKeyUp}
                        />
                    </div>
                    <div className="topic-landing-newsletter-input-row">
                        <input
                            type="text"
                            placeholder={Sefaria._("Email Address")}
                            ref={emailRef}
                            onKeyUp={handleSubscribeKeyUp}
                        />
                        <button type="submit" onKeyUp={handleSubscribeKeyUp} onClick={handleSubscribe}>Sign Up</button>
                    </div>
                    <div className="topic-landing-newsletter-input-row">
                        {subscribeMessage ?
                            <div className="subscribeMessage">{Sefaria._(subscribeMessage)}</div>
                            : null}
                    </div>
                </div>
            </div>
            <div className="">
                {subscribeErrorMessage ?
                    <div className="subscribeErrorMessage">{Sefaria._(subscribeErrorMessage)}</div>
                    : null}
            </div>
        </div>
    );
};