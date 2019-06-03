const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  TabView,
  FilterableList,
  SheetListing,
  ProfileListing,
}               = require('./Misc');
const React      = require('react');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const Sefaria   = require('./sefaria/sefaria');
const TextRange  = require('./TextRange');
const { GroupListing } = require('./MyGroupsPanel');
const NoteListing = require('./NoteListing');
import Component from 'react-class';
const Footer    = require('./Footer');


class UserProfile extends Component {
  constructor(props) {
    super(props);
    this.tabs = [
      { text: "Sheets", icon: "/static/img/sheet.svg" },
      { text: "Groups", icon: "/static/img/group.svg" },
      { text: "Followers", invisible: true },
      { text: "Following", invisible: true },
    ];
    this.showNotes = !!props.profile.id && Sefaria._uid === props.profile.id;
    if (this.showNotes) {
      this.tabs.splice(1, 0, { text: "Notes", icon: "/static/img/note.svg" });
    }
  }
  _getTabViewRef(ref) { this._tabViewRef = ref; }
  _getSheetListRef(ref) { this._sheetListRef = ref; }
  _getNoteListRef(ref) { this._noteListRef = ref; }
  _getGroupListRef(ref) { this._groupListRef = ref; }
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
      <GroupListing key={group.name} data={group} showMembership={true} />
    );
  }
  renderGroupHeader() {
    return (
      <div className="sheet-header">
        <a href="/groups/new" className="resourcesLink faded">
          <img src="/static/img/group.svg" alt="Group icon" />
          <span className="en">Create a New Group</span>
          <span className="he">צור קבוצה חדשה</span>
        </a>
      </div>
    );
  }
  getNotes() {
    return new Promise((resolve, reject) => {
      Sefaria.allPrivateNotes(notes => {
        resolve(notes);
      });
    });
  }
  onDeleteNote() {
    if (this._noteListRef) { this._noteListRef.reload(); }
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
      <NoteListing
        key={`${note.text}|${note.ref}`}
        data={note}
        onDeleteNote={this.onDeleteNote}
      />
    );
  }
  getSheets(ignoreCache) {
    return new Promise((resolve, reject) => {
      Sefaria.sheets.userSheets(this.props.profile.id, sheets => {
        // add urls to sheets for rendering with SheetListing
        sheets.forEach(s => {
          s.options.language = "en";
          s.sheetUrl = `/Sheet.${s.id}`; 
        });
        resolve(sheets);
      }, undefined, 0, 0, ignoreCache);
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
      <div className="emptySheetList">
        <div className="emptySheetListText">
          You can use sheets to save and organize sources, write new texts, create
            lessons, lectures, articles, and more.
        </div>
        <a href="/sheets/new" className="resourcesLink faded">
          <img src="/static/img/sheet.svg" alt="Source sheet icon" />
          <span className="en">Create a New Sheet</span>
          <span className="he">צור דף חדש</span>
        </a>

      </div>
    );
  }
  handleSheetDelete() {
    if (this._sheetListRef) { this._sheetListRef.reload(); }
  }
  renderSheet(sheet) {
    return (
      <SheetListing
        key={sheet.id}
        sheet={sheet}
        hideAuthor={true}
        handleSheetClick={this.props.handleInAppLinkClick}
        handleSheetDelete={this.handleSheetDelete}
        deletable={Sefaria._uid === this.props.profile.id}
        saveable={Sefaria._uid !== this.props.profile.id}
        connectedRefs={[]}
        infoUnderneath={true}
      />
    );
  }
  renderSheetHeader() {
    return (
      <div className="sheet-header">
        <a href="/sheets/new" className="resourcesLink faded">
          <img src="/static/img/sheet.svg" alt="Source sheet icon" />
          <span className="en">Create a New Sheet</span>
          <span className="he">צור דף חדש</span>
        </a>
      </div>
    );
  }
  getFollowers() {
    return Sefaria.followAPI(this.props.profile.slug, "followers");
  }
  renderFollowerHeader() {
    return (
      <div>
        Followers
      </div>
    );
  }
  renderFollower(item) {
    return (
      <ProfileListing
        uid={item.id}
        url={`/profile/${item.slug}`}
        name={item.full_name}
        image={item.gravatar_url}
        is_followed={false}
        position={item.position}
      />
    );
  }
  renderEmptyFollowerList() {
    return (
      <div>
        No Followers
      </div>
    );
  }
  renderTab(tab) {
    if (tab.invisible) { return null; }
    return (
      <div className="tab">
        <img src={tab.icon} alt={`${tab.text} icon`} />
        {tab.text}
      </div>
    );
  }
  message() {
  
  }
  follow() {
    Sefaria.followAPI(this.props.profile.id);
  }
  openFollowers(e) {
    e.preventDefault();
    this._tabViewRef.openTab(this.tabs.findIndex(t => t.text === 'Followers'));
  }
  openFollowing(e) {
    e.preventDefault();
    this._tabViewRef.openTab(this.tabs.findIndex(t => t.text === 'Following'));
  }
  render() {
    return (
      <div className="profile-page readerNavMenu noHeader">
        <div className="content hasFooter">
          <div className="contentInner">
            { !this.props.profile.id ? <LoadingMessage /> :
              <div>
                <ProfileSummary
                  profile={this.props.profile}
                  message={this.message}
                  follow={this.follow}
                  openFollowers={this.openFollowers}
                  openFollowing={this.openFollowing}
                />
                <TabView
                  ref={this._getTabViewRef}
                  tabs={this.tabs}
                  renderTab={this.renderTab}
                >
                  <FilterableList
                    ref={this._getSheetListRef}
                    filterFunc={this.filterSheet}
                    sortFunc={this.sortSheet}
                    renderItem={this.renderSheet}
                    renderEmptyList={this.renderEmptySheetList}
                    renderHeader={this.renderSheetHeader}
                    sortOptions={["Recent", "Views"]}
                    getData={this.getSheets}
                  />
                  {
                    this.showNotes ? (
                      <FilterableList
                        ref={this._getNoteListRef}
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
                    ref={this._getGroupListRef}
                    filterFunc={this.filterGroup}
                    sortFunc={this.sortGroup}
                    renderItem={this.renderGroup}
                    renderEmptyList={this.renderEmptyGroupList}
                    renderHeader={this.renderGroupHeader}
                    sortOptions={["Members", "Sheets"]}
                    getData={this.getGroups}
                  />
                  <FilterableList
                    filterFunc={() => { return true; }}
                    sortFunc={() => { return 0; }}
                    renderItem={this.renderFollower}
                    renderEmptyList={this.renderEmptyFollowerList}
                    renderHeader={this.renderFollowerHeader}
                    sortOptions={[]}
                    getData={this.getFollowers}
                  />
                  <FilterableList
                    filterFunc={() => { return true; }}
                    sortFunc={() => { return 0; }}
                    renderItem={this.renderFollower}
                    renderEmptyList={this.renderEmptyFollowerList}
                    renderHeader={this.renderFollowerHeader}
                    sortOptions={[]}
                    getData={this.getFollowers}
                  />
                </TabView>
              </div>
            }
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

const ProfileSummary = ({ profile:p, message, follow, openFollowers, openFollowing }) => {
  // collect info about this profile in `infoList`
  const social = ['facebook', 'twitter', 'youtube', 'linkedin'];
  let infoList = [];
  if (p.location) { infoList.push(p.location); }
  infoList = infoList.concat(p.jewish_education);
  if (p.website) {
    infoList.push(<span><a href={p.website}>{"website"}</a></span>);
  }
  const socialList = social.filter(s => !!p[s]);
  if (socialList.length) {
    infoList = infoList.concat(
      <span>
        {
          socialList.map(s => (<a key={s} className="social-icon" target="_blank" href={p[s]}><img src={`/static/img/${s}.svg`} /></a>))
        }
      </span>
    );
  }
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
            <a href="/logout" className="button transparent logoutLink">
              <span className="int-en">Log Out</span>
              <span className="int-he">ניתוק</span>
            </a>
          </div>) : (
          <div className="profile-actions">
            <a href="#" className="resourcesLink blue" onClick={follow}>
              <span className="en">Follow</span>
              <span className="he">עקוב</span>
            </a>
            <a href="#" className="resourcesLink" onClick={message}>
              <img src="/static/img/settings.svg" alt="Profile Settings" />
              <span className="en">Message</span>
              <span className="he">שלח הודעה</span>
            </a>
          </div>)
        }
        <div className="follow">
          <a href="" onClick={openFollowers}>{ `${p.followers.length} followers`}</a>
          <span className="follow-bull">&bull;</span>
          <a href="" onClick={openFollowing}>{ `${p.followees.length} following`}</a>
        </div>
      </div>
      <div className="summary-column end">
        <img className="img-circle profile-img" src={p.gravatar_url} alt="User Profile Picture"/>
      </div>
    </div>
  );
}
ProfileSummary.propTypes = {
  profile:       PropTypes.object.isRequired,
  message:       PropTypes.func.isRequired,
  follow:        PropTypes.func.isRequired,
  openFollowers: PropTypes.func.isRequired,
  openFollowing: PropTypes.func.isRequired,
}

module.exports = UserProfile;
