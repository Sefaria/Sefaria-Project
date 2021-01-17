import {
  LoadingMessage,
  TabView,
  FilterableList,
  SheetListing,
  SinglePanelNavHeader,
  ProfileListing,
  ProfilePic,
  FollowButton,
  IntText,
} from './Misc';
import React  from 'react';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import { CollectionListing } from './PublicCollectionsPage';
import NoteListing  from './NoteListing';
import Component from 'react-class';
import Footer  from './Footer';

class UserProfile extends Component {
  constructor(props) {
    super(props);
    this.state = this.getPrivateTabState(props);
  }
  componentDidUpdate(prevProps) {
    if (!!this.props.profile && (!prevProps || prevProps.profile.id !== this.props.profile.id) 
        || this.props.tab !== prevProps.tab) {
      this.setState(this.getPrivateTabState(this.props));
    }
  }
  getPrivateTabState(props) {
    const showNotes = !!props.profile.id && Sefaria._uid === props.profile.id;
    const showBio = !!props.profile.bio;
    const tabs = [
      { name: "sheets", text: Sefaria._("Sheets"), icon: "/static/img/sheet.svg" },
      { name: "collections", text: Sefaria._("Collections"), icon: "/static/icons/collection.svg" },
      { name: "followers", text: Sefaria._("Followers"), invisible: true },
      { name: "following", text: Sefaria._("Following"), invisible: true },
      { name: "torah-tracker", text: Sefaria._("Torah Tracker"), invisible: Sefaria._uid !== props.profile.id, icon: "/static/img/chart-icon.svg", href: "/torahtracker", applink: true, justifyright: true}
    ];
    if (showNotes) {
      tabs.splice(2, 0, { name: "notes", text: Sefaria._("Notes"), icon: "/static/img/note.svg" });
    }
    if (showBio) {
      tabs.push({ name: "about", text: Sefaria._("About"), icon: "/static/img/info.svg" });
    }
    let tabIndex = tabs.findIndex(t => t.name == props.tab);
    tabIndex = tabIndex == -1 ? 0 : tabIndex;
    return {
      showNotes,
      showBio,
      tabs,
      tabIndex,
    };
  }
  _getMessageModalRef(ref) { this._messageModalRef = ref; }
  _getTabViewRef(ref) { this._tabViewRef = ref; }
  getCollections() {
    return Sefaria.getUserCollections(this.props.profile.id);
  }
  getCollectionsFromCache() {
    return Sefaria.getUserCollectionsFromCache(this.props.profile.id);
  }
  filterCollection(currFilter, collection) {
    const n = text => text.toLowerCase();
    currFilter = n(currFilter);
    return n(collection.name).indexOf(currFilter) > -1;
  }
  sortCollection(currSortOption, collectionA, collectionB) {
    switch(currSortOption) {
      case "Recent":
        return collectionB.lastModified > collectionA.lastModified ? 1 : -1;
        break;
      case "Name":
        return collectionB.name > collectionA.name ? -1 : 1;
        break;
      case "Sheets":
        return collectionB.sheetCount - collectionA.sheetCount;
        break;
    }
  }
  handleCollectionsChange() {
    // Rerender Collections tab when data changes in cache.
    this.setState({ refreshCollectionsData: Math.random(), refreshSheetData: Math.random() });
  }
  renderEmptyCollectionList() {
    if (Sefaria._uid !== this.props.profile.id) {
     return (
        <div className="emptyList">
          <div className="emptyListText">
            <IntText>{this.props.profile.full_name}</IntText>
            <IntText> hasn't shared any collections yet.</IntText>
          </div>
        </div>);
    }
    return (
      <div className="emptyList">
        <div className="emptyListText">
          <IntText>You can use collections to organize your sheets or public sheets you like. Collections can be shared privately or made public on Sefaria.</IntText>
        </div>
        <a href="/collections/new" className="resourcesLink">
          <img src="/static/icons/collection.svg" alt="Collection icon" />
            <IntText>Create a New Collection</IntText>
        </a>
      </div>);
  }
  renderCollection(collection) {
    return (
      <CollectionListing key={collection.slug} data={collection} showMembership={true} small={true} />
    );
  }
  renderCollectionHeader() {
    if (Sefaria._uid !== this.props.profile.id) { return null; }
    return (
      <div className="sheet-header">
        <a href="/collections/new" className="resourcesLink">
          <img src="/static/icons/collection.svg" alt="Collection icon" />
            <IntText>Create a New Collection</IntText>
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
  getNotesFromCache() {
    return Sefaria.allPrivateNotes();
  }
  onDeleteNote() {
    Sefaria.clearPrivateNotes();
    this.getNotes().then(() => this.setState({ refreshNoteData: Math.random() }));
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
      <div className="emptyList">
        <div className="emptyListText">
          <span className="int-en">0 Notes</span>
          <span className="int-he">0 הערות</span>
        </div>
      </div>
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
  getSheets() {
    return new Promise((resolve, reject) => {
      Sefaria.sheets.userSheets(this.props.profile.id, sheets => {
        resolve(sheets);
      }, undefined, 0, 0);
    });
  }
  getSheetsFromCache() {
    return Sefaria.sheets.userSheets(this.props.profile.id, null, undefined, 0, 0);
  }
  filterSheet(currFilter, sheet) {
    const n = text => text.toLowerCase();
    currFilter = n(currFilter);
    const filterText = [sheet.title.stripHtml(),
                        sheet.topics.map(topic => topic.asTyped).join(" "),
                        sheet.collections.map(collection => collection.name).join(" "),
                        "displayedCollectionName" in sheet ? sheet.displayedCollectionName : "",
                        ].join(" ");
    return n(filterText).indexOf(currFilter) > -1;
  }
  sortSheet(currSortOption, sheetA, sheetB) {
    if (currSortOption === "Recent") { return 0; /* already in order */}
    else {
      return sheetB.views - sheetA.views;
    }
  }
  renderEmptySheetList() {
    if (Sefaria._uid !== this.props.profile.id) {
      return (
        <div className="emptyList">
          <div className="emptyListText">
            <IntText>{this.props.profile.full_name}</IntText>
            <IntText> hasn't shared any sheets yet.</IntText>
          </div>
        </div>
      );
    }
    return (
      <div className="emptyList">
        <div className="emptyListText">
          <span className="int-en">
            You can use sheets to save and organize sources, write new texts, create
            lessons, lectures, articles, and more.
          </span>
          <span className="int-he">
            באפשרותכם להשתמש בדפי מקורות בכדי לארגן מקורות, ליצור טקסטים חדשים, לתכנן שיעורים, הרצאות, כתבות ועוד.
          </span>
        </div>
        <a href="/sheets/new" className="resourcesLink">
          <img src="/static/img/sheet.svg" alt="Source sheet icon" />
          <span className="int-en">Create a New Sheet</span>
          <span className="int-he">צור דף חדש</span>
        </a>
      </div>
    );
  }
  handleSheetDelete() {
    Sefaria.sheets.clearUserSheets(Sefaria._uid);
    this.getSheets().then(() => this.setState({ refreshSheetData: Math.random() }));
    Sefaria._collections = {};
    delete Sefaria._userCollections[Sefaria._uid];
    this.getCollections().then(() => this.setState({refreshCollectionsData: Math.random() }));
  }
  renderSheet(sheet) {
    return (
      <SheetListing
        key={sheet.id}
        sheet={sheet}
        hideAuthor={true}
        handleSheetDelete={this.handleSheetDelete}
        handleCollectionsChange={this.handleCollectionsChange}
        editable={Sefaria._uid === this.props.profile.id}
        deletable={Sefaria._uid === this.props.profile.id}
        saveable={Sefaria._uid !== this.props.profile.id}
        collectable={true}
        connectedRefs={[]}
        infoUnderneath={true}
        toggleSignUpModal={this.props.toggleSignUpModal}
      />
    );
  }
  renderSheetHeader() {
    if (Sefaria._uid !== this.props.profile.id) { return null; }
    return (
      <div className="sheet-header">
        <a href="/sheets/new" className="resourcesLink">
          <img src="/static/img/sheet.svg" alt="Source sheet icon" />
          <span className="int-en">Create a New Sheet</span>
          <span className="int-he">יצירת דף מקורות</span>
        </a>
      </div>
    );
  }
  getFollowers() {
    return Sefaria.followAPI(this.props.profile.slug, "followers");
  }
  getFollowing() {
    return Sefaria.followAPI(this.props.profile.slug, "following");
  }
  filterFollower(currFilter, follower) {
    const n = text => text.toLowerCase();
    currFilter = n(currFilter);
    return n(follower.full_name).indexOf(currFilter) > -1 || n(follower.position).indexOf(currFilter) > -1;
  }
  renderFollowerHeader() {
    return (
      <div className="follow-header">
        {Sefaria._("Followers")} <span className="follow-count">{`(${this.props.profile.followers.length})`}</span>
      </div>
    );
  }
  renderFollowingHeader() {
    return (
      <div className="follow-header">
        {Sefaria._("Following")} <span className="follow-count">{`(${this.props.profile.followees.length})`}</span>
      </div>
    );
  }
  renderFollower(item) {
    return (
      <ProfileListing
        key={item.id}
        uid={item.id}
        slug={item.slug}
        url={`/profile/${item.slug}`}
        name={item.full_name}
        image={item.profile_pic_url}
        is_followed={Sefaria.following.indexOf(item.id) > -1}
        position={item.position}
        organization={item.organization}
        toggleSignUpModal={this.props.toggleSignUpModal}
      />
    );
  }
  renderEmptyFollowerList() {
    return (
      <div>
        <span className="int-en">0 followers</span>
        <span className="int-he">0 עוקבים</span>
      </div>
    );
  }
  renderEmptyFollowingList() {
    return (
      <div>
        <span className="int-en">0 following</span>
        <span className="int-he">0 נעקבים</span>
      </div>
    );
  }
  renderTab(tab) {
    if (tab.invisible) { return null; }
    if (tab.applink) {
      return (
          <div className="tab">
            <a href={tab.href}>
              <img src={tab.icon} alt={`${tab.text} icon`}/>
              {tab.text}
            </a>
          </div>
      );
    }
    return (
      <div className="tab">
        <img src={tab.icon} alt={`${tab.text} icon`} />
        {tab.text}
      </div>
    );
  }
  onTabChange(tabIndex) {
    const tab = this.state.tabs[tabIndex];
    this.props.setProfileTab(tab.name);
  }
  message(e) {
    e.preventDefault();
    if (!Sefaria._uid) { this.props.toggleSignUpModal(); return; }
    this._messageModalRef.makeVisible();
  }
  follow() { 
    Sefaria.followAPI(this.props.profile.id);
  }
  openFollowers(e) {
    e.preventDefault();
    this.props.setProfileTab("followers");
  }
  openFollowing(e) {
    e.preventDefault();
    this.props.setProfileTab("following");
  }
  render() {
    return (
      <div key={this.props.profile.id} className="profile-page readerNavMenu noHeader">
        {this.props.multiPanel ? null :
          <SinglePanelNavHeader
            title="Profile"
            navHome={this.props.navHome}
            showDisplaySettings={false}/>
        }
        <div className="content hasFooter noOverflowX">
          <div className="contentInner">
            { !this.props.profile.id ? <LoadingMessage /> :
              <div>
                <ProfileSummary
                  profile={this.props.profile}
                  message={this.message}
                  follow={this.follow}
                  openFollowers={this.openFollowers}
                  openFollowing={this.openFollowing}
                  toggleSignUpModal={this.props.toggleSignUpModal}
                />
                <TabView
                  ref={this._getTabViewRef}
                  tabs={this.state.tabs}
                  renderTab={this.renderTab}
                  currTabIndex={this.state.tabIndex}
                  setTab={this.onTabChange}
                >
                  <FilterableList
                    key="sheet"
                    pageSize={1e6}
                    filterFunc={this.filterSheet}
                    sortFunc={this.sortSheet}
                    renderItem={this.renderSheet}
                    renderEmptyList={this.renderEmptySheetList}
                    renderHeader={this.renderSheetHeader}
                    sortOptions={["Recent", "Views"]}
                    containerClass={"sheetList"}
                    getData={this.getSheets}
                    data={this.getSheetsFromCache()}
                    refreshData={this.state.refreshSheetData}
                  />
                  <FilterableList
                    key="collection"
                    pageSize={1e6}
                    filterFunc={this.filterCollection}
                    sortFunc={this.sortCollection}
                    renderItem={this.renderCollection}
                    renderEmptyList={this.renderEmptyCollectionList}
                    renderHeader={this.renderCollectionHeader}
                    sortOptions={["Recent", "Name", "Sheets"]}
                    getData={this.getCollections}
                    data={this.getCollectionsFromCache()}
                    refreshData={this.state.refreshCollectionsData}
                  />
                  {
                    this.state.showNotes ? (
                      <FilterableList
                        key="note"
                        pageSize={1e6}
                        filterFunc={this.filterNote}
                        sortFunc={this.sortNote}
                        renderItem={this.renderNote}
                        renderEmptyList={this.renderEmptyNoteList}
                        sortOptions={[]}
                        getData={this.getNotes}
                        data={this.getNotesFromCache()}
                        refreshData={this.state.refreshNoteData}
                      />
                    ) : null
                  }
                  <FilterableList
                    key="follower"
                    pageSize={1e6}
                    filterFunc={this.filterFollower}
                    sortFunc={() => { return 0; }}
                    renderItem={this.renderFollower}
                    renderEmptyList={this.renderEmptyFollowerList}
                    renderHeader={this.renderFollowerHeader}
                    sortOptions={[]}
                    getData={this.getFollowers}
                  />
                  <FilterableList
                    key="following"
                    pageSize={1e6}
                    filterFunc={this.filterFollower}
                    sortFunc={() => { return 0; }}
                    renderItem={this.renderFollower}
                    renderEmptyList={this.renderEmptyFollowingList}
                    renderHeader={this.renderFollowingHeader}
                    sortOptions={[]}
                    getData={this.getFollowing}
                  />
                  <div className="torahTrackerPlaceholder filterable-list" />
                  { this.state.showBio ?
                    <div className="systemText filterable-list">
                      <div  className="aboutText" dangerouslySetInnerHTML={{ __html: this.props.profile.bio }} />
                    </div> : null
                  }
                </TabView>
            </div>
            }
            <MessageModal uid={this.props.profile.id} name={this.props.profile.full_name} ref={this._getMessageModalRef} />
          </div>
          <Footer />
        </div>
      </div>
    );
  }
}
UserProfile.propTypes = {
  profile: PropTypes.object.isRequired,
};

const ProfileSummary = ({ profile:p, message, follow, openFollowers, openFollowing, toggleSignUpModal }) => {
  // collect info about this profile in `infoList`
  const social = ['facebook', 'twitter', 'youtube', 'linkedin'];
  let infoList = [];
  if (p.location) { infoList.push(p.location); }
  infoList = infoList.concat(p.jewish_education);
  if (p.website) {
    infoList.push(<span><a href={p.website} target="_blank">{Sefaria._("Website")}</a></span>);
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
      <div className="summary-column profile-summary-content start">
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
              <span className="int-en">Edit Profile</span>
              <span className="int-he">עריכת פרופיל</span>
            </a>
            <a href="/settings/account" className="resourcesLink">
              <img src="/static/img/settings.svg" alt="Profile Settings" />
              <span className="int-en">Settings</span>
              <span className="int-he">הגדרות</span>
            </a>
            <a href="/logout" className="button transparent logoutLink">
              <span className="int-en">Log Out</span>
              <span className="int-he">ניתוק</span>
            </a>
          </div>) : (
          <div className="profile-actions">
            <FollowButton
              large={true}
              uid={p.id}
              following={Sefaria.following.indexOf(p.id) > -1}
              toggleSignUpModal={toggleSignUpModal}
            />
            <a href="#" className="resourcesLink" onClick={message}>
              <span className="int-en">Message</span>
              <span className="int-he">שלח הודעה</span>
            </a>
          </div>)
        }
        <div className="follow">
          <a href="" onClick={openFollowers}>{ `${p.followers.length} ${Sefaria._("followers")}`}</a>
          <span className="follow-bull">&bull;</span>
          <a href="" onClick={openFollowing}>{ `${p.followees.length} ${Sefaria._("following")}`}</a>
        </div>
      </div>
      <div className="summary-column end">
        <ProfilePic
          url={p.profile_pic_url}
          name={p.full_name}
          len={175}
          hideOnDefault={Sefaria._uid !== p.id}
          showButtons={Sefaria._uid === p.id}
        />
      </div>
    </div>
  );
};
ProfileSummary.propTypes = {
  profile:       PropTypes.object.isRequired,
  message:       PropTypes.func.isRequired,
  follow:        PropTypes.func.isRequired,
  openFollowers: PropTypes.func.isRequired,
  openFollowing: PropTypes.func.isRequired,
  toggleSignUpModal: PropTypes.func.isRequired,
};


class MessageModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      visible: false,
      message: '',
    };
  }
  onChange(e) { this.setState({ message: e.target.value }); }
  onSend(e) {
    if (!this.state.message) { return; }
    Sefaria.messageAPI(this.props.uid, this.state.message).then(() => {
      this.setState({ visible: false });
      alert("Message Sent");
      Sefaria.track.event("Messages", "Message Sent", "");
    });
  }
  makeVisible() { this.setState({ visible: true }); }
  onCancel(e) { this.setState({ visible: false }); }
  render() {
    if (!this.state.visible) { return null; }
    return (
      <div id="interruptingMessageBox" className="sefariaModalBox">
        <div id="interruptingMessageOverlay" onClick={this.onCancel}></div>
        <div id="interruptingMessage" className='message-modal' style={{display: 'block'}}>
          <div className='messageHeader'>{ `${Sefaria._("Send a message to ")}${this.props.name}` }</div>
          <textarea value={this.state.message} onChange={this.onChange} />
          <div className='sendMessage button' onClick={this.onSend}>{ Sefaria._("Send") }</div>
          <div className='cancel button white' onClick={this.onCancel}>{ Sefaria._("Cancel") }</div>
        </div>
      </div>
    );
  }
}
MessageModal.propTypes = {
  name: PropTypes.string.isRequired,
  uid:  PropTypes.number.isRequired,
};
export default UserProfile;
