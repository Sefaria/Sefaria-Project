import React, { useRef, useState } from 'react';
import Sefaria from '../sefaria/sefaria';
import Util from '../sefaria/util';
import {InterfaceText} from "../Misc";

const NEWSLETTER_TEASER_TEXT = "Stay curious. Get the Timeless Topics newsletter every Tuesday."

const getNewsletterAnalyticsData = () => {
    const lang = Sefaria._getShortInterfaceLang();
    const newsletterName = Sefaria.getTopicLandingNewsletterMailingLists().join(", ");
    return {
        text: Sefaria._(NEWSLETTER_TEASER_TEXT),
        feature_name: "Newsletter Signup Form",
        version: lang,
        form_name: "newsletter_topics",
        form_destination: newsletterName,
    };
};

export const TopicLandingNewsletter = () => {
    const firstNameRef = useRef();
    const lastNameRef = useRef();
    const emailRef = useRef();
    const [subscribeMessage, setSubscribeMessage] = useState(null);
    const [subscribeErrorMessage, setSubscribeErrorMessage] = useState(null);

    function validateInputs() {
        if (firstNameRef.current?.value.length === 0 || lastNameRef.current?.value.length === 0) {
            setSubscribeMessage(Sefaria._("topic_landing_newsletter.please_enter_a_valid_first_and_last_name"));
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
        const mailingLists = Sefaria.getTopicLandingNewsletterMailingLists();
        Sefaria.subscribeSefariaNewsletter(firstNameRef.current?.value, lastNameRef.current?.value, emailRef.current?.value, false, mailingLists).then(res => {
            setSubscribeMessage("Subscribed! Welcome to our list.");
        }).catch(error => {
            setSubscribeErrorMessage(error?.message || "Sorry, there was an error.");
            setSubscribeMessage(null);
        });
    }
    return (
        <div className="topic-landing-newsletter-wrapper" data-anl-batch={JSON.stringify(getNewsletterAnalyticsData())}>
            <div className="topic-landing-newsletter">
                <h3 className="topic-landing-newsletter-text">
                    <InterfaceText>{NEWSLETTER_TEASER_TEXT}</InterfaceText>
                </h3>
                <div className="topic-landing-newsletter-input-wrapper" data-anl-event="form_start:inputStart">
                    <div className="topic-landing-newsletter-input-row">
                        <input
                            type="text"
                            placeholder={Sefaria._("common.first_name")}
                            aria-label={Sefaria._("common.first_name")}
                            ref={firstNameRef}
                            onKeyUp={Util.handleEnterKey(handleSubscribe)}
                        />
                        <input
                            type="text"
                            placeholder={Sefaria._("common.last_name")}
                            aria-label={Sefaria._("common.last_name")}
                            ref={lastNameRef}
                            onKeyUp={Util.handleEnterKey(handleSubscribe)}
                        />
                    </div>
                    <div className="topic-landing-newsletter-input-row">
                        <input
                            type="text"
                            placeholder={Sefaria._("common.email_address")}
                            aria-label={Sefaria._("common.email_address")}
                            ref={emailRef}
                            onKeyUp={Util.handleEnterKey(handleSubscribe)}
                        />
                        <button
                            type="submit"
                            onKeyUp={Util.handleEnterKey(handleSubscribe)}
                            onClick={handleSubscribe}
                            data-anl-event="form_submit:click"
                        >
                            {Sefaria._("common.sign_up")}
                        </button>
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
                    <div className="subscribeErrorMessage" role="alert" aria-live="assertive">{Sefaria._(subscribeErrorMessage)}</div>
                    : null}
            </div>
        </div>
    );
};