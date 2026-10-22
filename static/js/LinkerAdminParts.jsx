import React, { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';

// Shared pieces of the linker admin UIs (reader sidebar LinkerAdminBox and LinkerBulkCorrectorPage).

const LINKER_PART_COLORS = {
  NAMED: "#dbeafe",
  NUMBERED: "#dcfce7",
  DH: "#fef3c7",
  RANGE: "#fce7f3",
  RANGE_SYMBOL: "#ede9fe",
  IBID: "#e0f2fe",
  RELATIVE: "#ffedd5",
  NON_CTS: "#f3f4f6",
};

// Parts injected from context (rather than the citation text itself) are these RawRefPart subclasses.
const CONTEXT_PART_CLASSES = ["ContextPart", "TermContext", "SectionContext"];
const CONTEXT_TYPE_LABELS = {
  CURRENT_BOOK: "curr. book",
  IBID: "ibid",
};

export const LinkerPartChip = ({part, contextType}) => {
  const contextLabel = contextType && CONTEXT_PART_CLASSES.includes(part.class)
    ? (CONTEXT_TYPE_LABELS[contextType] || contextType)
    : null;
  return (
    <span className="linkerAdminPartChip" style={{backgroundColor: LINKER_PART_COLORS[part.type] || "#f3f4f6"}}>
      <span className="linkerAdminPartText">{part.text}</span>
      <span className="linkerAdminPartType">{part.type}</span>
      {contextLabel ? <span className="linkerAdminPartContext">from {contextLabel}</span> : null}
    </span>
  );
};

LinkerPartChip.propTypes = {
  part: PropTypes.object.isRequired,
  contextType: PropTypes.string,
};

// Total number of ref parts matched across a parsing's Ref Part / Node Pairings — used to rank
// the "Options considered" list (a resolution that consumed more parts is a stronger match).
const matchedPartCount = (parsing) => (parsing.pairings || []).reduce((n, pairing) => n + (pairing.parts?.length || 0), 0);

const LinkerPairings = ({pairings, contextType}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="linkerAdminPairings">
      <button className="linkerAdminDisclosure" onClick={() => setOpen(!open)} aria-expanded={open}>
        <img
          src="/static/icons/chevron-down.svg"
          className={classNames("linkerAdminDisclosureChevron", {open})}
          alt=""
          aria-hidden={true}
        />
        Ref Part / Node Pairings
      </button>
      {open ? pairings.map((pairing, i) => {
        const pairingRef = pairing.ref || pairing.node?.ref;
        return (
          <div className="linkerAdminPairing" key={i}>
            <div>{(pairing.parts || []).map((part, j) => <LinkerPartChip key={j} part={part} contextType={contextType} />)}</div>
            <div className="linkerAdminNode">
              {pairingRef
                ? <a className="linkerAdminRefValue" href={`/${Sefaria.normRef(pairingRef)}`} target="_blank">{pairingRef}</a>
                : (pairing.node?.key || "No node")}
            </div>
          </div>
        );
      }) : null}
    </div>
  );
};

LinkerPairings.propTypes = {
  pairings: PropTypes.array.isRequired,
  contextType: PropTypes.string,
};

export const LinkerParsingList = ({parsings, keyPrefix}) => (
  <div className="linkerAdminParsingList">
    {parsings
      .map((parsing, i) => ({parsing, i}))
      // Valid (green) parsings first; within each group, options that matched more ref
      // parts come first. Stable sort preserves original order on ties.
      .sort((a, b) => (a.parsing.valid === b.parsing.valid)
        ? (matchedPartCount(b.parsing) - matchedPartCount(a.parsing))
        : (a.parsing.valid ? -1 : 1))
      .map(({parsing, i}) => (
        // keyPrefix identifies the citation, so switching to a new citation remounts each parsing
        // (and its LinkerPairings disclosure), resetting it to the collapsed state.
        <div className={classNames("linkerAdminParsing", {valid: parsing.valid, invalid: !parsing.valid})} key={`${keyPrefix}-${i}`}>
          <div className="linkerAdminParsingRef">{parsing.ref || "No Ref"}</div>
          {!parsing.valid ? <div className="linkerAdminInvalidReason">{parsing.disqualificationReason}</div> : null}
          <LinkerPairings pairings={parsing.pairings || []} contextType={parsing.contextType} />
        </div>
      ))}
  </div>
);

LinkerParsingList.propTypes = {
  parsings: PropTypes.array.isRequired,
  keyPrefix: PropTypes.string.isRequired,
};

export const LinkerTestStringBox = ({testString}) => {
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (inputRef.current) {
      inputRef.current.select();
      inputRef.current.setSelectionRange(0, 99999); // for mobile devices
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(testString);
    } else { // fallback if navigator.clipboard is unavailable
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="linkerAdminSection">
      <div className="linkerAdminSectionTitle">CRRD Test String</div>
      <div className="linkerAdminTestStringBox" onClick={copy} title="Click to copy">
        <input
          ref={inputRef}
          className="linkerAdminTestStringInput"
          type="text"
          readOnly
          value={testString}
        />
        <img src="/static/icons/copy.svg" className="linkerAdminCopyIcon" aria-hidden="true" alt="" />
      </div>
      {copied ? <div className="linkerAdminMessage">Copied to clipboard</div> : null}
    </div>
  );
};

LinkerTestStringBox.propTypes = {
  testString: PropTypes.string.isRequired,
};
