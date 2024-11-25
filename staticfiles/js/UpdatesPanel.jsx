import React  from 'react';
import ReactDOM  from 'react-dom';
import Component from 'react-class';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Footer  from './Footer';
import { Notifications } from './NotificationsPanel';
import { NavSidebar }from './NavSidebar';
import {
  InterfaceText,
} from './Misc';


class UpdatesPanel extends Component {
  constructor(props) {
    super(props);

    this.state = {
      page: 0,
      loadedToEnd: false,
      loading: false,
      updates: [],
      submitting: false,
      submitCount: 0,
      error: null
    };
  }
  componentDidMount() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.getMoreNotifications();
  }
  handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 600;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreNotifications();
    }
  }
  getMoreNotifications() {
    $.getJSON("/api/updates?page=" + this.state.page, this.loadMoreNotifications);
    this.setState({loading: true});
  }
  loadMoreNotifications(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    }
    this.setState({page: data.page + 1, loading: false, updates: this.state.updates.concat(data.updates)});
  }
  onDelete(id) {
    $.ajax({
        url: '/api/updates/' + id,
        type: 'DELETE',
        success: function(result) {
          if (result.status == "ok") {
              this.setState({updates: this.state.updates.filter(u => u._id != id)});
          }
        }.bind(this)
    });
  }
  handleSubmit(type, content) {
    this.setState({"submitting": true, "error": null});
    var payload = {
      type: type,
      content: content
    };
    $.ajax({
      url: "/api/updates",
      dataType: 'json',
      type: 'POST',
      data: {json: JSON.stringify(payload)},
      success: function(data) {
        if (data.status == "ok") {
          payload.date = Date();
          this.state.updates.unshift(payload);
          this.setState({submitting: false, updates: this.state.updates, submitCount: this.state.submitCount + 1});
        } else {
          this.setState({"error": "Error - " + data.error});
        }
      }.bind(this),
      error: function(xhr, status, err) {
        this.setState({"error": "Error - " + err.toString()});
        console.error(this.props.url, status, err.toString());
      }.bind(this)
    });
  }
  render() {
    const sidebarModules = [{type: "Promo"}, {type: "StayConnected"}];

    return (
      <div className="readerNavMenu sans-serif">
        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1><InterfaceText>side_nav.updates</InterfaceText></h1>

              {Sefaria.is_moderator?<NewUpdateForm handleSubmit={this.handleSubmit} key={this.state.submitCount} error={this.state.error}/>:""}

              <div className="notificationsList">
              {this.state.updates.map(u =>
                <SingleUpdate
                  type={u.type}
                  content={u.content}
                  date={u.date}
                  key={u._id}
                  id={u._id}
                  onDelete={this.onDelete}
                  submitting={this.state.submitting}
                />
              )}
              </div>
            </div>
            <NavSidebar modules={sidebarModules} />
          </div>
          <Footer />
        </div>
      </div>
    );
  }
}
UpdatesPanel.propTypes = {
  interfaceLang:  PropTypes.string
};


class NewUpdateForm extends Component {
  constructor(props) {
    super(props);
    this.state = {type: 'index', index: '', language: 'en', version: '', en: '', he: '', error: ''};
  }
  componentWillReceiveProps(nextProps) {
    this.setState({"error": nextProps.error});
  }
  handleEnChange(e) {
    this.setState({en: e.target.value, error: null});
  }
  handleHeChange(e) {
    this.setState({he: e.target.value, error: null});
  }
  handleTypeChange(e) {
    this.setState({type: e.target.value, error: null});
  }
  handleIndexChange(e) {
    this.setState({index: e.target.value, error: null});
  }
  handleVersionChange(e) {
    this.setState({version: e.target.value, error: null});
  }
  handleLanguageChange(e) {
    this.setState({language: e.target.value, error: null});
  }
  handleSubmit(e) {
    e.preventDefault();
    var content = {
      "en": this.state.en.trim(),
      "he": this.state.he.trim()
    };
    if (this.state.type == "general") {
      if (!this.state.en || !this.state.he) {
        this.setState({"error": "Both Hebrew and English are required"});
        return;
      }
    } else {
      if (!this.state.index) {
        this.setState({"error": "Index is required"});
        return;
      }
      content["index"] = this.state.index.trim();
    }
    if (this.state.type == "version") {
      if (!this.state.version || !this.state.language) {
        this.setState({"error": "Version is required"});
        return;
      }
      content["version"] = this.state.version.trim();
      content["language"] = this.state.language.trim();
    }
    this.props.handleSubmit(this.state.type, content);

  }
  render() {
    return (
      <form className="globalUpdateForm" onSubmit={this.handleSubmit}>
        <div>
          <input type="radio" name="type" value="index" onChange={this.handleTypeChange} checked={this.state.type=="index"}/>Index&nbsp;&nbsp;
          <input type="radio" name="type" value="version" onChange={this.handleTypeChange} checked={this.state.type=="version"}/>Version&nbsp;&nbsp;
          <input type="radio" name="type" value="general" onChange={this.handleTypeChange} checked={this.state.type=="general"}/>General&nbsp;&nbsp;
        </div>
        <div>
          {(this.state.type != "general")?<input type="text" placeholder="Index Title" onChange={this.handleIndexChange} />:""}
          {(this.state.type == "version")?<input type="text" placeholder="Version Title" onChange={this.handleVersionChange}/>:""}
          {(this.state.type == "version")?<select type="text" placeholder="Version Language" onChange={this.handleLanguageChange}>
            <option value="en">English</option>
            <option value="he">Hebrew</option>
          </select>:""}
        </div>
        <div>
          <textarea
            placeholder="English Description (optional for Index and Version)"
            onChange={this.handleEnChange}
            rows="3"
            cols="80"
          />
        </div>
        <div>
          <textarea
            placeholder="Hebrew Description (optional for Index and Version)"
            onChange={this.handleHeChange}
            rows="3"
            cols="80"
          />
        </div>
        <input type="submit" value="Submit" disabled={this.props.submitting}/>
        <span className="error">{this.state.error}</span>
      </form>
    );
  }
}
NewUpdateForm.propTypes = {
  error:               PropTypes.string,
  handleSubmit:        PropTypes.func
};


class SingleUpdate extends Component {
  onDelete() {
    this.props.onDelete(this.props.id);
  }
  render() {
    return (
      <div className="update">
        {Sefaria.is_moderator?<i className="fa fa-times-circle delete-update-button" onClick={this.onDelete} aria-hidden="true"/>:""}
        <Notifications
          type={this.props.type}
          props={this.props} />
      </div>);
  }
}
SingleUpdate.propTypes = {
  id:        PropTypes.string,
  type:      PropTypes.string,
  content:   PropTypes.object,
  onDelete:  PropTypes.func,
  date:      PropTypes.number
};


export default UpdatesPanel;