const {
  LanguageToggleButton,
  LoadingMessage,
  TwoOrThreeBox,
  SheetTagLink,
  SheetAccessIcon,
}                = require('./Misc');
const React      = require('react');
const PropTypes  = require('prop-types');
const classNames = require('classnames');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const Footer     = require('./Footer');
import Component from 'react-class';


class GroupPage extends Component {
  constructor(props) {
    super(props);

    this.showTagsByDefault = this.props.group == "גיליונות נחמה";

    this.state = {
      showTags: this.showTagsByDefault,
      sheetFilterTag: this.props.tag,
      sheetSort: "date",
      tab: "sheets"
    };
  }
  componentDidMount() {
    this.ensureData();
  }
  componentDidUpdate(prevProps, prevState) {
    if (!this.state.showTags && prevState.showTags && $(".content").scrollTop() > 570) {
      $(".content").scrollTop(570);
    }
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.tag !== this.state.sheetFilterTag) {
      this.setState({sheetFilterTag: nextProps.tag});
      if (this.showTagsByDefault && nextProps.tag == null) {
        this.setState({showTags: true});
      }
      if (nextProps.tag !== null) {
        this.setState({showTags: false});
      }
    }
  }
  onDataLoad(data) {
    this.forceUpdate();
  }
  ensureData() {
    if (!Sefaria.groups(this.props.group)) {
      Sefaria.groups(this.props.group, this.onDataLoad);
    }
  }
  getData() {
      var groupData = Sefaria.groups(this.props.group);
      this.sortSheetData(groupData);
      if (groupData.pinnedSheets && groupData.pinnedSheets.length > 0) {
        this.pinSheetsToSheetList(groupData);
      }
      return(groupData);
  }
  sortSheetData(group) {
    if (!group.sheets) { return; }

    var sorters = {
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
    group.sheets.sort(sorters[this.state.sheetSort]);
  }
  pinSheetsToSheetList(group){
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
  setTab(tab) {
    this.setState({tab: tab});
  }
  toggleSheetTags() {
    if (this.state.showTags) {
      this.setState({showTags: false});
    } else {
      this.setState({showTags: true, sheetFilterTag: null});
      this.props.setGroupTag(null);
    }
  }
  setSheetTag(tag) {
    this.setState({sheetFilterTag: tag, showTags: false});
    this.props.setGroupTag(tag);
  }
  handleTagButtonClick (tag) {
    if (tag == this.state.sheetFilterTag) {
      this.setState({sheetFilterTag: null, showTags: false});
      this.props.setGroupTag(null);
    } else {
      this.setSheetTag(tag);
    }
  }
  changeSheetSort(event) {
    this.setState({sheetSort: event.target.value})
  }
  memberList() {
    var group = this.getData();
    if (!group) { return null; }
    var admins = group.admins.map(function(member) {member.role = "Admin"; return member; });
    var publishers = group.publishers.map(function(member) {member.role = "Publisher"; return member; });
    var members = group.members.map(function(member) {member.role = "Member"; return member; });
    var invitations = group.invitations.map(function(member) {member.role = "Invitation"; return member; });

    return admins.concat(publishers, members, invitations);
  }
  pinSheet(sheetId) {
    if (this.pinning) { return; }
    $.post("/api/groups/" + this.props.group + "/pin-sheet/" + sheetId, function(data) {
      if ("error" in data) {
        alert(data.error);
      } else {
        Sefaria._groups[this.props.group] = data.group;
        this.onDataLoad();
      }
      this.pinning = false;
    }.bind(this)).fail(function() {
        alert("There was an error pinning your sheet.");
        this.pinning = false;
    }.bind(this));
    this.pinning = true;
  }
  render() {
    var group        = this.getData();
    var sheets       = group ? group.sheets : null;
    var groupTagList = group ? group.tags : null;
    var members      = this.memberList();
    var isMember     = members && members.filter(function(x) { return x.uid == Sefaria._uid } ).length !== 0;
    var isAdmin      = group && group.admins.filter(function(x) { return x.uid == Sefaria._uid } ).length !== 0;

    groupTagList = groupTagList ? groupTagList.map(function (tag) {
        var filterThisTag = this.handleTagButtonClick.bind(this, tag.tag);
        var classes = classNames({navButton: 1, sheetButton: 1, active: this.state.sheetFilterTag == tag.tag});
        /* TODO this has a very similar structure to SheetTag, maybe merge */
        return (<div className={classes} onClick={filterThisTag} key={tag.tag}>
            <span className="int-en">{tag.tag} ({tag.count})</span>
            <span className="int-he">{Sefaria.hebrewTerm(tag.tag)} (<span className="enInHe">{tag.count}</span>)</span>
        </div>);
      }.bind(this)) : null;

    if (this.props.group == "גיליונות נחמה"){
      var parshaOrder = ["Bereshit", "Noach", "Lech Lecha", "Vayera", "Chayei Sara", "Toldot", "Vayetzei", "Vayishlach", "Vayeshev", "Miketz", "Vayigash", "Vayechi", "Shemot", "Vaera", "Bo", "Beshalach", "Yitro", "Mishpatim", "Terumah", "Tetzaveh", "Ki Tisa", "Vayakhel", "Pekudei", "Vayikra", "Tzav", "Shmini", "Tazria", "Metzora", "Achrei Mot", "Kedoshim", "Emor", "Behar", "Bechukotai", "Bamidbar", "Nasso", "Beha'alotcha", "Sh'lach", "Korach", "Chukat", "Balak", "Pinchas", "Matot", "Masei", "Devarim", "Vaetchanan", "Eikev", "Re'eh", "Shoftim", "Ki Teitzei", "Ki Tavo", "Nitzavim", "Vayeilech", "Ha'Azinu", "V'Zot HaBerachah"]

      groupTagList.sort( function (a, b) {
        var A = a["key"], B = b["key"];
        var orderA = parshaOrder.indexOf(A), orderB = parshaOrder.indexOf(B);

        if (orderA == -1) { return 1; }
        if (orderB == -1) { return -1; }
        return orderA > orderB ? 1 : -1;
      });
    }

    sheets = sheets && this.state.sheetFilterTag ? sheets.filter(function(sheet) {
      return Sefaria.util.inArray(this.state.sheetFilterTag, sheet.tags) >= 0;
    }.bind(this)) : sheets;
    sheets = sheets ? sheets.map(function(sheet) {
      return (<GroupSheetListing
                sheet={sheet}
                pinned={group.pinnedSheets.indexOf(sheet.id) != -1}
                isAdmin={isAdmin}
                multiPanel={this.props.multiPanel}
                pinSheet={this.pinSheet.bind(null, sheet.id)}
                setSheetTag={this.setSheetTag}
                key={sheet.id} />);
    }.bind(this)) : <LoadingMessage />;

    return (group ? <div className="content groupPage sheetList hasFooter">
              <div className="contentInner">

                {group.imageUrl ?
                  <img className="groupImage" src={group.imageUrl} alt={this.props.group}/>
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

                  {group.description || group.toc ?
                    <div className="groupDescription">
                      {group.toc ? 
                      <span>
                        <span className="en" dangerouslySetInnerHTML={ {__html: group.toc.description} }></span>
                        <span className="he"dangerouslySetInnerHTML={ {__html: group.toc.heDescription} }></span>
                      </span>
                      : group.description }
                    </div>
                    : null }
                </div>

                <div className="tabs">
                  <a className={classNames({bubbleTab: 1, active: this.state.tab == "sheets"})} onClick={this.setTab.bind(null, "sheets")}>
                    <span className="int-en">Sheets</span>
                    <span className="int-he">דפי מקורות</span>
                  </a>
                  <a className={classNames({bubbleTab: 1, active: this.state.tab == "members"})} onClick={this.setTab.bind(null, "members")}>
                    <span className="int-en">Members</span>
                    <span className="int-he">חברים</span>
                  </a>
                  { isAdmin ?
                    <a className="bubbleTab" href={"/groups/" + this.props.group.replace(/\s/g, "-") + "/settings"}>
                      <span className="int-en">Settings</span>
                      <span className="int-he">הגדרות</span>
                    </a>
                    : null }
                </div>

                { this.state.tab == "sheets" ?
                  <div>
                    {sheets.length ?
                    <h2 className="splitHeader">
                      { groupTagList && groupTagList.length ?
                      <span className="filterByTag" onClick={this.toggleSheetTags}>
                        <span className="int-en" >Filter By Tag <i className="fa fa-angle-down"></i></span>
                        <span className="int-he">סנן לפי תווית<i className="fa fa-angle-down"></i></span>
                       </span>
                       : null }

                          <span className="int-en actionText">Sort By:
                            <select value={this.state.sheetSort} onChange={this.changeSheetSort}>
                             <option value="date">Recent</option>
                             <option value="alphabetical">Alphabetical</option>
                             <option value="views">Most Viewed</option>
                           </select> <i className="fa fa-angle-down"></i></span>
                          <span className="int-he actionText">סנן לפי:
                            <select value={this.state.sheetSort} onChange={this.changeSheetSort}>
                             <option value="date">הכי חדש</option>
                             <option value="alphabetical">Alphabetical</option>
                             <option value="views">הכי נצפה</option>
                           </select> <i className="fa fa-angle-down"></i></span>
                    </h2>
                    : null }

                  {this.state.showTags ? <div className="tagsList"><TwoOrThreeBox content={groupTagList} width={this.props.width} /></div> : null}

                  {sheets.length && !this.state.showTags ? sheets : null}

                  {!sheets.length ? (isMember ?
                          <div className="emptyMessage">
                            <span className="int-en">There are no sheets in this group yet. <a href="/sheets/new">Start a sheet</a>.</span>
                            <span className="int-he"> לא קיימים דפי מקורות בקבוצה <a href="/sheets/new">צור דף מקורות</a>.</span>
                          </div>
                        : <div className="emptyMessage">
                            <span className="int-en">There are no public sheets in this group yet.</span>
                            <span className="int-he">לא קיימים דפי מקורות פומביים בקבוצה</span>
                          </div>) : null}
                  </div>
                  : null }

                  {this.state.tab == "members" ?
                    <div>
                     {isAdmin ? <GroupInvitationBox groupName={this.props.group} onDataChange={this.onDataLoad}/> : null }
                     { members.map(function(member) {
                      return <GroupMemberListing
                                member={member}
                                isAdmin={isAdmin}
                                isSelf={member.uid == Sefaria._uid}
                                groupName={this.props.group}
                                onDataChange={this.onDataLoad}
                                key={member.uid} />;
                     }.bind(this)) }
                    </div>
                  : null }

              </div>
            <Footer />
            </div>: <LoadingMessage />);
  }
}
GroupPage.propTypes = {
  group: PropTypes.string.isRequired,
  width: PropTypes.number
};


class GroupSheetListing extends Component {
  render() {
    var sheet = this.props.sheet;
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;

    if (sheet.tags === undefined) { sheet.tags = []; }
    var sheetArr = sheet.tags.filter(function(item, pos) {
        return sheet.tags.indexOf(item) == pos;
    });
    var tagString = sheetArr.map(function (tag) {
          return(<SheetTagLink setSheetTag={this.props.setSheetTag} tag={tag} key={`${sheet.id}-${tag}`}/>);
    }, this);


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
                    <div>{sheet.ownerName} · {sheet.views} {Sefaria._('Views')} · {sheet.modified} · <span className="tagString">{tagString}</span></div>
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
      this.flashMessage("That isn't a valid email address.")
      return;
    }
    this.setState({inviting: true, message: "Inviting..."})
    $.post("/api/groups/" + this.props.groupName + "/invite/" + email, function(data) {
      if ("error" in data) {
        alert(data.error);
        this.setState({message: null, inviting: false});
      } else {
        Sefaria._groups[this.props.groupName] = data.group;
        $("#groupInvitationInput").val("");
        this.flashMessage(data.message);
        this.setState({inviting: false})
        this.props.onDataChange();
      }
    }.bind(this)).fail(function() {
        alert("There was an error sending your invitation.");
        this.setState({message: null, inviting: false});
    }.bind(this));
  }
  validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }
  render() {
    return (<div className="groupInvitationBox">
                <input id="groupInvitationInput" placeholder="Email Address" />
                <div className="button" onClick={this.onInviteClick}>
                  <span className="int-en">Invite</span>
                  <span className="int-he">הזמן</span>
                </div>
                {this.state.message ?
                  <div className="groupInvitationBoxMessage">{this.state.message}</div>
                  : null}
              </div>);
  }
}
GroupInvitationBox.propTypes = {
  groupName: PropTypes.string.isRequired,
  onDataChange: PropTypes.func.isRequired,
};


