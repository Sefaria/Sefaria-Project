import React, { useState, useEffect } from 'react';
import Component from 'react-class';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import {
  CollectionListing,
  FilterableList,
  LoadingMessage,
  TabView,
  SheetListing,
  ProfileListing,
  FollowButton,
  InterfaceText,
} from './Misc';
import {ProfilePic} from "./ProfilePic";
import { SignUpModalKind } from './sefaria/signupModalContent';

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
    const showBio = !!props.profile.bio;
    const tabs = [
      { id: "sheets", text: "Sheets", icon: "/static/icons/sheet.svg" },
      { id: "collections", text: "Collections", icon: "/static/icons/collection.svg" },
      { id: "followers", text: "Followers", invisible: true },
      { id: "following", text: "Following", invisible: true }
    ];
    if (showBio) {
      tabs.push({ id: "about", text: Sefaria._("About"), icon: "/static/icons/info.svg" });
    }
    return {
      showBio,
      tabs,
    };
  }
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
      </div>);
  }
  renderCollection(collection) {
    return (
      <CollectionListing key={collection.slug} data={collection} />
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
        url={`/sheets/profile/${item.slug}`}
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
  follow() {
    Sefaria.followAPI(this.props.profile.id);
  }
  openFollowers(e) {
    e.preventDefault();
    this.props.setTab("followers");
  }
  openFollowing(e) {
    e.preventDefault();
    this.props.setTab("following");
  }

  render() {
    return (
      <div key={this.props.profile.id} className="profile-page readerNavMenu">
        <div className="content noOverflowX">
          {(this.props.profile.id === Sefaria._uid && this.props.profile.show_editor_toggle)  ? <EditorToggleHeader usesneweditor={this.props.profile.uses_new_editor} /> : null}
          <div className="contentInner">
            { !this.props.profile.id ? <LoadingMessage /> :
              <div>
                <ProfileSummary
                  profile={this.props.profile}
                  openFollowers={this.openFollowers}
                  openFollowing={this.openFollowing}
                  toggleSignUpModal={this.props.toggleSignUpModal}
                  multiPanel={this.props.multiPanel}
                  inProfileView={true}
                />
                <TabView
                  ref={this._getTabViewRef}
                  currTabName={this.props.tab}
                  tabs={this.state.tabs}
                  renderTab={this.renderTab}
                  setTab={this.props.setTab}
                >
                 {this.props.profile && 
                    <SheetsList profile={this.props.profile} 
                                  handleSheetDelete={this.handleSheetDelete}
                                  handleCollectionsChange={this.handleCollectionsChange}
                                  toggleSignUpModal={this.props.toggleSignUpModal}/>}

                  {this.props.profile && 
                    <CollectionsList profile={this.props.profile} />}
                  
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
                  { this.state.showBio ?
                    <div className="systemText filterable-list">
                      <div  className="aboutText" dangerouslySetInnerHTML={{ __html: this.props.profile.bio }} />
                    </div> : null
                  }
                </TabView>
            </div>
            }
          </div>
        </div>
      </div>
    );
  }
}
UserProfile.propTypes = {
  profile: PropTypes.object.isRequired,
};

const SheetsList = ({profile, handleSheetDelete, handleCollectionsChange, toggleSignUpModal}) => {
  const [sheets, setSheets] = useState(null);

  useEffect(() => {
    const fetchSheets = async () => {
      try {
        const fetchedSheets = await new Promise((resolve, reject) => {
          Sefaria.sheets.userSheets(
            profile.id,
            sheets => resolve(sheets),
            undefined,
            0,
            0
          );
        });
        setSheets(fetchedSheets);
      } catch (error) {
        console.error("Failed to fetch sheets:", error);
      }
    };

    fetchSheets();
  }, [profile.id]);

  if (!sheets) {
    return <div>Loading sheets...</div>;
  }

  return (
    <div class="sheetsProfileList">
      {sheets.map(sheet => (
        <SheetListing
          key={sheet.id}
          sheet={sheet}
          hideAuthor={true}
          handleSheetDelete={handleSheetDelete}
          handleCollectionsChange={handleCollectionsChange}
          editable={Sefaria._uid === profile.id}
          deletable={Sefaria._uid === profile.id}
          saveable={Sefaria._uid !== profile.id}
          collectable={true}
          connectedRefs={[]}
          infoUnderneath={true}
          toggleSignUpModal={toggleSignUpModal}
        />
      ))}
    </div>
  );
};

const CollectionsList = ({profile}) => {

  const [collections, setCollections] = useState(null);

  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const collections = await Sefaria.getUserCollections(profile.id);
        setCollections(collections);
      } catch (error) {
        console.error("Failed to fetch collections:", error);
      }
    };

    fetchCollections();
  }, [profile.id]);

  if (!collections) {
    return <div>Loading collections...</div>;
  }


  return (
    collections.map(collection =>(<CollectionListing key={collection.slug} data={collection} />))
  );
};





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
        <li><InterfaceText>Missing features</InterfaceText></li>
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


