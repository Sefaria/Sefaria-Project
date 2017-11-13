const React                  = require('react');
const PropTypes              = require('prop-types');
const Sefaria                = require('./sefaria/sefaria');
const SidebarVersion         = require('./SidebarVersion');
import Component             from 'react-class';


class AboutBox extends Component {
  render() {
    const d = this.props.details;
    const vh = this.props.heVersion;
    const ve = this.props.enVersion;
    let detailSection = null;
    if (d) {
      let authorTextEn, authorTextHe;
      if (d.authors) {
        const authorArrayEn = d.authors.filter((elem) => !!elem.en);
        const authorArrayHe = d.authors.filter((elem) => !!elem.he);
        authorTextEn = authorArrayEn.reduce((accum, curr, ind) => accum + (ind === 0 ? curr.en : `, ${curr.en}`), "");
        authorTextHe = authorArrayHe.reduce((accum, curr, ind) => accum + (ind === 0 ? curr.he : `, ${curr.he}`), "");
      }
      // use compPlaceString and compDateString if available. then use compPlace o/w use pubPlace o/w nothing
      let placeTextEn, placeTextHe;
      if (d.compPlaceString) {
        placeTextEn = d.compPlaceString.en;
        placeTextHe = d.compPlaceString.he;
      } else if (d.compPlace){
        placeTextEn = d.compPlace;
        placeTextHe = d.compPlace;
      } else if (d.pubPlace) {
        placeTextEn = d.pubPlace;
        placeTextHe = d.pubPlace;
      }

      let dateTextEn, dateTextHe;
      if (d.compDateString) {
        dateTextEn = d.compDateString.en;
        dateTextHe = d.compDateString.he
      } else if (d.compDate) {
        if (d.errorMargin !== 0) {
          //I don't think there are any texts which are mixed BCE/CE
          const lowerDate = Math.abs(d.compDate - d.errorMargin);
          const upperDate = Math.abs(d.compDate - d.errorMargin);
          dateTextEn = `(c.${lowerDate} - c.${upperDate} ${d.compDate < 0 ? "BCE" : "CE"})`;
          dateTextHe = `(${lowerDate} - ${upperDate} ${d.compDate < 0 ? 'לפנה"ס בקירוב' : 'לספירה בקירוב'})`;
        } else {
          dateTextEn = `(${Math.abs(d.compDate)} ${d.compDate < 0 ? "BCE" : "CE"})`;
          dateTextHe = `(${Math.abs(d.compDate)} ${d.compDate < 0 ? 'לפנה"ס בקירוב' : 'לספירה בקירוב'})`;
        }
      } else if (d.pubDate) {
        dateTextEn = `(${Math.abs(d.pubDate)} ${d.pubDate < 0 ? "BCE" : "CE"})`;
        dateTextHe = `(${Math.abs(d.pubDate)} ${d.pubDate < 0 ? 'לפנה"ס בקירוב' : 'לספירה בקירוב'})`;
      }
      detailSection = (
        <div className="detailsSection">
          <h2 className="aboutHeader">
            <span className="int-en">About This Text</span>
            <span className="int-he">אודות ספר זה</span>
          </h2>
          <div className="aboutTitle">
            <span className="en">{d.title}</span>
            <span className="he">{d.heTitle}</span>
          </div>
          { !!authorTextEn ?
            <div className="aboutSubtitle">
              <span className="en">{`Author: ${authorTextEn}`}</span>
              <span className="he">{`מחברים: ${authorTextHe}`}</span>
            </div> : null
          }
          { !!placeTextEn || !!dateTextEn ?
            <div className="aboutSubtitle">
              <span className="en">{`Composed: ${!!placeTextEn ? placeTextEn : ""} ${!!dateTextEn ? dateTextEn : ""}`}</span>
              <span className="he">{`נוצר/נערך: ${!!placeTextHe ? placeTextHe : ""} ${!!dateTextHe ? dateTextHe : ""}`}</span>
            </div> : null
          }
          <div className="aboutDesc">
            { !!d.enDesc ? <span className="en">{d.enDesc}</span> : null}
            { !!d.heDesc ? <span className="he">{d.heDesc}</span> : null}
          </div>
        </div>
      );
    }

    const versionSectionHe =
      (!!vh ? <div className="currVersionSection">
        <h2>
          <span className="int-en">Current Hebrew Version</span>
          <span className="int-he">גרסה עברית נוכחית</span>
        </h2>
        <SidebarVersion
          version={vh}
          srefs={this.props.srefs}
          getLicenseMap={this.props.getLicenseMap} />
      </div> : null );
    const versionSectionEn =
      (!!ve ? <div className="currVersionSection">
        <h2>
          <span className="int-en">Current English Version</span>
          <span className="int-he">גרסה אנגלית נוכחית</span>
        </h2>
        <SidebarVersion
          version={ve}
          srefs={this.props.srefs}
          getLicenseMap={this.props.getLicenseMap} />
      </div> : null );
    return (
      <section className="aboutBox">
        {detailSection}
        { this.props.mainVersionLanguage === "english" ?
          (<div>{versionSectionEn}{versionSectionHe}</div>) :
          (<div>{versionSectionHe}{versionSectionEn}</div>)
        }
      </section>
    );
  }
}
AboutBox.propTypes = {
  enVersion:           PropTypes.object,
  heVersion:           PropTypes.object,
  mainVersionLanguage: PropTypes.oneOf(["english", "hebrew"]),
  details:             PropTypes.object,
  srefs:               PropTypes.array.isRequired,
  getLicenseMap:       PropTypes.func.isRequired,
};




module.exports = AboutBox;