class GroupMemberListing extends Component {
  render() {
    if (this.props.member.role == "Invitation") {
      return this.props.isAdmin ?
        <GroupInvitationListing
          member={this.props.member}
          groupName={this.props.groupName}
          onDataChange={this.props.onDataChange} />
        : null;
    }

    return (
      <div className="groupMemberListing">
        <a href={this.props.member.profileUrl}>
          <img className="groupMemberListingProfileImage" src={this.props.member.imageUrl} alt="" />
        </a>

        <a href={this.props.member.profileUrl} className="groupMemberListingName">
          {this.props.member.name}
        </a>

        <div className="groupMemberListingRoleBox">
          <span className="groupMemberListingRole">{this.props.member.role}</span>
          {this.props.isAdmin || this.props.isSelf ?
            <GroupMemberListingActions
              member={this.props.member}
              groupName={this.props.groupName}
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
  groupName:    PropTypes.string,
  onDataChange: PropTypes.func,
};


class GroupInvitationListing extends Component {
  render() {
    return (
      <div className="groupMemberListing">
        <span className="groupInvitationListing">
          {this.props.member.email}
        </span>

        <div className="groupMemberListingRoleBox">
          <span className="groupMemberListingRole">Invited</span>
          <GroupMemberListingActions
            member={this.props.member}
            groupName={this.props.groupName}
            isInvitation={true}
            onDataChange={this.props.onDataChange} />
        </div>

      </div>);
  }
}
GroupInvitationListing.propTypes = {
  member:       PropTypes.object.isRequired,
  groupName:    PropTypes.string,
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
      if (!confirm("Are you want to change your group role? You won't be able to undo this action unless another admin restores your permissions.")) {
        return;
      }
    }

    $.post("/api/groups/" + this.props.groupName + "/set-role/" + this.props.member.uid + "/" + role, function(data) {
      if ("error" in data) {
        alert(data.error)
      } else {
        Sefaria._groups[data.name] = data;
        this.props.onDataChange();
      }
    }.bind(this));
  }
  removeMember() {
    var message = this.props.isSelf ?
      "Are you sure you want to leave this group?" :
      "Are you sure you want to remove " + this.props.member.name + " from this group?";

    if (confirm(message)) {
      this.setRole("remove");
    }
  }
  resendInvitation() {
    $.post("/api/groups/" + this.props.groupName + "/invite/" + this.props.member.email, function(data) {
      if ("error" in data) {
        alert(data.error)
      } else {
        Sefaria._groups[this.props.groupName] = data.group;
        this.props.onDataChange();
        this.setState({"invitationResent": true});
      }
    }.bind(this));
  }
  removeInvitation() {
    if (confirm("Are you sure you want to remove this invitation?")) {
      $.post("/api/groups/" + this.props.groupName + "/invite/" + this.props.member.email + "/uninvite", function(data) {
        if ("error" in data) {
          alert(data.error)
        } else {
          Sefaria._groups[this.props.groupName] = data.group;
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
                <span className={classNames({role: 1, current: this.props.member.role == "Admin"})}>Admin</span>
                - can invite & edit settings
              </div>
              : null }
            {this.props.isAdmin ?
              <div className="action" onClick={this.setRole.bind(this, "publisher")}>
                <span className={classNames({role: 1, current: this.props.member.role == "Publisher"})}>Publisher</span>
                - can publish
              </div>
              : null }
            {this.props.isAdmin ?
              <div className="action" onClick={this.setRole.bind(this, "member")}>
                <span className={classNames({role: 1, current: this.props.member.role == "Member"})}>Member</span>
                - can view & share within group
              </div>
              : null}
            {this.props.isAdmin || this.props.isSelf ?
              <div className="action" onClick={this.removeMember}>
                <span className="role">{this.props.isSelf ? "Leave Group" : "Remove"}</span>
              </div>
            : null }
            {this.props.isInvitation  && !this.state.invitationResent ?
              <div className="action" onClick={this.resendInvitation}>
                <span className="role">Resend Invitation</span>
              </div>
              : null}
            {this.props.isInvitation  && this.state.invitationResent ?
              <div className="action">
                <span className="role">Invitation Resent</span>
              </div>
              : null}
            {this.props.isInvitation ?
              <div className="action" onClick={this.removeInvitation}>
                <span className="role">Remove</span>

              </div>
              : null}
          </div>
        : null }
      </div>);
  }
}
GroupMemberListingActions.propTypes = {
  member:       PropTypes.object.isRequired,
  groupName:    PropTypes.string.isRequired,
  isAdmin:      PropTypes.bool,
  isSelf:       PropTypes.bool,
  isInvitation: PropTypes.bool,
  onDataChange: PropTypes.func.isRequired
};


module.exports = GroupPage;
