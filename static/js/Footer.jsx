import React  from 'react';
import Sefaria  from './sefaria/sefaria';
import PropTypes from'prop-types';
import $  from './sefaria/sefariaJquery';
import { InterfaceText, NewsletterSignUpForm, DonateLink } from './Misc';
import Component from 'react-class';

const Section = ({en, he, children}) => (
    <div className="section">
      <div className="header">
         <InterfaceText text={{en:en, he:he}}/>
      </div>
      {children}
    </div>
);

const Link = ({href, en, he, blank}) => (
    <a href={href} target={blank ? "_blank" : "_self"}>
      <InterfaceText text={{en:en, he:he}}/>
    </a>
);

class Footer extends Component {
  constructor(props) {
    super(props);
    this.state = {subscribeMessage: null};
  }
  componentDidMount() {
    this.setState({isClient: true});
  }
  trackLanguageClick(language){
    Sefaria.track.setInterfaceLanguage('interface language footer', language);
  }
  render() {
    if (!Sefaria._siteSettings.TORAH_SPECIFIC) { return null; }

    const fbURL = Sefaria.interfaceLang == "hebrew" ? "https://www.facebook.com/sefaria.org.il" : "https://www.facebook.com/sefaria.org";
    const blgURL = Sefaria.interfaceLang == "hebrew" ? "https://blog.sefaria.org.il/" : "https://blog.sefaria.org/";
    let next = this.state.isClient ? (encodeURIComponent(Sefaria.util.currentPath())) : "/" ; //try to make sure that a server render of this does not get some weird data in the url that then gets cached
    return (
      <footer id="footer" className="static sans-serif">
        <div id="footerInner">
            <Section en="About" he="אודות">
                <Link href="/about" en="What is Sefaria?" he="מהי ספריא" />
                <Link href="/help" en="Help" he="עזרה" />
                <Link href="/team" en="Team" he="צוות" />
                <Link href="/testimonials" en="Testimonials" he="חוות דעת" />
                <Link href="/metrics" en="Metrics" he="מדדים" />
                <Link href="/terms" en="Terms of Use" he="תנאי שימוש" />
                <Link href="/privacy-policy" en="Privacy Policy" he="מדיניות פרטיות" />
            </Section>

            <Section en="Tools" he="כלים">
                <Link href="/educators" en="Teach with Sefaria" he="מלמדים עם ספריא" />
                <Link href="/calendars" en="Learning Schedules" he="לוח לימוד יומי" />
                <Link href="/sheets" en="Source Sheets" he="דפי מקורות" />
                <Link href="/visualizations" en="Visualizations" he="תרשימים גרפיים" />
                <Link href="/mobile" en="Mobile Apps" he="ספריא בנייד" />
                <Link href="/daf-yomi" en="Daf Yomi" he="דף יומי" />
                <Link href="/torah-tab" en="Torah Tab" he="תורה טאב" />
                <Link href="/people" en="Authors" he="מחברים" />
                <Link href="/collections" en="Collections" he="אסופות" />
                <Link href="/updates" en="New Additions" he="עדכונים" />
                <Link href="/remote-learning" en="Remote Learning" he="למידה מרחוק" />
            </Section>

            <Section en="Developers" he="מפתחים">
                <Link href="/developers" en="Get Involved" he="הצטרפו אלינו" blank={true} />
                <Link href="/developers#api" en="API Docs" he="מסמכי API" blank={true} />
                <Link href="https://github.com/Sefaria/Sefaria-Project" en="Fork us on GitHub" he="Github" blank={true} />
                <Link href="https://github.com/Sefaria/Sefaria-Export" en="Download our Data" he="בסיס נתונים" blank={true} />
            </Section>

            <Section en="Join Us" he="הצטרפו אלינו">
                <DonateLink source={"Footer"}><InterfaceText text={{en:"Donate", he:"תרומות"}}/></DonateLink>
                <Link href="/ways-to-give" en="Ways to Give" he="אפשרויות תרומה" />
                <Link href="/supporters" en="Supporters" he="תומכים" />
                <Link href="/jobs" en="Jobs" he="דרושים" />
                <Link href="https://store.sefaria.org" en="Shop" he="חנות" />
            </Section>

          <div className="section last connect">
              <div className="header connect">
                  <InterfaceText>Connect</InterfaceText>
              </div>
              <NewsletterSignUpForm contextName="Footer" />
              <LikeFollowButtons />
              <div className="socialLinks">
                  <Link href={fbURL} en="Facebook" he="פייסבוק" blank={true}/>
                  &bull;
                  <Link href="https://twitter.com/SefariaProject" en="Twitter" he="טוויטר" />
                  <br />

                  <Link href="https://www.youtube.com/user/SefariaProject" en="YouTube" he="יוטיוב" />
                  &bull;
                  <Link href={blgURL} en="Blog" he="בלוג" blank={true}/>
                  <br />

                  <Link href="https://www.instagram.com/sefariaproject/" en="Instagram" he="אינסטגרם" />
                  &bull;
                  <Link href="mailto:hello@sefaria.org" en="Email" he="דוא&quot;ל" />
              </div>
              <div id="siteLanguageToggle">
                  <div id="siteLanguageToggleLabel">
                      <InterfaceText>Site Language</InterfaceText>
                  </div>
                  <a href={"/interface/english?next=" + next} id="siteLanguageEnglish"
                     onClick={this.trackLanguageClick.bind(null, "English")}>English
                  </a>
                  |
                  <a href={"/interface/hebrew?next=" + next} id="siteLanguageHebrew"
                      onClick={this.trackLanguageClick.bind(null, "Hebrew")}>עברית
                  </a>
              </div>
          </div>
        </div>
      </footer>
    );
  }
}

