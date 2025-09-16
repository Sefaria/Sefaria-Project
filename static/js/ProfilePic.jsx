import React from 'react';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import Component from 'react-class';
import {ImageCropper} from "./ImageCropper";

/* flexible profile picture that overrides the default image of gravatar with text with the user's initials */
export class ProfilePic extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showDefault: !this.props.url || this.props.url.startsWith("https://www.gravatar"), // We can't know in advance if a gravatar image exists of not, so start with the default beforing trying to load image
            fileToCropSrc: null,
            uploadError: null,
            uploading: false,
        };
        this.imgFile = React.createRef();
    }
    setShowDefault() { /* console.log("error"); */ this.setState({showDefault: true});  }
    setShowImage() { /* console.log("load"); */ this.setState({showDefault: false});  }
    componentDidMount() {
        if (this.didImageLoad()) {
            this.setShowImage();
        } else {
            this.setShowDefault();
        }
    }
    didImageLoad(){
        // When using React Hydrate, the onLoad event of the profile image will return before
        // react code runs, so we check after mount as well to look replace bad images, or to
        // swap in a gravatar image that we now know is valid.
        const img = this.imgFile.current;
        return (img && img.complete && img.naturalWidth !== 0);
    }
    onSelectFile(e) {
        if (e.target.files && e.target.files.length > 0) {
            if (!e.target.files[0].type.startsWith('image/')) {
                this.setState({uploadError: "Error: Please upload an image with the correct file extension (e.g. jpg, png)"})
                return;
            }
            const reader = new FileReader();
            reader.addEventListener("load", () => this.setState({fileToCropSrc: reader.result}));
            reader.readAsDataURL(e.target.files[0]);
        }
    }
    onCloseCropper() {
        this.setState({fileToCropSrc: null, uploadError: null, uploading: false});
    }
    async upload(croppedImageBlob) {
        const formData = new FormData();
        formData.append('file', croppedImageBlob);
        this.setState({ uploading: true });
        try {
            const response = await Sefaria.uploadProfilePhoto(formData);
            if (response.error) {
                throw new Error(response.error);
            } else {
                window.location = "/sheets/profile/" + Sefaria.slug; // reload to get update
                return;
            }
        } catch (e) {
            this.setState({fileToCropSrc: null, uploadError: "Upload Error. Please contact hello@sefaria.org for assistance."})
        }
        this.setState({ uploading: false });
    }
    render() {
        const { name, url, len, hideOnDefault, showButtons, outerStyle, onClick, tabIndex, onKeyDown, ...otherProps } = this.props;
        const { showDefault} = this.state;
        const nameArray = !!name.trim() ? name.trim().split(/\s/) : [];
        const initials = nameArray.length > 0 ? (nameArray.length === 1 ? nameArray[0][0] : nameArray[0][0] + nameArray[nameArray.length-1][0]) : "";
        const defaultViz = showDefault ? 'flex' : 'none';
        const profileViz = showDefault ? 'none' : 'block';
        const imageSrc = url.replace("profile-default.png", 'profile-default-404.png');  // replace default with non-existant image to force onLoad to fail

        return (
            <div 
                style={outerStyle} 
                className="profile-pic"
                onClick={onClick}
                tabIndex={tabIndex}
                onKeyDown={onKeyDown}
                {...otherProps}
            >
                <div className={classNames({'default-profile-img': 1, noselect: 1, invisible: hideOnDefault})}
                     style={{display: defaultViz,  width: len, height: len, fontSize: len/2}}>
                    { showButtons ? null : `${initials}` }
                </div>
                <img
                    className="img-circle profile-img"
                    style={{display: profileViz, width: len, height: len, fontSize: len/2}}
                    src={imageSrc}
                    alt={Sefaria._("User Profile Picture")}
                    ref={this.imgFile}
                    onLoad={this.setShowImage}
                    onError={this.setShowDefault}
                />
                {this.props.children ? this.props.children : null /*required for slate.js*/}
                { showButtons ? /* cant style file input directly. see: https://stackoverflow.com/questions/572768/styling-an-input-type-file-button */
                    (<div className={classNames({"profile-pic-button-visible": showDefault !== null, "profile-pic-hover-button": !showDefault, "profile-pic-button": 1})}>
                        <input type="file" className="profile-pic-input-file" id="profile-pic-input-file" onChange={this.onSelectFile} onClick={(event)=> { event.target.value = null}}/>
                        <label htmlFor="profile-pic-input-file" className={classNames({resourcesLink: 1, blue: showDefault})}>
                            <span className="int-en">{ showDefault ? "Add Picture" : "Upload New" }</span>
                            <span className="int-he">{ showDefault ? "הוספת תמונה" : "עדכון תמונה" }</span>
                        </label>
                    </div>) : null
                }
                <ImageCropper
                    loading={this.state.uploading}
                    error={this.state.uploadError}
                    src={this.state.fileToCropSrc}
                    onClose={this.onCloseCropper}
                    onSave={this.upload}
                    widthHeightRatio={1}
                />
            </div>
        );
    }
}
ProfilePic.propTypes = {
    url:           PropTypes.string,
    name:          PropTypes.string,
    len:           PropTypes.number,
    hideOnDefault: PropTypes.bool,  // hide profile pic if you have are displaying default pic
    showButtons:   PropTypes.bool,  // show profile pic action buttons
    onClick:       PropTypes.func,  // click handler for dropdown functionality
    tabIndex:      PropTypes.number, // for keyboard accessibility
    onKeyDown:     PropTypes.func,  // keyboard handler for dropdown functionality
};
