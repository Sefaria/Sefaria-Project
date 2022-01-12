import React, { useState, useEffect } from 'react';
import Component from 'react-class';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import NoteListing  from './NoteListing';
import Footer  from './Footer';
import {
  CollectionListing,
  FilterableList,
  LoadingMessage,
  TabView,
  SheetListing,
  ProfileListing,
  ProfilePic,
  ScheduleListing,
  MessageModal,
  FollowButton,
  InterfaceText,
  InterfaceOption
} from './Misc';
import { CalendarsPage, reformatCalendars } from './CalendarsPage';
import { Autocompleter } from './Editor'

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
      { id: "sheets", text: "Sheets", icon: "/static/icons/sheet.svg" },
      { id: "collections", text: "Collections", icon: "/static/icons/collection.svg" },
      { id: "schedules", text: "Schedules", icon: "/static/icons/calendar.svg"},
      { id: "followers", text: "Followers", invisible: true },
      { id: "following", text: "Following", invisible: true },
      { id: "torah-tracker", text: "Torah Tracker", invisible: Sefaria._uid !== props.profile.id, icon: "/static/icons/chart-icon.svg", href: "/torahtracker", applink: true, justifyright: true}
    ];
    if (showNotes) {
      tabs.splice(3, 0, { id: "notes", text: Sefaria._("Notes"), icon: "/static/icons/note.svg" });
    }
    if (showBio) {
      tabs.push({ id: "about", text: Sefaria._("About"), icon: "/static/icons/info.svg" });
    }
    let tabIndex = tabs.findIndex(t => t.id == props.tab);
    tabIndex = tabIndex == -1 ? 0 : tabIndex;
    return {
      showNotes,
      showBio,
      tabs,
      tabIndex,
      showSchedule: false
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
            <InterfaceText>{this.props.profile.full_name}</InterfaceText>
            <InterfaceText> hasn't shared any collections yet.</InterfaceText>
          </div>
        </div>);
    }
    return (
      <div className="emptyList">
        <div className="emptyListText">
          <InterfaceText>You can use collections to organize your sheets or public sheets you like. Collections can be shared privately or made public on Sefaria.</InterfaceText>
        </div>
        <a href="/collections/new" className="resourcesLink sans-serif">
          <img src="/static/icons/collection.svg" alt="Collection icon" />
            <InterfaceText>Create a New Collection</InterfaceText>
        </a>
      </div>);
  }
  renderCollection(collection) {
    return (
      <CollectionListing key={collection.slug} data={collection} />
    );
  }
  renderCollectionHeader() {
    if (Sefaria._uid !== this.props.profile.id) { return null; }
    return (
      <div className="sheet-header">
        <a href="/collections/new" className="resourcesLink sans-serif">
          <img src="/static/icons/collection.svg" alt="Collection icon" />
            <InterfaceText>Create a New Collection</InterfaceText>
        </a>
      </div>
    );
  }
  getSchedules() {
    return Sefaria.getUserSchedules(this.props.profile.id);
  }
  getSchedulesFromCache() {
    return Sefaria.getUserSchedulesFromCache(this.props.profile.id);
  }
  filterSchedules(currFilter, collection) {
    const n = text => text.toLowerCase();
    currFilter = n(currFilter);
    return n(collection.name).indexOf(currFilter) > -1;
  }
  sortSchedules(currSortOption, collectionA, collectionB) {
    switch(currSortOption) {
      case "Recent":
        return collectionB.lastModified > collectionA.lastModified ? 1 : -1;
        break;
      case "Name":
        return collectionB.name > collectionA.name ? -1 : 1;
        break;
    }
  }
  handleSchedules() {
    // Rerender Schedules tab when data changes in cache. TODO:: Why is this broken?
    this.setState({ refreshSchedules: Math.random() });
  }
  renderEmptySchedulesList() {
    if (Sefaria._uid !== this.props.profile.id) {
     return (
        <div className="emptyList">
          <div className="emptyListText">
            <InterfaceText>{this.props.profile.full_name}</InterfaceText>
            <InterfaceText> hasn't shared any collections yet.</InterfaceText>
          </div>
        </div>);
    }
    return (
      <div className="emptyList">
        <div className="emptyListText">
          <InterfaceText>You can create schedules to remind you to learn via email or SMS.</InterfaceText>
        </div>
        <button onClick={() => this.setState({showSchedule: true})} className="resourcesLink sans-serif scheduleButton">
          <img src="/static/icons/calendar.svg" alt="Schedule icon" />
            <InterfaceText>Create a New Learning Schedule</InterfaceText>
        </button>
      </div>);
  }
  renderSchedules(collection) {
    return (
      <ScheduleListing key={collection.schedule_name} data={collection} />
    );
  }
  renderSchedulesHeader() {
    if (Sefaria._uid !== this.props.profile.id) { return null; }
    return (
      <div className="schedulesHeader">
        <button onClick={() => this.setState({showSchedule: true})} className="resourcesLink sans-serif">
          <img src="/static/icons/calendar.svg" alt="Schedule icon" />
            <InterfaceText>Create a New Learning Schedule</InterfaceText>
        </button>
      </div>
    );
  }
  closeSchedule() {
    this.setState({showSchedule:false})
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
                        sheet.collections ? sheet.collections.map(collection => collection.name).join(" ") : "",
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
            <InterfaceText>{this.props.profile.full_name}</InterfaceText>
            <InterfaceText> hasn't shared any sheets yet.</InterfaceText>
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
        <a href="/sheets/new" className="resourcesLink sans-serif">
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
        <a href="/sheets/new" className="resourcesLink sans-serif">
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
      <div className="follow-header sans-serif">
        <InterfaceText>Followers</InterfaceText> <span className="follow-count">{`(${this.props.profile.followers.length})`}</span>
      </div>
    );
  }
  renderFollowingHeader() {
    return (
      <div className="follow-header sans-serif">
        <InterfaceText>Following</InterfaceText> <span className="follow-count">{`(${this.props.profile.followees.length})`}</span>
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
              <img className="tabIcon" src={tab.icon} alt={`${tab.text} icon`}/>
              <InterfaceText>{tab.text}</InterfaceText>
            </a>
          </div>
      );
    }
    return (
      <div className="tab">
        <img className="tabIcon" src={tab.icon} alt={`${tab.text} icon`} />
        <InterfaceText>{tab.text}</InterfaceText>
      </div>
    );
  }
  onTabChange(tabIndex) {
    const tab = this.state.tabs[tabIndex];
    this.props.setProfileTab(tab.id);
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
      <div key={this.props.profile.id} className="profile-page readerNavMenu">
        <div className="content noOverflowX">
          {this.props.profile.show_editor_toggle ?  <EditorToggleHeader usesneweditor={this.props.profile.uses_new_editor} /> : null}
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
                  <>
                  {this.state.showSchedule ? <LearningSchedule handleSchedules={this.handleSchedules} closeSchedule={this.closeSchedule}/> : null}
                   <FilterableList
                    key="schedule"
                    pageSize={1e6}
                    filterFunc={this.filterSchedules}
                    sortFunc={this.sortSchedules}
                    renderItem={this.renderSchedules}
                    renderEmptyList={this.renderEmptySchedulesList}
                    renderHeader={this.renderSchedulesHeader}
                    sortOptions={["Recent", "Name"]}
                    getData={this.getSchedules}
                    data={this.getSchedulesFromCache()}
                    refreshData={this.state.refreshSchedules}
                  />
                  </>
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


const BookCorpusAutocompleter = ({updateSelectedItem}) => {
  const [selectedItem, setSelectedItem] = useState("");
  const [showAutocompleter, setShowAutocompleter] = useState(true);
  useEffect(() => {
    console.log(selectedItem);
    updateSelectedItem(selectedItem);
  }, [selectedItem])
  const onSelect = (value) => {
    setSelectedItem(value);
    setShowAutocompleter(false);
  }
  return (showAutocompleter ? <Autocompleter selectedRefCallback={onSelect}/> : <button onClick={() => setShowAutocompleter(true)}>{selectedItem ? selectedItem.toString() : null}</button>)
}


const CustomLearningSchedulePicker = ({currentValues, onUpdate}) => {

  const [startRef, setStartRef] = currentValues ? useState(currentValues.startRef) : useState("");
  const [endRef, setEndRef] = currentValues ? useState(currentValues.endRef) :useState("");
  const [startDate, setStartDate] = currentValues ? useState(currentValues.startDate) :useState(new Date());
  const [endDate, setEndDate] = currentValues ? useState(currentValues.endDate) :useState(null);
  const [rate, setRate] = currentValues ? useState(currentValues.rate) : useState("2");
  const [rateUnit, setRateUnit] = currentValues ? useState(currentValues.rateUnit) :useState("Verses");
  const [unitCount, setUnitCount] = currentValues ? useState(currentValues.unitCount) :useState(null);
  const dropdownTexts = Sefaria.tocObjectByCategories(['Tanakh']).contents.slice(0,2).map(subCat => subCat.contents.map(item => {return {en: item.title, he: item.heTitle}})).flat()

  useEffect(() => {
    if (startRef) {
      $.get(`/api/schedules/pace-calculation?text=${startRef}&pace=${rate}`, applyNewValues);
    } else {
      setEndDate(null);
      setUnitCount(null)
      onUpdate({
        startRef: null,
        endRef: null,
        rate: null,
        unitCount: null
      })
    }
  }, [rate, startRef])

  const applyNewValues = (data) => {
    if(data.pace.toString() === rate) {
      setEndDate(new Date(data.end_date));
      setUnitCount(data.num_of_learning_chunks)
      onUpdate({
        startRef,
        endRef,
        startDate,
        endDate,
        rate,
        rateUnit,
        unitCount
      })
    }
  }

  return (
    <>
      <div className="scheduleFormHorizontal" id="alertsContainer">
        <span className="label">Text to learn: </span>
        {/* <select onChange={$event => setStartRef($event.target.value)} value={startRef || ""}>
          <InterfaceOption key="none" text="None" value=""></InterfaceOption>
          {dropdownTexts.map(text => {
            return <InterfaceOption key={text.en} text={text} value={text.en}></InterfaceOption>
          })}
        </select> */}
        <BookCorpusAutocompleter updateSelectedItem={setStartRef} />
      </div>
      <div className="scheduleDescription">
        {unitCount ? <>It will take you {unitCount.toString()} days to finish learning this text.</> : null}
      </div>
      <div className="scheduleFormHorizontal">
        <span className="label">{rateUnit} per day: </span> <input min="1" type="number" value={rate} onChange={$event => setRate($event.target.value)}></input>
      </div>
      <div className="scheduleFormHorizontal">
        <span className="label">Completion date: </span> {endDate ? Sefaria.util.localeDate(endDate) : null}
      </div>
    </>
  )
}

const LearningSchedule = ({slug, closeSchedule, handleSchedules}) => {
  const scheduleStates = {
    SelectScheduleType: "SelectScheduleType",
    CreateExistingSchedule: "CreateExistingSchedule",
    CreateCustomSchedule: "CreateCustomSchedule",
    AlertsAndSettings: "AlertsAndSettings",
    None: "None"
  }
  const [scheduleFormState, setScheduleFormState] = useState(slug ? scheduleStates.AlertsAndSettings : scheduleStates.SelectScheduleType );
  const [scheduleFormStateArray, setScheduleFormStateArray] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [scheduleOptions, setScheduleOptions] = useState({});
  const [alerts, setAlerts] = useState({email: false, textMessage: false});
  const [alertTime, setAlertTime] = useState("08:00");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [customScheduleValues, setCustomScheduleValues] = useState(null);
  const calendars = reformatCalendars().filter(cal => (!!cal.isDaily));
  const schedulesUrl = '/api/schedules/';

  // update schedule object
  useEffect(() => {
    setScheduleOptions(prevScheduleOptions => {
      return {
      ...prevScheduleOptions,
      schedule,
      alerts: alerts,
      phoneNumber,
      alertTime: new Date(new Date().toDateString() + " " + alertTime).getUTCHours(),
      startRef: customScheduleValues ? customScheduleValues.startRef : null,
      endRef: customScheduleValues? customScheduleValues.endRef : null,
      startDate: customScheduleValues ? customScheduleValues.startDate : null,
      endDate: customScheduleValues ? customScheduleValues.endDate : null,
      rate: customScheduleValues ? customScheduleValues.rate : null,
      rateUnit: customScheduleValues ? customScheduleValues.rateUnit : null,
    }});
  }, [schedule, alerts, phoneNumber, alertTime, customScheduleValues])

  // right now just log schedule
  // useEffect(() => {
  //   console.log(scheduleOptions);
  // }, [scheduleOptions])

  useEffect(() => {
    if(scheduleFormState === scheduleStates.CreateCustomSchedule) {
      setSchedule(null); // get rid of non-custom schedule value if we are using a custom schedule
    } if (scheduleFormState === scheduleStates.AlertsAndSettings && schedule) {
      setCustomScheduleValues(null); // reset custom schedule values if we have decided on a non-custom schedule
    }
  }, [scheduleFormState])

  const forward = newState => {
    setScheduleFormStateArray([...scheduleFormStateArray, scheduleFormState])
    setScheduleFormState(newState);
  }

  const backButton = () => {
    setScheduleFormState(scheduleFormStateArray.slice(-1)[0]);
    setScheduleFormStateArray(scheduleFormStateArray.slice(0, -1))
  }

  const askCloseSchedule = () => {
    if(confirm("Are you sure you want to close the schedule before saving?")) {
      closeSchedule();
    }
  }

  const saveAndClose = () => {
    const postData = {
      start_date: scheduleOptions.startDate ? new Date(scheduleOptions.startDate).toISOString().split('T')[0] : null,
      end_date: scheduleOptions.endDate ? new Date(scheduleOptions.endDate).toISOString().split('T')[0] : null,
      pace: scheduleOptions.rate,
      book: scheduleOptions.startRef,
      time_of_notification: scheduleOptions.alertTime,
      calendar_schedule: scheduleOptions.schedule,
      contact_by_email: scheduleOptions.alerts.email,
      contact_by_sms: scheduleOptions.alerts.textMessage,
      phone_number: scheduleOptions.phoneNumber
    }
    $.post(schedulesUrl, {"json": JSON.stringify(postData)}, function (data) {
      if (data.error) {
          alert(data.error);
      } else {
          console.log(data);
          handleSchedules()
      }
    });
    closeSchedule();
  }

  const getScheduleInfo = (type) => {
    const selectedSchedule = calendars.filter(x => x.title.en === schedule)[0];
    let interfaceText;
    switch(type) {
      case "description":
        interfaceText = selectedSchedule ? (<InterfaceText text={selectedSchedule.description}></InterfaceText>) : !customScheduleValues ? (<InterfaceText>Select a schedule to view a description</InterfaceText>) : null;
        break;
      case "title":
        interfaceText = selectedSchedule ? (<InterfaceText text={selectedSchedule.title}></InterfaceText>) : (<>Custom Schedule: {customScheduleValues.startRef}</>);
        break;
      default:
        interfaceText = null;
        break;
    }
    return interfaceText;
     
  }

  const selectSchedule = () => {
    if(schedule && schedule !== "") {
      forward(scheduleStates.AlertsAndSettings);
    } else {
      alert("Please select a schedule to continue")
    }
  }

  const selectCustomSchedule = () => {
    if(customScheduleValues && customScheduleValues.startRef) {
      forward(scheduleStates.AlertsAndSettings);
    } else {
      alert("Please select a text and a rate to continue");
    }
  }
  
  const getFormContents = () => {
    switch(scheduleFormState) {
      case scheduleStates.SelectScheduleType:
        return (
          <>
          <h3>Select a schedule type</h3>
          {/* <div className="scheduleFormHorizontal"> */}
            <div className="scheduleBox">
              <div>Follow a schedule (like daf yomi, 929, or the weekly parsha) where you'll learn the same thing as other learners around the world.</div>
                <div className="scheduleSelect"><select onChange={$event => setSchedule($event.target.value)} value={schedule || ""}>
                  <InterfaceOption key="none" text="None" value=""></InterfaceOption>
                  {calendars.map(cal => {
                    return <InterfaceOption key={cal.title.en} text={cal.title} value={cal.title.en}></InterfaceOption>
                  })}
                </select>
                  <div className="scheduleDescription">
                    {getScheduleInfo("description")}
                  </div>
                  <button className="small button" onClick={() => selectSchedule()}>Select this Schedule</button>
                </div>
              {/* <button className="small button" onClick={() => forward(scheduleStates.CreateExistingSchedule)}>Existing Schedule</button> */}
            </div>
            <div className="scheduleBox">
              <div>Generate your own schedule. You pick the text and how quickly you'll learn it.</div>
              <button className="small button white" onClick={() => forward(scheduleStates.CreateCustomSchedule)}>Custom Schedule</button>
            </div>
          {/* </div> */}
          </>
          )
      case scheduleStates.CreateExistingSchedule:
        console.log(calendars);
        return <><h3>Create Existing Schedule </h3>
        <div><select onChange={$event => setSchedule($event.target.value)} value={schedule || ""}>
          <InterfaceOption key="none" text="None" value=""></InterfaceOption>
          {calendars.map(cal => {
            return <InterfaceOption key={cal.title.en} text={cal.title} value={cal.title.en}></InterfaceOption>
          })}
        </select>
        <div className="scheduleDescription">
        {getScheduleInfo("description")}
        </div>
        <button className="small button" onClick={() => selectSchedule()}>Select this Schedule</button>
        </div>
        </>
      case scheduleStates.CreateCustomSchedule:
          return <><h3>Create Custom Schedule</h3>
            <div className="scheduleBox">
              <div><button onClick={backButton}>Back</button></div>
              <CustomLearningSchedulePicker currentValues={customScheduleValues} onUpdate={setCustomScheduleValues} />
              <button className="small button" onClick={() => selectCustomSchedule()}>Select this Schedule</button>
            </div>
          </>
      case scheduleStates.AlertsAndSettings:
        return <><h3>Alerts and Settings</h3>
        <div className="scheduleBox">
        <div>
          <span className="label">Learning Schedule: </span><span>{getScheduleInfo("title")}</span> <button onClick={backButton}>Select a different schedule</button>
          <div className="scheduleDescription"><span>{getScheduleInfo("description")}</span></div>
        </div>
        <div className="scheduleFormHorizontal">
          <span className="label">Alerts:</span>
            <input type="checkbox" id="email" key="email" name="email"
            checked={alerts.email} onChange={() => setAlerts(prevAlerts => {return {...prevAlerts, email: !prevAlerts.email}})} />
            <label htmlFor="email">Send Email</label>
            <input type="checkbox" id="text-message" key="text-message" name="text-message"
          checked={alerts.textMessage} onChange={() => setAlerts(prevAlerts => {return {...prevAlerts, textMessage: !prevAlerts.textMessage}})} />
            <label htmlFor="text-message">Send Text</label>{alerts.textMessage ? <PhoneNumberInput setPhoneNumber={setPhoneNumber}/> : null }
        </div>
        <div className="scheduleFormHorizontal">
          <span className="label">Time to send Alert:</span>
            <input type="time" id="alertTime" key="alertTime" name="alertTime" step="3600"
            value={alertTime} onChange={$event => {setAlertTime($event.target.value)}} />
            <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </div>
        <div>
        <button className="small button" onClick={() => saveAndClose()}>Save and Close</button>
        </div>
        </div>
        </>
      case scheduleStates.None:
        return null
      default:
        return <>nada</>;
    }
  }
    return (
      <div className="scheduleFormContainer">
        <div className="scheduleForm">
          {scheduleFormState ? getFormContents() : null}
        </div>
        <div className="scheduleFormHorizontal">
          <button onClick={askCloseSchedule}>Close</button>
        </div>
      </div>
    )
}

const PhoneNumberInput = ({setPhoneNumber}) => {
  return(<div className="phoneNumberInput">+1<input type="tel" placeholder="###-###-####" onChange={$event => setPhoneNumber($event.target.value)}></input></div>) // TODO: make this better
}

const EditorToggleHeader = ({usesneweditor}) => {
 const [feedbackHeaderState, setFeedbackHeaderState] = useState("hidden")

 const text = <InterfaceText>{usesneweditor ? "You are currently testing the new Sefaria editor." : "You are currently using the old Sefaria editor."}</InterfaceText>;
 const buttonText = <InterfaceText>{usesneweditor ? "Go back to old version" : "Try the new version"}</InterfaceText>;

 const sendFeedback = () => {

   const feedback = {
       type: "new_editor",
       email: null,
       msg: $("#feedbackText").val(),
       url: "",
       uid: Sefaria._uid || null
   };
   if (!feedback.msg) {
     setFeedbackHeaderState("thanks")
     return;
   }
   var postData = {json: JSON.stringify(feedback)};
   var url = "/api/send_feedback";

   $.post(url, postData, function (data) {
       if (data.error) {
           alert(data.error);
       } else {
           console.log(data);
           $("#feedbackText").val("");
           Sefaria.track.event("New Editor", "Send Feedback", null);
           setFeedbackHeaderState("thanks")

       }
   }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
       alert(Sefaria._("Unfortunately, there was an error sending this feedback. Please try again or try reloading this page."));
   });
 }

 const disableOverlayContent = (
   <div class="sans-serif-in-hebrew">
      <h2><InterfaceText>Request for Feedback</InterfaceText></h2>
      <p><InterfaceText>Thank you for trying the new Sefaria editor! We’d love to hear what you thought. Please take a few minutes to give us feedback on your experience.</InterfaceText></p>
      <p><InterfaceText>Did you encounter any issues while using the new editor? For example:</InterfaceText></p>
      <ul>
        <li><InterfaceText>Technical problems</InterfaceText></li>
        <li><InterfaceText>Difficulties using the editor</InterfaceText></li>
        <li><InterfaceText>Missing features </InterfaceText></li>
      </ul>

      <p>
        <textarea className="feedbackText" placeholder={Sefaria._("Tell us about it...")} id="feedbackText"></textarea>
      </p>
      <p>
        <a href="#" className="button" role="button" onClick={()=>sendFeedback()}>
            <InterfaceText>Submit Feedback</InterfaceText>
        </a>
      </p>

   </div>
 )
 const enableOverlayContent = (
   <div class="sans-serif-in-hebrew">
      <h2><InterfaceText>Thanks for Trying the New Editor!</InterfaceText></h2>
      <p><InterfaceText>Go to your profile to create a new sheet, or edit an existing sheet, to try out the new experience. After you’ve had a chance to try it out, we would love to hear your feedback. You can reach us at</InterfaceText> <a href="mailto:hello@sefaria.org">hello@sefaria.org</a></p>
      <div className="buttonContainer"><a href="/enable_new_editor" onClick={()=>toggleFeedbackOverlayState()} className="button" role="button"><InterfaceText>Back to Profile</InterfaceText></a></div>
   </div>
 )
 const thankYouContent = (
   <div class="sans-serif-in-hebrew">
      <h2><InterfaceText>Thank you!</InterfaceText></h2>
      <p><InterfaceText>Your feedback is greatly appreciated. You can now edit your sheets again using the old source sheet editor. If you have any questions or additional feedback you can reach us at</InterfaceText> <a href="mailto:hello@sefaria.org">hello@sefaria.org</a>.</p>
      <div className="buttonContainer"><a href="/disable_new_editor" className="button" role="button"><InterfaceText>Back to Profile</InterfaceText></a></div>
   </div>
 )

 let overlayContent;
 switch (feedbackHeaderState) {
   case "disableOverlay":
     overlayContent = disableOverlayContent;
     break;
   case "enableOverlay":
     overlayContent = enableOverlayContent;
     break;
   case "thanks":
     overlayContent = thankYouContent;
     break;
 }

 const toggleFeedbackOverlayState = () => {
   if (usesneweditor) {
     setFeedbackHeaderState("disableOverlay")
   }
   else {
     setFeedbackHeaderState("enableOverlay")
   }
 }
 const buttonLink = (usesneweditor ? "/disable_new_editor" : "");

 return (
   <>
   <div className="editorToggleHeader sans-serif">{text}
     <a href="#" onClick={()=>toggleFeedbackOverlayState()} className="button white" role="button">{buttonText}</a>
   </div>
   {feedbackHeaderState != "hidden" ? <div className="feedbackOverlay">{overlayContent}</div> : null}
   </>
 )
}

