const React      = require('react');
const PropTypes  = require('prop-types');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
import Component from 'react-class';


class EditGroupPage extends Component {
  constructor(props) {
    super(props);

    this.state = props.initialData || {
        name: null,
        description: null,
        websiteUrl: null,
        imageUrl: null,
        headerUrl: null,
        listed: false
    };
  }
  componentDidMount() {
    $(window).on("beforeunload", function() {
      if (this.changed) {
        return "You have unsaved changes to your group.";
      }
    }.bind(this));
  }
  handleImageChange(e) {
    var MAX_IMAGE_MB = 2;
    var MAX_IMAGE_SIZE = MAX_IMAGE_MB * 1024 * 1024;
    var idToField = {
      groupHeader: "headerUrl",
      groupImage: "imageUrl",
    }
    var field = idToField[e.target.id];
    var file = e.currentTarget.files[0];
    if (file.size > MAX_IMAGE_SIZE) {
      alert("Images must be smaller than " + MAX_IMAGE_MB + "MB.");
      return;
    }
    var formData = new FormData();
    formData.append("file", e.currentTarget.files[0])
    $.ajax({
        url: '/api/file/upload',
        data: formData,
        type: 'POST',
        contentType: false,
        processData: false,
        success: function(data) {
          if ("error" in data) {
            alert(data.error);
            this.clearUploading(field);
          } else {
            var state = {};
            state[field] = data.url;
            this.setState(state);
            this.changed = true;
          }
        }.bind(this),
        fail: function() {
          alert("Unfortunately an error occurred uploading your file.")
          this.clearUploading(field);
        }
    });
    this.setUploading(field);
  }
  setUploading(field) {
    var state = {};
    state[field] = "/static/img/loading.gif";
    this.setState(state);
  }
  clearUploading(field) {
    var state = {};
    state[field] = null;
    this.setState(state);
  }
  handleInputChange(e) {
    var idToField = {
      groupName: "name",
      groupWebsite: "websiteUrl",
      groupDescription: "description"
    }
    var field = idToField[e.target.id];
    var state = {};
    state[field] = e.target.value;
    this.setState(state);
    this.changed = true;
  }
  handleListingChange(e) {
    this.setState({listed: !!e.target.checked});
  }
  delete() {
    if (confirm("Are you sure you want to delete this group? This cannot be undone.")) {
     $.ajax({
        url: "/api/groups/" + this.props.initialData.name,
        type: "DELETE",
        success: function(data) {
          if ("error" in data) {
            alert(data.error);
          } else {
            window.location = "/my/groups";
          }
        },
        fail: function() {
          alert("Sorry, an error occurred.");
        }
      });
    }
  }
  save() {
    var groupData = Sefaria.util.clone(this.state);
    if (!this.props.initialData) {
      groupData["new"] = true;
    }
    if (this.props.initialData && this.props.initialData.name !== groupData.name) {
      groupData["previousName"] = this.props.initialData.name;
    }
    if (groupData["headerUrl"] == "/static/img/loading.gif") { groupData["headerUrl"] = null; }
    if (groupData["imageUrl"] == "/static/img/loading.gif") { groupData["imageUrl"] = null; }

    $.post("/api/groups", {json: JSON.stringify(groupData)}, function(data) {
        if ("error" in data) {
          alert(data.error);
        } else {
          this.changed = false;
          window.location = "/groups/" + this.state.name.replace(/ /g, "-");
        }
    }.bind(this)).fail(function() {
        alert("Sorry, an error occurred.");
    });
  }
  render() {
    return (
      <div id="editGroupPage">
        {this.props.initialData
          ? <h1>
              <span className="int-en">Edit Group</span>
              <span className="int-he">ערוך קבוצה</span>
            </h1>
          : <h1>
              <span className="int-en">Create a Group</span>
              <span className="int-he">צור קבוצה</span>
            </h1>}

        <div id="saveCancelButtons">
            <a className="button transparent control-elem" href={this.props.initialData ? "/groups/" + this.state.name.replace(/ /g, "-") : "/my/groups"}>
                <span className="int-en">Cancel</span>
                <span className="int-he">בטל</span>
            </a>
            <div id="saveGroup" className="button blue control-elem" onClick={this.save}>
                <span className="int-en">Save</span>
                <span className="int-he">שמור</span>
            </div>
        </div>

        <div className="field halfWidth">
          <label>
            <span className="int-en">Group Name</span>
            <span className="int-he">שם הקבוצה</span>
          </label>
          <input id="groupName" value={this.state.name||""} onChange={this.handleInputChange}/>
        </div>

        <div className="field halfWidth">
          <label>
            <span className="int-en">Website</span>
            <span className="int-he">כתובת אתר</span>
          </label>
          <input id="groupWebsite" value={this.state.websiteUrl||""} onChange={this.handleInputChange}/>
        </div>

        <div className="field">
          <label>
            <span className="int-en">Description</span>
            <span className="int-he">תיאור</span>
          </label>
          <textarea id="groupDescription" onChange={this.handleInputChange} value={this.state.description||""}></textarea>
        </div>

        <div className="field">
          <label>
            <span className="int-en">Group Image</span>
            <span className="int-he">תמונה לקבוצה</span>
          </label>
          {this.state.imageUrl
            ? <img className="groupImage" src={this.state.imageUrl} alt="Group Image" />
            : <div className="groupImage placeholder"></div>}
          <FileInput
             name="groupImage"
             accept="image/*"
             text="Upload Image"
             className="button white"
             onChange={this.handleImageChange} />
          <div className="helperText">
            <span className="int-en">Recommended size: 350px x 350px or larger</span>
            <span className="int-he">גודל מומלץ: לפחות 350 פיקסל ע"ג 350 פיקסל</span>
          </div>
        </div>

        <div className="field">
          <label>
            <span className="int-en">Default Sheet Header</span>
            <span className="int-he">כותרת עמוד ראשונית</span>
          </label>
          {this.state.headerUrl
            ? <div className="groupHeaderBox">
                <img className="groupHeader" src={this.state.headerUrl} alt="Group Header Image" />
                <div className="clearFix"></div>
              </div>
            : <div className="groupHeader placeholder"></div>}
          <FileInput
             name="groupHeader"
             accept="image/*"
             text="Upload Image"
             className="button white"
             onChange={this.handleImageChange} />
          <div className="helperText">
            <span className="int-en">Recommended size: 1000px width to fill sheet, smaller images align right</span>
            <span className="int-he">גודל מומלץ: 1000 פיקסל כדי למלא את חלל הדף. גודל קטן יותר יתיישר לימין</span>
          </div>
        </div>

        <div className="field">
          <label>
              <span className="int-en">List on Sefaria</span>
              <span className="int-he">הצג לכלל משתמשי ספריא</span>
          </label>
          {this.state.moderationStatus !== "nolist" ? 
          <div className="onoffswitch">
            <input type="checkbox" 
              name="onoffswitch" 
              className="onoffswitch-checkbox" 
              id="groupPublicToggle"
              checked={!!this.state.listed}
              onChange={this.handleListingChange} />
            <label className="onoffswitch-label" htmlFor="groupPublicToggle">
                <span className="onoffswitch-inner"></span>
                <span className="onoffswitch-switch"></span>
            </label>
            <div className="helperText">
              <span className="int-en">Your group will appear on the public groups page where others can find it.</span>
              <span className="int-he">HEBREW NEEDED</span>
            </div>
          </div>
          : <div>
              <span className="int-en">Your group was previously made public, but our moderators determined it was not generally useful for all Sefaria users. Please contact <a href="mailto:hello@sefari.org">hello@sefaria.org</a> with any questions.</span>
              <span className="int-he">HEBREW NEEDED</span>
          </div> }
        </div>

        {this.props.initialData ?
          <div className="deleteGroup" onClick={this.delete}>
            <span className="int-en">Delete Group</span>
            <span className="int-he">מחק קבוצה</span>
          </div>
          : null}

      </div>);
  }
}
EditGroupPage.propTypes = {
  initialData:  PropTypes.object // If present this view is for editing a group, otherwise for creating a new group
};


class FileInput extends Component {
  handleChange(e) {
    if (this.props.onChange) { this.props.onChange(e); }
  }
  render() {
    return (<div>
              <label htmlFor={this.props.name} className={this.props.className}>{this.props.text}</label>
              <input
                type="file"
                id={this.props.name}
                name={this.props.name}
                className="hiddenFileInput"
                accept={this.props.accept}
                onChange={this.handleChange} />
            </div>);
  }
}


module.exports = EditGroupPage;
