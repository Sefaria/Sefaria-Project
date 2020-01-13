import React, { useState, useEffect, useCallback, useRef } from 'react';
import Component from 'react-class';
const $                        = require('./sefaria/sefariaJquery');
const Sefaria                  = require('./sefaria/sefaria');
const PropTypes                = require('prop-types');
const {Story}                  = require('./Story');
const Footer                   = require('./Footer');
const { usePaginatedScroll }   = require('./Hooks');
const { 
    NewsletterSignUpForm, 
    LoadingMessage 
}                              = require('./Misc');


function HomeFeedSidebar(props) {
    return (
        <div className="homeFeedSidebar">
            <div id="homeLearn" className="section">
                <div className="sectionInner">
                    <div className="textBox">
                        <h2>
                            <span className="int-en">Start Learning</span>
                            <span className="int-he">למידה</span>
                        </h2>
                        <div className="description systemText">
                            <span className="int-en">Explore commentaries, connections and translations across our free, ever-growing library of texts.</span>
                            <span className="int-he">למידה בספריא היא תהליך פשוט, יפיפה ורב עוצמה. מצאו פרשנויות, יחסים אינטרטקסטואליים ותרגומים ברחבי ספריית הטקסטים החינמית והמתרחבת שלנו.</span>
                        </div>
                    </div>
                    <div className="imageBox">
                        <a className="refLink inAppLink" href={"/" + Sefaria.normRef(Sefaria.calendarRef("Parashat Hashavua"))} style={{borderColor: "rgb(0, 78, 95)"}}>
                            <span className="int-en">Weekly Torah Portion</span>
                            <span className="int-he">פרשת השבוע</span>
                        </a>
                        <a className="refLink inAppLink" href={"/" + Sefaria.normRef(Sefaria.calendarRef("Daf Yomi"))} style={{borderColor: "rgb(204, 180, 121)"}}>
                            <span className="int-en">Daf Yomi</span>
                            <span className="int-he">דף יומי</span>
                        </a>
                        <a className="refLink" href="/texts/Liturgy/Haggadah" style={{borderColor: "rgb(171, 78, 102)"}}>
                            <span className="int-en">Passover Haggadah</span>
                            <span className="int-he">הגדה של פסח</span>
                        </a>
                        <a className="refLink inAppLink" href="/Pirkei_Avot.1" style={{borderColor: "rgb(90, 153, 183)"}}>
                            <span className="int-en">Pirkei Avot</span>
                            <span className="int-he">פרקי אבות</span>
                        </a>
                        <a className="refLink inAppLink" href="/Bereishit_Rabbah.1" style={{borderColor: "rgb(93, 149, 111)"}}>
                            <span className="int-en">Midrash Rabbah</span>
                            <span className="int-he">מדרש רבה</span>
                        </a>
                        <a className="refLink inAppLink" href="/Shulchan_Arukh,_Orach_Chayyim.1" style={{borderColor: "rgb(128, 47, 62)"}}>
                            <span className="int-en">Shulchan Arukh</span>
                            <span className="int-he">שולחן ערוך</span>
                        </a>

                    </div>
                </div>
            </div>

            <div id="homeSheets" className="section">
                <div className="sectionInner">
                    <div className="textBox">
                        <h2>
                            <span className="int-en">Make a Sheet</span>
                            <span className="int-he">דפי מקורות</span>
                        </h2>
                        <div className="description systemText">
                            <span className="int-en">Mix and match sources from our library, as well as outside sources, comments, images and videos.</span>
                            <span className="int-he">אתם יכולים לשלב מקורות מהספריה שלנו, יחד עם מקורות חיצוניים, ולהוסיף הערות, תמונות וסרטונים.</span>
                        </div>
                        <a href="/sheets/new" className="button fillWidth control-elem">
                            <img src="/static/img/sheet.svg" />
                            <span className="int-en">Start a Sheet</span>
                            <span className="int-he">צור דף מקורות</span>
                        </a>
                    </div>
                </div>
            </div>

            <div id="homeMobile" className="section">
                <div className="sectionInner">
                    <div className="textBox">
                        <h2>
                            <span className="int-en">Sefaria Mobile</span>
                            <span className="int-he">ספריא בנייד</span>
                        </h2>
                        <div className="description systemText">
                            <span className="int-en">
                                Enjoy Sefaria's entire library and all of its links and interconnections on-the-go.
                                Sefaria’s apps for Android and iOS available to download for free.
                            </span>
                            <span className="int-he">
                                הספריה המלאה של ספריא, הכוללת את כל הלינקים והקשרים, זמינה גם בנייד.
                                האפליקציות של ספריא לאנדרואיד ולאייפון זמינות עכשיו להורדה בחינם.
                            </span>

                        </div>
                        <div className="inlineButtonBox">
                        <a href="https://play.google.com/store/apps/details?id=org.sefaria.sefaria" target="_blank">
                            <div className="button white control-elem">
                                <i className="fa fa-android"></i>
                                <span className="int-en">Android</span>
                                <span className="int-he">אנדרואיד</span>
                            </div>
                        </a>
                        &nbsp;&nbsp;
                        <a href="https://itunes.apple.com/us/app/sefaria/id1163273965?ls=1&mt=8" id="iOSButton" target="_blank">
                            <div className="button white control-elem">
                                <i className="fa fa-apple"></i>
                                <span className="int-en">iOS</span>
                                <span className="int-he">אייפון</span>
                            </div>
                        </a>
                        </div>
                    </div>
                </div>
            </div>

            <div id="homeEducators" className="section">
                <div className="sectionInner">
                    <div className="textBox">
                         <h2>
                            <span className="int-en">Educators</span>
                            <span className="int-he">מחנכים</span>
                        </h2>
                        <div className="description systemText">
                            <span className="int-en">Discover Sefaria’s potential in the classroom, connect with other educators and learn to integrate Sefaria into your teaching.</span>
                            <span className="int-he">קרא עוד על יתרונות השימוש בספריא בכיתת הלימוד, צור קשר עם אנשי חינוך אחרים בתחום ולמד כיצד לשלב את ספריא בהוראה.</span>
                        </div>
                        <a href="/educators">
                            <div className="button white fillWidth control-elem">
                                <span className="int-en">Learn More</span>
                                <span className="int-he">קרא עוד</span>
                            </div>
                        </a>
                    </div>
                </div>
            </div>

            <div id="homeHelp" className="section">
                <div className="sectionInner">
                    <h2>
                        <span className="int-en">Support Sefaria</span>
                        <span className="int-he">אנו זקוקים לעזרתכם</span>
                    </h2>
                    <div className="description systemText">
                        <span className="int-en">Sefaria is an open source, non-profit project. Support us by making a tax-deductible donation.</span>
                        <span className="int-he">פרויקט ספריא פתוח לקהל הרחב (open source) ללא מטרות רווח. תמכו בנו באמצעות תרומה פטורה ממס.</span>
                    </div>
                    <a href="/donate">
                        <div className="button white fillWidth control-elem">
                            <img src="/static/img/heart.png" />
                            <span className="int-en">Make a Donation</span>
                            <span className="int-he">תרמו לנו</span>
                        </div>
                    </a>
                </div>
            </div>

            <div id="homeConnect" className="section center">
                <div className="sectionInner">
                    <h2>
                        <span className="int-en">Stay Connected</span>
                        <span className="int-he">השארו מחוברים</span>
                    </h2>
                    <NewsletterSignUpForm contextName="Home Page Sidebar" />
                    <div id="homeSocialButtons">
                        <a target="_blank" href={"https://www.facebook.com/sefaria.org" + (Sefaria.interfaceLang == "hebrew" ? ".il" : "")} className="fa fa-facebook"></a>
                        <a target="_blank" href="https://www.twitter.com/SefariaProject" className="fa fa-twitter"></a>
                        <a target="_blank" href="https://www.instagram.com/SefariaProject" className="fa fa-instagram"></a>
                        <a target="_blank" href="https://www.youtube.com/user/SefariaProject" className="fa fa-youtube-play"></a>
                    </div>
                </div>
            </div>

            <div id="homeFeedback">
                <NewHomeFeedbackBox />
            </div>

          </div>
    );
}

