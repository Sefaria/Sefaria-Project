import React  from 'react';
import Component from 'react-class';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import { NavSidebar } from './NavSidebar';
import Footer  from './Footer';
import {
  CategoryColorLine,
  DropdownModal,
  DropdownButton,
  DropdownOptionList,
  FilterableList,
  InterfaceText,
  LanguageToggleButton,
  LoadingMessage,
  ProfilePic,
  ResponsiveNBox,
  SheetListing,
  TabView,
  TwoOrThreeBox,
} from './Misc';
import {ContentText} from "./ContentText";


class CollectionPage extends Component {
  constructor(props) {
    super(props);

    const collectionData = Sefaria.getCollectionFromCache(props.slug);

    this.state = {
      tab: props.tab,
      showFilterHeader: !!props.tag,
      sheetFilterTopic: props.tag || '',
      collectionData: collectionData,
    };
 
    this.scrollableRef = React.createRef();
  }
  componentDidMount() {
    this.loadData();
    if (!!this.props.tag & !this.props.tab) {
      this.props.setTab("sheets");
    }
  }
  componentDidUpdate(prevProps, prevState) {
    if (this.props.slug !== prevProps.slug) {
      this.setState({collectionData: null});
      this.loadData();
    }
    if (this.props.tab !== prevProps.tab) {
      this.setState({tab: this.props.tab});
    }
    if (prevState.sheetFilterTopic !== this.state.sheetFilterTopic && $(".content").scrollTop() > 260) {
      $(".content").scrollTop(0);
    }
  }
  loadData() {
    Sefaria.getCollection(this.props.slug)
      .then(collectionData => {
        this.setState({collectionData});
        this.props.updateCollectionName(collectionData.name);
      });
  }
  onDataChange() {
    this.setState({collectionData: Sefaria._collections[this.props.slug]});
  }
  setFilter(filter) {
    this.setState({sheetFilterTopic: filter, showFilterHeader: true});
    this.props.setTab("sheets");
  }
  memberList() {
    var collection = this.state.collectionData;
    if (!collection) { return null; }
    var admins = collection.admins.map(function(member) {member.role = "Owner"; return member; });
    var members = collection.members.map(function(member) {member.role = "Editor"; return member; });
    var invitations = collection.invitations.map(function(member) {member.role = "Invitation"; return member; });

    return admins.concat(members, invitations);
  }
  isMember() {
    const members   = this.memberList();
    return members && members.filter(function(x) { return x.uid === Sefaria._uid } ).length !== 0;
  }
  pinSheet(sheetId) {
    if (this.pinning) { return; }
    $.post("/api/collections/" + this.props.slug + "/pin-sheet/" + sheetId, function(data) {
      if ("error" in data) {
        alert(data.error);
      } else {
        Sefaria._collections[this.props.slug] = data.collection;
        this.setState({collectionData: data.collection});
      }
      this.pinning = false;
    }.bind(this)).fail(function() {
        alert(Sefaria._("There was an error pinning your sheet."));
        this.pinning = false;
    }.bind(this));
    this.pinning = true;
  }
  sortSheets(option, a, b) {
    // if x is not pinned, indexOf will return -1. Add 1 to make it zero and then convert to very high number so it will be sorted after pinned sheets
    const [ai, bi] = [a, b].map(x => (this.state.collectionData.pinnedSheets.indexOf(x.id)+1) || 1e7);
    if (ai !== bi) {
      return  ai - bi;
    
    } else if (option === "Recent") {
      return Date.parse(b.modified) - Date.parse(a.modified);
  
    } else if (option === "Alphabetical") {
      return a.title.stripHtml().trim().toLowerCase() > b.title.stripHtml().trim().toLowerCase() ? 1 : -1;
  
    } else if (option === "Views") {
      return b.views - a.views;
    }
  }
  filterSheets(filter, sheet) {
    //generally speaking we want to filter also by partial match of a tag, but there are cases where we want to load only sheets that match a passed in tag. |
    //one such case is someone clicked a tag in the pinned tags view for the collection. For example if someone wants פורים they shouldnt get סיפורים
    const exact = this.state.sheetFilterTopic === filter;
    const n = text => text.toLowerCase();
    filter = n(filter);
    
    //title and each topic in he and en
    let filterableData  = sheet.topics.map(topic => [n(topic.en), n(topic.he), n(topic.asTyped)]).flat();
    filterableData.push(n(sheet.title.stripHtml()));
    
    //this may be confusing- in the exact case, "includes" is an array func and returns if any of the above match filter exactly, 
    // if not "includes" is a string func and is testing for a substring, meaning the filter is a partial match to any of the above. 
    return exact ? filterableData.includes(filter) : filterableData.some(element => element.includes(filter));
  }
  renderSheet(sheet) {
    return (
      <SheetListing
        sheet={sheet}
        hideAuthor={true}
        infoUnderneath={true}
        showAuthorUnderneath={true}
        hideCollection={true}
        pinned={this.state.collectionData.pinnedSheets.indexOf(sheet.id) !== -1}
        pinnable={this.isMember()}
        editable={sheet.author === Sefaria._uid}
        saveable={sheet.author !== Sefaria._uid && !this.isMember()}
        collectable={true}
        pinSheet={this.pinSheet.bind(null, sheet.id)}
        handleCollectionsChange={this.onDataChange}
        toggleSignUpModal={this.props.toggleSignUpModal}
        showSheetSummary={true}
        key={sheet.id} />
    );
  }
  renderEmptyList({filter}) {
    if (filter) {
      return (
        <div className="emptyMessage sans-serif">
          <InterfaceText>{Sefaria._("No sheets matching")} </InterfaceText>;
          "<InterfaceText text={{en: filter, he: filter}} />".
        </div>
      );
    } else if (this.isMember()) {
      return (
        <div className="emptyMessage sans-serif">
          <InterfaceText>{Sefaria._( "You can add sheets to this collection on your profile.")}</InterfaceText>
          <br />
          <a className="button" href="/my/profile">
            <InterfaceText>{Sefaria._("Open Profile")}</InterfaceText>
          </a>
        </div>
      );
    } else {
      return (
        <div className="emptyMessage sans-serif">
          <InterfaceText>{ Sefaria._("There are no sheets in this collection yet.")} </InterfaceText>
        </div>
      );
    }
  }
  renderSearchLink({filter}) {
    if (!filter || !this.state.collectionData.listed) { return null; }
    return (
      <a className="searchInCollectionLink sans-serif" href={`/search?q=${filter}&tab=sheet&scollectionsFilters=${this.state.collectionData.name}`}
        onClick={(e) => {
          e.preventDefault();
          this.props.searchInCollection(filter, this.state.collectionData.name);
        }}>
        <InterfaceText>{ Sefaria._("Search the full text of this collection for")}</InterfaceText>&nbsp;
        "<InterfaceText text={{en: filter, he: filter}} />" &raquo;
      </a>
    );
  }
  render() {
    const collection = this.state.collectionData;
    const sidebarModules = [];

    let content;

    if (!collection) {
      content = <LoadingMessage />;
    } else {
      const sheets  = collection.sheets;
      const isAdmin = collection.admins.filter(function(x) { return x.uid === Sefaria._uid } ).length !== 0;

      if (collection.imageUrl) {
        sidebarModules.push({type: "Image", props: {url: collection.imageUrl}});
      }

      const editorsBlock = (
        <div>
         {isAdmin ? <CollectionInvitationBox slug={this.props.slug} onDataChange={this.onDataChange}/> : null }
         {this.memberList().map((member, i) => (
            <CollectionMemberListing
              member={member}
              isAdmin={isAdmin}
              isSelf={member.uid === Sefaria._uid}
              slug={this.props.slug}
              onDataChange={this.onDataChange}
              key={i} />
          ))}
        </div>
      );
      sidebarModules.push({type: "Wrapper", props: {
        title: Sefaria._("Editors"),
        content: editorsBlock}});

      const hasContentsTab = (collection.pinnedTags && collection.pinnedTags.length);
      const tabs = !hasContentsTab ? []
        : [{id: "contents", title: {en: Sefaria._("Contents") , he: Sefaria._("Contents")}}];
      tabs.push(
        {id: "sheets", title: {en: Sefaria._("Sheets"), he: Sefaria._("Sheets")}},
        {
          id: 'filter',
          title: {en: Sefaria._("Filter"), he: Sefaria._("Filter")},
          icon: `/static/icons/arrow-${this.state.showFilterHeader ? 'up' : 'down'}-bold.svg`,
          justifyright: true,
          clickTabOverride: () => {
            this.setState({showFilterHeader: !this.state.showFilterHeader});
          }
        }
      );
      const renderTab = t => (
        <div className={classNames({tab: 1, noselect: 1, filter: t.justifyright, open: t.justifyright && this.state.showFilterHeader})}>
          <InterfaceText text={t.title} />
          { t.icon ? <img src={t.icon} alt={`${t.title.en} icon`} /> : null }
        </div>
      );

      content = (
        <>
          <CollectionAbout
            collection={collection}
            isAdmin={isAdmin}
            toggleLanguage={this.props.toggleLanguage} />

          <TabView
            tabs={tabs}
            currTabName={this.state.tab}
            renderTab={renderTab}
            containerClasses={"largeTabs"}
            setTab={this.props.setTab} >

            {!hasContentsTab ? null :
            <CollectionContentsTab 
              collection={collection}
              setFilter={this.setFilter} />}

            <FilterableList
              pageSize={20}
              filterFunc={this.filterSheets}
              sortFunc={this.sortSheets}
              renderItem={this.renderSheet}
              renderEmptyList={this.renderEmptyList}
              renderFooter={this.renderSearchLink}
              sortOptions={["Recent", "Alphabetical", "Views"]}
              data={sheets}
              containerClass={"sheetList"}
              scrollableElement={this.scrollableRef}
              initialRenderSize={collection._sheetsDisplayed}
              onDisplayedDataChange={data => {collection._sheetsDisplayed = data.length}}
              initialFilter={this.state.sheetFilterTopic}
              showFilterHeader={this.state.showFilterHeader} />
          
          </TabView>
        </>
      );
    }

    return (
      <div className="readerNavMenu">
        <CategoryColorLine category="Sheets" />
        <div className="content collectionPage" ref={this.scrollableRef}>
          <div className="sidebarLayout">
            <div className="contentInner">
              {content}
            </div>
            <NavSidebar modules={sidebarModules} />
          </div>
          <Footer />
        </div>
      </div>
    );
  }
}
CollectionPage.propTypes = {
  setTab:             PropTypes.func.isRequired,
  tab:                PropTypes.string,
  name:               PropTypes.string,
  slug:               PropTypes.string,
  width:              PropTypes.number,
  multiPanel:         PropTypes.bool,
  tag:                PropTypes.string,
  interfaceLang:      PropTypes.string,
  searchInCollection: PropTypes.func,
};