class LikeFollowButtons extends Component {
  componentDidMount() {
    this.loadFacebook();
    this.loadTwitter();
  }
  loadFacebook() {
    if (typeof FB !== "undefined") {
       FB.XFBML.parse();
    } else {
      (function(d, s, id) {
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) return;
        js = d.createElement(s); js.id = id;
        js.src = Sefaria.interfaceLang ==  "hebrew" ?
          "https://connect.facebook.net/he_IL/sdk.js#xfbml=1&version=v2.10&appId=206308089417064"
          : "https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v2.10&appId=206308089417064";
        fjs.parentNode.insertBefore(js, fjs);
      }(document, 'script', 'facebook-jssdk'));
    }
  }
  loadTwitter() {
    if (typeof twttr !== "undefined") {
      if ("widgets" in twttr) {
        twttr.widgets.load();
      }
    } else {
      window.twttr = (function(d, s, id) {
        var js, fjs = d.getElementsByTagName(s)[0],
          t = window.twttr || {};
        if (d.getElementById(id)) return t;
        js = d.createElement(s);
        js.id = id;
        js.src = "https://platform.twitter.com/widgets.js";
        fjs.parentNode.insertBefore(js, fjs);

        t._e = [];
        t.ready = function(f) {
          t._e.push(f);
        };

        return t;
      }(document, "script", "twitter-wjs"));
    }
  }
  render() {
    var fbURL = Sefaria.interfaceLang == "hebrew" ? "https://www.facebook.com/sefaria.org.il" : "https://www.facebook.com/sefaria.org";
    var lang = Sefaria.interfaceLang.substring(0,2);
    return (<div id="socialButtons">
              <div id="facebookButton">
                <div className="fb-like"
                  data-href={fbURL}
                  data-layout="button"
                  data-action="like"
                  data-size="small"
                  data-show-faces="false"
                  data-share="true"></div>
              </div>
              <div id="twitterButton">
                <a className="twitter-follow-button"
                  href="https://twitter.com/SefariaProject"
                  data-show-screen-name="false"
                  data-show-count="false"
                  data-lang={lang}></a>
              </div>
            </div>);
  }
}


export default Footer;
