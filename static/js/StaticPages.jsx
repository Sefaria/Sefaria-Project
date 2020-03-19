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
        <GreyBox>
            <HeaderLine />
            <LinkGrid />
        </GreyBox>
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
const HeaderLine = ({}) => (
    <div></div>
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

module.exports = DistanceLearningPage;