const CollectionAbout = ({collection, isAdmin, toggleLanguage}) => (
  <div className="collectionInfo sans-serif">
    {collection.toc ?
    <div className="navTitle">
      <h1>
        <ContentText text={{en: collection.toc.title, he: collection.toc.heTitle}} />
      </h1>
      { isAdmin ? <EditCollectionButton slug={collection.slug} /> : null }
      { Sefaria.multiPanel && Sefaria.interfaceLang !== "hebrew" ? <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null }
    </div>
    : 
    <div className="navTitle">
      <h1>{collection.name}</h1>
      { isAdmin ? <EditCollectionButton slug={collection.slug} /> : null }
    </div> }

    <a className="collectionLabel" href="/collections">
      <InterfaceText>{ Sefaria._("Collection")}</InterfaceText>
    </a>

    {collection.toc ?
      <div className="collectionDescription">
        <ContentText html={{en: collection.toc.description, he: collection.toc.heDescription}} />
      </div>
    : collection.description ?
      <div className="collectionDescription"  dangerouslySetInnerHTML={ {__html: collection.description} }></div>
    : null }

    {collection.websiteUrl ?
      <a className="collectionWebsite" target="_blank" href={collection.websiteUrl}>{collection.websiteUrl.replace(/https?:\/\//, "")}</a>
      : null }
  </div>
);


const EditCollectionButton = ({slug}) => (
  <a className="button small white" href={`/collections/${slug}/settings`}>
    <img className="buttonIcon" src="/static/icons/tools-write-note.svg" /><InterfaceText>Edit</InterfaceText>
  </a>
);



const CollectionContentsTab = ({collection, setFilter}) => {
  let pinnedTags = collection.pinnedTags;
  
  if (!pinnedTags || !pinnedTags.length) { return null; }

  if (collection.name === "גיליונות נחמה" && Sefaria.interfaceLang === "english"){
    pinnedTags = ["English"].concat(pinnedTags);
  }

  // Tags may be grouped under labels which are represented as objects in `pinnedTags`, instead of strings.
  const groupedTags = pinnedTags.reduce((accum, tag) => {
    if (typeof tag === "object") {
      return accum.concat([{label: tag, contents: []}]);
    } else if (accum.length === 0) {
      return accum.concat([{label: null, contents: [tag]}]);
    } else {
      accum[accum.length -1].contents.push(tag);
      return accum;
    }
  }, []);

  return (
    <div className="collectionContentsTab">
      {groupedTags.map(tagGroup => (
        <div key={tagGroup.label ? tagGroup.label.en : "contents"}>
          {!tagGroup.label ? null :
          <div className="collectionContentsSectionLabel sans-serif">
            <InterfaceText text={tagGroup.label} />
          </div>}
          <ResponsiveNBox content={tagGroup.contents.map(tag => (
            <a href={`/collections/${collection.slug}?tag=${tag}`} className="collectionContentsTag" onClick={(e) => {
              e.preventDefault();
              setFilter(tag);}}>
              <InterfaceText>{tag}</InterfaceText>
            </a>   
          ))} />
        </div>
      ))}
    </div>
  );
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
    return (<div className="collectionInvitationBox sans-serif">
              <div className="collectionInvitationBoxInner">
                <input id="collectionInvitationInput" placeholder={Sefaria._("Email Address")} />
                <div className="button small" onClick={this.onInviteClick}>
                  <InterfaceText>Invite</InterfaceText>
                </div>
              </div>
              {this.state.message ?
                <div className="collectionInvitationBoxMessage"><InterfaceText>{this.state.message}</InterfaceText></div>
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
    if (this.props.member.role === "Invitation") {
      return this.props.isAdmin ?
        <CollectionInvitationListing
          member={this.props.member}
          slug={this.props.slug}
          onDataChange={this.props.onDataChange} />
        : null;
    }

    return (
      <div className="collectionMemberListing">
        <a href={this.props.member.profileUrl} className="collectionMemberListingPic">
          <ProfilePic
            url={this.props.member.imageUrl}
            name={this.props.member.name}
            len={40}
          />
        </a>
        <div className="collectionMemberListingText">
          <a href={this.props.member.profileUrl} className="collectionMemberListingName">
            {this.props.member.name}
          </a>
          <div className="collectionMemberListingRole">
            <InterfaceText>{this.props.member.role}</InterfaceText>
          {this.props.isAdmin || this.props.isSelf ?
            <CollectionMemberListingActions
              member={this.props.member}
              slug={this.props.slug}
              isAdmin={this.props.isAdmin}
              isSelf={this.props.isSelf}
              onDataChange={this.props.onDataChange} />
            : null }
          </div>
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
        <div className="collectionMemberListingPic invitation">
          <img src="/static/icons/mail.svg" />
        </div>
        <div className="collectionMemberListingText">
          <span className="collectionMemberListingName">
            {this.props.member.email}
          </span>
          <div className="collectionMemberListingRole">
            <InterfaceText>Invited</InterfaceText>
            <CollectionMemberListingActions
              member={this.props.member}
              slug={this.props.slug}
              isInvitation={true}
              onDataChange={this.props.onDataChange} />
          </div>
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
                <span className={classNames({role: 1, current: this.props.member.role === "Owner"})}><InterfaceText>{Sefaria._("Owner")}</InterfaceText></span>
                - <InterfaceText>can invite & edit settings</InterfaceText>
              </div>
              : null }
            {this.props.isAdmin ?
              <div className="action" onClick={this.setRole.bind(this, "member")}>
                <span className={classNames({role: 1, current: this.props.member.role === "Editor"})}><InterfaceText>{Sefaria._("Editor")} </InterfaceText></span>
                - <InterfaceText>can add & remove sheets</InterfaceText>
              </div>
              : null}
            {this.props.isAdmin || this.props.isSelf ?
              <div className="action" onClick={this.removeMember}>
                <span className="role"><InterfaceText>{this.props.isSelf ? Sefaria._("Leave Collection"): Sefaria._("Remove")}</InterfaceText></span>
              </div>
            : null }
            {this.props.isInvitation  && !this.state.invitationResent ?
              <div className="action" onClick={this.resendInvitation}>
                <span className="role"><InterfaceText>{Sefaria._("Resend Invitation")}</InterfaceText></span>
              </div>
              : null}
            {this.props.isInvitation  && this.state.invitationResent ?
              <div className="action">
                <span className="role"><InterfaceText>{Sefaria._("Invitation Resent" )}</InterfaceText></span>
              </div>
              : null}
            {this.props.isInvitation ?
              <div className="action" onClick={this.removeInvitation}>
                <span className="role"><InterfaceText>{ Sefaria._("Remove")} </InterfaceText></span>

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
