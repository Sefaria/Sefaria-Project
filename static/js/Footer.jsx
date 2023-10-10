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
    this.state = {};
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
            <Section en="About" he="དཔེ་ཆའི་སྐོར་འབྲེལ་">
                <Link href="/about" en="What is Pecha?" he="དཔེ་ཆ་གང་ཡིན་ནམ་།" />
                <Link href="/help" en="Help" he="རོགས་རམ་།" />
                <Link href="/team" en="Team" he="ལས་མི་།" />
                <Link href="/testimonials" en="Testimonials" he="ཡ་ལན་།" />
                <Link href="/metrics" en="Metrics" he="ཚད་གཞི་།" />
                <Link href="/annualreport/2022" en="Annual Report" he='ལོ་རེའི་ཞུ་ཐོ་།' />
                <Link href="/terms" en="Terms of Use" he="བེད་སྤྱད་སྒྲིག་གཞི་།" />
                <Link href="/privacy-policy" en="Privacy Policy" he="གསང་དོན་།" />
            </Section>

            <Section en="Tools" he="ལག་ཆ་།">
                <Link href="/educators" en="Teach with Pecha" he="དཔེ་ཆའི་མཉམ་དུ་སློབ་།" />
                <Link href="/calendars" en="Learning Schedules" he="སྦྱང་བྱའི་རེའུ་མིག" />
                <Link href="/sheets" en="Source Sheets" he="འབྱུང་ཁུངས་རེའུ་མིག" />
                <Link href="/visualizations" en="Visualizations" he="པར་སྟོན་།" />
                <Link href="/mobile" en="Mobile Apps" he="ཁ་པར་གཉམ་ཆས་།" />
                {/*<Link href="/daf-yomi" en="Daf Yomi" he="דף יומי" />*/}
                {/*<Link href="/torah-tab" en="Torah Tab" he="תורה טאב" />*/}
                <Link href="/people" en="Authors" he="རྩོམ་པ་པོ་།" />
                <Link href="/collections" en="Collections" he="གསོག་འཇོག་བྱེད་ས་།" />
                <Link href="/updates" en="New Additions" he="གསར་སྡོམ་བྱེད་ཡུལ་།" />
                <Link href="/remote-learning" en="Remote Learning" he="ཐག་རིང་ནས་སྦྱང་ས་།" />
            </Section>

            <Section en="Developers" he="གློག་ཀླད་ལས་མཁན་">
                <Link href="/developers" en="Get Involved" he="མཉམ་ལས་བྱེད་ས་།" blank={true} />
                <Link href="/developers#api" en="API Docs" he="API་ཡི་ཡིག་ཆ་།" blank={true} />
                <Link href="https://github.com/Sefaria/Sefaria-Project" en="Fork us on GitHub" he="Github" blank={true} />
                <Link href="https://github.com/Sefaria/Sefaria-Export" en="Download our Data" he="དཔྱད་གཞི་ཕབས་ལེན་།" blank={true} />
            </Section>

            <Section en="Join Us" he="མཉམ་གཞུགས་།">
                <DonateLink source={"Footer"}><InterfaceText text={{en:"Donate", he:"ཞལ་འདེབས་།"}}/></DonateLink>
                <Link href="/ways-to-give" en="Ways to Give" he="གཞན་རོགས་ཀྱི་ལམ་།" />
                <Link href="/supporters" en="Supporters" he="རོགས་སྐྱོར་མཁན་རྣམས་།" />
                <Link href="/jobs" en="Jobs" he="ལས་ཀ་།" />
                <Link href="https://store.sefaria.org" en="Shop" he="ཉོ་ཡུལ་།" />
            </Section>

          <div className="section last connect">
              <div className="header connect">
                  <InterfaceText>Connect</InterfaceText>
              </div>
              <NewsletterSignUpForm contextName="Footer" />
              <LikeFollowButtons />
              <div className="socialLinks">
                  <Link href={fbURL} en="Facebook" he="ངོ་དེབ་།" blank={true}/>
                  &bull;
                  <Link href="https://twitter.com/SefariaProject" en="Twitter" he="ཏྲི་དབི་ཏྲར་།" />
                  <br />

                  <Link href="https://www.youtube.com/user/SefariaProject" en="YouTube" he="ཡུ་ཀྲུབ་།" />
                  &bull;
                  <Link href={blgURL} en="Blog" he="འབྲི་དྲ་།" blank={true}/>
                  <br />

                  <Link href="https://www.instagram.com/sefariaproject/" en="Instagram" he="ཨིན་ས་ཀྲ་རྒ་རམ་།" />
                  &bull;
                  <Link href="mailto:hello@sefaria.org" en="Email" he="དྲ་ཚིག" />
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
                      onClick={this.trackLanguageClick.bind(null, "Hebrew")}>བོད་ཡིག
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
