const React      = require('react');
const PropTypes  = require('prop-types');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const {
    SimpleContentBlock,
    SimpleInterfaceBlock,
    NewsletterSignUpForm,
    TextBlockLink,
    ThreeBox
}                   = require('./Misc');
import Component from 'react-class';

const DistanceLearningPage = () => (
    <StaticPage>
        <Header
            enTitle="Remote Learning"
            enText="For educators, learners, and the curious."
            enImg="/static/img/distance-learning-landing-page/tablet.png"
            enImgAlt="Sefaria on tablet."
            enActionURL={null}
            enActionText={null}
            heTitle="Remote Learning"
            heText="For educators, learners, and the curious."
            heImg="/static/img/distance-learning-landing-page/tablet.png"
            heImgAlt="Sefaria on tablet."
            heActionURL={null}
            heActionText={null}
        />
        <About
            enTitle="Resources for teaching and learning virtually"
            enText="More and more people across the world are discovering the power of the internet for education. Sefaria is always open and ready to bring you foundational Jewish texts, modern works, and user-generated Torah content, with the tools you need to take your learning to the next level."
            heTitle="Resources for teaching and learning virtually"
            heText="More and more people across the world are discovering the power of the internet for education. Sefaria is always open and ready to bring you foundational Jewish texts, modern works, and user-generated Torah content, with the tools you need to take your learning to the next level."

        />
        <GreyBox>
            <H2Block en="Browse our Latest Groups" he="" />
            <ButtonRow>
                <SimpleButton href="" he="" en="Seder on Sefaria"/>
                <SimpleButton href="" he="" en="A Jewish Response to COVID-19"/>
                <SimpleButton href="" he="" en="Online Learning Resources"/>
            </ButtonRow>
        </GreyBox>
        <H2Block en="Resources for Everyone" he="" />
        <Feature
            enTitle="Learners"
            enText="Whether you’re a pro, or a new user, Sefaria has resources to help your virtual study thrive. Join a Sefaria 101 webinar, browse our tutorials, or sign up for the online student training course to up your skills on all things Sefaria. Create a free account to track your learning, save texts, and follow users creating things that interest you."
            enImg="/static/img/distance-learning-landing-page/learners 1.png"
            enImgAlt="Source Sheet - Pesach 101"
            heTitle=""
            heText=""
            heImg="/static/img/distance-learning-landing-page/learners 1.png"
            heImgAlt=""
            borderColor="#004E5F"
        />
        <ButtonRow>
            <SimpleButton href="" he="" en="Webinars"/>
            <SimpleButton href="" he="" en="Tutorials"/>
            <SimpleButton href="" he="" en="Student Course"/>
        </ButtonRow>
        <Feature
            enTitle="Educators"
            enText="Sefaria is here to support your efforts to teach from a distance. Our Education Department has a variety of resources to get you started with distance learning using Sefaria. Create an account to make and assign source sheets to your students, organize your sheets into groups, and save texts."
            enImg="/static/img/distance-learning-landing-page/Educators 1.png"
            enImgAlt="Source Sheet - Teaching with Sefaria Online"
            heTitle=""
            heText=""
            heImg="/static/img/distance-learning-landing-page/Educators 1.png"
            heImgAlt=""
            borderColor="#CCB479"
        />
        <ButtonRow>
            <SimpleButton href="" he="" en="Webinars"/>
            <SimpleButton href="" he="" en="Tutorials"/>
            <SimpleButton href="" he="" en="Educator Course"/>
        </ButtonRow>
        <Feature
            enTitle="Developers"
            enText="Is it time to start incorporating digital texts into your website and/or app? Sefaria has you covered. All of our software is open source and our texts are all in the creative commons, meaning you can use anything we have for your own projects. Browse our tutorials or head over to GitHub to see all that our API has to offer."
            enImg="/static/img/distance-learning-landing-page/Developers 1.png"
            enImgAlt="Source Sheet - Link Sefaria to your Site"
            heTitle=""
            heText=""
            heImg="/static/img/distance-learning-landing-page/Developers 1.png"
            heImgAlt=""
            borderColor="#802F3E"
        />
        <ButtonRow>
            <SimpleButton href="" he="" en="Webinars"/>
            <SimpleButton href="" he="" en="Tutorials"/>
            <SimpleButton href="" he="" en="GitHub"/>
        </ButtonRow>
        <CallToActionFooterWithNewsletter enText="Sign up for our mailing list to get resources in your inbox" />
    </StaticPage>
);