const ProfileSummary = ({ profile:p, message, follow, openFollowers, openFollowing, toggleSignUpModal }) => {
  // collect info about this profile in `infoList`
  const social = ['facebook', 'twitter', 'youtube', 'linkedin'];
  let infoList = [];
  if (p.location) { infoList.push(p.location); }
  infoList = infoList.concat(p.jewish_education);
  if (p.website) {
    infoList.push(<span><a href={p.website} target="_blank"><InterfaceText>Website</InterfaceText></a></span>);
  }
  const socialList = social.filter(s => !!p[s]);
  if (socialList.length) {
    infoList = infoList.concat(
      // we only store twitter handles so twitter needs to be hardcoded
      <span>
        {
          socialList.map(s => (<a key={s} className="social-icon" target="_blank" href={(s == 'twitter' ? 'https://twitter.com/' : '') + p[s]}><img src={`/static/img/${s}.svg`} /></a>))
        }
      </span>
    );
  }
  return (
    <div className="profile-summary sans-serif">
      <div className="summary-column profile-summary-content start">
        <div className="title pageTitle">
          <span className="int-en">{p.full_name}</span>
          <span className="int-he">{p.full_name}</span>
        </div>
        { p.position || p.organization ?
          <div className="title sub-title">
            <span>{p.position}</span>
            { p.position && p.organization ? <span>{ Sefaria._(" at ") }</span> : null }
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
            <a href="/settings/profile" className="resourcesLink sans-serif">
              <span className="int-en">Edit Profile</span>
              <span className="int-he">עריכת פרופיל</span>
            </a>
            <a href="/settings/account" className="resourcesLink sans-serif profile-settings">
              <img src="/static/icons/settings.svg" alt="Profile Settings" />
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
            <a href="#" className="resourcesLink sans-serif" onClick={message}>
              <span className="int-en">Message</span>
              <span className="int-he">שליחת הודעה</span>
            </a>
          </div>)
        }
        <div className="follow">
          <a href="" onClick={openFollowers}>
            <InterfaceText>{String(p.followers.length)}</InterfaceText>&nbsp;
            <InterfaceText>followers</InterfaceText>
          </a>
          <span className="follow-bull">&bull;</span>
          <a href="" onClick={openFollowing}>
            <InterfaceText>{String(p.followees.length)}</InterfaceText>&nbsp;
            <InterfaceText>following</InterfaceText>
          </a>
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

export default UserProfile;