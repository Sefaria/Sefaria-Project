import React, { useState, useEffect, useRef } from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Component from 'react-class';

import {
	LoadingMessage
} from './Misc';

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
				source_he = {audio.source_he}
				license = {audio.license}
				source_site = {audio.source_site}
				description = {audio.description}
				description_he = {audio.description_he}
				anchor = {audio.anchorRef}
				key = {audio.anchorRef}
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
					<div className="he">קריאה בתורה</div>
				</div>
				  {content}
			   </div>;
	}
}
MediaList.propTypes = {
  srefs: PropTypes.array.isRequired,
};


const Audio = ({audioUrl, startTime, endTime, source, source_he, license, source_site, description, description_he, anchor}) => {
   const audioElement = useRef();
   const [currTime, setCurrTime] = useState(startTime);
   const [playing, setPlaying] = useState(false);
   const [clipEndTime, setClipEndTime] = useState(endTime);
   const [clipStartTime, setClipStartTime] = useState(startTime);
	 const [audioUrlWithTime, setAudioUrlWithTime] = useState(`${audioUrl}#t=${startTime},${endTime}`)
   const handleChange = (value) => {
		   setCurrTime(value.currentTarget.value);
		   audioElement.current.currentTime = value.currentTarget.value
		};

    function formatTime(totalSeconds) {
				if (totalSeconds == "NaN" || totalSeconds < 0) {
					return("0:00")
				}

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
		 const setAudioTime = () => {
			 setCurrTime(audioElement.current.currentTime)
		 };
		 const setAudioData = () => {
			 audioElement.current.currentTime = startTime;
		 };

		 audioElement.current.load()


		 audioElement.current.addEventListener("loadeddata", setAudioData);
		 audioElement.current.addEventListener("timeupdate", setAudioTime);

		 return () => {
			 audioElement.current.removeEventListener("timeupdate", setAudioTime);
			 audioElement.current.removeEventListener("loadeddata", setAudioData);
		 }
	 },
	 [clipStartTime, clipEndTime]
);


   useEffect(() => {
			 playing ? audioElement.current.play() : audioElement.current.pause();
   }, [playing]);


	 useEffect(() => {
		 if (currTime > clipEndTime) {
				 setPlaying(false);
				 setCurrTime(startTime);
				 audioElement.current.currentTime = startTime
		 }
   }, [currTime]);



      return (
		<div className="media"  key={anchor+"_"+"audio"}>
			  <div className="title en">{source}</div>
				<div className="title he">{source_he}</div>
				<div className={`${Sefaria.languageClassFont()} description`}>{description_he}</div>
			  <div className="panel">
          <div className="playTimeContainer">
            <input type="image" src = {playing ? "static/img/pause.svg" : "static/img/play.svg"} alt={playing ? "Pause Audio" : "Play Audio"} onClick={() => setPlaying(!playing)} id="pause"/>
            <span>{formatTime((clipEndTime-clipStartTime) - (clipEndTime - currTime)) + " / " + formatTime(clipEndTime-clipStartTime)}</span>
          </div>
				  <div className="sliderContainer"><input type="range" min={startTime} max={endTime} value = {currTime} step="any" className="slider" onChange={(value) => {handleChange(value)}}/></div>
			  </div>
			  <audio id="my-audio" ref={audioElement} preload="metadata">
				 <source src={audioUrlWithTime} type="audio/mpeg"/>
			  </audio>
			  <div className="meta">
				<span className={`${Sefaria.languageClassFont()}`}>License: {license}</span>
        <br/>
				<span className={`${Sefaria.languageClassFont()}`}>Source: <a href={source_site} target="_blank">{source}</a></span>
			  </div>

		</div>
   )
};

export {
  MediaList
}
