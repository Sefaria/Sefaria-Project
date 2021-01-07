import {
  CategoryColorLine,
  InterfaceTextWithFallback,
  LanguageToggleButton,
  LoadingMessage,
  TwoOrThreeBox,
  SheetListing,
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


class GroupPage extends Component {
  constructor(props) {
    super(props);

    const groupData = Sefaria.getGroupFromCache(props.slug);
    const sheetSort = "date";
    if (groupData) { this.sortSheetData(groupData, sheetSort); }

    this.state = {
      showTopics: groupData && !!groupData.showTagsByDefault && !props.tag,
      sheetFilterTopic: props.tag,
      sheetSort: sheetSort,
      tab: "sheets",
      groupData: groupData,
    };
  }
  componentDidMount() {
    this.loadData();
  }
  componentDidUpdate(prevProps, prevState) {
    if (this.props.slug !== prevProps.slug) {
      this.setState({groupData: null});
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
    Sefaria.getGroup(this.props.slug)
      .then(groupData => {
        this.sortSheetData(groupData, this.state.sheetSort);
        this.setState({
          groupData,
          showTopics: !!groupData.showTagsByDefault && !this.props.tag
        });
        this.props.updateCollectionName(groupData.name);
      });
  }
  onDataChange() {
    this.setState({groupData: Sefaria._groups[this.props.slug]});
  }
  sortSheetData(group, sheetSort) {
    // Warning: This sorts the sheets within the cached group item in sefaria.js
    if (!group.sheets) { return; }

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
    group.sheets.sort(sorters[sheetSort]);

    if (this.props.name == "גיליונות נחמה"){
      let parshaOrder = ["Bereshit", "Noach", "Lech Lecha", "Vayera", "Chayei Sara", "Toldot", "Vayetzei", "Vayishlach", "Vayeshev", "Miketz", "Vayigash", "Vayechi", "Shemot", "Vaera", "Bo", "Beshalach", "Yitro", "Mishpatim", "Terumah", "Tetzaveh", "Ki Tisa", "Vayakhel", "Pekudei", "Vayikra", "Tzav", "Shmini", "Tazria", "Metzora", "Achrei Mot", "Kedoshim", "Emor", "Behar", "Bechukotai", "Bamidbar", "Nasso", "Beha'alotcha", "Sh'lach", "Korach", "Chukat", "Balak", "Pinchas", "Matot", "Masei", "Devarim", "Vaetchanan", "Eikev", "Re'eh", "Shoftim", "Ki Teitzei", "Ki Tavo", "Nitzavim", "Vayeilech", "Ha'Azinu", "V'Zot HaBerachah"]
      if (this.props.interfaceLang == "english") {
        parshaOrder = ["English"].concat(parshaOrder);
      }
      group.pinnedTags = parshaOrder;
    }

    if (group.pinnedSheets && group.pinnedSheets.length > 0) {
      this.pinSheetsToSheetList(group);
    }
    if (group.pinnedTags && group.pinnedTags.length > 0) {
      this.sortTags(group);
    }
  }
  pinSheetsToSheetList(group){
    // Applies any pinned sheets to the sorting of sheets list
    var sortPinned = function(a, b) {
      var ai = group.pinnedSheets.indexOf(a.id);
      var bi = group.pinnedSheets.indexOf(b.id);
      if (ai == -1 && bi == -1) { return 0; }
      if (ai == -1) { return 1; }
      if (bi == -1) { return -1; }
      return  ai < bi ? -1 : 1;
    };
    group.sheets.sort(sortPinned);
  }
  sortTags(group) {
     var sortTags = function(a, b) {
      var ai = group.pinnedTags.indexOf(a.asTyped);
      var bi = group.pinnedTags.indexOf(b.asTyped);
      if (ai == -1 && bi == -1) { return 0; }
      if (ai == -1) { return 1; }
      if (bi == -1) { return -1; }
      return  ai < bi ? -1 : 1;
    };
    group.topics.sort(sortTags);
  }
  setTab(tab) {
    this.setState({tab: tab});
  }
  toggleSheetTags() {
    if (this.state.showTopics) {
      this.setState({showTopics: false});
    } else {
      this.setState({showTopics: true, sheetFilterTopic: null});
      this.props.setGroupTag(null);
    }
  }
  setSheetTag(topic) {
    this.setState({sheetFilterTopic: topic, showTopics: false});
    this.props.setGroupTag(topic);
  }
  handleTagButtonClick (topic) {
    if (topic == this.state.sheetFilterTopic) {
      this.setState({sheetFilterTopic: null, showTopics: false});
      this.props.setGroupTag(null);
    } else {
      this.setSheetTag(topic);
    }
  }
  changeSheetSort(event) {
    let groupData = this.state.groupData;
    this.sortSheetData(groupData, event.target.value);
    this.setState({groupData, sheetSort: event.target.value});
  }
  searchGroup(query) {
    this.props.searchInGroup(query, this.state.groupData.name);
  }
  handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      if (query) {
        this.searchGroup(query);
      }
    }
  }
  handleSearchButtonClick(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".groupSearchInput").val();
    if (query) {
      this.searchGroup(query);
    }
  }
  memberList() {
    var group = this.state.groupData;
    if (!group) { return null; }
    var admins = group.admins.map(function(member) {member.role = "Owner"; return member; });
    var members = group.members.map(function(member) {member.role = "Member"; return member; });
    var invitations = group.invitations.map(function(member) {member.role = "Invitation"; return member; });

    return admins.concat(members, invitations);
  }
  pinSheet(sheetId) {
    if (this.pinning) { return; }
    $.post("/api/groups/" + this.props.slug + "/pin-sheet/" + sheetId, function(data) {
      if ("error" in data) {
        alert(data.error);
      } else {
        Sefaria._groups[this.props.slug] = data.group;
        this.sortSheetData(data.group);
        this.setState({groupData: data.group});
      }
      this.pinning = false;
    }.bind(this)).fail(function() {
        alert(Sefaria._("There was an error pinning your sheet."));
        this.pinning = false;
    }.bind(this));
    this.pinning = true;
  }
  render() {
    const group = this.state.groupData;
    let content;

    if (!group) {
      content = <div className="contentInner"><LoadingMessage /></div>;
    } else {
      var sheets         = group.sheets;
      var groupTopicList = group.topics;
      var members        = this.memberList();
      var isMember       = members && members.filter(function(x) { return x.uid == Sefaria._uid } ).length !== 0;
      var isAdmin        = group.admins.filter(function(x) { return x.uid == Sefaria._uid } ).length !== 0;

      groupTopicList = groupTopicList ? groupTopicList.map(topic => {
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
                  pinned={group.pinnedSheets.indexOf(sheet.id) != -1}
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
        {group.imageUrl ?
          <img className="groupImage" src={group.imageUrl} alt={this.props.name}/>
          : null }

        <div className="groupInfo">
          <h1>
            {group.toc ?
            <span>
              { this.props.multiPanel && this.props.interfaceLang !== "hebrew" ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
              <span className="en">{group.toc.title}</span>
              <span className="he">{group.toc.heTitle}</span>
            </span>
            : group.name }
          </h1>

          {group.websiteUrl ?
            <a className="groupWebsite" target="_blank" href={group.websiteUrl}>{group.websiteUrl}</a>
            : null }

          {group.toc ?
            <div className="groupDescription">
              <span>
                <span className="en" dangerouslySetInnerHTML={ {__html: group.toc.description} }></span>
                <span className="he"dangerouslySetInnerHTML={ {__html: group.toc.heDescription} }></span>
              </span>
            </div>
          : group.description ?
            <div className="groupDescription"  dangerouslySetInnerHTML={ {__html: group.description} }></div>
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
            <a className="bubbleTab" href={"/collections/" + group.slug + "/settings"}>
              <span className="int-en">Settings</span>
              <span className="int-he">הגדרות</span>
            </a>
            : null }
        </div>

        { this.state.tab == "sheets" ?
          <div>
            {sheets.length ?
            <div className="splitHeader">
              { groupTopicList && groupTopicList.length ?
              <span className="filterByTag" onClick={this.toggleSheetTags}>
                <span className="int-en" >Filter By Tag <i className="fa fa-angle-down"></i></span>
                <span className="int-he">סנן לפי תווית<i className="fa fa-angle-down"></i></span>
               </span>
               : <div /> }

                  <span className="int-en actionText">Sort By:
                    <select value={this.state.sheetSort} onChange={this.changeSheetSort}>
                     <option value="date">Recent</option>
                     <option value="alphabetical">Alphabetical</option>
                     <option value="views">Most Viewed</option>
                   </select>
                  </span>
                  <span className="int-he actionText">סנן לפי:
                    <select value={this.state.sheetSort} onChange={this.changeSheetSort}>
                     <option value="date">הכי חדש</option>
                     <option value="alphabetical">אלפביתי</option>
                     <option value="views">הכי נצפה</option>
                   </select>
                  </span>
            </div>
            : null }

          {group.listed ?
            <div className="groupSearchBox">
              <img className="groupSearchIcon" src="/static/icons/iconmonstr-magnifier-2.svg" onClick={this.handleSearchButtonClick} />
              <input
                className="groupSearchInput"
                placeholder={Sefaria.interfaceLang == "hebrew" ? "חפש" : "Search"}
                onKeyUp={this.handleSearchKeyUp} />
          </div> : null}

          {this.state.showTopics ? <div className="tagsList"><TwoOrThreeBox content={groupTopicList} width={this.props.width} /></div> : null}

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
             {isAdmin ? <GroupInvitationBox slug={this.props.slug} onDataChange={this.onDataChange}/> : null }
             { members.map(function (member, i) {
                return <GroupMemberListing
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
            <div className="readerNavTop searchOnly" key="navTop">
              <CategoryColorLine category="Sheets" />
              <ReaderNavigationMenuMenuButton onClick={this.props.openNav} />
              <h2>
                <IntText>Collections</IntText>
              </h2>
              <div className="readerOptions"></div>
            </div>}

            <div className="content groupPage sheetList hasFooter">
              {content}
              <Footer />
            </div>;
          </div>
  }
}
GroupPage.propTypes = {
  name:           PropTypes.string,
  slug:           PropTypes.string,
  width:          PropTypes.number,
  multiPanel:     PropTypes.bool,
  tag:            PropTypes.string,
  interfaceLang:  PropTypes.string,
  searchInGroup:  PropTypes.func,
};


class GroupSheetListing extends Component {
  render() {
    var sheet = this.props.sheet;
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;

    if (sheet.topics === undefined) { sheet.topics = []; }
    const topicStr = sheet.topics.map((topic, i) => (<SheetTopicLink setSheetTag={this.props.setSheetTag} topic={topic} key={`${topic.slug}-${i}`}/>));


    var pinButtonClasses = classNames({groupSheetListingPinButton: 1, pinned: this.props.pinned, active: this.props.isAdmin});
    var pinMessage = this.props.pinned && this.props.isAdmin ? Sefaria._("Pinned Sheet - click to unpin") :
                      this.props.pinned ? Sefaria._("Pinned Sheet") : Sefaria._("Pin Sheet");
    var pinButton = <div className={pinButtonClasses} onClick={this.props.isAdmin ? this.props.pinSheet : null}>
                      <img src="/static/img/pin.svg" title={pinMessage} />
                    </div>


    return (<div className="sheet userSheet">
                <div className="groupSheetInner">
                  <div className="groupSheetInnerContent">
                    <span><a className="sheetTitle" href={url}>{title}</a> <SheetAccessIcon sheet={sheet} /></span>
                    <div>{sheet.ownerName} · {sheet.views} {Sefaria._('Views')} · {sheet.modified} · <span className="tagString">{topicStr}</span></div>
                  </div>
                  {pinButton}
                </div>
              </div>);

  }
}
GroupSheetListing.propTypes = {
  sheet:       PropTypes.object.isRequired,
  setSheetTag: PropTypes.func.isRequired,
  pinSheet:    PropTypes.func,
  pinned:      PropTypes.bool,
  isAdmin:     PropTypes.bool
};


class GroupInvitationBox extends Component {
  constructor(props) {
    super(props);

    this.state = {
      inviting: false,
      message: null
    };
  }
  onInviteClick() {
    if (!this.state.inviting) {
      this.inviteByEmail($("#groupInvitationInput").val());
    }
  }
  flashMessage(message) {
    this.setState({message: message});
    setTimeout(function() {
      this.setState({message: null});
    }.bind(this), 3000);
  }
  inviteByEmail(email) {
    if (!this.validateEmail(email)) {
      this.flashMessage(Sefaria._("Please enter a valid email address."));
      return;
    }
    this.setState({inviting: true, message: Sefaria._("Inviting...")})
    $.post("/api/groups/" + this.props.slug + "/invite/" + email, function(data) {
      if ("error" in data) {
        alert(data.error);
        this.setState({message: null, inviting: false});
      } else {
        Sefaria._groups[this.props.slug] = data.group;
        $("#groupInvitationInput").val("");
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
    return (<div className="groupInvitationBox">
                <input id="groupInvitationInput" placeholder={Sefaria._("Email Address")} />
                <div className="button" onClick={this.onInviteClick}>
                  <IntText>Invite</IntText>
                </div>
                {this.state.message ?
                  <div className="groupInvitationBoxMessage">{this.state.message}</div>
                  : null}
              </div>);
  }
}
GroupInvitationBox.propTypes = {
  slug: PropTypes.string.isRequired,
  onDataChange: PropTypes.func.isRequired,
};


class GroupMemberListing extends Component {
  render() {
    if (this.props.member.role == "Invitation") {
      return this.props.isAdmin ?
        <GroupInvitationListing
          member={this.props.member}
          slug={this.props.slug}
          onDataChange={this.props.onDataChange} />
        : null;
    }

    return (
      <div className="groupMemberListing">
        <div className="groupLeft">
          <a href={this.props.member.profileUrl}>
            <ProfilePic
              url={this.props.member.imageUrl}
              name={this.props.member.name}
              len={50}
            />
          </a>

          <a href={this.props.member.profileUrl} className="groupMemberListingName">
            {this.props.member.name}
          </a>
        </div>

        <div className="groupMemberListingRoleBox">
          <span className="groupMemberListingRole">{this.props.member.role}</span>
          {this.props.isAdmin || this.props.isSelf ?
            <GroupMemberListingActions
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
GroupMemberListing.propTypes ={
  member:       PropTypes.object.isRequired,
  isAdmin:      PropTypes.bool,
  isSelf:       PropTypes.bool,
  slug:         PropTypes.string,
  onDataChange: PropTypes.func.isRequired,
};


class GroupInvitationListing extends Component {
  render() {
    return (
      <div className="groupMemberListing">
        <span className="groupInvitationListing">
          {this.props.member.email}
        </span>

        <div className="groupMemberListingRoleBox">
          <span className="groupMemberListingRole"><IntText>Invited</IntText></span>
          <GroupMemberListingActions
            member={this.props.member}
            slug={this.props.slug}
            isInvitation={true}
            onDataChange={this.props.onDataChange} />
        </div>

      </div>);
  }
}
GroupInvitationListing.propTypes = {
  member:       PropTypes.object.isRequired,
  slug:         PropTypes.string,
  onDataChange: PropTypes.func,
};


class GroupMemberListingActions extends Component {
  constructor(props) {
    super(props);

    this.state = {
      menuOpen: false,
      invitationResent: false
    };
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

    $.post("/api/groups/" + this.props.slug + "/set-role/" + this.props.member.uid + "/" + role, function(data) {
      if ("error" in data) {
        alert(data.error)
      } else {
        Sefaria._groups[data.slug] = data;
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
    $.post("/api/groups/" + this.props.slug + "/invite/" + this.props.member.email, function(data) {
      if ("error" in data) {
        alert(data.error)
      } else {
        Sefaria._groups[this.props.slug] = data.group;
        this.props.onDataChange();
        this.setState({"invitationResent": true});
      }
    }.bind(this));
  }
  removeInvitation() {
    if (confirm(Sefaria._("Are you sure you want to remove this invitation?"))) {
      $.post("/api/groups/" + this.props.slug + "/invite/" + this.props.member.email + "/uninvite", function(data) {
        if ("error" in data) {
          alert(data.error)
        } else {
          Sefaria._groups[this.props.slug] = data.group;
          this.props.onDataChange();
        }
      }.bind(this));
    }
  }
  render() {
    return (
      <div className="groupMemberListingActions" onClick={this.toggleMenu}>
        <div className="groupMemberListingActionsButton">
          <i className="fa fa-gear"></i>
        </div>
        {this.state.menuOpen ?
          <div className="groupMemberListingActionsMenu">
            {this.props.isAdmin ?
              <div className="action" onClick={this.setRole.bind(this, "admin")}>
                <span className={classNames({role: 1, current: this.props.member.role == "Owner"})}><IntText>Owner</IntText></span>
                - <IntText>can invite & edit settings</IntText>
              </div>
              : null }
            {this.props.isAdmin ?
              <div className="action" onClick={this.setRole.bind(this, "member")}>
                <span className={classNames({role: 1, current: this.props.member.role == "Member"})}><IntText>Editor</IntText></span>
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
GroupMemberListingActions.propTypes = {
  member:       PropTypes.object.isRequired,
  slug:         PropTypes.string.isRequired,
  isAdmin:      PropTypes.bool,
  isSelf:       PropTypes.bool,
  isInvitation: PropTypes.bool,
  onDataChange: PropTypes.func.isRequired
};


export default GroupPage;
