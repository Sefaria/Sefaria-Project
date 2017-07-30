const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
import Component from 'react-class';

class Footer extends Component {
  trackLanguageClick(language){
    Sefaria.track.setInterfaceLanguage('interface language footer', language);
  }
  render(){
    var currentPath = Sefaria.util.currentPath();
    var currentPathEncoded = encodeURIComponent(currentPath);
    var next = currentPathEncoded ? currentPathEncoded : '?home';
    return (
        <div id="footerInner">
          <div className="section">

              <div className="header">
                  <span className="int-en">About</span>
                  <span className="int-he">אודות</span>
              </div>
              <a href="/about" className="outOfAppLink">
                  <span className="int-en">What is Sefaria?</span>
                  <span className="int-he">מהי ספאריה</span>
              </a>
              <a href="/help" className="outOfAppLink">
                  <span className="int-en">Help</span>
                  <span className="int-he">עזרה</span>
              </a>
              <a href="https://blog.sefaria.org" target="_blank" className="outOfAppLink">
                  <span className="int-en">Blog</span>
                  <span className="int-he">בלוג</span>
              </a>
              <a href="/faq" target="_blank" className="outOfAppLink">
                  <span className="int-en">FAQ</span>
                  <span className="int-he">שאלות נפוצות</span>
              </a>
              <a href="/team" className="outOfAppLink">
                  <span className="int-en">Team</span>
                  <span className="int-he">צוות</span>
              </a>
              <a href="/terms" className="outOfAppLink">
                  <span className="int-en">Terms of Use</span>
                  <span className="int-he">תנאי שימוש</span>
              </a>
              <a href="/privacy-policy" className="outOfAppLink">
                  <span className="int-en">Privacy Policy</span>
                  <span className="int-he">מדיניות הפרטיות</span>
              </a>
          </div>

          <div className="section">
              <div className="header">
                      <span className="int-en">Educators</span>
                      <span className="int-he">מחנכים</span>
              </div>
              <a href="/educators" className="outOfAppLink">
                  <span className="int-en">Teach with Sefaria</span>
                  <span className="int-he">למד באמצעות ספאריה</span>
              </a>
              <a href="/sheets" className="outOfAppLink">
                  <span className="int-en">Source Sheets</span>
                  <span className="int-he">דפי מקורות</span>
              </a>
              <a href="/visualizations" className="outOfAppLink">
                  <span className="int-en">Visualizations</span>
                  <span className="int-he">עזרים חזותיים</span>
              </a>
              <a href="/people" className="outOfAppLink">
                  <span className="int-en">Authors</span>
                  <span className="int-he">מחברים</span>
              </a>
              <a href="/updates" className="outOfAppLink">
                  <span className="int-en">New Additions</span>
                  <span className="int-he">מה חדש</span>
              </a>
          </div>

          <div className="section">
              <div className="header">
                  <span className="int-en">Developers</span>
                  <span className="int-he">מפתחים</span>
              </div>
              <a href="/developers" target="_blank" className="outOfAppLink">
                  <span className="int-en">Get Involved</span>
                  <span className="int-he">הצטרף אלינו</span>
              </a>
              <a href="/developers#api" target="_blank" className="outOfAppLink">
                  <span className="int-en">API Docs</span>
                  <span className="int-he">מסמכי API</span>
              </a>
              <a href="https://github.com/Sefaria/Sefaria-Project" target="_blank" className="outOfAppLink">
                  <span className="int-en">Fork us on GitHub</span>
                  <span className="int-he">זלגו חופשי מגיטהאב</span>
              </a>
              <a href="https://github.com/Sefaria/Sefaria-Export" target="_blank" className="outOfAppLink">
                  <span className="int-en">Download our Data</span>
                  <span className="int-he">הורד את בסיס הנתונים שלנו</span>
              </a>
          </div>

          <div className="section">
              <div className="header">
                  <span className="int-en">Join Us</span>
                  <span className="int-he">הצטרף אלינו</span>
              </div>
              <a href="/donate" className="outOfAppLink">
                  <span className="int-en">Donate</span>
                  <span className="int-he">תרומות</span>
              </a>
              <a href="/supporters" className="outOfAppLink">
                  <span className="int-en">Supporters</span>
                  <span className="int-he">תומכים</span>
              </a>
              <a href="/contribute" target="_blank" className="outOfAppLink">
                  <span className="int-en">Contribute</span>
                  <span className="int-he">הצטרף</span>
              </a>
              <a href="/jobs" className="outOfAppLink">
                  <span className="int-en">Jobs</span>
                  <span className="int-he">דרושים</span>
              </a>
          </div>

          <div className="section last">
              <div className="header">
                  <span className="int-en">Connect</span>
                  <span className="int-he">התחבר</span>
              </div>
              <a href="http://www.facebook.com/sefaria.org" target="_blank" className="outOfAppLink">
                  <i className="fa fa-facebook-official"></i>
                  <span className="int-en">Facebook</span>
                  <span className="int-he">פייסבוק</span>

              </a>
              <a href="http://twitter.com/SefariaProject" target="_blank" className="outOfAppLink">
                  <i className="fa fa-twitter"></i>
                  <span className="int-en">Twitter</span>
                  <span className="int-he">טוויטר</span>

              </a>
              <a href="http://www.youtube.com/user/SefariaProject" target="_blank" className="outOfAppLink">
                  <i className="fa fa-youtube"></i>
                  <span className="int-en">YouTube</span>
                  <span className="int-he">יוטיוב</span>

              </a>
              <a href="https://groups.google.com/forum/?fromgroups#!forum/sefaria" target="_blank" className="outOfAppLink">
                  <span className="int-en">Forum</span>
                  <span className="int-he">פורום</span>

              </a>
              <a href="mailto:hello@sefaria.org" target="_blank" className="outOfAppLink">
                  <span className="int-en">Email</span>
                  <span className="int-he">דוא&quot;ל</span>
              </a>
              <div id="siteLanguageToggle">
                  <div id="siteLanguageToggleLabel">
                      <span className="int-en">Site Language:</span>
                      <span className="int-he">שפת האתר</span>
                  </div>
                  <a href={"/interface/english?next=" + next} id="siteLanguageEnglish" className="outOfAppLink"
                     onClick={this.trackLanguageClick.bind(null, "English")}>English
                  </a>
                  |
                  <a href={"/interface/hebrew?next=" + next} id="siteLanguageHebrew" className="outOfAppLink"
                      onClick={this.trackLanguageClick.bind(null, "Hebrew")}>עברית
                  </a>
              </div>
          </div>
        </div>
    );
  }
}

module.exports = Footer;
