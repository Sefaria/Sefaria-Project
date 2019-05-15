const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  TabView,
  FilterableList,
  SheetListing,
}               = require('./Misc');
const React      = require('react');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const Sefaria   = require('./sefaria/sefaria');
const TextRange  = require('./TextRange');
const { GroupListing } = require('./MyGroupsPanel');
import Component from 'react-class';
const Footer    = require('./Footer');


class UserProfile extends Component {
  getGroups() {
    return Sefaria.userGroups(this.props.profile.id);
  }
  filterGroup(currFilter, group) {
    const n = text => text.toLowerCase();
    currFilter = n(currFilter);
    return n(group.name).indexOf(currFilter) > -1;
  }
  sortGroup(currSortOption, groupA, groupB) {
    return 0;
  }
  renderEmptyGroupList() {
    return (
      <div>{"no groups :("}</div>
    );
  }
  renderGroup(group) {
    return (
      <GroupListing data={group} />
    );
  }
  getNotes() {
    return new Promise((resolve, reject) => {
      Sefaria.allPrivateNotes(notes => {
        resolve(notes);
      });
    });
  }
  filterNote(currFilter, note) {
    const n = text => text.toLowerCase();
    currFilter = n(currFilter);
    return n(note.text).indexOf(currFilter) > -1;
  }
  sortNote(currSortOption, noteA, noteB) {
    return 0;
  }
  renderEmptyNoteList() {
    return (
      <div>{"no notes :("}</div>
    );
  }
  renderNote(note) {
    return (
      <div key={`${note.ref}|${note.text}`}>
        <TextRange sref={note.ref} />
        {note.text}
      </div>
    );
  }
  getSheets() {
    return new Promise((resolve, reject) => {
      Sefaria.sheets.userSheets(this.props.profile.id, sheets => {
        resolve(sheets);
      });
    });
  }
  filterSheet(currFilter, sheet) {
    const n = text => text.toLowerCase();
    currFilter = n(currFilter);
    return n(sheet.title).indexOf(currFilter) > -1 || sheet.tags.reduce((accum, curr) => accum || n(curr).indexOf(currFilter) > -1, false);
  }
  sortSheet(currSortOption, sheetA, sheetB) {
    if (currSortOption === "Recent") { return 0; /* already in order */}
    else {
      return sheetB.views - sheetA.views;
    }
  }
  renderEmptySheetList() {
    return (
      <div>{"no sheets :("}</div>
    );
  }
  renderSheet(sheet) {
    return (
      <SheetListing
        key={sheet.id}
        sheet={sheet}
        hideAuthor={true}
        handleSheetClick={this.props.handleSheetClick}
        connectedRefs={[]}
      />
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
      { text: "Groups", icon: "/static/img/group.svg" },
    ];
    const showNotes = Sefaria._uid === this.props.profile.id;
    if (showNotes) {
      tabs.splice(1, 0, { text: "Notes", icon: "/static/img/note.svg" });
    }
    return (
      <div className="profile-page readerNavMenu noHeader">
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
                renderEmptyList={this.renderEmptySheetList}
                sortOptions={["Recent", "Views"]}
                getData={this.getSheets}
              />
              {
                showNotes ? (
                  <FilterableList
                    filterFunc={this.filterNote}
                    sortFunc={this.sortNote}
                    renderItem={this.renderNote}
                    renderEmptyList={this.renderEmptyNoteList}
                    sortOptions={["Recent", "Views"]}
                    getData={this.getNotes}
                  />
                ) : null
              }
              <FilterableList
                filterFunc={this.filterGroup}
                sortFunc={this.sortGroup}
                renderItem={this.renderGroup}
                renderEmptyList={this.renderEmptyGroupList}
                sortOptions={["Recent", "Views"]}
                getData={this.getGroups}
              />
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
  handleSheetClick: PropTypes.func.isRequired,
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
