const React                  = require('react');
const PropTypes              = require('prop-types');
const classNames             = require('classnames');
const Sefaria                = require('./sefaria/sefaria');
import Component             from 'react-class';

class SidebarVersion extends Component {
  handleTitleClick(event) {
    event.preventDefault();
    this.props.openVersion(this.props.version);
  }
  handleSelectClick(event) {
    event.preventDefault();
    this.props.selectVersion(this.props.version);
  }
  render() {
    const v = this.props.version;
    const license = this.props.getLicenseMap()[v.license]?<a href={this.props.getLicenseMap()[v.license]} target="_blank">{Sefaria._(v.license)}</a>:v.license;
    const digitizedBySefaria = v.digitizedBySefaria
        ? <a className="versionDigitizedBySefaria" href="/digitized-by-sefaria">{Sefaria._("Digitized by Sefaria")}</a> : "";
    var licenseLine = "";
    if (v.license && v.license != "unknown") {
      licenseLine =
        <span className="versionLicense">
          {license}
          {digitizedBySefaria?" - ":""}{digitizedBySefaria}
        </span>
      ;
    }
    let versionNotes = "";
    if (Sefaria.interfaceLang=="english" && !!(v.versionNotes)) {
      versionNotes = v.versionNotes;
    }
    else if (Sefaria.interfaceLang=="hebrew" && !!(v.versionNotesInHebrew)) {
      versionNotes = v.versionNotesInHebrew;
    }

    const selectButtonClasses = classNames({selectButton: 1, currSelectButton: this.props.isCurrent});
    return (
      <div>
        {!!this.props.openVersion ?
          <a className="aboutTitle" href="#" onClick={this.handleTitleClick}>
            <span className="en">{v.versionTitle}</span>
            <span className="he">{v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle}</span>
          </a> :
          <div className="aboutTitle">
            <span className="en">{v.versionTitle}</span>
            <span className="he">{v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle}</span>
          </div>
        }
        {versionNotes ? <div className="versionNotes" dangerouslySetInnerHTML={ {__html: versionNotes} } ></div> : null}
        <div className="versionDetails">
          {!!this.props.selectVersion ?
            <a className={selectButtonClasses} href="#" onClick={this.handleSelectClick}>
              {this.props.isCurrent ? "Current" : "Select"}
            </a> : null}
          {this.props.selectVersion ? <span className="separator">-</span>: null}
          <a className="versionSource" target="_blank" href={v.versionSource}>
          { Sefaria.util.parseURL(v.versionSource).host }
          </a>
          {licenseLine ? <span className="separator">-</span>: null}
          {licenseLine}
          <span className="separator">-</span>
          <a className="versionHistoryLink" href={`/activity/${Sefaria.normRef(this.props.srefs[0])}/${v.language}/${v.versionTitle && v.versionTitle.replace(/\s/g,"_")}`}>{Sefaria._("Version History") + " "}›</a>
        </div>
      </div>
    );
  }
}
SidebarVersion.propTypes = {
  version:       PropTypes.object.isRequired,
  srefs:         PropTypes.array.isRequired,
  getLicenseMap: PropTypes.func.isRequired,
  isCurrent:     PropTypes.bool,
  selectVersion: PropTypes.func,
  openVersion:   PropTypes.func,
}

module.exports = SidebarVersion;
