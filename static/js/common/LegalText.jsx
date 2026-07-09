import React from 'react';
import { InterfaceText } from '../Misc.jsx';

const LegalText = () => (
  <p className="sefaria-legal-text">
    <InterfaceText context="Auth">{"By continuing, you are agreeing to Sefaria's "}</InterfaceText>
    <a href="/terms"><InterfaceText context="Auth">Terms of Use</InterfaceText></a>
    <InterfaceText context="Auth">{" and "}</InterfaceText>
    <a href="/privacy-policy"><InterfaceText context="Auth">Privacy Policy</InterfaceText></a>
    <InterfaceText context="Auth">{"."}</InterfaceText>
  </p>
);

export default LegalText;
