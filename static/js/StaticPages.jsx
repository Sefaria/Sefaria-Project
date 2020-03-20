const React      = require('react');
const PropTypes  = require('prop-types');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const {
    SimpleContentBlock,
    SimpleInterfaceBlock,
    TextBlockLink
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
        <LinkGrid />
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
    <div className="">
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
                <div className="staticPageHeaderText">
                    <span className="int-en">{enText}</span>
                    <span className="int-he">{heText}</span>
                </div>
                {enActionURL ?
                <div className="staticPageHeaderAction">
                    <a class="button int-en" href={enActionURL}>{enActionText}</a>
                    <a class="button int-he" href={heActionURL}>{heActionText}</a>
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
            <div className="staticPageAboutText">
                <span className="int-en">{enText}</span>
                <span className="int-he">{heText}</span>
            </div>
        </div>
    </div>
);

const Feature = ({enTitle, heTitle, enText, heText, enImg, heImg, enImgAlt, heImgAlt}) => (
    <div className="feature flexContainer">
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
);

const LinkGrid = ({}) => (<div></div>);

/*
      let calendar = Sefaria.calendars.map(function(item) {
          return (<TextBlockLink
                    sref={item.ref}
                    url_string={item.url}
                    title={item.title["en"]}
                    heTitle={item.title["he"]}
                    displayValue={item.displayValue["en"]}
                    heDisplayValue={item.displayValue["he"]}
                    category={item.category}
                    showSections={false}
                    recentItem={false} />)
      });
      calendar = (<div className="readerNavCalendar"><TwoOrThreeBox content={calendar} width={this.width} /></div>);
*/


module.exports.DistanceLearningPage = DistanceLearningPage;
