import {
  CategoryColorLine,
  DropdownModal,
  DropdownButton,
  DropdownOptionList,
  InterfaceTextWithFallback,
  LanguageToggleButton,
  LoadingMessage,
  TwoOrThreeBox,
  SheetListing,
  SinglePanelNavHeader,
  ProfilePic,
  IntText,
} from './Misc';
import React  from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import Footer  from './Footer';
import Component from 'react-class';


class CollectionPage extends Component {
  constructor(props) {
    super(props);

    const collectionData = Sefaria.getCollectionFromCache(props.slug);
    const sheetSort = "date";
    if (collectionData) { this.sortSheetData(collectionData, sheetSort); }

    this.state = {
      showTopics: collectionData && !!collectionData.showTagsByDefault && !props.tag,
      sheetFilterTopic: props.tag,
      sheetSort: sheetSort,
      displaySort: false,
      tab: "sheets",
      collectionData: collectionData,
    };
  }
  componentDidMount() {
    this.loadData();
  }
  componentDidUpdate(prevProps, prevState) {
    if (this.props.slug !== prevProps.slug) {
      this.setState({collectionData: null});
      this.loadData();
    }

    if (!this.state.showTopics && prevState.showTopics && $(".content").scrollTop() > 570) {
      $(".content").scrollTop(570);
    }
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.tag !== this.state.sheetFilterTopic) {
      this.setState({sheetFilterTopic: nextProps.tag});
      if (this.showTagsByDefault && nextProps.tag == null) {
        this.setState({showTopics: true});
      }
      if (nextProps.tag !== null) {
        this.setState({showTopics: false});
      }
    }
  }
  loadData() {
    Sefaria.getCollection(this.props.slug)
      .then(collectionData => {
        this.sortSheetData(collectionData, this.state.sheetSort);
        this.setState({
          collectionData,
          showTopics: !!collectionData.showTagsByDefault && !this.props.tag
        });
        this.props.updateCollectionName(collectionData.name);
      });
  }
  onDataChange() {
    this.setState({collectionData: Sefaria._collections[this.props.slug]});
  }
  sortSheetData(collection, sheetSort) {
    // Warning: This sorts the sheets within the cached collection item in sefaria.js
    if (!collection.sheets) { return; }

    const sorters = {
      date: function(a, b) {
        return Date.parse(b.modified) - Date.parse(a.modified);
      },
      alphabetical: function(a, b) {
        return a.title.stripHtml().trim().toLowerCase() > b.title.stripHtml().trim().toLowerCase() ? 1 : -1;
      },
      views: function(a, b) {
        return b.views - a.views;
      }
    };
    collection.sheets.sort(sorters[sheetSort]);

    if (this.props.name == "גיליונות נחמה"){
      let parshaOrder = ["Bereshit", "Noach", "Lech Lecha", "Vayera", "Chayei Sara", "Toldot", "Vayetzei", "Vayishlach", "Vayeshev", "Miketz", "Vayigash", "Vayechi", "Shemot", "Vaera", "Bo", "Beshalach", "Yitro", "Mishpatim", "Terumah", "Tetzaveh", "Ki Tisa", "Vayakhel", "Pekudei", "Vayikra", "Tzav", "Shmini", "Tazria", "Metzora", "Achrei Mot", "Kedoshim", "Emor", "Behar", "Bechukotai", "Bamidbar", "Nasso", "Beha'alotcha", "Sh'lach", "Korach", "Chukat", "Balak", "Pinchas", "Matot", "Masei", "Devarim", "Vaetchanan", "Eikev", "Re'eh", "Shoftim", "Ki Teitzei", "Ki Tavo", "Nitzavim", "Vayeilech", "Ha'Azinu", "V'Zot HaBerachah"]
      if (this.props.interfaceLang == "english") {
        parshaOrder = ["English"].concat(parshaOrder);
      }
      collection.pinnedTags = parshaOrder;
    }

    if (collection.pinnedSheets && collection.pinnedSheets.length > 0) {
      this.pinSheetsToSheetList(collection);
    }
    if (collection.pinnedTags && collection.pinnedTags.length > 0) {
      this.sortTags(collection);
    }
  }
  pinSheetsToSheetList(collection){
    // Applies any pinned sheets to the sorting of sheets list
    var sortPinned = function(a, b) {
      var ai = collection.pinnedSheets.indexOf(a.id);
      var bi = collection.pinnedSheets.indexOf(b.id);
      if (ai == -1 && bi == -1) { return 0; }
      if (ai == -1) { return 1; }
      if (bi == -1) { return -1; }
      return  ai < bi ? -1 : 1;
    };
    collection.sheets.sort(sortPinned);
  }
  sortTags(collection) {
     var sortTags = function(a, b) {
      var ai = collection.pinnedTags.indexOf(a.asTyped);
      var bi = collection.pinnedTags.indexOf(b.asTyped);
      if (ai == -1 && bi == -1) { return 0; }
      if (ai == -1) { return 1; }
      if (bi == -1) { return -1; }
      return  ai < bi ? -1 : 1;
    };
    collection.topics.sort(sortTags);
  }
  setTab(tab) {
    this.setState({tab: tab});
  }
  toggleSheetTags() {
    if (this.state.showTopics) {
      this.setState({showTopics: false});
    } else {
      this.setState({showTopics: true, sheetFilterTopic: null});
      this.props.setCollectionTag(null);
    }
  }
  setSheetTag(topic) {
    this.setState({sheetFilterTopic: topic, showTopics: false});
    this.props.setCollectionTag(topic);
  }
  handleTagButtonClick (topic) {
    if (topic == this.state.sheetFilterTopic) {
      this.setState({sheetFilterTopic: null, showTopics: false});
      this.props.setCollectionTag(null);
    } else {
      this.setSheetTag(topic);
    }
  }
  changeSheetSort(value) {
    let collectionData = this.state.collectionData;
    this.sortSheetData(collectionData, value);
    this.setState({collectionData, sheetSort: value, displaySort: false});
  }
  searchCollection(query) {
    this.props.searchInCollection(query, this.state.collectionData.name);
  }
  handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      if (query) {
        this.searchCollection(query);
      }
    }
  }
  handleSearchButtonClick(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".collectionSearchInput").val();
    if (query) {
      this.searchCollection(query);
    }
  }
  memberList() {
    var collection = this.state.collectionData;
    if (!collection) { return null; }
    var admins = collection.admins.map(function(member) {member.role = "Owner"; return member; });
    var members = collection.members.map(function(member) {member.role = "Editor"; return member; });
    var invitations = collection.invitations.map(function(member) {member.role = "Invitation"; return member; });

    return admins.concat(members, invitations);
  }
  pinSheet(sheetId) {
    if (this.pinning) { return; }
    $.post("/api/collections/" + this.props.slug + "/pin-sheet/" + sheetId, function(data) {
      if ("error" in data) {
        alert(data.error);
      } else {
        Sefaria._collections[this.props.slug] = data.collection;
        this.sortSheetData(data.collection);
        this.setState({collectionData: data.collection});
      }
      this.pinning = false;
    }.bind(this)).fail(function() {
        alert(Sefaria._("There was an error pinning your sheet."));
        this.pinning = false;
    }.bind(this));
    this.pinning = true;
  }
  render() {
    const collection = this.state.collectionData;
    let content;

    if (!collection) {
      content = <div className="contentInner"><LoadingMessage /></div>;
    } else {
      var sheets         = collection.sheets;
      var topicList      = collection.topics;
      var members        = this.memberList();
      var isMember       = members && members.filter(function(x) { return x.uid == Sefaria._uid } ).length !== 0;
      var isAdmin        = collection.admins.filter(function(x) { return x.uid == Sefaria._uid } ).length !== 0;

      topicList = topicList ? topicList.map(topic => {
          const filterThisTag = this.handleTagButtonClick.bind(this, topic.slug);
          const classes = classNames({navButton: 1, sheetButton: 1, active: this.state.sheetFilterTopic == topic.slug});
          return (<div className={classes} onClick={filterThisTag} key={topic.slug}>
            <InterfaceTextWithFallback en={topic.en} he={topic.he} endContent={<span className="enInHe">{` (${topic.count})`}</span>} />
          </div>);
        }) : null;

      sheets = this.state.sheetFilterTopic ? sheets.filter(sheet => sheet.topics && sheet.topics.reduce((accum, curr) => accum || this.state.sheetFilterTopic === curr.slug, false)) : sheets;
      sheets = sheets.map(function(sheet) {
        return (<SheetListing
                  sheet={sheet}
                  hideAuthor={true}
                  infoUnderneath={true}
                  showAuthorUnderneath={true}
                  hideCollection={true}
                  pinned={collection.pinnedSheets.indexOf(sheet.id) != -1}
                  pinnable={isMember}
                  editable={sheet.author == Sefaria._uid}
                  saveable={sheet.author !== Sefaria._uid && !isMember}
                  collectable={true}
                  pinSheet={this.pinSheet.bind(null, sheet.id)}
                  handleCollectionsChange={this.onDataChange}
                  toggleSignUpModal={this.props.toggleSignUpModal}
                  key={sheet.id} />);
      }.bind(this));     

      content = <div className="contentInner">
        {collection.imageUrl ?
          <img className="collectionImage" src={collection.imageUrl} alt={this.props.name}/>
          : null }

        <div className="collectionInfo">
          <h1>
            {collection.toc ?
            <span>
              { this.props.multiPanel && this.props.interfaceLang !== "hebrew" ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
              <span className="en">{collection.toc.title}</span>
              <span className="he">{collection.toc.heTitle}</span>
            </span>
            : collection.name }
          </h1>

          {collection.websiteUrl ?
            <a className="collectionWebsite" target="_blank" href={collection.websiteUrl}>{collection.websiteUrl}</a>
            : null }

          {collection.toc ?
            <div className="collectionDescription">
              <span>
                <span className="en" dangerouslySetInnerHTML={ {__html: collection.toc.description} }></span>
                <span className="he"dangerouslySetInnerHTML={ {__html: collection.toc.heDescription} }></span>
              </span>
            </div>
          : collection.description ?
            <div className="collectionDescription"  dangerouslySetInnerHTML={ {__html: collection.description} }></div>
          : null }
        </div>

        <div className="tabs">
          <a className={classNames({bubbleTab: 1, active: this.state.tab == "sheets"})} onClick={this.setTab.bind(null, "sheets")}>
            <span className="int-en">Sheets</span>
            <span className="int-he">דפי מקורות</span>
          </a>
          <a className={classNames({bubbleTab: 1, active: this.state.tab == "members"})} onClick={this.setTab.bind(null, "members")}>
            <IntText>Editors</IntText>
          </a>
          { isAdmin ?
            <a className="bubbleTab" href={"/collections/" + collection.slug + "/settings"}>
              <span className="int-en">Settings</span>
              <span className="int-he">הגדרות</span>
            </a>
            : null }
        </div>

        { this.state.tab == "sheets" ?
          <div className="sheetList">
            {sheets.length ?
            <div className="splitHeader">
              { topicList && topicList.length ?
              <span className="filterByTag" onClick={this.toggleSheetTags}>
                <span className="int-en" >Filter By Tag <i className="fa fa-angle-down"></i></span>
                <span className="int-he">סנן לפי תווית <i className="fa fa-angle-down"></i></span>
               </span>
               : <div /> }

              <DropdownModal close={()=>this.setState({displaySort: false})} isOpen={this.state.displaySort}>
                <DropdownButton
                  isOpen={this.state.displaySort}
                  toggle={()=>this.setState({displaySort: !this.state.displaySort})}
                  enText={"Sort"}
                  heText={"מיון"}
                />
                <DropdownOptionList
                  isOpen={this.state.displaySort}
                  options={[{type: "date", name: "Recent", heName: "הכי חדש"}, {type: "alphabetical", name:"Alphabetical", heName: "אלפביתי"}, {type: "views", name:"Most Viewed", heName: "הכי נצפה"}]}
                  currOptionSelected={this.state.sheetSort}
                  handleClick={this.changeSheetSort}
                />
              </DropdownModal>
            </div>
            : null }

          {collection.listed ?
            <div className="collectionSearchBox">
              <img className="collectionSearchIcon" src="/static/icons/iconmonstr-magnifier-2.svg" onClick={this.handleSearchButtonClick} />
              <input
                className="collectionSearchInput"
                placeholder={Sefaria._("Search")}
                onKeyUp={this.handleSearchKeyUp} />
          </div> : null}

          {this.state.showTopics ? <div className="tagsList"><TwoOrThreeBox content={topicList} width={this.props.width} /></div> : null}

          {sheets.length && !this.state.showTopics ? sheets : null}

          {!sheets.length ? (isMember ?
                  <div className="emptyMessage">
                    <IntText>You can add sheets to this collection on your profile.</IntText>
                    <br />
                    <a className="button" href="/my/profile">
                      <IntText>Open Profile</IntText>
                    </a>
                  </div>
                : <div className="emptyMessage">
                    <IntText>There are no sheets in this collection yet.</IntText>
                  </div>) : null}
          </div>
          : null }

          {this.state.tab == "members" ?
            <div>
             {isAdmin ? <CollectionInvitationBox slug={this.props.slug} onDataChange={this.onDataChange}/> : null }
             { members.map(function (member, i) {
                return <CollectionMemberListing
                        member={member}
                        isAdmin={isAdmin}
                        isSelf={member.uid == Sefaria._uid}
                        slug={this.props.slug}
                        onDataChange={this.onDataChange}
                        key={i} />
                }.bind(this) )
              }
            </div>
          : null }
      </div>
    }

    var classes = classNames({readerNavMenu: 1, noHeader: this.props.hideNavHeader});
    return <div className={classes}>
            <CategoryColorLine category="Sheets" />
            {this.props.hideNavHeader ? null :
            <SinglePanelNavHeader
              title="Collection"
              navHome={this.props.navHome}
              showDisplaySettings={false}/>}

            <div className="content collectionPage hasFooter">
              {content}
              <Footer />
            </div>;
          </div>
  }
}
CollectionPage.propTypes = {
  name:               PropTypes.string,
  slug:               PropTypes.string,
  width:              PropTypes.number,
  multiPanel:         PropTypes.bool,
  tag:                PropTypes.string,
  interfaceLang:      PropTypes.string,
  searchInCollection: PropTypes.func,
};


