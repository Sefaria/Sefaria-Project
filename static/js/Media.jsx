import React, { useState, useEffect, useRef } from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Component from 'react-class';

class MediaList extends Component {
	render() {
		let audios = Sefaria.mediaByRef(this.props.srefs)
		let content = [];
		  content = audios.map(audio => {
			return <Audio
				audioUrl = {audio.media_url}
				startTime = {audio.start_time}
				endTime = {audio.end_time}
				source = {audio.source}
				license = {audio.license}
				source_site = {audio.source_site}
				description = {audio.description}
				anchor = {audio.anchorRef}
				/>
		  });
		 if (!content.length) {
			return <div className="mediaList empty">
                  <LoadingMessage />
                </div>;
		 }

		return <div className="mediaList">
				<div className="mediaTitle">
					<div className="en">Torah Reading </div>
					<div className="he">קריאת התורה </div>
				</div>
				  {content}
			   </div>;
	}
}
MediaList.propTypes = {
  srefs: PropTypes.array.isRequired,
};


const Audio = ({audioUrl, startTime, endTime, source, license, source_site, description, anchor}) => {
   const audioElement = useRef();
   const [currTime, setCurrTime] = useState(true);
   const [playing, setPlaying] = useState(false); //true for autoplay
   const [clipEndTime, setClipEndTime] = useState();
   const [clipStartTime, setClipStartTime] = useState();
   const handleChange = (value) => {
		   setCurrTime(value);
		   setCurrTime(value.currentTarget.value);
		   audioElement.current.currentTime = value.currentTarget.value
		};

    function formatTime(totalSeconds) {
        const seconds = Math.floor(totalSeconds % 60);
        const minutes = Math.floor(totalSeconds / 60);

        const padWithZero = number => {
            const string = number.toString();
            if (number < 10) {
                return "0" + string;
            }
            return string;
        };
        return (minutes) + ":" + padWithZero(seconds);
    }


   useEffect(() => {
       const setAudioData = () => {
		   if (startTime < clipStartTime){
		   if (clipStartTime != currTime) setPlaying(true);
		   setCurrTime(null)};
           setClipEndTime(endTime);
		   setClipStartTime(startTime);
       };

       const setAudioTime = () => setCurrTime(audioElement.current.currentTime); //control range component


       audioElement.current.addEventListener("timeupdate", setAudioTime);
	   setAudioData();

	   if (clipStartTime && currTime < clipStartTime){
			audioElement.current.currentTime = clipStartTime;
	   };


       playing ? audioElement.current.play() : audioElement.current.pause();

       if (clipEndTime && currTime > clipEndTime) {
           setPlaying(false);
		   setCurrTime(null);
       }


       return () => { //pretty sure these are both unnecassary
           audioElement.current.removeEventListener("loadeddata", setAudioData);
           audioElement.current.removeEventListener("timeupdate", setAudioTime);
       }
   });
      return (
		<div className="media"  key={anchor+"_"+"audio"}>
			  <div className="title">{source}</div>
			  <div className="description">{description}</div>
			  <div className="panel">
          <div className="playTimeContainer">
            <input type="image" src = {playing ? "static/img/pause.svg" : "static/img/play.svg"} alt={playing ? "Pause Audio" : "Play Audio"} onClick={() => setPlaying(playing ? false : true)} id="pause"/>
            <span>{formatTime((clipEndTime-clipStartTime) - (clipEndTime - currTime)) + " / " + formatTime(clipEndTime-clipStartTime)}</span>
          </div>
				  <div className="sliderContainer"><input type="range" min={startTime} max={endTime} value = {currTime} step="any" className="slider" onChange={(value) => {handleChange(value)}}/></div>
			  </div>
			  <audio id="my-audio" ref = {audioElement}>
				 <source src={audioUrl} type="audio/mpeg"/>
			  </audio>
			  <div className="meta">
				<span className="int-en">License: {license}</span>
				<span className="int-he">עסק רשיון: {license}</span>
        <br/>
				<span className="int-en">Source: <a href={"//"+source_site} target="_blank">{source}</a></span>
				<span className="int-he">מקור: {source_site}</span>
			  </div>

		</div>
   )
};

export {
  MediaList
}
