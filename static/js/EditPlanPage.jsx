import React from 'react';
import PropTypes from 'prop-types';
import Component from 'react-class';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import { categories as validCategories } from './Plans';

class FileInput extends Component {
  handleChange = (e) => {
    if (this.props.onChange) {
      this.props.onChange(e);
    }
  }
  render() {
    return (
      <input
        type="file"
        id={this.props.name}
        accept={this.props.accept}
        onChange={this.handleChange}
        className={this.props.className}
      />
    );
  }
}

class EditPlanPage extends Component {
  constructor(props) {
    super(props);
    this.state = props.initialData || {
      title: '',
      description: '',
      long_description: '',
      categories: [],
      imageUrl: null,
      total_days: 7,
      content: {},
      listed: false,
      categoryInput: '',
      suggestedCategories: []
    };
    this.changed = false;
    
    // Bind methods
    this.handleInputChange = this.handleInputChange.bind(this);
    this.handleImageChange = this.handleImageChange.bind(this);
    this.handleCategoryInputChange = this.handleCategoryInputChange.bind(this);
    this.handleCategorySelect = this.handleCategorySelect.bind(this);
    this.handleCategoryRemove = this.handleCategoryRemove.bind(this);
    this.handleDaysChange = this.handleDaysChange.bind(this);
    this.save = this.save.bind(this);
  }

  componentDidMount() {
    $(window).on("beforeunload", function() {
      if (this.changed) {
        return "You have unsaved changes. Are you sure you want to leave?";
      }
    }.bind(this));
  }

  handleImageChange(e) {
    var MAX_IMAGE_MB = 2;
    var MAX_IMAGE_SIZE = MAX_IMAGE_MB * 1024 * 1024;
    var file = e.currentTarget.files[0];
    
    if (file.size > MAX_IMAGE_SIZE) {
      alert("Please choose an image smaller than " + MAX_IMAGE_MB + "MB");
      return;
    }

    var formData = new FormData();
    formData.append("file", file);
    if (this.props.initialData && this.props.initialData.id) {
      formData.append("plan_id", this.props.initialData.id);
    }

    $.ajax({
      url: '/api/plans/upload',
      data: formData,
      type: 'POST',
      contentType: false,
      processData: false,
      success: function(data) {
        if ("error" in data) {
          alert(data.error);
          this.clearImage();
        } else {
          this.setState({ imageUrl: data.url });
          this.changed = true;
        }
      }.bind(this),
      error: function() {
        alert("There was an error uploading your image.");
        this.clearImage();
      }.bind(this)
    });

    this.setUploading();
  }

  setUploading() {
    this.setState({ imageUrl: "/static/img/loading.gif" });
  }

  clearImage() {
    this.setState({ imageUrl: null });
  }

  handleInputChange(e) {
    const idToField = {
      planTitle: "title",
      planDescription: "description",
      planLongDescription: "long_description"
    };
    const field = idToField[e.target.id];
    const state = {};
    state[field] = e.target.value;
    this.setState(state);
    this.changed = true;
  }

  handleCategoryInputChange(e) {
    const input = e.target.value.toLowerCase();
    this.setState({ 
      categoryInput: input,
      suggestedCategories: input 
        ? validCategories.filter(cat => 
            cat.toLowerCase().includes(input) && 
            !this.state.categories.includes(cat)
          )
        : []
    });
  }

  handleCategorySelect(category) {
    if (!this.state.categories.includes(category)) {
      this.setState(prevState => ({
        categories: [...prevState.categories, category],
        categoryInput: '',
        suggestedCategories: []
      }));
      this.changed = true;
    }
  }

  handleCategoryRemove(categoryToRemove) {
    this.setState(prevState => ({
      categories: prevState.categories.filter(cat => cat !== categoryToRemove)
    }));
    this.changed = true;
  }

  handleDaysChange(e) {
    const value = parseInt(e.target.value) || 0;
    
    // Initialize content with empty sheet_ids for each day
    const content = {};
    for (let i = 1; i <= value; i++) {
      content[`day ${i}`] = 0;  
    }
    
    this.setState({ 
      total_days: value,
      content: content
    });
    this.changed = true;
  }

