const React      = require('react');
const PropTypes  = require('prop-types');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const {
    SimpleContentBlock,
    SimpleInterfaceBlock,
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
            <LinkGrid>
                <SimpleButton href="" he="" en="Foo"/>
                <SimpleButton href="" he="" en="Bar"/>
                <SimpleButton href="" he="" en="Quuz"/>
            </LinkGrid>
        </GreyBox>
        <Feature
            enTitle="Learners"
            enText="Whether you’re a pro, or a new user, Sefaria has resources to help your virtual study thrive. Join a Sefaria 101 webinar, browse our tutorials, or sign up for the online student training course to up your skills on all things Sefaria. Create a free account to track your learning, save texts, and follow users creating things that interest you."
            enImg="/static/img/distance-learning-landing-page/learners 1.png"
            enImgAlt="Source Sheet - Pesach 101"
            heTitle=""
            heText=""
            heImg="/static/img/distance-learning-landing-page/learners 1.png"
            heImgAlt=""
        />
        <LinkGrid>
            <SimpleButton href="" he="" en="Foo"/>
            <SimpleButton href="" he="" en="Bar"/>
            <SimpleButton href="" he="" en="Quuz"/>
        </LinkGrid>
        <Feature
            enTitle=""
            enText=""
            enImg=""
            enImgAlt=""
            heTitle=""
            heText=""
            heImg=""
            heImgAlt=""
        />
        <LinkGrid>
            <SimpleButton href="" he="" en="Foo"/>
            <SimpleButton href="" he="" en="Bar"/>
            <SimpleButton href="" he="" en="Quuz"/>
        </LinkGrid>
        <Feature
            enTitle=""
            enText=""
            enImg=""
            enImgAlt=""
            heTitle=""
            heText=""
            heImg=""
            heImgAlt=""
        />
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

const Feature = ({enTitle, heTitle, enText, heText, enImg, heImg, enImgAlt, heImgAlt}) => (
    <div className="feature flexContainer">
        <div className="staticPageBlockInner">
            <div className="featureText">
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
                <span className="int-en">
                    <img className="button-icon" src={enImg} alt={enImgAlt}/>
                </span>
                <span className="int-he">
                    <img className="button-icon" src={heImg} alt={heImgAlt}/>
                </span>
            </div>
        </div>
    </div>
);

// links - array of {href, he, en}
const LinkGrid = ({children}) =>
    <div className="staticPageBlockInner blockVerticalPadding">
        <ThreeBox content={React.Children.toArray(children)}/>
    </div>;

const SimpleButton = ({href, he, en}) => (
    <div className="">
        <a href={href} className="button white flexContainer">
            <span className="int-en">{en}</span>
            <span className="int-he">{he}</span>
        </a>
    </div>
);




module.exports.DistanceLearningPage = DistanceLearningPage;
