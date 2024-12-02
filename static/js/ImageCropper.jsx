import React, {useState, useRef} from 'react';
import Sefaria from './sefaria/sefaria';
import ReactCrop from 'react-image-crop';
import {LoadingRing} from "./Misc";
import 'react-image-crop/dist/ReactCrop.css';

export const ImageCropper = ({loading, error, src, onClose, onSave}) => {
    const imageRef = useRef(null);
    const [isFirstCropChange, setIsFirstCropChange] = useState(true);
    const [crop, setCrop] = useState({unit: "px", width: 250, aspect: 1});
    const [croppedImageBlob, setCroppedImageBlob] = useState(null);
    const onImageLoaded = (image) => {imageRef.current = image};
    const onCropComplete = (crop) => {
        makeClientCrop(crop);
    }
    const onCropChange = (crop, percentCrop) => {
        if (isFirstCropChange) {
            const { clientWidth:width, clientHeight:height } = imageRef.current;
            crop.width = Math.min(width, height);
            crop.height = crop.width;
            crop.x = (imageRef.current.width/2) - (crop.width/2);
            crop.y = (imageRef.current.height/2) - (crop.width/2);
            setCrop(crop);
            setIsFirstCropChange(false);
        } else {
            setCrop(crop);
        }
    }
    const makeClientCrop = async (crop) => {
        if (imageRef.current && crop.width && crop.height) {
            const croppedImageBlob = await getCroppedImg(
                imageRef.current,
                crop,
                "newFile.jpeg"
            );
            setCroppedImageBlob(croppedImageBlob);
        }
    }
    const getCroppedImg = (image, crop, fileName) => {
        const canvas = document.createElement("canvas");
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        canvas.width = crop.width * scaleX;
        canvas.height = crop.height * scaleY;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
            image,
            crop.x * scaleX,
            crop.y * scaleY,
            crop.width * scaleX,
            crop.height * scaleY,
            0,
            0,
            crop.width * scaleX,
            crop.height * scaleY
        );

        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    console.error("Canvas is empty");
                    return;
                }
                blob.name = fileName;
                resolve(blob);
            }, "image/jpeg");
        });
    }
    const closePopup = () => {
        setCrop({unit: "px", width: 250, aspect: 1});
        setIsFirstCropChange(true);
        setCroppedImageBlob(null);
        onClose();
    }
    return (<>
        { (src || !!error) && (
            <div id="interruptingMessageBox" className="sefariaModalBox">
                <div id="interruptingMessageOverlay" onClick={closePopup}></div>
                <div id="interruptingMessage" className="profile-pic-cropper-modal">
                    <div className="sefariaModalContent profile-pic-cropper-modal-inner">
                        { src ?
                            (<ReactCrop
                                src={src}
                                crop={crop}
                                className="profile-pic-cropper"
                                keepSelection
                                onImageLoaded={onImageLoaded}
                                onComplete={onCropComplete}
                                onChange={onCropChange}
                            />) : (<div className="profile-pic-cropper-error">{ error }</div>)
                        }
                    </div>
                    { (loading || isFirstCropChange) ? (<div className="profile-pic-loading"><LoadingRing /></div>) : (
                        <div>
                            <div className="smallText profile-pic-cropper-desc">
                                <span className="int-en">Drag corners to crop image</span>
                                <span className="int-he">לחיתוך התמונה, גרור את הפינות</span>
                            </div>
                            <div className="profile-pic-cropper-button-row">
                                <a href="#" className="resourcesLink profile-pic-cropper-button" onClick={closePopup}>
                                    <span className="int-en">Cancel</span>
                                    <span className="int-he">בטל</span>
                                </a>
                                <a href="#" className="resourcesLink blue profile-pic-cropper-button" onClick={onSave}>
                                    <span className="int-en">Save</span>
                                    <span className="int-he">שמור</span>
                                </a>
                            </div>
                        </div>
                    )
                    }
                </div>
            </div>
        )
        }
    </>);
};
