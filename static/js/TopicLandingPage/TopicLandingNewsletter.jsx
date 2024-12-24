import React from 'react';
import {InterfaceText} from "../Misc";

export const TopicLandingNewsletter = () => {
    return (
        <div className="topic-landing-newsletter">
            <h3 className="topic-landing-newsletter-text">
                <InterfaceText>Stay curious. Sign up for our free Topic of the Week Newsletter.</InterfaceText>
            </h3>
            <div>
                <div className="topic-landing-newsletter-input-row">
                    <input type="text" placeholder="First Name"/>
                    <input type="text" placeholder="Last Name"/>
                </div>
                <div className="topic-landing-newsletter-input-row">
                    <input type="text" placeholder="Email Address"/>
                    <button>Sign Up</button>
                </div>
            </div>
        </div>
    );
};