class CollectionInvitationBox extends Component {
  constructor(props) {
    super(props);

    this.state = {
      inviting: false,
      message: null
    };
  }
  onInviteClick() {
    if (!this.state.inviting) {
      this.inviteByEmail($("#collectionInvitationInput").val());
    }
  }
  flashMessage(message) {
    this.setState({message: message});
    setTimeout(function() {
      this.setState({message: null});
    }.bind(this), 5000);
  }
  inviteByEmail(email) {
    if (!this.validateEmail(email)) {
      this.flashMessage(Sefaria._("Please enter a valid email address."));
      return;
    }
    this.setState({inviting: true, message: Sefaria._("Inviting...")})
    $.post("/api/collections/" + this.props.slug + "/invite/" + email, function(data) {
      if ("error" in data) {
        alert(data.error);
        this.setState({message: null, inviting: false});
      } else {
        Sefaria._collections[this.props.slug] = data.collection;
        $("#collectionInvitationInput").val("");
        this.flashMessage(data.message);
        this.setState({inviting: false})
        this.props.onDataChange();
      }
    }.bind(this)).fail(function() {
        alert(Sefaria._("There was an error sending your invitation."));
        this.setState({message: null, inviting: false});
    }.bind(this));
  }
  validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }
  render() {
    return (<div className="collectionInvitationBox">
              <div className="collectionInvitationBoxInner">
                <input id="collectionInvitationInput" placeholder={Sefaria._("Email Address")} />
                <div className="button" onClick={this.onInviteClick}>
                  <IntText>Invite</IntText>
                </div>
              </div>
              {this.state.message ?
                <div className="collectionInvitationBoxMessage"><IntText>{this.state.message}</IntText></div>
                : null}
            </div>);
  }
}
CollectionInvitationBox.propTypes = {
  slug: PropTypes.string.isRequired,
  onDataChange: PropTypes.func.isRequired,
};


