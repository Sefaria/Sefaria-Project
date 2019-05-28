const React                  = require('react');
const PropTypes              = require('prop-types');
const Sefaria                = require('./sefaria/sefaria');
const VersionBlock         = require('./VersionBlock');
import Component             from 'react-class';


class AboutBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      details: null,
    }
  }

  setTextMetaData() {
    if (this.props.title == "Sheet") {
      const sheetID = (Sefaria.sheets.extractIdFromSheetRef(this.props.srefs));
        if (!Sefaria.sheets.loadSheetByID(sheetID)) {
          Sefaria.sheets.loadSheetByID(sheetID, function (data) {
              this.setState({ details: data });
          }.bind(this));
      }
      else {
          this.setState({
            details: Sefaria.sheets.loadSheetByID(sheetID),
          });
        }

    }
    else {
      Sefaria.getIndexDetails(this.props.title).then(data => {
        this.setState({details: data});
      });
    }
  }

  componentDidMount() {
      this.setTextMetaData();
  }
  componentDidUpdate(prevProps, prevState) {
    if (prevProps.title !== this.props.title) {
      this.setState({details: null});
      this.setTextMetaData();
    }
  }

  render() {
    const d = this.state.details;
    const vh = this.props.currObjectVersions.he;
    const ve = this.props.currObjectVersions.en;

    if (this.props.srefs[0].startsWith("Sheet")) {
      let detailSection = null;

      if (d) {

          detailSection = (<div className="detailsSection">
                  <h2 className="aboutHeader">
                      <span className="int-en">About This Text</span>
                      <span className="int-he">אודות ספר זה</span>
                  </h2>
                  <div className="aboutTitle">
                      <span className="en">{d.title}</span>
                  </div>
                  <div className="aboutSubtitle">
                      <span className="en">By: {d.ownerName}</span>
                  </div>
                  <div className="aboutDesc">
                      <span className="en">{d.summary}</span>
                  </div>
              </div>
          )
      }
      return(

      <section className="aboutBox">{detailSection}</section>
      )

    }

    let detailSection = null;
    if (d) {
      let authorsEn, authorsHe;
      if (d.authors && d.authors.length) {
        const authorArrayEn = d.authors.filter((elem) => !!elem.en);
        const authorArrayHe = d.authors.filter((elem) => !!elem.he);
        authorsEn = authorArrayEn.map(author => <a key={author.en} href={"/person/" + author.en}>{author.en}</a> );
        authorsHe = authorArrayHe.map(author => <a key={author.en} href={"/person/" + author.en}>{author.he}</a> );
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
          { authorsEn && authorsEn.length ?
            <div className="aboutSubtitle">
              <span className="en">Author: {authorsEn}</span>
              <span className="he">מחבר: {authorsHe}</span>
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
    const currVersions = {};
    for (let vlang in this.props.currObjectVersions) {
      const tempV = this.props.currObjectVersions[vlang];
      currVersions[vlang] = !!tempV ? tempV.versionTitle : null;
    }
    const versionSectionHe =
      (!!vh ? <div className="currVersionSection">
        <h2 className="aboutHeader">
          <span className="int-en">Current Hebrew Version</span>
          <span className="int-he">גרסה עברית נוכחית</span>
        </h2>
        <VersionBlock
          version={vh}
          currVersions={currVersions}
          currentRef={this.props.srefs[0]}
          firstSectionRef={"firstSectionRef" in vh ? vh.firstSectionRef : null}
          getLicenseMap={this.props.getLicenseMap} />
      </div> : null );
    const versionSectionEn =
      (!!ve ? <div className="currVersionSection">
        <h2 className="aboutHeader">
          <span className="int-en">Current English Version</span>
          <span className="int-he">גרסה אנגלית נוכחית</span>
        </h2>
        <VersionBlock
          version={ve}
          currVersions={currVersions}
          currentRef={this.props.srefs[0]}
          firstSectionRef={"firstSectionRef" in ve ? ve.firstSectionRef : null}
          viewExtendedNotes={this.props.viewExtendedNotes}
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
  currObjectVersions:  PropTypes.object.isRequired,
  mainVersionLanguage: PropTypes.oneOf(["english", "hebrew"]),
  title:               PropTypes.string.isRequired,
  srefs:               PropTypes.array.isRequired,
  getLicenseMap:       PropTypes.func.isRequired,
};




module.exports = AboutBox;
