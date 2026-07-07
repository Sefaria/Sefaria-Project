import React from 'react';

const LegalText = () => {
  if (Sefaria.interfaceLang === 'hebrew') {
    return (
      <p className="sefaria-legal-text">
        {Sefaria._('Auth legal prefix')}
        <a href="/terms">{Sefaria._('Auth Terms of Use')}</a>
        {Sefaria._('Auth legal conjunction')}
        <a href="/privacy-policy">{Sefaria._('Auth Privacy Policy')}</a>
        {Sefaria._('Auth legal suffix')}
      </p>
    );
  }
  const sentence = Sefaria._("By continuing, you are agreeing to Sefaria's Terms of Use and Privacy Policy.");
  const links = [[Sefaria._('Terms of Use'), '/terms'], [Sefaria._('Privacy Policy'), '/privacy-policy']];
  const parts = [];
  let rest = sentence;
  links.forEach(([label, href], i) => {
    const idx = rest.indexOf(label);
    if (idx >= 0) {
      parts.push(rest.slice(0, idx));
      parts.push(<a key={i} href={href}>{label}</a>);
      rest = rest.slice(idx + label.length);
    }
  });
  parts.push(rest);
  return <p className="sefaria-legal-text">{parts}</p>;
};

export default LegalText;
