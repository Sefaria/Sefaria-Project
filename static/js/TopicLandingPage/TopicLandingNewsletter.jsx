import React, { useState } from 'react';
import Sefaria from '../sefaria/sefaria';
import {InterfaceText} from "../Misc";

export const TopicLandingNewsletter = () => {
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [educatorCheck, setEducatorCheck] = useState(false);
    const [subscribeMessage, setSubscribeMessage] = useState("Hello this is a subscribe message");

    function handleSubscribeKeyUp(e) {
        if (e.keyCode === 13) {
            handleSubscribe();
        }
    }

    function validateInputs() {
        if (firstName.length === 0 || lastName.length === 0) {
            setSubscribeMessage(Sefaria._("Please enter a valid first and last name"));
            return false;
        }
        if (!Sefaria.util.isValidEmailAddress(email)) {
            setSubscribeMessage("Please enter a valid email address.");
            return false;
        }
        return true;
    }

    function handleSubscribe() {
        if (!validateInputs()) { return; }
        setSubscribeMessage("Subscribing...");
        Sefaria.subscribeSefariaNewsletter(firstName, lastName, email).then(res => {
            setSubscribeMessage("Subscribed! Welcome to our list.");
        }).catch(error => {
            setSubscribeMessage(error?.message || "Sorry, there was an error.");
        });
    }
    return (
        <div className="topic-landing-newsletter">
            <h3 className="topic-landing-newsletter-text">
                <InterfaceText>Stay curious. Sign up for our free Topic of the Week Newsletter.</InterfaceText>
            </h3>
            <div>
                <div className="topic-landing-newsletter-input-row">
                    <input
                        type="text"
                        placeholder={Sefaria._("First Name")}
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        onKeyUp={handleSubscribeKeyUp}
                    />
                    <input
                        type="text"
                        placeholder={Sefaria._("Last Name")}
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        onKeyUp={handleSubscribeKeyUp}
                    />
                </div>
                <div className="topic-landing-newsletter-input-row">
                    <input
                        type="text"
                        placeholder={Sefaria._("Email Address")}
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        onKeyUp={handleSubscribeKeyUp}
                    />
                    <button onKeyUp={handleSubscribeKeyUp}>Sign Up</button>
                </div>
                <div className="topic-landing-newsletter-input-row">
                    {subscribeMessage ?
                        <div className="subscribeMessage">{Sefaria._(subscribeMessage)}</div>
                        : null}
                </div>
            </div>
        </div>
    );
};