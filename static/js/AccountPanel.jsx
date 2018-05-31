
const {
  TwoOrThreeBox,
  BlockLink,
  ReaderNavigationMenuSection
}                = require('./Misc');
const React      = require('react');
const PropTypes  = require('prop-types');
const classNames = require('classnames');
const Footer     = require('./Footer');
const $          = require('./sefaria/sefariaJquery');
import Component from 'react-class';


class AccountPanel extends Component {
  componentDidMount() {
    $(".inAppLink").on("click", this.props.handleInAppLinkClick);
  }
  render() {
    var width = typeof window !== "undefined" ? $(window).width() : 1000;
    var accountContent = [
      (<BlockLink interfaceLink={true} target="/my/profile" title="Profile" heTitle="פרופיל" image="/static/img/profile.svg" />),
      (<BlockLink interfaceLink={true} target="/sheets/private" inAppLink={true} title="Sheets" heTitle="דפי מקורות" image="/static/img/sheet.svg" />),
      (<BlockLink interfaceLink={true} target="/my/notes" inAppLink={true} title="Notes" heTitle="הערות" image="/static/img/tools-write-note.svg" />),
      (<BlockLink interfaceLink={true} target="/my/groups" inAppLink={true} title="Groups" heTitle="קבוצות" image="/static/img/group.svg" />),
      (<BlockLink interfaceLink={true} target="/texts/recent" title="Reading History" heTitle="היסטורית קריאה" image="/static/img/readinghistory.svg" />),
      (<BlockLink interfaceLink={true} target="/settings/account" title="Settings" heTitle="הגדרות" image="/static/img/settings.svg" />),
    ];
    accountContent = (<TwoOrThreeBox content={accountContent} width={width} />);

    var learnContent = [
      (<BlockLink interfaceLink={true} target="/about" title="About" heTitle="אודות" />),
      (<BlockLink interfaceLink={true} target="/help" title="Help" heTitle="עזרה" />),
      (<BlockLink interfaceLink={true} target="http://blog.sefaria.org" title="Blog" heTitle="בלוג" />),
      (<BlockLink interfaceLink={true} target="/faq" title="FAQ" heTitle="שאלות נפוצות" />),
      (<BlockLink interfaceLink={true} target="/educators" title="Educators" heTitle="מחנכים" />),
      (<BlockLink interfaceLink={true} target="/team" title="Team" heTitle="צוות" />)
    ];
    learnContent = (<TwoOrThreeBox content={learnContent} width={width} />);

    var contributeContent = [
      (<BlockLink interfaceLink={true} target="/activity" title="Recent Activity" heTitle="פעילות אחרונה" />),
      (<BlockLink interfaceLink={true} target="/metrics" title="Metrics" heTitle="מדדים" />),
      (<BlockLink interfaceLink={true} target="/contribute" title="Contribute" heTitle="הצטרפות לעשיה" />),
      (<BlockLink interfaceLink={true} target="/donate" title="Donate" heTitle="תרומות" />),
      (<BlockLink interfaceLink={true} target="/supporters" title="Supporters" heTitle="תומכים" />),
      (<BlockLink interfaceLink={true} target="/jobs" title="Jobs" heTitle="דרושים" />),
    ];
    contributeContent = (<TwoOrThreeBox content={contributeContent} width={width} />);

    var connectContent = [
      (<BlockLink interfaceLink={true} target="https://groups.google.com/forum/?fromgroups#!forum/sefaria" title="Forum" heTitle="פורום" />),
      (<BlockLink interfaceLink={true} target="http://www.facebook.com/sefaria.org" title="Facebook" heTitle="פייסבוק" />),
      (<BlockLink interfaceLink={true} target="http://twitter.com/SefariaProject" title="Twitter" heTitle="טוויטר" />),
      (<BlockLink interfaceLink={true} target="http://www.youtube.com/user/SefariaProject" title="YouTube" heTitle="יוטיוב" />),
      (<BlockLink interfaceLink={true} target="http://www.github.com/Sefaria" title="GitHub" heTitle="גיטהאב" />),
      (<BlockLink interfaceLink={true} target="mailto:hello@sefaria.org" title="Email" heTitle='אימייל' />)
    ];
    connectContent = (<TwoOrThreeBox content={connectContent} width={width} />);

    var footer =  (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                    <Footer />
                    </footer> );

    var classes = {accountPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    var classStr = classNames(classes);
    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">
            <h1>
              <a href="/logout" className="button transparent">
                <span className="int-en">Log Out</span>
                <span className="int-he">ניתוק</span>
              </a>
              <span className="int-en">Account</span>
              <span className="int-he">חשבון משתמש</span>
            </h1>
           <ReaderNavigationMenuSection content={accountContent} />
           <ReaderNavigationMenuSection title="Learn" heTitle="לימוד" content={learnContent} />
           <ReaderNavigationMenuSection title="Contribute" heTitle="עשייה" content={contributeContent} />
           <ReaderNavigationMenuSection title="Connect" heTitle="התחברות" content={connectContent} />
          </div>
            {footer}
        </div>
      </div>
      );
  }
}
AccountPanel.propTypes = {
  interfaceLang: PropTypes.string,
};


module.exports = AccountPanel;
