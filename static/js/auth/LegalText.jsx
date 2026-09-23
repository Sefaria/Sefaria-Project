import React from 'react';
import { InterfaceText } from '../Misc.jsx';

const LegalText = () => (
  <p className="sefaria-legal-text">
    <InterfaceText>auth.terms_prefix</InterfaceText>
    <a href="/terms" target="_blank" rel="noopener noreferrer"><InterfaceText>auth.terms_of_use</InterfaceText></a>
    <InterfaceText>auth.terms_conjunction</InterfaceText>
    <a href="/privacy-policy" target="_blank" rel="noopener noreferrer"><InterfaceText>auth.privacy_policy</InterfaceText></a>
    <InterfaceText>auth.terms_suffix</InterfaceText>
  </p>
);

export default LegalText;