const UserBackground = ({profile: p, showBio, multiPanel}) => {
    // used in ProfileSummary and in SheetContentSidebar, renders user education, organization, and location info
    // if 'showBio', render p.bio; this property corresponds to "About me" in the profile edit view
    const social = ['facebook', 'twitter', 'youtube', 'linkedin'];
    let infoList = [];
    if (p.location) {
        infoList.push(p.location);
    }
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
          socialList.map(s => (<a key={s} className="social-icon" target="_blank" href={(s === 'twitter' ? 'https://twitter.com/' : s === 'youtube' ? 'https://www.youtube.com/' : '') + p[s]}><img src={`/static/img/${s}.svg`} /></a>))
        }
      </span>
        );
    }
    const aboutMe = <div className="title sub-title" dangerouslySetInnerHTML={{ __html: p.bio }}/>;
    const subTitle = <div className="title sub-title">
        <span>{p.position}</span>
        {p.position && p.organization ? <span>{Sefaria._(" at ")}</span> : null}
        <span>{p.organization}</span>
    </div>;
    const infoListComponent = <div className="title sub-sub-title">
                                        {
                                            infoList.map((i, ii) => (
                                                <span key={ii}>
                                                        {ii !== 0 && '\u2022'}
                                                    <span className="small-margin">{i}</span>
                                                </span>
                                            ))
                                        }
                                    </div>;

    return <>{showBio && aboutMe}
             {(p.position || p.organization) && subTitle}
             {infoList.length > 0 && multiPanel && infoListComponent}
           </>;
}


const ProfileSummary = ({
                            profile: p,
                            openFollowers,
                            openFollowing,
                            toggleSignUpModal,
                            multiPanel,
                            inProfileView = false,
                        }) => {

    const followInfo = <div className="follow">
                                 <a href="" onClick={openFollowers}>
                                    <InterfaceText>{String(p.followers.length)}</InterfaceText>&nbsp;
                                    <InterfaceText>followers</InterfaceText>
                                 </a>
                                 <span className="follow-bull">&bull;</span>
                                 <a href="" onClick={openFollowing}>
                                    <InterfaceText>{String(p.followees.length)}</InterfaceText>&nbsp;
                                    <InterfaceText>following</InterfaceText>
                                 </a>
                             </div>;
    const profileButtons = Sefaria._uid === p.id ? (
                                    <div className="profile-actions">
                                        <a href="/settings/profile" className="resourcesLink sans-serif">
                                            <span className="int-en">Edit Profile</span>
                                            <span className="int-he">עריכת פרופיל</span>
                                        </a>
                                    </div>) : (
                                    <div className="profile-actions">
                                        <FollowButton
                                            large={true}
                                            uid={p.id}
                                            following={Sefaria.following.indexOf(p.id) > -1}
                                            toggleSignUpModal={toggleSignUpModal}
                                        />
                                    </div>);
    const profileName = <div className="title pageTitle">
                                    <span className="int-en">{p.full_name}</span>
                                    <span className="int-he">{p.full_name}</span>
                                </div>;

    const tempSheetButton = (
          <a href="/sheets/new" className="resourcesLink sans-serif">
            <span className="int-en">Create Sheet</span>
            <span className="int-he">יצירת דף מקורות</span>
          </a>
      );
  
  const tempCollectionButton = (
          <a href="/collections/new" className="resourcesLink sans-serif">
              <InterfaceText>Create Collection</InterfaceText>
          </a>
      );

    return (
        <div className="profile-summary sans-serif">
            <div className="summary-column profile-summary-content start">
                {profileName}
                <UserBackground profile={p} showBio={false} multiPanel={multiPanel}/>
                {multiPanel && followInfo}
                {inProfileView && (
                <div className="createButtons">
                  {(multiPanel && (Sefaria._uid === p.id)) && tempSheetButton}
                  {(multiPanel && (Sefaria._uid === p.id)) && tempCollectionButton}
                  {!multiPanel && profileButtons}
                </div>
                )}
            </div>
            <div className='profilePicAndButtonContainer'>
              <ProfilePic
                  url={p.profile_pic_url}
                  name={p.full_name}
                  len={175}
                  hideOnDefault={Sefaria._uid !== p.id}
                  showButtons={Sefaria._uid === p.id}
              />
              {multiPanel && profileButtons}
            </div>
            
        </div>
    );
};
ProfileSummary.propTypes = {
    profile: PropTypes.object.isRequired,
    openFollowers: PropTypes.func,
    openFollowing: PropTypes.func,
    toggleSignUpModal: PropTypes.func.isRequired,
};

export { UserProfile, UserBackground };

