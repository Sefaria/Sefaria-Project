import {InterfaceText} from "./Misc";
import React from "react";

const MobileAbout = () => {
  return <div className="mobileAbout"><h1>About Sefaria</h1>
    <a id="about" href="/about"><InterfaceText>What is Sefaria?</InterfaceText></a>
    <a id="team" href="/team"><InterfaceText>Team</InterfaceText></a>
    <a id="jobs" href="/jobs"><InterfaceText>Jobs at Sefaria</InterfaceText></a>
    <a id="supporters" href="/supporters"><InterfaceText>Our Supporters</InterfaceText></a>
    <a id="metrics" href="/metrics"><InterfaceText>Metrics</InterfaceText></a>
    <a id="annualreport" href="/link-to-annual-report"><InterfaceText>Annual Report</InterfaceText></a>
    <a id="terms" href="/terms"><InterfaceText>Terms of Use</InterfaceText></a>
    <a id="privacy" href="/privacy-policy"><InterfaceText>Privacy Policy</InterfaceText></a>
        </div>;
}
export {MobileAbout};