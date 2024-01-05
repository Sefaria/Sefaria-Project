import {InterfaceText} from "./Misc";
import React from "react";

const MobileAbout = () => {
  return <div className="mobileAbout"><h1>About Sefaria</h1>
    <a id="about" href="/about"><InterfaceText>What is Sefaria?</InterfaceText><i className="fa fa-chevron-right"/></a>
    <a id="team" href="/team"><InterfaceText>Team</InterfaceText><i className="fa fa-chevron-right"/></a>
    <a id="jobs" href="/jobs"><InterfaceText>Jobs at Sefaria</InterfaceText><i className="fa fa-chevron-right"/></a>
    <a id="supporters" href="/supporters"><InterfaceText>Our Supporters</InterfaceText><i className="fa fa-chevron-right"/></a>
    <a id="metrics" href="/metrics"><InterfaceText>Metrics</InterfaceText><i className="fa fa-chevron-right"/></a>
    <a id="annualreport" href="/link-to-annual-report"><InterfaceText>Annual Report</InterfaceText><i className="fa fa-chevron-right"/></a>
    <a id="terms" href="/terms"><InterfaceText>Terms of Use</InterfaceText><i className="fa fa-chevron-right"/></a>
    <a id="privacy" href="/privacy-policy"><InterfaceText>Privacy Policy</InterfaceText><i className="fa fa-chevron-right"/></a>
        </div>;
}
export {MobileAbout};