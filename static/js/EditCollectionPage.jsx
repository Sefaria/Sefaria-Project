import React  from 'react';
import PropTypes  from 'prop-types';
import Component from 'react-class';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import { InterfaceText } from './Misc';


class EditCollectionPage extends Component {
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
        return Sefaria._("edit_collection_page.you_have_unsaved_changes_to_your_collection");
      }
    }.bind(this));
  }
  handleImageChange(e) {
    var MAX_IMAGE_MB = 2;
    var MAX_IMAGE_SIZE = MAX_IMAGE_MB * 1024 * 1024;
    var idToField = {
      collectionHeader: "headerUrl",
      collectionImage: "imageUrl",
    };
    var field = idToField[e.target.id];
    var file = e.currentTarget.files[0];
    if (file.size > MAX_IMAGE_SIZE) {
      alert(Sefaria._("edit_collection_page.images_must_be_smaller_than") + MAX_IMAGE_MB + "MB.");
      return;
    }
    var formData = new FormData();
    formData.append("file", e.currentTarget.files[0])
    $.ajax({
        url: '/api/collections/upload',
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
          alert(Sefaria._("edit_collection_page.unfortunately_an_error_occurred_uploading_your_file"))
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
      collectionName: "name",
      collectionWebsite: "websiteUrl",
      collectionDescription: "description"
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
    if (confirm(Sefaria._("edit_collection_page.are_you_sure_you_want_to_delete_this"))) {
     $.ajax({
        url: "/api/collections/" + this.props.initialData.slug,
        type: "DELETE",
        success: function(data) {
          if ("error" in data) {
            alert(data.error);
          } else {
            window.location = "/my/profile";
          }
        },
        fail: function() {
          alert(Sefaria._("edit_collection_page.unfortunately_an_error_occurred_deleting_your_collection"));
        }
      });
    }
  }
  save() {
    var collectionData = Sefaria.util.clone(this.state);

    if (collectionData["headerUrl"] == "/static/img/loading.gif") { collectionData["headerUrl"] = null; }
    if (collectionData["imageUrl"] == "/static/img/loading.gif") { collectionData["imageUrl"] = null; }

    $.post("/api/collections", {json: JSON.stringify(collectionData)}, function(data) {
        if ("error" in data) {
          alert(data.error);
        } else {
          this.changed = false;
          window.location = `${Sefaria.getModuleURL(Sefaria.VOICES_MODULE).origin}/collections/${data.collection.slug}`; 
        }
    }.bind(this)).fail(function() {
        alert(Sefaria._("edit_collection_page.unfortunately_an_error_occurred_saving_your_collection"));
    });
  }
  getCancelLink() {
    if (this.props.initialData) {
      return `${Sefaria.getModuleURL(Sefaria.VOICES_MODULE).origin}/collections/${this.state.slug}`;
    }
    return `${Sefaria.getModuleURL(Sefaria.VOICES_MODULE).origin}/my/profile`;
  }
  render() {
    const title = this.props.initialData ? "edit_collection_page.edit_collection" : "nav_sidebar.create_a_collection";
    return (
      <div className="readerNavMenu" key="0">
        <div className="content">
          <div id="editCollectionPage">
            <div className="headerWithButtons">
              <div className="start"></div>
              <h1>
                <InterfaceText>{title}</InterfaceText>
              </h1>
              <div className="end">
                  <a className="button small transparent control-elem" href={this.getCancelLink()}>
                      <InterfaceText>common.cancel</InterfaceText>
                  </a>
                  <div id="saveCollection" className="button small blue control-elem" onClick={this.save}>
                      <InterfaceText>common.save</InterfaceText>
                  </div>
              </div>
            </div>

            <div className="field halfWidth">
              <label>
                <InterfaceText>edit_collection_page.collection_name</InterfaceText>
              </label>
              <input id="collectionName" value={this.state.name||""} onChange={this.handleInputChange}/>
            </div>

            <div className="field halfWidth">
              <label>
                <InterfaceText>common.website</InterfaceText>
              </label>
              <input id="collectionWebsite" value={this.state.websiteUrl||""} onChange={this.handleInputChange}/>
            </div>

            <div className="field">
              <label>
                <InterfaceText>edit_collection_page.description</InterfaceText>
              </label>
              <textarea id="collectionDescription" onChange={this.handleInputChange} value={this.state.description||""}></textarea>
            </div>

            <div className="field">
              <label>
                <InterfaceText>edit_collection_page.collection_image</InterfaceText>
              </label>
              {this.state.imageUrl
                ? <img className="collectionImage" src={this.state.imageUrl} alt={Sefaria._("edit_collection_page.collection_image")} />
                : <div className="collectionImage placeholder"></div>}
              <FileInput
                name="collectionImage"
                accept="image/*"
                text={Sefaria._("edit_collection_page.upload_image")}
                className="button white"
                onChange={this.handleImageChange} />
              <div className="helperText">
                <InterfaceText>edit_collection_page.recommended_size_350px_x_350px_or_larger</InterfaceText>
              </div>
            </div>

            {/* Header images are only supported for legacy collections which already had them */}
            {this.state.headerUrl ? 
            <div className="field">
              <label>
                <InterfaceText>edit_collection_page.default_sheet_header</InterfaceText>
              </label>
              {this.state.headerUrl
                ? <div className="collectionHeaderBox">
                    <img className="collectionHeader" src={this.state.headerUrl} alt={Sefaria._("edit_collection_page.collection_header_image")} />
                    <div className="clearFix"></div>
                  </div>
                : <div className="collectionHeader placeholder"></div>}
              <FileInput
                name="collectionHeader"
                accept="image/*"
                text="edit_collection_page.upload_image"
                className="button white"
                onChange={this.handleImageChange} />
              <div className="helperText">
                <InterfaceText>edit_collection_page.recommended_size_1000px_width_to_fill_sheet_smaller</InterfaceText>
              </div>
            </div>
            : null }

            {/* Only show publish option on existing collections, since new collections are empty */}
            {this.props.initialData ?
            <div className="field">
              <label>
                  <InterfaceText>edit_collection_page.list_on_sefaria</InterfaceText>
              </label>
              {this.state.moderationStatus !== "nolist" ?
              <div className="onoffswitch">
                <input type="checkbox"
                  name="onoffswitch"
                  className="onoffswitch-checkbox"
                  id="collectionPublicToggle"
                  checked={!!this.state.listed}
                  onChange={this.handleListingChange} />
                <label className="onoffswitch-label" htmlFor="collectionPublicToggle">
                    <span className="onoffswitch-inner"></span>
                    <span className="onoffswitch-switch"></span>
                </label>
                <div className="helperText">
                  <InterfaceText>edit_collection_page.your_collection_will_appear_on_the_public_collections</InterfaceText>
                </div>
              </div>
              : <div>
                  <span className="int-en">Your collection was previously made public, but our moderators determined it was not generally useful for all Sefaria users. Please contact <a href="mailto:hello@sefari.org">hello@sefaria.org</a> with any questions.</span>
                  <span className="int-he">האסופה שלך הוגדרה כציבורית, אך המנהלים שלנו הגיעו למסקנה שהיא אינה רלוונטית לכלל משתמשי ספריא. לשאלות יש ליצור עימנו קשר בכתובת <a href="mailto:hello@sefari.org">hello@sefaria.org</a>.</span>
              </div> }
            </div>
            : null }

            {this.props.initialData ?
            <div className="deleteCollection" onClick={this.delete}>
              <InterfaceText>edit_collection_page.delete_collection</InterfaceText>
            </div>
            : null}

          </div>
        </div>
      </div>
    );
  }
}
EditCollectionPage.propTypes = {
  initialData:  PropTypes.object // If present this view is for editing a collection, otherwise for creating a new collection
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


export default EditCollectionPage;