class CollectionMemberListing extends Component {
  render() {
    if (this.props.member.role == "Invitation") {
      return this.props.isAdmin ?
        <CollectionInvitationListing
          member={this.props.member}
          slug={this.props.slug}
          onDataChange={this.props.onDataChange} />
        : null;
    }

    return (
      <div className="collectionMemberListing">
        <div className="collectionLeft">
          <a href={this.props.member.profileUrl}>
            <ProfilePic
              url={this.props.member.imageUrl}
              name={this.props.member.name}
              len={50}
            />
          </a>

          <a href={this.props.member.profileUrl} className="collectionMemberListingName">
            {this.props.member.name}
          </a>
        </div>

        <div className="collectionMemberListingRoleBox">
          <span className="collectionMemberListingRole"><IntText>{this.props.member.role}</IntText></span>
          {this.props.isAdmin || this.props.isSelf ?
            <CollectionMemberListingActions
              member={this.props.member}
              slug={this.props.slug}
              isAdmin={this.props.isAdmin}
              isSelf={this.props.isSelf}
              onDataChange={this.props.onDataChange} />
            : null }
        </div>

      </div>);
  }
}
CollectionMemberListing.propTypes ={
  member:       PropTypes.object.isRequired,
  isAdmin:      PropTypes.bool,
  isSelf:       PropTypes.bool,
  slug:         PropTypes.string,
  onDataChange: PropTypes.func.isRequired,
};


