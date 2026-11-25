import React from "react";
import Sefaria from "../sefaria/sefaria";

/**
 * Renders a keyed interface string that contains {placeholders}, filling each one with a React node.
 *
 * Why not concatenate <InterfaceText> pieces around the node? Word order differs between English and
 * Hebrew, so translators need the whole sentence in one string and the placeholder wherever it
 * belongs for their language (same approach as NoSearchResults.jsx).
 *
 * Example: en.json has "Managing subscriptions for {email}"
 *   <InterfaceTextWithSlots id={TEXT_KEYS.MANAGING_SUBSCRIPTIONS_FOR} slots={{ email: <strong>{userEmail}</strong> }} />
 */
export function InterfaceTextWithSlots({ id, slots }) {
  const langClass = Sefaria.interfaceLang === "hebrew" ? "int-he" : "int-en";
  // Splitting on a capturing group keeps the "{name}" tokens, so every odd index is a placeholder.
  const parts = Sefaria._(id).split(/\{(\w+)\}/);
  return (
    <span className={langClass}>
      {parts.map((part, i) =>
        i % 2 === 1 ? <React.Fragment key={i}>{slots[part]}</React.Fragment> : part
      )}
    </span>
  );
}
