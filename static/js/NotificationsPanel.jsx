import React, { useRef }  from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Footer  from './Footer';
import ReactDOM  from 'react-dom';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Component from 'react-class';
import { NavSidebar }from './NavSidebar';
import {
  InterfaceText,
  LoginPrompt,
  FollowButton,
  MessageModal,
} from './Misc';


class NotificationsPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      page: 1,
      loadedToEnd: false,
      loading: false
    };
  }
  componentDidMount() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.markAsRead();
  }
  componentDidUpdate() {
    this.markAsRead();
  }
  handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 600;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreNotifications();
    }
  }
  markAsRead() {
    // Marks each notification that is loaded into the page as read via API call
    var ids = [];
    Sefaria.notifications.map(n => {
      if (!n.read) {
        ids.push(n._id);
        n.read = true;
      }
    });
    if (ids.length) {
      $.post("/api/notifications/read", {notifications: JSON.stringify(ids)}, function(data) {
        this.props.setUnreadNotificationsCount(data.unreadCount);
      }.bind(this));
    }
  }
  getMoreNotifications() {
    $.getJSON("/api/notifications?page=" + this.state.page, this.loadMoreNotifications);
    this.setState({loading: true});
  }
  loadMoreNotifications(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    }
    Sefaria.notifications = Sefaria.notifications.concat(data.notifications);
    this.setState({page: data.page + 1, loading: false});
    this.forceUpdate();
  }
  render() {
    const notifications = Sefaria.notifications.map(n => 
      <Notifications type={n.type} props={n} key={n._id} />
    );
    const sidebarModules = [{type: "StayConnected"}];
    return (
      <div className="readerNavMenu sans-serif">
        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1>
                <img className="notificationsTitleIcon" src="/static/icons/notification.svg" />
                <InterfaceText>Notifications</InterfaceText>
              </h1>
              { Sefaria._uid ?
              notifications :
              <LoginPrompt fullPanel={true} /> }
            </div>
            <NavSidebar modules={sidebarModules} />
          </div>
          <Footer />
        </div>
      </div>
    );
  }
}
NotificationsPanel.propTypes = {
  setUnreadNotificationsCount: PropTypes.func.isRequired,
  interfaceLang:               PropTypes.string,
};


const Notifications = ({type, props}) => {
  // Choose the appropriate component to render by `type`
  const notificationTypes = {
    "sheet publish":   SheetPublishNotification,
    "sheet like":      SheetLikeNotification,
    "follow":          FollowNotification,
    "message":         MessageNotification,
    "collection add":  CollectionAddNotification,
    "index":           IndexNotification,
    "version":         VersionNotification,
    "general":         GeneralNotification,
  };
  if (!type || !notificationTypes[type]) { return null; }
  const NotificationType = notificationTypes[type];
  return <NotificationType {...props} />
};


const Notification = ({imageUrl, imageLink, topLine, date, body}) => {
  
  let image = imageUrl ? <img src={imageUrl} /> : null
  image     = imageLink ? <a href={imageLink}>{image}</a> : image;

  return (
    <div className="notification">
      <div className="imageSection">
        {image}
      </div>
      
      <div className="mainSection">
        <div className="topLine">
          <div className="topLineText">{topLine}</div>
          <div className="date">{Sefaria.util.naturalTime(date) + " " + Sefaria._("ago")}</div>
        </div>
        
        {body ?
        <div className="notificationBody">
          {body}
        </div> :
        null }
      </div>
    </div>
  );
};


const SheetPublishNotification = ({date, content}) => {
  const topLine = (
    <>
      <a href={content.profileUrl}>{content.name}</a>&nbsp;
      <InterfaceText>published a new sheet</InterfaceText>
    </>
  );

  const body = (
    <>
      <a className="sheetTitle" href={"/sheets/" + content.sheet_id}>{content.sheet_title}</a>
      {content.summary ?
      <div className="sheetSummary">
        {content.summary}
      </div>
      : null}
    </>
  );

  return (
    <Notification
      topLine={topLine}
      imageUrl={content.imageUrl}
      imageLink={content.profileUrl}
      date={date}
      body={body} />
  );
};


