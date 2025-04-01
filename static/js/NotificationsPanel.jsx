import React, { useRef }  from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import ReactDOM  from 'react-dom';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Component from 'react-class';
import { NavSidebar }from './NavSidebar';
import {
  InterfaceText,
  LoginPrompt,
  FollowButton,
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
    const activeModule = Sefaria.activeModule;
    $.getJSON(`/api/notifications?page=${this.state.page}&scope=${activeModule}`, this.loadMoreNotifications);
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
              <div className="notificationsTopContainer">
                <div className="notificationsHeaderBox">
                  <h1>
                    <img className="notificationsTitleIcon" src="/static/icons/notification.svg" alt="Notification icon"/>
                    <InterfaceText>Notifications</InterfaceText>
                  </h1>
                </div>
                {!Sefaria._uid && <LoginPrompt fullPanel={true} />}
              </div>
              {Sefaria._uid && notifications.length < 1 && <EmptyNotificationsMessage /> } 
              {Sefaria._uid && notifications.length > 0 && notifications}
            </div>
            <NavSidebar sidebarModules={sidebarModules} />
          </div>
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
    "collection add":  CollectionAddNotification,
    "index":           IndexNotification,
    "version":         VersionNotification,
    "general":         GeneralNotification,
  };
  if (!type || !notificationTypes[type]) { return null; }
  const NotificationType = notificationTypes[type];
  return <NotificationType {...props} />
};

const EmptyNotificationsMessage = () => {
  return (
        <div className="emptyNotificationPage">
          <div className="emptyNotificationsTitle" aria-label="No notifications message title">
            <InterfaceText en={"Looks like you don’t have any notifications yet."} 
                           he={"נראה שעדיין אין לך התראות"}/>
          </div>
          <div className="emptyNotificationsMessage" aria-label="No notifications message body">
            <InterfaceText en={"Try following sheet creators to get notified when they publish a new sheet."} 
                           he={"מומלץ לעקוב אחרי יוצרים של דפי מקורות כדי לקבל התראה כאשר יפרסמו דף מקורות חדש"}/> 
          </div>
        </div>
  )
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
          <div className="date">
            <InterfaceText text={{en: `${Sefaria.util.naturalTime(date)} ago`, he: `לפני ${Sefaria.util.naturalTime(date)}`}} />
          </div>
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
      <a href={content.profileUrl} className="notificationUserName">{content.name}</a>&nbsp;
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
      <a href={content.profileUrl} className="notificationUserName">{content.name}</a>&nbsp;
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
      <a href={content.profileUrl} className="notificationUserName">{content.name}</a>&nbsp;
      <InterfaceText>is now following you</InterfaceText>
    </>
  );

  const body = content.is_already_following ? null : (
    <FollowButton
      large={true}
      uid={content.follower}
      followBack={true}
      smallText={false} />
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
      <InterfaceText>New Text</InterfaceText>:&nbsp;
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