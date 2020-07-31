//Slider moves as audio moves
const Audio = ({audioUrl, startTime, endTime}) => {
   const audioElement = useRef();
   const [currTime, setCurrTime] = useState(); //state that keeps track of time
   const [playing, setPlaying] = useState(false); //true would be autoplay
   const [clipEndTime, setClipEndTime] = useState();
   const [clipStartTime, setClipStartTime] = useState();
   const handleChange = (value) => setCurrTime(value); //set value when user uses slider
   
   useEffect(() => {
       const setAudioData = () => {
           setClipEndTime(endTime);
		   setClipStartTime(startTime);
           //setCurrTime(startTime);
       };
	   
       const setAudioTime = () => setCurrTime(audioElement.current.currentTime); //control range component 
	   
	   
       audioElement.current.addEventListener("timeupdate", setAudioTime);
       //audioElement.current.addEventListener("loadeddata", setAudioData);
	   setAudioData();
	   
	   if (clipStartTime && currTime < clipStartTime){		   
			audioElement.current.currentTime = clipStartTime;
	   };
			
	   
       playing ? audioElement.current.play() : audioElement.current.pause();
	   
       if (clipEndTime && currTime > clipEndTime) {
           setPlaying(false);
		   setCurrTime(null);
       } 
	   
	   //<input type="range" min={startTime} max={endTime} value = {currTime} step="1" onChange={(value) => {handleChange(value)}}/> //changes pointer according to audio

       return () => {
           audioElement.current.removeEventListener("loadeddata", setAudioData);
           audioElement.current.removeEventListener("timeupdate", setAudioTime);
       }
   });
   return (
       <div className={"Audio"}  key={audioUrl}>
          <h3>
		  <div> {"range: 0 ----- " + parseInt((clipEndTime-clipStartTime) - (clipEndTime - currTime)) + " ----- " + parseInt(clipEndTime-clipStartTime)} </div>
		  </h3>
          <button onClick={() => setPlaying(playing ? false : true)}>{playing ? "Pause" : "Play"}</button>
		  <input type="range" min={startTime} max={endTime} value = {currTime} step="any" onChange={(value) => {handleChange(value)}}/>
          <audio id="my-audio" ref = {audioElement}>
             <source src={audioUrl} type="audio/mpeg"/>
			 //set back to normal vals and do math at the endTime
          </audio>
       </div>
   )
};


//slider actually adjusts the audio, doesn't move with audioconst Audio = ({audioUrl, startTime, endTime}) => {
   const audioElement = useRef();
   const [currTime, setCurrTime] = useState(false); //state that keeps track of time
   const [playing, setPlaying] = useState(false); //true would be autoplay
   const [clipEndTime, setClipEndTime] = useState();
   const [clipStartTime, setClipStartTime] = useState();
   const onChange = (e) => {
		audioElement.current.pause();
		setCurrTime(e.currentTarget.value);
		audioElement.current.currentTime = e.currentTarget.value
		console.log("current time= " + audioElement.current.currentTime);
	//setPlaying(e.currentTarget.value)
	};
		   
   
   useEffect(() => {
       const setAudioData = () => {
           setClipEndTime(endTime);
		   setClipStartTime(startTime);
           //setCurrTime(startTime);
       };
	   
       const setAudioTime = () => { setCurrTime(audioElement.current.currentTime) } //control range component	  
		   
	   
       if (!currTime) audioElement.current.addEventListener("timeupdate", setAudioTime); //if user hasn't changed time (fix for when start time ==0)
	   
       //audioElement.current.addEventListener("loadeddata", setAudioData);
	   setAudioData();
	   
	   if (clipStartTime && currTime < clipStartTime){		   
			audioElement.current.currentTime = clipStartTime;
	   };
			
	   
       playing ? audioElement.current.play() : audioElement.current.pause();
	   
       if (clipEndTime && currTime > clipEndTime) {
           setPlaying(false);
		   setCurrTime(""); //was (null)
       } 
	   
	   //<input type="range" min={startTime} max={endTime} value = {currTime} step="1" onChange={(value) => {handleChange(value)}}/> //changes pointer according to audio

       return () => {
           audioElement.current.removeEventListener("loadeddata", setAudioData);
           audioElement.current.removeEventListener("timeupdate", setAudioTime);
       }
   });
   return (
       <div className={"Audio"}  key={audioUrl}>
          <h3>
		  <div> {"range: 0 ----- " + parseInt((clipEndTime-clipStartTime) - (clipEndTime - currTime)) + " ----- " + parseInt(clipEndTime-clipStartTime)} </div>
		  </h3>
          <button onClick={() => setPlaying(playing ? false : true)}>{playing ? "Pause" : "Play"}</button>
		  <input type="range" min={startTime} max={endTime} value = {currTime} step="1" onChange={(value) => {onChange(value)}}/>
          <audio id="my-audio" ref = {audioElement}><source src={audioUrl} type="audio/mpeg"/></audio>
       </div>
   )
};

//all scrolling and moving works, only issue is a phantom second audio player
const Audio = ({audioUrl, startTime, endTime}) => {
   const audioElement = useRef();
   const [currTime, setCurrTime] = useState(); //state that keeps track of time
   const [playing, setPlaying] = useState(false); //true would be autoplay
   const [clipEndTime, setClipEndTime] = useState();
   const [clipStartTime, setClipStartTime] = useState();
   const handleChange = (value) =>{
	   setCurrTime(value);  //slider will follow the time
	   //audioElement.current.pause();
	   setCurrTime(value.currentTarget.value);
	   audioElement.current.currentTime = value.currentTarget.value
   };//set value when user uses slider
   
   useEffect(() => {
       const setAudioData = () => {
		   if (startTime < clipStartTime){
		   setPlaying(true); 
		   setCurrTime(null)};
           setClipEndTime(endTime);
		   setClipStartTime(startTime);
           //setCurrTime(startTime);
       };
	   
       const setAudioTime = () => setCurrTime(audioElement.current.currentTime); //control range component 
	   
	   
       audioElement.current.addEventListener("timeupdate", setAudioTime);
       //audioElement.current.addEventListener("loadeddata", setAudioData);
	   setAudioData();
	   
	   if (clipStartTime && currTime < clipStartTime){		   
			audioElement.current.currentTime = clipStartTime;
	   };
			
	   
       playing ? audioElement.current.play() : audioElement.current.pause();
	   
       if (clipEndTime && currTime > clipEndTime) {
           setPlaying(false);
		   setCurrTime(null);
       } 
	   
	   
       return () => {
           audioElement.current.removeEventListener("loadeddata", setAudioData);
           audioElement.current.removeEventListener("timeupdate", setAudioTime);
       }
   });
   return (
   
	
		   <div className={"Audio"}  key={audioUrl}>
			  <h3>
			  <div> {"range: 0 ----- " + parseInt((clipEndTime-clipStartTime) - (clipEndTime - currTime)) + " ----- " + parseInt(clipEndTime-clipStartTime)} </div>
			  </h3>
			  <button onClick={() => setPlaying(playing ? false : true)}>{playing ? "Pause" : "Play"}</button>
			  <input type="range" min={startTime} max={endTime} value = {currTime} step="any" onChange={(value) => {handleChange(value)}}/>
			  <audio id="my-audio" controls="controls" ref = {audioElement}>
				 <source src={audioUrl} type="audio/mpeg"/>
				 //set back to normal vals and do math at the endTime
			  </audio>
		   </div> 
	
   )
};
