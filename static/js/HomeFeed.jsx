const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const Footer     = require('./Footer');
import Component from 'react-class';


class HomeFeed extends Component {
  constructor(props) {
    super(props);

    this.state = {
      page: 0,
      loadedToEnd: false,
      loading: false,
      stories: [],
    };
  }
  componentDidMount() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.getMoreStories();
  }
  handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 100;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreStories();
    }
  }
  getMoreStories() {
    $.getJSON("/api/stories?page=" + this.state.page, this.loadMoreStories);
    this.setState({loading: true});
  }
  loadMoreStories(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    }
    this.setState({page: data.page + 1, loading: false, stories: this.state.stories.concat(data.stories)});
  }
  /*
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
  */

  //This is a pseudo Component.  It uses "storyForm" to determine the component to render.
  Story(props) {
    const storyForms = {
      newContent:   NewContentStory,
      newIndex:     NewIndexStory,
      newVersion:   NewVersionStory,
      publishSheet: PublishSheetStory
    };
    const StoryForm = storyForms[props.storyForm];
    return <StoryForm
                storyForm={props.storyForm}
                data={props.data}
                timestamp={props.timestamp}
                natural_time={props.natural_time}
                is_global={props.is_global}
                key={props.timestamp} />;
  }

  render() {
    const classes = {"readerNavMenu": 1};
    const classStr = classNames(classes);

    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">
            <div className="storyFeed">
            {this.state.stories.map(s => this.Story(s))}
            </div>
          </div>
          <footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
            <Footer />
          </footer>
        </div>
      </div>);
  }
}
HomeFeed.propTypes = {
  interfaceLang:  PropTypes.string
};



class AbstractStory extends Component {
  heTitle(title) {
    return title && Sefaria.index(title)?Sefaria.index(title).heTitle:"";
  }
  url(title) {
    return title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);
  }
  indexColor(title) {
      return title && Sefaria.index(title) ?
      Sefaria.palette.categoryColor(Sefaria.index(title).categories[0]):
      Sefaria.palette.categoryColor("Other");
  }
  naturalTimeBlock() {
      return (
        <div className="timeBlock smallText">
          <span className="int-en">{ this.props.natural_time.en } ago</span>
          <span className="int-he">&rlm;לפני { this.props.natural_time.he }</span>
        </div>);
  }
  /*
  date() {
    return new Date(this.props.timestamp * 1000)
  }
  dateBlock() {
    const d = this.date();
    return (
      <div className="date">
          <span className="int-en">{d.toLocaleDateString("en")}</span>
          <span className="int-he">{d.toLocaleDateString("he")}</span>
      </div>
    );
  } */
  render() {}
}

AbstractStory.propTypes = {
  storyForm: PropTypes.string,
  timestamp: PropTypes.number,
  natural_time: PropTypes.object,
  is_global: PropTypes.bool,
  data:      PropTypes.object,
};

class NewContentStory extends AbstractStory {
    render() {
      const cardStyle = {"border-color": "#18345D"};

      return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">New Content</span>
                <span className="int-he">תוכן חדש</span>
            </div>
            {this.naturalTimeBlock()}

            <div className="storyBody systemText">
              <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
            </div>
        </div>);
    }
}
class NewIndexStory extends AbstractStory {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);
      const cardStyle = {"border-color": this.indexColor(title)};

      return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">New Text</span>
                <span className="int-he">טקסט חדש</span>
            </div>
            {this.naturalTimeBlock()}
            <div className="storyTitle pageTitle">
                <span className="int-en">{title}</span>
                <span className="int-he">{heTitle}</span>
            </div>
            <div className="storyBody systemText">
              <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
            </div>
        </div>);
    }
}
class NewVersionStory extends AbstractStory {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);
      const cardStyle = {"border-color": this.indexColor(title)};

      /*
         <div>
              <span className="int-en">New { this.props.data.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {this.props.data.version}</span>
              <span className="int-he">גרסה חדשה של <a href={url}>{heTitle}</a> ב{ this.props.data.language == "en"?"אנגלית":"עברית"} : {this.props.data.version}</span>
          </div>
      */
      return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">New Version</span>
                <span className="int-he">גרסה חדשה</span>
            </div>
            {this.naturalTimeBlock()}
            <div className="storyTitle pageTitle">
                <span className="int-en">{title}</span>
                <span className="int-he">{heTitle}</span>
            </div>
            <div className="storyBody systemText">
                <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
                <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
            </div>
        </div>);
    }
}

class PublishSheetStory extends AbstractStory {
  /* props.data: {
      publisher_id
      publisher_name
      publisher_url
      sheet_id
      sheet_title
      }
   */
  render() {
      const cardStyle = {"border-color": "#18345D"};
    // <a href={"/sheets/" + this.props.data.sheet_id}>
      return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">New Sheet</span>
                <span className="int-he">דף מקורות חדש</span>
            </div>
            {this.naturalTimeBlock()}
            <div className="storyTitle pageTitle">
                <span className="int-en">{this.props.data.sheet_title}</span>
                <span className="int-he">{this.props.data.sheet_title}</span>
            </div>
            <div className="storyBody systemText">
                <span className="int-en"><a href={this.props.data.publisher_url}>{this.props.data.publisher_name}</a> </span>
                <span className="int-he"><a href={this.props.data.publisher_url}>{this.props.data.publisher_name}</a> </span>
            </div>
        </div>
      );
  }
}

module.exports = HomeFeed;
