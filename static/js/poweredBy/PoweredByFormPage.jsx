import React, { useState } from 'react';
import Sefaria from '../sefaria/sefaria';
import { InterfaceText } from '../Misc';
import PoweredByForm from './PoweredByForm';
import { buildSubmission, findListingMatch, saveSubmission } from './poweredByPoc';

/* HEBREW REVIEW: the `he` strings below are drafts awaiting a native speaker's review. */
const PAGE_COPY = {
  duplicateTitle: {
    en: "This project is already listed on Powered by Sefaria",
    he: "הפרויקט הזה כבר מופיע ב־Powered by Sefaria",
  },
  duplicateBody: {
    en: "We can send your answers to our team as an update to the existing listing, or you can go back and change them.",
    he: "אפשר לשלוח את התשובות שלכם לצוות שלנו כעדכון לרשומה הקיימת, או לחזור ולשנות אותן.",
  },
  sendAsUpdate: {en: "Send as an update", he: "שליחה כעדכון"},
  goBack: {en: "Go back", he: "חזרה"},
  placeholderTag: {en: "Placeholder text", he: "טקסט זמני"},
  thanksTitle: {en: "Thank you!", he: "תודה!"},
  thanksBody: {
    en: "We received your submission. Our team reviews every project before it appears on Powered by Sefaria.",
    he: "קיבלנו את הפנייה שלכם. הצוות שלנו בודק כל פרויקט לפני שהוא מופיע ב־Powered by Sefaria.",
  },
  updateThanksBody: {
    en: "We sent your answers to our team as an update to the existing listing.",
    he: "שלחנו את התשובות שלכם לצוות שלנו כעדכון לרשומה הקיימת.",
  },
  apiKeyQuestion: {en: "Want an API key?", he: "רוצים מפתח API?"},
  signIn: {en: "Sign in", he: "התחברות"},
  openDeveloperSettings: {en: "Go to Developer settings", he: "מעבר להגדרות המפתחים"},
  saveFailed: {
    en: "We couldn't send your answers. Please try again.",
    he: "לא הצלחנו לשלוח את התשובות. אנא נסו שוב.",
  },
};

export const DEVELOPER_SETTINGS_PATH = "/settings/developer";
export const SIGN_IN_FOR_API_KEY_URL = "/login?next=" + encodeURIComponent(DEVELOPER_SETTINGS_PATH);

/* A signed-in visitor starts with their name and email filled in. */
export const accountPrefill = () => {
  if (!Sefaria._uid) { return {}; }
  const fullName = String(Sefaria.full_name || "").trim();
  const space = fullName.indexOf(" ");
  return {
    firstName: space === -1 ? fullName : fullName.slice(0, space),
    lastName: space === -1 ? "" : fullName.slice(space + 1),
    email: Sefaria._email && Sefaria._email !== "null" ? Sefaria._email : "",
  };
};

const ThankYou = ({kind}) => (
  <div className="pbfForm pbfThanks" role="status">
    <span className="pbfPlaceholderTag"><InterfaceText text={PAGE_COPY.placeholderTag} /></span>
    <h2 className="pbfSectionHeading"><InterfaceText text={PAGE_COPY.thanksTitle} /></h2>
    <p className="pbfRichText">
      <InterfaceText text={kind === "update" ? PAGE_COPY.updateThanksBody : PAGE_COPY.thanksBody} />
    </p>
    <p className="pbfApiKey">
      <InterfaceText text={PAGE_COPY.apiKeyQuestion} />{" "}
      {Sefaria._uid ?
        <a href={DEVELOPER_SETTINGS_PATH}><InterfaceText text={PAGE_COPY.openDeveloperSettings} /></a> :
        <a href={SIGN_IN_FOR_API_KEY_URL}><InterfaceText text={PAGE_COPY.signIn} /></a>}
    </p>
  </div>
);

const DuplicateNotice = ({onSendUpdate, onGoBack, sending}) => (
  <div className="pbfForm pbfDuplicate" role="alertdialog" aria-labelledby="pbfDuplicateTitle">
    <h2 className="pbfSectionHeading" id="pbfDuplicateTitle"><InterfaceText text={PAGE_COPY.duplicateTitle} /></h2>
    <p className="pbfRichText"><InterfaceText text={PAGE_COPY.duplicateBody} /></p>
    <div className="pbfButtons">
      <button type="button" className="pbfButton" onClick={onGoBack}><InterfaceText text={PAGE_COPY.goBack} /></button>
      <button type="button" className="pbfButton" onClick={onSendUpdate} disabled={sending}>
        <InterfaceText text={PAGE_COPY.sendAsUpdate} />
      </button>
    </div>
  </div>
);

/* The public form at /powered-by/form, with a mock submit. */
const PoweredByFormPage = () => {
  const [initialValues] = useState(accountPrefill);
  const [answers, setAnswers] = useState(null);
  const [step, setStep] = useState("form");  // form | duplicate | thanks
  const [match, setMatch] = useState(null);
  const [kind, setKind] = useState("new");
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);

  const send = (submittedAnswers, submissionKind, submissionMatch) => {
    setFailed(false);
    setSending(true);
    return saveSubmission(buildSubmission(submittedAnswers, {kind: submissionKind, match: submissionMatch}))
      .then(() => { setKind(submissionKind); setStep("thanks"); })
      .catch(() => { setFailed(true); setStep("form"); })
      .finally(() => setSending(false));
  };

  const onSubmit = (submittedAnswers) => {
    setAnswers(submittedAnswers);
    const found = findListingMatch(submittedAnswers.projectLink);
    setMatch(found);
    if (found.status === "published") {
      setStep("duplicate");
      return Promise.resolve();
    }
    return send(submittedAnswers, "new", found);
  };

  let body;
  if (step === "thanks") {
    body = <ThankYou kind={kind} />;
  } else if (step === "duplicate") {
    body = (
      <DuplicateNotice
        sending={sending}
        onGoBack={() => setStep("form")}
        onSendUpdate={() => send(answers, "update", match)}
      />
    );
  } else {
    body = (
      <>
        {failed ? <p className="pbfForm pbfSaveFailed" role="alert"><InterfaceText text={PAGE_COPY.saveFailed} /></p> : null}
        <PoweredByForm
          key={answers ? "returning" : "fresh"}
          mode="public"
          initialValues={answers || initialValues}
          initialPage={answers ? 1 : 0}
          onSubmit={onSubmit}
        />
      </>
    );
  }

  return (
    <div className="readerNavMenu poweredByFormPage" key="poweredByForm">
      <div className="content">
        <div className="contentInner">{body}</div>
      </div>
    </div>
  );
};

export default PoweredByFormPage;
