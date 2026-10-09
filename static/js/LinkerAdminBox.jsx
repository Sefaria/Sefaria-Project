import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import ToggleSwitch from './common/ToggleSwitch';

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

const LinkerPartChip = ({part, contextType}) => {
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

// All citation spans sharing this span's charRange. For an unambiguous citation that's just the
// one span; for an ambiguous citation it's every option the linker considered (the disambiguator
// keeps one and marks the rest llm_ambiguous_option_valid === false). Falls back to [span] when the
// output map isn't populated (e.g. selection came from a URL param rather than a debug-mode click).
const getLinkerAdminOptions = (span) => {
  if (!span) { return []; }
  const sourceRef = span.refContext || span.sourceRef;
  const lang = span.language || span.lang;
  const charRange = Array.isArray(span.charRange) ? span.charRange.join("-") : span.charRange;
  const options = Sefaria._linkerOutputMap?.[`${sourceRef}|${lang}|${charRange}`];
  const citationOptions = (options || []).filter(s => s.type === "citation");
  if (!citationOptions.length) { return [span]; }
  // Push disambiguator-rejected options to the bottom; stable within each group.
  return citationOptions
    .map((option, i) => ({option, i}))
    .sort((a, b) => (a.option.llm_ambiguous_option_valid === false ? 1 : 0) - (b.option.llm_ambiguous_option_valid === false ? 1 : 0))
    .map(({option}) => option);
};

const linkerPartsFromSpan = (span) => (span?.inputRefParts || []).flatMap((text, i) => {
  const type = span.inputRefPartTypes?.[i];
  if (type === "RANGE") {
    // Flatten a ranged part back into its NUMBERED sections + "-" + NUMBERED toSections so the
    // server's RawRef._group_ranged_parts can reconstruct the RangedRawRefParts. Mirrors the range
    // branch in Sefaria._getLinkerTestStringForParts.
    const sections = span.inputRangeSections || [];
    const toSections = span.inputRangeToSections || [];
    return [
      ...sections.map(t => ({text: t, type: "NUMBERED"})),
      {text: "-", type: "RANGE_SYMBOL"},
      ...toSections.map(t => ({text: t, type: "NUMBERED"})),
    ];
  }
  return [{text, type}];
}).filter(part => part.text && part.type);

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
            <div>{pairing.parts.map((part, j) => <LinkerPartChip key={j} part={part} contextType={contextType} />)}</div>
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

const LinkerAdminBox = ({srefs, currentlyVisibleRef, connectionData, currVersions, currObjectVersions}) => {
  const selectedCitationData = connectionData || Sefaria._linkerAdminSelectedCitation;
  const linkerDebugOn = Sefaria._debug_mode === "linker";
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [rerunStatus, setRerunStatus] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testStringCopied, setTestStringCopied] = useState(false);
  const [selectedSpan, setSelectedSpan] = useState(selectedCitationData?.linkerAdminSpan || null);
  // Fall back to the ref currently visible in the reader (updates as you scroll) rather than the
  // panel's static srefs, so "Current Ref" tracks the reader when no citation is selected.
  const rerunRef = selectedSpan?.refContext || selectedSpan?.sourceRef || currentlyVisibleRef || srefs?.[0];
  const selectedSpanLang = selectedSpan?.language || selectedSpan?.lang;
  // Every ref the linker found for this citation. One entry for an unambiguous citation, several
  // (stacked) for an ambiguous one. Each option carries its own disambiguated ref (if any), so the
  // Disambiguator arrow is drawn per-option — only on the option the disambiguator actually resolved.
  const spanOptions = getLinkerAdminOptions(selectedSpan);
  // CRRD test string (paste into linker_test.py). Only citation spans carry ref parts.
  const testStringCrrd = selectedSpan?.inputRefParts ? Sefaria._getLinkerTestString(selectedSpan) : null;
  const visibleRerunVersions = selectedSpan?.versionTitle && selectedSpanLang ? [{
    lang: selectedSpanLang,
    versionTitle: selectedSpan.versionTitle,
  }] : ["he", "en"].map(lang => ({
    lang,
    versionTitle: currVersions?.[lang]?.versionTitle || currObjectVersions?.[lang]?.versionTitle,
  })).filter(version => version.versionTitle);

  const parseSpan = async (span) => {
    if (!span) {
      setError("No linker debug citation found. Click a resolved citation in the text (in linker debug mode) to select it.");
      return;
    }
    setBusy(true);
    setParsing(true);
    setError(null);
    setMessage(null);
    try {
      const parts = linkerPartsFromSpan(span);
      // span.contextRef is the ref the ORIGINAL live resolution actually matched against — for an
      // ibid-sourced citation that's the ibid target, not the citation's home segment. Feeding it in
      // as the resolver's book_context_ref would make the fresh parse label that same match
      // "curr. book" (RefResolver always tags book_context_ref matches CURRENT_BOOK), even though the
      // live resolution used ibid. Send the true home segment as contextRef, and carry the original
      // ibid target (if any) as prevRefs so a genuinely ibid-sourced match can still resolve — and be
      // labeled — as ibid here too.
      const homeRef = span.refContext || span.sourceRef || null;
      const prevRefs = span.contextType === "IBID" && span.contextRef ? [span.contextRef] : [];
      const result = await Sefaria.apiRequestWithBody("/_api/linker-admin/citation/parse", null, {
        parts,
        lang: span.language || span.lang || (Sefaria.hebrew.isHebrew(parts.map(part => part.text).join(" ")) ? "he" : "en"),
        contextRef: homeRef,
        prevRefs,
      }, "POST");
      setParsed(result);
      setSelectedSpan(span);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setParsing(false);
    }
  };

  const openLinkerEditor = () => {
    window.open("/linker-editor", "_blank", "noopener");
  };

  useEffect(() => {
    if (selectedCitationData?.linkerAdminSpan) {
      setSelectedSpan(selectedCitationData.linkerAdminSpan);
      parseSpan(selectedCitationData.linkerAdminSpan);
    }
  }, [selectedCitationData?.linkerAdminSpan]);

  useEffect(() => {
    // A citation selection should only pin "Rerun Linker" (and the other selectedSpan-driven
    // actions) to its own segment while that segment is still on screen. Without this, scrolling
    // away from a selected citation without clicking a new one leaves selectedSpan stale, so
    // rerunRef keeps silently targeting the OLD segment instead of the one currently visible.
    if (selectedSpan?.sourceRef && currentlyVisibleRef && selectedSpan.sourceRef !== currentlyVisibleRef) {
      setSelectedSpan(null);
      setParsed(null);
    }
  }, [currentlyVisibleRef]);

  // Restyle the citation's <a class="mutc"> element(s) already rendered in the reader so a
  // delete/recreate is visible immediately, without waiting for a reload to refetch linker_output.
  // Scoped the same way TextRange's own click handler resolves a citation: by the segment's
  // data-ref, the .contentSpan language, and the span's data-range.
  const LINKER_DEBUG_STATUS_CLASSES = ["spanSucceeded", "spanFailed", "spanAmbiguous", "spanDisambiguated", "spanDeleted"];
  const debugStatusClassForSpan = (span) => {
    if (span.failed) { return "spanFailed"; }
    if (span.llm_resolved_ref_non_segment || span.llm_resolved_ref_ambiguous) { return "spanDisambiguated"; }
    if (span.ambiguous) { return "spanAmbiguous"; }
    return "spanSucceeded";
  };
  const restyleLinkerCitationInReader = (span, deleted) => {
    const sourceRef = span.refContext || span.sourceRef;
    const lang = span.language || span.lang;
    const charRange = Array.isArray(span.charRange) ? span.charRange.join("-") : span.charRange;
    if (!sourceRef || !lang || !charRange) { return; }
    document.querySelectorAll(`a.mutc[data-range="${CSS.escape(charRange)}"]`).forEach(el => {
      const contentSpan = el.closest(".contentSpan");
      // Start from the parent, not el itself: the <a class="mutc"> carries its own data-ref
      // (the citation's target ref), which would otherwise shadow the ancestor segment's data-ref.
      const container = el.parentElement?.closest("[data-ref]");
      if (!contentSpan?.classList.contains(lang) || container?.getAttribute("data-ref") !== sourceRef) { return; }
      LINKER_DEBUG_STATUS_CLASSES.forEach(cls => el.classList.remove(cls));
      el.classList.add(deleted ? "spanDeleted" : debugStatusClassForSpan(span));
    });
  };

  const toggleDeleted = async () => {
    if (!selectedSpan) { return; }
    const deleted = !!selectedSpan.deleted;
    if (!deleted && !window.confirm(
      "This will permanently delete this link and prevent it from being recreated, even when the linker is re-run.\n\n" +
      "The link will remain visible in grey in linker debug mode, and can be recreated from there."
    )) { return; }
    const payload = {
      ref: selectedSpan.refContext || selectedSpan.sourceRef,
      versionTitle: selectedSpan.versionTitle,
      lang: selectedSpan.language || selectedSpan.lang,
      text: selectedSpan.text,
      charRange: selectedSpan.charRange,
      targetRef: selectedSpan.ref,
    };
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await Sefaria.apiRequestWithBody(`/_api/linker-admin/citation/${deleted ? "recreate" : "delete"}`, null, payload, "POST");
      setSelectedSpan({...selectedSpan, deleted: !deleted});
      if (result.marked) {
        restyleLinkerCitationInReader(selectedSpan, !deleted);
      }
      if (!deleted && result.marked && !result.linkDeleted) {
        // The citation is hidden, but no linker-generated Link was found to remove alongside it
        // (e.g. it was superseded by a more precise, non-auto-generated link). Surface that so the
        // admin doesn't assume the underlying connection is gone.
        setMessage("Citation hidden, but no linker-generated link was found to delete. The connection may still exist if it wasn't created by the linker.");
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const rerunLinker = async () => {
    if (!rerunRef || !visibleRerunVersions.length) { return; }
    setBusy(true);
    setError(null);
    setMessage(null);
    setRerunStatus(`Queueing linker rerun: ${rerunRef}`);
    try {
      const tasks = await Promise.all(visibleRerunVersions.map(version => Sefaria.apiRequestWithBody("/_api/linker-admin/segment/rerun", null, {
          ref: rerunRef,
          lang: version.lang,
          versionTitle: version.versionTitle,
        }, "POST")));
      setRerunStatus(`Waiting for linker rerun: ${rerunRef}`);
      await Promise.all(tasks.map(task => pollLinkerRerunTask(task.task_id || task.taskId)));
      setMessage(`Completed linker rerun: ${rerunRef}`);
      setRerunStatus(null);
      alert(`Completed linker rerun: ${rerunRef}`);
      window.location.reload();
    } catch (e) {
      setError(e.message || String(e));
      setRerunStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const pollLinkerRerunTask = async (taskId) => {
    if (!taskId) { throw new Error("Missing linker rerun task id"); }
    return Sefaria.pollTask(taskId, {
      interval: 1000,
      onProgress: (meta) => setRerunStatus(`Waiting for linker rerun: ${rerunRef}${meta?.step || meta?.state ? ` (${meta.step || meta.state})` : ""}`),
    });
  };

  const addRefDatasetExample = async () => {
    const version = visibleRerunVersions[0];
    if (!rerunRef || !version) { return; }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await Sefaria.apiRequestWithBody("/_api/linker-admin/dataset/ref", null, {
        ref: rerunRef,
        lang: version.lang,
        versionTitle: version.versionTitle,
      }, "POST");
      setMessage(`Saved Ref dataset example (${result.numEntities} labels): ${rerunRef}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const addRefPartDatasetExample = async () => {
    if (!selectedSpan) { return; }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await Sefaria.apiRequestWithBody("/_api/linker-admin/dataset/ref-part", null, {
        ref: selectedSpan.refContext || selectedSpan.sourceRef,
        lang: selectedSpan.language || selectedSpan.lang,
        versionTitle: selectedSpan.versionTitle,
        charRange: selectedSpan.charRange,
      }, "POST");
      setMessage(`Saved Ref Part dataset example (${result.numEntities} labels): ${selectedSpan.text}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyTestString = () => {
    if (!testStringCrrd) { return; }
    const input = document.getElementById("linkerAdminTestString");
    if (input) {
      input.select();
      input.setSelectionRange(0, 99999); // for mobile devices
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(testStringCrrd);
    } else { // fallback if navigator.clipboard is unavailable
      document.execCommand('copy');
    }
    setTestStringCopied(true);
    setTimeout(() => setTestStringCopied(false), 2000);
  };

  const toggleLinkerDebugMode = () => {
    const url = new URL(window.location.href);
    Sefaria.util.setLinkerAdminUrlParams(url.searchParams, {debug: !linkerDebugOn});
    window.location.href = url.toString();
  };

  // error, rerunStatus, and message are never set simultaneously (each setter call clears the
  // others first), so they collapse into a single status line with one of three visual treatments.
  // `parsing` (the citation/parse call backing ref-part loading) takes priority since it's the
  // most time-sensitive: it should replace whatever status was showing the instant a new parse starts.
  const statusKind = parsing ? "pending" : error ? "error" : rerunStatus ? "pending" : message ? "success" : null;
  const statusText = parsing ? "Loading ref parts…" : (error || rerunStatus || message);

  return (
    <div className="linkerAdminBox sans-serif">
      <div className="linkerAdminToggle">
        <label htmlFor="linker-admin-debug-mode" id="linker-admin-debug-mode-label">Linker debug mode</label>
        <ToggleSwitch
          name="linker-admin-debug-mode"
          isChecked={linkerDebugOn}
          onChange={toggleLinkerDebugMode}
        />
      </div>
      {rerunRef ? <div className="linkerAdminCurrentRef">Current Ref: {rerunRef}</div> : null}
      <div className="linkerAdminCitationActions">
        <button className={classNames("button", "small", {disabled: busy || !rerunRef || !visibleRerunVersions.length})} disabled={busy || !rerunRef || !visibleRerunVersions.length} onClick={rerunLinker}>
          Re-run linker
        </button>
        <button className={classNames("button", "small", {disabled: !selectedSpan?.ref || busy, linkerAdminDanger: !selectedSpan?.deleted && selectedSpan?.ref && !busy})} disabled={!selectedSpan?.ref || busy} onClick={toggleDeleted}>
          {selectedSpan?.deleted ? "Recreate Link" : "Delete Link"}
        </button>
        <button className="button small" onClick={openLinkerEditor}>
          Linker editor
        </button>
        <button className={classNames("button", "small", {disabled: busy || !selectedSpan})} disabled={busy || !selectedSpan} onClick={() => parseSpan(selectedSpan)}>
          Re-parse
        </button>
      </div>
      <div className="linkerAdminCitationActions">
        <button className={classNames("button", "small", {disabled: busy || !rerunRef || !visibleRerunVersions.length})} disabled={busy || !rerunRef || !visibleRerunVersions.length} onClick={addRefDatasetExample}>
          + Ref Dataset
        </button>
        <button className={classNames("button", "small", {disabled: busy || !selectedSpan})} disabled={busy || !selectedSpan} onClick={addRefPartDatasetExample}>
          + Ref Part Dataset
        </button>
      </div>
      {statusText ? (
        <div className={classNames("linkerAdminStatusLine", `linkerAdminStatusLine--${statusKind}`)}>
          {statusText}
        </div>
      ) : null}
      {selectedSpan ? (
        <div className="linkerAdminSelectedSpan">
          <div className="linkerAdminSectionTitle">
            {spanOptions.some(option => option.llm_resolved_ref_non_segment || option.llm_resolved_ref_ambiguous)
              ? "Linker Resolution (Disambiguated)"
              : (spanOptions.length > 1 || selectedSpan.ambiguous)
                ? "Linker Resolutions (Ambiguous)"
                : "Linker Resolution"}
          </div>
          {selectedSpan.text ? <div className="linkerAdminSpanText">&ldquo;{selectedSpan.text}&rdquo;</div> : null}
          <div className="linkerAdminOptions">
            {spanOptions.map((option, i) => {
              const optionDisambiguatedRef = option.llm_resolved_ref_non_segment || option.llm_resolved_ref_ambiguous;
              const rejected = option.llm_ambiguous_option_valid === false;
              return (
                <div className={classNames("linkerAdminRefFlow", {rejected})} key={i}>
                  <div className="linkerAdminRefItem">
                    <span className="linkerAdminRefTag">Linker</span>
                    {option.ref
                      ? <a className="linkerAdminRefValue" href={`/${Sefaria.normRef(option.ref)}`} target="_blank">{option.ref}</a>
                      : <span className="linkerAdminRefValue">No Ref</span>}
                  </div>
                  {optionDisambiguatedRef ? (
                    <React.Fragment>
                      <span className="linkerAdminRefArrow">→</span>
                      <div className="linkerAdminRefItem disambiguated">
                        <span className="linkerAdminRefTag">Disambiguator</span>
                        <a className="linkerAdminRefValue" href={`/${Sefaria.normRef(optionDisambiguatedRef)}`} target="_blank">{optionDisambiguatedRef}</a>
                      </div>
                    </React.Fragment>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {parsed?.input?.parts?.length ? (
        <div className="linkerAdminSection">
          <div className="linkerAdminSectionTitle">Ref Parts</div>
          <div className="linkerAdminParts">
            {parsed.input.parts.map((part, i) => <LinkerPartChip key={i} part={part} />)}
          </div>
        </div>
      ) : null}
      {parsed?.parsings?.length ? (
        <div className="linkerAdminSection">
          <div className="linkerAdminSectionTitle">Options considered</div>
          <div className="linkerAdminParsingList">
            {parsed.parsings
              .map((parsing, i) => ({parsing, i}))
              // Valid (green) parsings first; within each group, options that matched more ref
              // parts come first. Stable sort preserves original order on ties.
              .sort((a, b) => (a.parsing.valid === b.parsing.valid)
                ? (matchedPartCount(b.parsing) - matchedPartCount(a.parsing))
                : (a.parsing.valid ? -1 : 1))
              .map(({parsing, i}) => (
                // Key includes the citation text so switching to a new citation remounts each parsing
                // (and its LinkerPairings disclosure), resetting it to the collapsed state.
                <div className={classNames("linkerAdminParsing", {valid: parsing.valid, invalid: !parsing.valid})} key={`${parsed?.input?.text || ""}-${i}`}>
                  <div className="linkerAdminParsingRef">{parsing.ref || "No Ref"}</div>
                  {!parsing.valid ? <div className="linkerAdminInvalidReason">{parsing.disqualificationReason}</div> : null}
                  <LinkerPairings pairings={parsing.pairings || []} contextType={parsing.contextType} />
                </div>
              ))}
          </div>
        </div>
      ) : null}
      {testStringCrrd ? (
        <div className="linkerAdminSection">
          <div className="linkerAdminSectionTitle">CRRD Test String</div>
          <div className="linkerAdminTestStringBox" onClick={copyTestString} title="Click to copy">
            <input
              id="linkerAdminTestString"
              className="linkerAdminTestStringInput"
              type="text"
              readOnly
              value={testStringCrrd}
            />
            <img src="/static/icons/copy.svg" className="linkerAdminCopyIcon" aria-hidden="true" alt="" />
          </div>
          {testStringCopied ? <div className="linkerAdminMessage">Copied to clipboard</div> : null}
        </div>
      ) : null}
    </div>
  );
};

LinkerAdminBox.propTypes = {
  srefs: PropTypes.array.isRequired,
  currentlyVisibleRef: PropTypes.string,
  connectionData: PropTypes.object,
  currVersions: PropTypes.object,
  currObjectVersions: PropTypes.object,
};

export default LinkerAdminBox;
