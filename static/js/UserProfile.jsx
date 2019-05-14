const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  TabView,
  FilterableList,
}               = require('./Misc');
const React      = require('react');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const Sefaria   = require('./sefaria/sefaria');
import Component from 'react-class';
const Footer    = require('./Footer');


class UserProfile extends Component {
  filterSheet(currFilter, sheet) {
    return sheet.indexOf(currFilter) > -1;
  }
  sortSheet(currSortOption, sheetA, sheetB) {
    if (currSortOption === 'Recent') {
      return parseInt(sheetA.split(" ")[1]) - parseInt(sheetB.split(" ")[1]);
    }
    return parseInt(sheetB.split(" ")[1]) - parseInt(sheetA.split(" ")[1]);
  }
  renderSheet(sheet) {
    return (
      <div key={sheet}>{sheet}</div>
    );
  }
  renderTab(tab) {
    return (
      <div className="tab">
        <img src={tab.icon} alt={`${tab.text} icon`} />
        {tab.text}
      </div>
    );
  }
  render() {
    const tabs = [
      { text: "Sheets", icon: "/static/img/sheet.svg" },
      { text: "Notes", icon: "/static/img/note.svg" },
      { text: "Groups", icon: "/static/img/group.svg" },
    ];
    return (
      <div className="profile-page readerNavMenu">
        <div className="content hasFooter">
          <div className="contentInner">
            <ProfileSummary
              profile={this.props.profile}
            />
            <TabView
              tabs={tabs}
              renderTab={this.renderTab}
            >
              <FilterableList
                filterFunc={this.filterSheet}
                sortFunc={this.sortSheet}
                renderItem={this.renderSheet}
                sortOptions={["Recent", "Views"]}
                data={["Sheet 1", "Sheet 2", "Sheet 3", "Bob 4"]}
              />
              <NoteList/>
              <div>{"GROUPS"}</div>
            </TabView>
          </div>
          <Footer />
        </div>
      </div>
    );
  }
}
UserProfile.propTypes = {
  profile: PropTypes.object.isRequired,
}
class NoteList extends Component {
  render() {
    console.log("NOTES");
    return (
      <div>{"NOTES"}</div>
    );
  }
}
class SheetList extends Component {
  render() {
    console.log("SHEETS");
    return (
      <div>{"SHEETS"}</div>
    );
  }
}

const ProfileSummary = ({ profile:p }) => {
  const social = [
    {icon: "fa-facebook-f", field: 'facebook'},
    {icon: "fa-twitter", field: 'twitter'},
    {icon: "fa-youtube", field: 'youtube'},
    {icon: "fa-linkedin", field: 'linkedin'},
    {icon: "fa-home", field: 'website'}
  ];
  const hasAnySocialLife = social.reduce((accum, curr) => accum || !!p[curr.field], false);
  const hasAnyEducationSocialOrLocation = hasAnySocialLife || p.jewish_education.length || p.location;
  return (
    <div className="profile-summary">
      <div className="summary-column start">
        <div className="title pageTitle">
          <span className="int-en">{p.full_name}</span>
          <span className="int-he">{p.full_name}</span>
        </div>
        { p.position || p.organization ?
          <div className="title sub-title">
            <span>{p.position}</span>
            { p.position && p.organization ? <span>{ " at " }</span> : null }
            <span>{p.organization}</span>
          </div> : null
        }
        { hasAnyEducationSocialOrLocation ?
          <div className="title sub-sub-title">
            { p.location ? <span className="small-margin">{p.location}</span> : null }
            { (hasAnySocialLife || p.jewish_education.length) ? '\u2022' : null }
            { p.jewish_education.map((j, i) =>
                (
                  <span key={j}>
                    { i !== 0 ? '\u2022' : null }
                    <span className="small-margin">
                      {j}
                    </span>
                  </span>
                )
              )
            }
            { hasAnySocialLife ? '\u2022' : null }
            { social.map((s, i) =>
                (
                  !!p[s.field] || true ?
                    <span key={s.field} className="small-margin">
                      <i className={`fa ${s.icon}`}></i>
                    </span> : null
                )
              )
            }
          </div> : null
        }
        <div>

        </div>
        <div>
          <span>{ `${p.followers.length} followers`}</span>
          &bull;
          <span>{ `${p.followees.length} following`}</span>
        </div>
      </div>
      <div className="summary-column end">
        <img className="img-circle profile-img" src={p.gravatar_url} alt="User Profile Picture"/>
      </div>
    </div>
  );
}
ProfileSummary.propTypes = {
  profile: PropTypes.object.isRequired,
}

module.exports = UserProfile;
