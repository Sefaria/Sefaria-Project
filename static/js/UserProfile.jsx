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
    if (currSortOption == "Members") {
      return groupB.memberCount - groupA.memberCount;
    }
    return groupB.sheetCount - groupA.sheetCount;
  }
  renderEmptyGroupList() {
    return (
      <div>{"no groups :("}</div>
    );
  }
  renderGroup(group) {
    return (
      <GroupListing data={group} showMembership={true} />
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
      <div className="note" key={`${note.ref}|${note.text}`}>
        <TextRange sref={note.ref} />
        <div className="note-text">
          {note.text}
        </div>
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
        infoUnderneath={true}
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
                sortOptions={["Members", "Sheets"]}
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
  // collect info about this profile in `infoList`
  const social = ['facebook', 'twitter', 'youtube', 'linkedin'];
  let infoList = [];
  if (p.location) { infoList.push(p.location); }
  infoList = infoList.concat(p.jewish_education);
  if (p.website) {
    infoList.push(<span><a href={p.website}>{"website"}</a></span>);
  }
  infoList = infoList.concat(
    <span>
      { social
        .filter(s => !!p[s])
        .map(s => (<a className="social-icon" href={p[s]}><img key={s} src={`/static/img/${s}.svg`} /></a>))
      }
    </span>
  );
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
        { infoList.length ?
          <div className="title sub-sub-title">
            {
              infoList.map((i, ii) => (
                <span key={ii}>
                  { ii !== 0 ? '\u2022' : null }
                  <span className="small-margin">{i}</span>
                </span>
              ))
            }
          </div> : null
        }
        {
          Sefaria._uid === p.id ? (
          <div className="profile-actions">
            <a href="/settings/profile" className="resourcesLink">
              <span className="en">Edit Profile</span>
              <span className="he">עריכת פרופיל</span>
            </a>
            <a href="/settings/account" className="resourcesLink">
              <img src="/static/img/settings.svg" alt="Profile Settings" />
              <span className="en">Settings</span>
              <span className="he">הגדרות</span>
            </a>
          </div>) : (
          <div className="profile-actions">
            <a href="/settings/profile" className="resourcesLink blue">
              <span className="en">Follow</span>
              <span className="he">עריכת פרופיל</span>
            </a>
            <a href="/settings/account" className="resourcesLink">
              <img src="/static/img/settings.svg" alt="Profile Settings" />
              <span className="en">Message</span>
              <span className="he">הגדרות</span>
            </a>
          </div>)
        }
        <div className="follow">
          <span>{ `${p.followers.length} followers`}</span>
          <span className="follow-bull">&bull;</span>
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
