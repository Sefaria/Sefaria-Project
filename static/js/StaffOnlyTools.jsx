import React, { useEffect, useState } from 'react';
import Sefaria from './sefaria/sefaria';

/*
 * Admin controls for staff-only (`admin_only`) records, shown to moderators on the staff site only
 * (Sefaria.staff_only_mode): a STAFF ONLY badge and Publish buttons for categories, books and versions.
 *
 * TEMPORARY (PR #3838 QA): the "QA: copy as staff-only" buttons, shown only where Sefaria.staff_only_qa_tools
 * is on. Remove them, and sefaria/helper/staff_only_qa.py, before merging.
 */

async function staffOnlyPost(url, payload) {
  const response = await Sefaria.apiRequestWithBody(url, null, payload, "POST", false);
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error(`The server answered ${response.status} without details.`);
  }
  if (!response.ok || data.error) {
    throw new Error(data.error || `The server answered ${response.status}.`);
  }
  return data;
}

async function run(confirmText, action, describe) {
  if (confirmText && !window.confirm(confirmText)) { return; }
  try {
    const result = await action();
    window.alert(describe(result));
    window.location.reload();
  } catch (e) {
    window.alert(`Failed: ${e.message}`);
  }
}

const refreshNote = paths => paths && paths.length ?
  `\n\nThe public site keeps the library in memory. Open these there, logged in as staff, in order:\n${paths.join("\n")}` : "";

/** A default Hebrew name for a copy: the source's, marked as a copy, with a number so copies don't collide. */
const hebrewCopyName = heSource => `${heSource || ""} עותק ${Math.floor(1000 + Math.random() * 9000)}`.trim();

const StaffOnlyBadge = ({adminOnly}) => (
  Sefaria.staff_only_mode && adminOnly ?
    <span className="staffOnlyBadge" title="Hidden on the public site until published">STAFF ONLY</span> : null
);

/** Whether the category at `path` is staff-only (the table of contents doesn't carry the flag). */
function useCategoryAdminOnly(path) {
  const [adminOnly, setAdminOnly] = useState(false);
  const key = (path || []).join("/");
  useEffect(() => {
    if (!Sefaria.staff_only_mode || !key) { return; }
    let cancelled = false;
    fetch(`/api/category/${path.map(encodeURIComponent).join("/")}`, {credentials: "same-origin"})
      .then(r => r.json())
      .then(d => { if (!cancelled) { setAdminOnly(!!d.admin_only); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]);
  return adminOnly;
}

/** Extra entries for CategoryHeader's admin menu on a category page. */
function staffOnlyCategoryButtons(path, adminOnly, heName) {
  const buttons = {};
  if (Sefaria.staff_only_qa_tools) {
    buttons.qaCopyCategory = ["QA: copy as staff-only", () => {
      const name = window.prompt("English name of the staff-only copy (no hyphens):", `Zzz QA ${path[path.length - 1]}`);
      if (!name) { return; }
      const heCopyName = window.prompt("Hebrew name of the copy:", hebrewCopyName(heName));
      if (!heCopyName) { return; }
      run(null, () => staffOnlyPost("/_api/staff-only/qa/copy-category", {path, name, heName: heCopyName}),
          r => `Created the staff-only category ${r.copied}.\nIt's empty: copy books into it from their book pages.`);
    }];
  }
  if (Sefaria.staff_only_mode && adminOnly) {
    buttons.publishStaffOnly = ["Publish (make public)", () =>
      run(`Publish the category ${path.join("/")}? This can't be undone from here.`,
          () => staffOnlyPost("/_api/staff-only/category/publish", {path}),
          r => `Published ${r.published}.` + refreshNote(r.refresh))];
  }
  return buttons;
}

/** Extra entries for CategoryHeader's admin menu on a book page. */
function staffOnlyBookButtons(title, categories, adminOnly, heTitle) {
  const buttons = {};
  if (Sefaria.staff_only_qa_tools) {
    buttons.qaCopyBook = ["QA: copy as staff-only", () => {
      const newTitle = window.prompt("English title of the staff-only copy (no hyphens):", `Zzz QA ${title}`);
      if (!newTitle) { return; }
      const heCopyTitle = window.prompt("Hebrew title of the copy:", hebrewCopyName(heTitle));
      if (!heCopyTitle) { return; }
      const category = window.prompt("Category of the copy (separate levels with /). Keep it, or name a staff-only category:",
                                     (categories || []).join("/"));
      if (!category) { return; }
      run(null, () => staffOnlyPost("/_api/staff-only/qa/copy-index",
                                    {title, newTitle, heTitle: heCopyTitle, categories: category.split("/").map(c => c.trim())}),
          r => `Copying ${title} to the staff-only book ${r.copying} in the background.\n` +
               `A book with many versions takes a minute or two. Then open ${r.url} : it shows a STAFF ONLY badge.`);
    }];
  }
  if (Sefaria.staff_only_mode && adminOnly) {
    buttons.publishStaffOnly = ["Publish (make public)", () =>
      run(`Publish ${title}, with its staff-only versions and links? This can't be undone from here.`,
          () => staffOnlyPost("/_api/staff-only/index/publish", {title, include_versions: true, include_links: true}),
          r => `Published ${r.published}, ${r.versions.length} version(s) and ${r.links ? r.links.published : 0} link(s)` +
               (r.links && r.links.skipped.length ? ` (${r.links.skipped.length} link(s) skipped: their other book is still staff-only)` : "") +
               "." + refreshNote(r.refresh))];
  }
  return buttons;
}

/** Buttons in a version's moderator edit form. */
const VersionStaffOnlyControls = ({version}) => {
  if (!Sefaria.staff_only_mode || !version) { return null; }
  const {title, versionTitle, language} = version;
  return (
    <div className="staffOnlyVersionControls">
      {Sefaria.staff_only_qa_tools ?
        <div className="button small" onClick={() => {
          const newVersionTitle = window.prompt("Title of the staff-only copy of this version:", `${versionTitle} (staff-only QA copy)`);
          if (!newVersionTitle) { return; }
          run(null, () => staffOnlyPost("/_api/staff-only/qa/copy-version", {title, versionTitle, language, newVersionTitle}),
              r => `Created the staff-only version ${r.copied}.`);
        }}>QA: copy as staff-only version</div> : null}
      {version.admin_only ?
        <div className="button small" onClick={() =>
          run(`Publish the version ${versionTitle}? This can't be undone from here.`,
              () => staffOnlyPost("/_api/staff-only/version/publish", {title, versionTitle, language}),
              r => `Published ${r.published}.` + refreshNote(r.refresh))}>Publish (make public)</div> : null}
    </div>
  );
};

export { StaffOnlyBadge, useCategoryAdminOnly, staffOnlyCategoryButtons, staffOnlyBookButtons, VersionStaffOnlyControls };