const SheetLikeNotification = ({date, content}) => {
  const topLine = (
    <>
      <a href={content.profileUrl}>{content.name}</a>&nbsp;
      <InterfaceText>liked your sheet</InterfaceText>
    </>
  );

  const body = (
    <>
      <a className="sheetTitle" href={"/sheets/" + content.sheet_id}>{content.sheet_title}</a>
    </>
  );

  return (
    <Notification
      topLine={topLine}
      imageUrl={content.imageUrl}
      imageLink={content.profileUrl}
      date={date}
      body={body} />
  );
};


const FollowNotification = ({date, content}) => {

  const topLine = (
    <>
      <a href={content.profileUrl}>{content.name}</a>&nbsp;
      <InterfaceText>is now following you</InterfaceText>
    </>
  );

  const body = Sefaria.following.indexOf(content.follower) === -1 ? (
    <FollowButton
      large={true}
      uid={content.follower}
      followBack={true}
      smallText={false} />
  ) : null;

  return (
    <Notification
      topLine={topLine}
      imageUrl={content.imageUrl}
      imageLink={content.profileUrl}
      date={date}
      body={body} />
  );
};


const MessageNotification = ({date, content}) => {

  const modalRef = useRef(null);

  const onReplyClick = () => { modalRef.current.makeVisible(); };

  const topLine = (
    <>
      <a href={content.profileUrl}>{content.name}</a>&nbsp;
      <InterfaceText>sent you a message</InterfaceText>
    </>
  );

  const body = (
    <>
      <div className="message" dangerouslySetInnerHTML={ {__html: content.message }} />
      <div className="button small white replyButton" onClick={onReplyClick}>
        <img src="/static/icons/reply.svg" />
        <InterfaceText>Reply</InterfaceText>
      </div>
    
      <MessageModal uid={content.sender} name={content.name} ref={modalRef} />
    </>
  );

  return (
    <Notification
      topLine={topLine}
      imageUrl={content.imageUrl}
      imageLink={content.profileUrl}
      date={date}
      body={body} />
  );
};


const CollectionAddNotification = ({date, content}) => {

  const topLine = (
    <>
      <a href={content.profileUrl}>{content.name}</a>&nbsp;
      <InterfaceText>added you to a collection</InterfaceText>
    </>
  );

  const body = (
    <>
      <a className="collectionName" href={"/collections/" + content.collection_slug}>
        {content.collection_name}
      </a>
    </>
  );

  return (
    <Notification
      topLine={topLine}
      imageUrl={content.imageUrl}
      imageLink={content.profileUrl}
      date={date}
      body={body} />
  );
};


const IndexNotification = ({date, content}) => {
  const title = content.index;
  const heTitle = Sefaria.index(title).heTitle;
  const url = "/" + Sefaria.normRef(title);

  const topLine = (
    <>
      <InterfaceText>New Text:</InterfaceText>&nbsp;
      <a href={url}>
        <InterfaceText text={{en: title, he: heTitle}} />
      </a>
    </>
  );

  const body = (
    <div className="globalNotificationText">
      <InterfaceText html={content} />
    </div>
  );

  return (
    <Notification
      topLine={topLine}
      imageUrl={"/static/img/icon.png"}
      date={date}
      body={body} />
  );
};


const VersionNotification = ({date, content}) => {
  const title = content.index;
  const heTitle = Sefaria.index(title).heTitle;
  const url = "/" + Sefaria.normRef(title);

  const topLine = (
    <>
      <span className="int-en">
        New { content.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {content.version}
      </span>
      <span className="int-he">
        גרסה חדשה של <a href={url}>{heTitle}</a> ב{ content.language == "en"?"אנגלית":"עברית"} : {content.version}
      </span>
    </>
  );

  const body = (
    <div className="globalNotificationText">
      <InterfaceText html={content} />
    </div>
  );

  return (
    <Notification
      topLine={topLine}
      imageUrl={"/static/img/icon.png"}
      date={date}
      body={body} />
  );
};


const GeneralNotification = ({date, content}) => {
  const topLine = (
    <div className="globalNotificationText">
      <InterfaceText html={content} />
    </div>
  );

  return (
    <Notification
      topLine={topLine}
      imageUrl={"/static/img/icon.png"}
      date={date} />
  );
};


export { 
  NotificationsPanel,
  Notifications,
}