  save() {
    // Basic validation
    if (!this.state.title) {
      alert("Please enter a title");
      return;
    }
    if (!this.state.description) {
      alert("Please enter a description");
      return;
    }
    if (!this.state.long_description) {
      alert("Please enter what users will learn");
      return;
    }
    if (this.state.total_days < 1) {
      alert("Total days must be at least 1");
      return;
    }
    if (this.state.categories.length === 0) {
      alert("Please select at least one category");
      return;
    }

    const planData = {...this.state};
    if (planData.imageUrl === "/static/img/loading.gif") {
      planData.imageUrl = null;
    }

    // Ensure content is properly initialized if it's empty
    if (Object.keys(planData.content || {}).length === 0) {
      planData.content = {};
      for (let i = 1; i <= planData.total_days; i++) {
        planData.content[`day ${i}`] = 0;  
      }
    }

    // Convert total_days to number to ensure proper MongoDB storage
    planData.total_days = parseInt(planData.total_days);

    $.post("/api/plansPost", {json: JSON.stringify(planData)}, function(data) {
      if ("error" in data) {
        alert(data.error);
      } else if (data.status === "success" && data.plan && data.plan.id) {
        this.changed = false;
        window.location = "/plans/" + data.plan.id;
      } else {
        alert("There was an error saving your plan.");
      }
    }.bind(this)).fail(function(jqXHR) {
      if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
        alert(jqXHR.responseJSON.error);
      } else {
        alert("There was an error saving your plan.");
      }
    });
  }

  render() {
    return (
      <div id="editPlanPage">
        <div className="headerWithButtons">
          <div className="start"></div>
          <h1>
            <InterfaceText>Create Plan</InterfaceText>
          </h1>
          <div className="end">
            <a className="button small transparent control-elem" href="/plans">
              <InterfaceText>Cancel</InterfaceText>
            </a>
            <div className="button small blue control-elem" onClick={this.save}>
              <InterfaceText>Save</InterfaceText>
            </div>
          </div>
        </div>

        <div className="field halfWidth">
          <label>
            <InterfaceText>Title</InterfaceText>
            <span className="required">*</span>
          </label>
          <input
            id="planTitle"
            value={this.state.title}
            onChange={this.handleInputChange}
            placeholder="Enter plan title"
          />
        </div>

        <div className="field">
          <label>
            <InterfaceText>Description</InterfaceText>
            <span className="required">*</span>
          </label>
          <textarea
            id="planDescription"
            value={this.state.description}
            onChange={this.handleInputChange}
            placeholder="Describe your plan"
            rows={4}
          />
        </div>

        <div className="field">
          <label>
            <InterfaceText>What you'll learn</InterfaceText>
            <span className="required">*</span>
          </label>
          <textarea
            id="planLongDescription"
            value={this.state.long_description}
            onChange={this.handleInputChange}
            rows="4"
          />
        </div>

        <div className="field halfWidth" style={{ marginRight: '2rem' }}>
          <label>
            <InterfaceText>Categories</InterfaceText>
            <span className="required">*</span>
          </label>
          <div className="categoryInputContainer">
            <input
              type="text"
              value={this.state.categoryInput}
              onChange={this.handleCategoryInputChange}
              placeholder="Type to search categories"
              className="categoryInput"
            />
            {this.state.suggestedCategories.length > 0 && (
              <ul className="categorySuggestions">
                {this.state.suggestedCategories.map(category => (
                  <li 
                    key={category} 
                    onClick={() => this.handleCategorySelect(category)}
                    className="categorySuggestion"
                  >
                    {category}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="selectedCategories">
            {this.state.categories.map(category => (
              <span key={category} className="categoryTag">
                {category}
                <button
                  type="button"
                  onClick={() => this.handleCategoryRemove(category)}
                  className="removeCategory"
                  style={{
                    marginLeft: '4px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    padding: '0',
                    fontSize: '14px',
                    color: '#666',
                    width: '16px',
                    height: '16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="helperText">Type to search and select categories</div>
        </div>

        <div className="field halfWidth">
          <label>
            <InterfaceText>Total Days</InterfaceText>
            <span className="required">*</span>
          </label>
          <input
            type="number"
            id="total_days"
            min="1"
            value={this.state.total_days}
            onChange={this.handleDaysChange}
          />
        </div>

        <div className="field">
          <label htmlFor="planImage">
            <InterfaceText>Plan Image</InterfaceText>
          </label>
          {this.state.imageUrl ? (
            <div className="imageContainer">
              <img className="planImage" src={this.state.imageUrl} alt="Plan preview" />
                
            </div>
          ) : (
            <div className="planImage placeholder">
              <span className="placeholderText">No image uploaded</span>
            </div>
          )}
          <FileInput
            name="planImage"
            accept="image/*"
            text="Upload Image"
            className="button white uploadButton"
            onChange={this.handleImageChange}
          />
          <div className="helperText" id="planImageHelper">
            <InterfaceText>Recommended size: 350px x 350px or larger</InterfaceText>
          </div>
        </div>
      </div>
    );
  }
}

EditPlanPage.propTypes = {
  initialData: PropTypes.object // If present, we're editing an existing plan
};

export default EditPlanPage;