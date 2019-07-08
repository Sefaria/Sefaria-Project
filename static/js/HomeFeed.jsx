import React, { useState, useEffect, useCallback, useRef } from 'react';
const $          = require('./sefaria/sefariaJquery');
const PropTypes  = require('prop-types');
const Story      = require('./Story');
const Footer     = require('./Footer');
const { usePaginatedScroll } = require('./Hooks');


function HomeFeed(props) {
  const {interfaceLang, toggleSignUpModal, onlySharedStories} = props;
  const [stories, setStories] = useState([]);

  usePaginatedScroll(
      $(".homeFeedWrapper .content"),
      "/api/stories?" + (onlySharedStories ? "shared_only=1" : ""),
      data => setStories(prev => ([...prev, ...data.stories]))
  );

  return (
    <div className="homeFeedWrapper">
      <div className="content hasFooter">
        
        <div id="homeCover">
            <video id="homeVideo" poster="/static/img/home-video.jpg" preload="auto" autoPlay={true} loop="loop" muted="muted" volume="0">
                <source src="/static/img/home-video.webm" type="video/webm" />
                <source src="/static/img/home-video.mp4" type="video/mp4" />
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
            {stories.map((s,i) => Story(s, i, props))}
            </div>
          </div>

          <div className="homeFeedSidebar">

            <div id="homeLearn" className="section">
                <div className="sectionInner">
                    <div className="textBox">
                        <h2>
                            <span className="int-en">Start Learning</span>
                            <span className="int-he">למידה</span>
                        </h2>
                        <div className="description systemText">
                            <span className="int-en">Learning on Sefaria is simple, beautiful and powerful. Find commentaries, connections and translations across our free, ever-growing library of texts.</span>
                            <span className="int-he">למידה בספריא היא תהליך פשוט, יפיפה ורב עוצמה. מצאו פרשנויות, יחסים אינטרטקסטואליים ותרגומים ברחבי ספריית הטקסטים החינמית והמתרחבת שלנו.</span>
                        </div>
                        <a href="/texts">
                            <div className="button white control-elem">
                                <span className="int-en">Explore the Library &rsaquo;</span>
                                <span className="int-he">גלה את הספריה &rsaquo; </span>
                            </div>
                        </a>
                    </div>
                    <div className="imageBox">
                        <a className="refLink blockLink inAppLink" href={"/" + Sefaria.normRef(Sefaria.calendarRef("Parashat HaShavua"))} style={{borderColor: "rgb(0, 78, 95)"}}>
                            <span className="int-en">Parashah</span>
                            <span className="int-he">פרשה</span>
                        </a>
                        <a className="refLink blockLink inAppLink" href={"/" + Sefaria.normRef(Sefaria.calendarRef("Daf Yomi"))} style={{borderColor: "gb(204, 180, 121)"}}>
                            <span className="int-en">Daf Yomi</span>
                            <span className="int-he">דף יומי</span>
                        </a>
                        <a className="refLink blockLink" href="/texts/Liturgy/Haggadah" style={{borderColor: "rgb(171, 78, 102)"}}>
                            <span className="int-en">Haggadah</span>
                            <span className="int-he">הגדה של פסח</span>
                        </a>
                        <a className="refLink blockLink inAppLink" href="/Pirkei_Avot.1" style={{borderColor: "rgb(90, 153, 183)"}}>
                            <span className="int-en">Pirkei Avot</span>
                            <span className="int-he">פרקי אבות</span>
                        </a>
                        <a className="refLink blockLink inAppLink" href="/Bereishit_Rabbah.1" style={{borderColor: "rgb(93, 149, 111)"}}>
                            <span className="int-en">Midrash Rabbah</span>
                            <span className="int-he">מדרש רבה</span>
                        </a>
                        <a className="refLink blockLink inAppLink" href="/Shulchan_Arukh,_Orach_Chayyim.1" style={{borderColor: "rgb(128, 47, 62)"}}>
                            <span className="int-en">Shulchan Arukh</span>
                            <span className="int-he">שולחן ערוך</span>
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
                        <a href="https://play.google.com/store/apps/details?id=org.sefaria.sefaria" target="_blank">
                            <div className="button white control-elem">
                                <i className="fa fa-android"></i>
                                <span className="int-en">Get Android App &rsaquo;</span>
                                <span className="int-he"> הורדה לאנדרואיד &rsaquo;</span>
                            </div>
                        </a>
                        <a href="https://itunes.apple.com/us/app/sefaria/id1163273965?ls=1&mt=8" id="iOSButton" target="_blank">
                            <div className="button white control-elem">
                                <i className="fa fa-apple"></i>
                                <span className="int-en">Get iOS App &rsaquo;</span>
                                <span className="int-he"> הורדה לאייפון &rsaquo;</span>
                            </div>
                        </a>
                    </div>
                </div>
            </div>

            <div id="homeSheets" className="section">
                <div className="sectionInner">
                    <div className="textBox">
                        <h2>
                            <span className="int-en">Make a Source Sheet</span>
                            <span className="int-he">דפי מקורות</span>
                        </h2>
                        <div className="description systemText">
                            <span className="int-en">Mix and match sources from our library, as well as outside sources, along with your comments, images and videos.</span>
                            <span className="int-he">אתם יכולים לשלב מקורות מהספריה שלנו, יחד עם מקורות חיצוניים, ולהוסיף הערות, תמונות וסרטונים.</span>
                        </div>
                        <a href="/sheets/new">
                            <div className="button control-elem">
                                <span className="int-en">Start a Sheet &rsaquo;</span>
                                <span className="int-he">צור דף מקורות &rsaquo;</span>
                            </div>
                        </a>
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
                            <div className="button white control-elem">
                                <span className="int-en">Learn More &rsaquo;</span>
                                <span className="int-he">קרא עוד &rsaquo;</span>
                            </div>
                        </a>
                    </div>
                </div>
            </div>

            <div id="homeHelp" className="section">
                <div className="sectionInner">
                    <h2>
                        <span className="int-en">We Need Your Help</span>
                        <span className="int-he">אנו זקוקים לעזרתכם</span>
                    </h2>
                    <div className="description systemText">
                        <span className="int-en">Sefaria is an open source, non-profit project. Support us by making a tax-deductible donation.</span>
                        <span className="int-he">פרויקט ספריא פתוח לקהל הרחב (open source) ללא מטרות רווח. תמכו בנו באמצעות תרומה פטורה ממס.</span>
                    </div>
                    <a href="/donate">
                        <div className="button control-elem">
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
                    <div id="mailingListBox">
                        <div id="mailingListTitle" className="systemText">
                            <span className="int-en">Subscribe to our mailing list</span>
                            <span className="int-he">הצטרפו לרשימת הדיוור שלנו</span>
                        </div>
                        <input id="mailingListEmail" title="Subscribe to our mailing list by entering your email here" placeholder="Email Address" />
                        <span id="subscribe" className="button control-elem">
                            <span className="int-en">Subscribe</span>
                            <span className="int-he">הרשמו</span>
                        </span>
                        <div id="subscribeMsg">&nbsp;</div>
                    </div>
                </div>
            </div>

          </div>

        </div>

        <Footer />
      </div>
    </div>);
}
HomeFeed.propTypes = {
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func.isRequired,
  onlySharedStories:  PropTypes.bool
};

module.exports = HomeFeed;