class CollectionInvitationListing extends Component {
  render() {
    return (
      <div className="collectionMemberListing">
        <span className="collectionInvitationListing">
          {this.props.member.email}
        </span>

        <div className="collectionMemberListingRoleBox">
          <span className="collectionMemberListingRole"><IntText>Invited</IntText></span>
          <CollectionMemberListingActions
            member={this.props.member}
            slug={this.props.slug}
            isInvitation={true}
            onDataChange={this.props.onDataChange} />
        </div>

      </div>);
  }
}
CollectionInvitationListing.propTypes = {
  member:       PropTypes.object.isRequired,
  slug:         PropTypes.string,
  onDataChange: PropTypes.func,
};


class CollectionMemberListingActions extends Component {
  constructor(props) {
    super(props);

    this.state = {
      menuOpen: false,
      invitationResent: false
    };
  }
  componentDidMount() {
    document.addEventListener('mousedown', this.handleClickOutside, false);
  }
  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleClickOutside, false);
  }
  handleClickOutside(event) {
    const domNode = ReactDOM.findDOMNode(this);
    if (((!domNode || !domNode.contains(event.target))) && this.state.menuOpen) {
      this.setState({menuOpen: false});
    }
  }
  toggleMenu() {
    this.setState({menuOpen: !this.state.menuOpen});
  }
  setRole(role) {
    if (this.props.isSelf && this.props.isAdmin && role !== "admin") {
      if (!confirm(Sefaria._("Are you sure you want to change your collection role? You won't be able to undo this action unless another owner restores your permissions."))) {
        return;
      }
    }

    $.post("/api/collections/" + this.props.slug + "/set-role/" + this.props.member.uid + "/" + role, function(data) {
      if ("error" in data) {
        alert(data.error)
      } else {
        Sefaria._collections[data.slug] = data;
        this.props.onDataChange();
      }
    }.bind(this));
  }
  removeMember() {
    var message = this.props.isSelf ?
      Sefaria._("Are you sure you want to leave this collection?") :
      Sefaria._("Are you sure you want to remove this person from this collection?");

    if (confirm(message)) {
      this.setRole("remove");
    }
  }
  resendInvitation() {
    $.post("/api/collections/" + this.props.slug + "/invite/" + this.props.member.email, function(data) {
      if ("error" in data) {
        alert(data.error)
      } else {
        Sefaria._collections[this.props.slug] = data.collection;
        this.props.onDataChange();
        this.setState({"invitationResent": true});
      }
    }.bind(this));
  }
  removeInvitation() {
    if (confirm(Sefaria._("Are you sure you want to remove this invitation?"))) {
      $.post("/api/collections/" + this.props.slug + "/invite/" + this.props.member.email + "/uninvite", function(data) {
        if ("error" in data) {
          alert(data.error)
        } else {
          Sefaria._collections[this.props.slug] = data.collection;
          this.props.onDataChange();
        }
      }.bind(this));
    }
  }
  render() {
    return (
      <div className="collectionMemberListingActions" onClick={this.toggleMenu}>
        <div className="collectionMemberListingActionsButton">
          <i className="fa fa-gear"></i>
        </div>
        {this.state.menuOpen ?
          <div className="collectionMemberListingActionsMenu">
            {this.props.isAdmin ?
              <div className="action" onClick={this.setRole.bind(this, "admin")}>
                <span className={classNames({role: 1, current: this.props.member.role == "Owner"})}><IntText>Owner</IntText></span>
                - <IntText>can invite & edit settings</IntText>
              </div>
              : null }
            {this.props.isAdmin ?
              <div className="action" onClick={this.setRole.bind(this, "member")}>
                <span className={classNames({role: 1, current: this.props.member.role == "Editor"})}><IntText>Editor</IntText></span>
                - <IntText>can add & remove sheets</IntText>
              </div>
              : null}
            {this.props.isAdmin || this.props.isSelf ?
              <div className="action" onClick={this.removeMember}>
                <span className="role"><IntText>{this.props.isSelf ? "Leave Collection" : "Remove"}</IntText></span>
              </div>
            : null }
            {this.props.isInvitation  && !this.state.invitationResent ?
              <div className="action" onClick={this.resendInvitation}>
                <span className="role"><IntText>Resend Invitation</IntText></span>
              </div>
              : null}
            {this.props.isInvitation  && this.state.invitationResent ?
              <div className="action">
                <span className="role"><IntText>Invitation Resent</IntText></span>
              </div>
              : null}
            {this.props.isInvitation ?
              <div className="action" onClick={this.removeInvitation}>
                <span className="role"><IntText>Remove</IntText></span>

              </div>
              : null}
          </div>
        : null }
      </div>);
  }
}
CollectionMemberListingActions.propTypes = {
  member:       PropTypes.object.isRequired,
  slug:         PropTypes.string.isRequired,
  isAdmin:      PropTypes.bool,
  isSelf:       PropTypes.bool,
  isInvitation: PropTypes.bool,
  onDataChange: PropTypes.func.isRequired
};


export default CollectionPage;
