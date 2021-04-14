import React  from 'react';
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
    $(".notification.unread").not(".marked").each(function() {
      ids.push($(this).attr("data-id"));
    });
    if (ids.length) {
      $.post("/api/notifications/read", {notifications: JSON.stringify(ids)}, function(data) {
        $(".notification.unread").addClass("marked");
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
    Sefaria.notificationsHtml += data.html;
    this.setState({page: data.page + 1, loading: false});
    this.forceUpdate();
  }
  render() {
    const sidebarModules = [{type: "StayConnected"}];
    const classes = {readerNavMenu: 1};
    const classStr = classNames(classes);
    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1>
                <img className="notificationsTitleIcon" src="/static/icons/notification.svg" />
                <InterfaceText>Notifications</InterfaceText>
              </h1>
              { Sefaria._uid ?
              (<div className="notificationsList" dangerouslySetInnerHTML={ {__html: Sefaria.notificationsHtml } }></div>) :
              (<LoginPrompt fullPanel={true} />) }
            </div>
            <NavSidebar modules={sidebarModules} />
          </div>
          <Footer />
        </div>
      </div>);
  }
}
NotificationsPanel.propTypes = {
  setUnreadNotificationsCount: PropTypes.func.isRequired,
  interfaceLang:               PropTypes.string,
};


export default NotificationsPanel;