const StaticPage = ({children}) => (
    <div className="staticPage">
        {children}
    </div>
);

const GreyBox = ({children}) => (
    <div className="greyBackground">
        {children}
    </div>
);
const H2Block = ({en, he, classes}) =>
    <div className="staticPageBlockInner">
        <h2 className="staticPageH2">
            <SimpleInterfaceBlock en={en} he={he} />
        </h2>
    </div>;

const Header = ({enTitle, heTitle, enText, heText, enImg, heImg, enImgAlt, heImgAlt, enActionURL, enActionText, heActionURL, heActionText}) => (
    <div className="staticPageHeader">
        <div className="staticPageBlockInner flexContainer">
            <div className="staticPageHeaderTextBox">
                <h1>
                    <span className="int-en">{enTitle}</span>
                    <span className="int-he">{heTitle}</span>
                </h1>
                <SimpleInterfaceBlock classes="staticPageHeaderText" he={heText} en={enText} />
                {enActionURL ?
                <div className="staticPageHeaderAction">
                    <a className="button int-en" href={enActionURL}>{enActionText}</a>
                    <a className="button int-he" href={heActionURL}>{heActionText}</a>
                </div>
                : null}
            </div>
            <div className="staticPageHeaderImg">
                <img className="int-en" src={enImg} alt={enImgAlt} />
                <img className="int-he" src={heImg} alt={heImgAlt} />
            </div>
        </div>
    </div>
);

const CallToActionFooterWithButton = ({href, enText, heText, enButtonText, heButtonText}) => (
    <div className="staticPageCallToActionFooter">
        <SimpleInterfaceBlock classes="callToActionText" en={enText} he={heText} />
        <CallToActionButton href={href} en={enButtonText} he={heButtonText} />
    </div>
);
const CallToActionFooterWithNewsletter = ({enText, heText}) => (
    <div className="staticPageCallToActionFooter">
        <div className="staticPageBlockInner flexContainer">
            <SimpleInterfaceBlock classes="callToActionText" en={enText} he={heText} />
            <NewsletterSignUpForm contextName="Distance Learning Static Page" />
        </div>
    </div>
);

const About = ({enTitle, heTitle, enText, heText, backgroundColor}) => (
    <div className={"staticPageAbout" + (backgroundColor == "grey" ? " greyBackground" : "")}>
        <div className="staticPageBlockInner">
            <h2>
                <span className="int-en">{enTitle}</span>
                <span className="int-he">{heTitle}</span>
            </h2>
            <SimpleInterfaceBlock classes="staticPageAboutText" he={heText} en={enText} />
        </div>
    </div>
);

const Feature = ({enTitle, heTitle, enText, heText, enImg, heImg, enImgAlt, heImgAlt, borderColor}) => (
    <div className="feature">
        <div className="staticPageBlockInner flexContainer">
            <div className="featureText" style={{borderColor: borderColor}}>
                <div className="featureHeader">
                    <h3>
                        <span className="int-en">{enTitle}</span>
                        <span className="int-he">{heTitle}</span>
                    </h3>
                </div>
                <p className="int-en">{enText}</p>
                <p className="int-he">{heText}</p>
            </div>
            <div className="featureImage">
                <img className="int-en" src={enImg} alt={enImgAlt}/>
                <img className="int-he" src={heImg} alt={heImgAlt}/>
            </div>
        </div>
    </div>
);

const ButtonRow = ({children}) => (
    <div className="staticPageBlockInner blockVerticalPadding flexContainer">
        {children}
    </div>
);

const SimpleButton = ({href, he, en}) => (
    <div className="simpleButtonWrapper">
        <a href={href} className="button white flexContainer">
            <span className="int-en">{en}</span>
            <span className="int-he">{he}</span>
        </a>
    </div>
);
const CallToActionButton =  ({href, he, en}) => (
    <div className="">
        <a href={href} className="button flexContainer">
            <span className="int-en">{en}</span>
            <span className="int-he">{he}</span>
        </a>
    </div>
);



module.exports.DistanceLearningPage = DistanceLearningPage;