function HomeFeed(props) {
  const {interfaceLang, toggleSignUpModal, onlySharedStories} = props;
  const [stories, setStories] = useState([]);
  const scrollable_element = useRef();

  usePaginatedScroll(
      scrollable_element,
      "/api/stories?" + (onlySharedStories ? "shared_only=1" : ""),
      data => setStories(prev => ([...prev, ...data.stories]))
  );

  return (
    <div className="homeFeedWrapper">
      <div className="content hasFooter" ref={scrollable_element}>
        
        <div id="homeCover">
            <video id="homeVideo" poster="/static/img/home-video-narrow.jpg" preload="auto" autoPlay={true} loop="loop" muted="muted" volume="0">
                <source src="/static/img/home-video-narrow.webm" type="video/webm" />
                <source src="/static/img/home-video-narrow.mp4" type="video/mp4" />
                Video of sofer writing letters of the Torah
            </video>
            <h1 className="featureTitle">
                <span className="int-en">A Living Library of Jewish Texts</span>
                <span className="int-he">ספריה חיה של טקסטים יהודיים</span>
            </h1>
            <div className="sub">
                <span className="int-en">Explore 3,000 years of Jewish texts in Hebrew and English translation. <a href="/about">Learn More &rsaquo;</a></span>
                <span className="int-he">3,000 שנה של טקסטים יהודיים בעברית ובתרגום לאנגלית פרושים לפניך. <a href="/about">קרא עוד&rsaquo;</a></span>
            </div>
        </div>

        <div className="homeFeedColumns">
            <div className="storyFeed">
                <div className="storyFeedInner">
                {stories.length ? stories.map((s,i) => Story(s, i, props)) : <LoadingMessage />}
                </div>
            </div>
            <HomeFeedSidebar/>
        </div>
      </div>
    </div>);
}
HomeFeed.propTypes = {
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func.isRequired,
  onlySharedStories:  PropTypes.bool
};


class NewHomeFeedbackBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      alertmsg: null,
      feedbackSent: false,
      goodbyePrompt: false,
    };
  }
  sendFeedback() {
    if (!Sefaria._uid && !this.validateEmail($("#feedbackEmail").val())) {
      this.setState({alertmsg: Sefaria._("Please enter a valid email address")});
      return
    }

    var feedback = {
        type: "new_homepage",
        email: $("#feedbackEmail").val() || null,
        msg: $("#feedbackText").val(),
        url: "/newhome",
        uid: Sefaria._uid || null
    };
    if (!feedback.msg) { return; }
    var postData = {json: JSON.stringify(feedback)};
    var url = "/api/send_feedback";

    this.setState({feedbackSent: true});

    $.post(url, postData, function (data) {
        if (data.error) {
            alert(data.error);
        } else {
            console.log(data);
            $("#feedbackText").val("");
            Sefaria.track.event("New Home", "Send Feedback", null);
        }
    }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
        alert(Sefaria._("Unfortunately, there was an error sending this feedback. Please try again or try reloading this page."));
        this.setState({feedbackSent: false});
    });
  }
  validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }
  toggleGoodbyePrompt() {
    this.setState({goodbyePrompt: !this.state.goodbyePrompt});
  }
  sendFeedbackAndGoBack() {
    this.sendFeedback();
    Sefaria.track.event("New Home", "Disable", null);
    window.location = "/disable_feed";
  }
  render() {
    return (
        <div className={"feedbackBoxOverlay" + (this.state.goodbyePrompt ? " open" : "")}>
        <div className="feedbackBox">
            
            {this.state.goodbyePrompt ? 
            <div><p className="int-en">Before you go, would you tell why you're going back?</p>
            <p className="int-he">עוזבים? ספרו לנו מדוע אתם חוזרים למצב הישן</p></div>
            : 
            <div><p className="int-en">Thanks for trying out the new homepage!</p>
            <p className="int-he">תודה שניסיתם את דף הבית החדש!</p></div>}

            {this.state.alertmsg ?
                <div>
                    <p className="int-en">{this.state.alertmsg}</p>
                    <p className="int-he">{this.state.alertmsg}</p>
                </div>
                : null
            }

            <textarea className="feedbackText" placeholder={Sefaria._("Tell us what you think...")} id="feedbackText"></textarea>

            {!Sefaria._uid ?
                <div><input className="sidebarInput noselect" placeholder={Sefaria._("Email Address")} id="feedbackEmail" /></div>
                : null }


            {this.state.goodbyePrompt ?
             <div><div className="button" role="button" onClick={this.sendFeedbackAndGoBack}>
                 <span className="int-en">Submit & Go Back</span>
                 <span className="int-he">שליחה וחזרה</span>
             </div>
             <div className="button white" role="button" onClick={this.toggleGoodbyePrompt}>
                 <span className="int-en">Stay on new homepage</span>
                 <span className="int-he">המשך שימוש בדף הבית החדש</span>
             </div></div>           
             :
             <div><div className="button" role="button" onClick={this.sendFeedback}>
                 <span className="int-en">Submit Feedback</span>
                 <span className="int-he">שלח</span>
             </div>
            {/* TODO remove Goodbye prompt code once there's no going back
             <div className="button white" role="button" onClick={this.toggleGoodbyePrompt}>
                 <span className="int-en">Back to old homepage</span>
                 <span className="int-he">חזרה לדף הבית הישן</span>
             </div>
             */}
             </div>}

            {this.state.feedbackSent ?
                <div className="feedbackBox">
                    <p className="int-en">Feedback sent!</p>
                    <p className="int-he">משוב נשלח!</p>
                </div>
            : null }

        </div>
        </div>
    );
  }
}


module.exports = HomeFeed;