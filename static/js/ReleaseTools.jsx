import React, { useEffect, useState } from 'react';
import Sefaria from './sefaria/sefaria';

/*
 * Admin controls for unreleased (`unreleased`) records, shown to moderators on the staff site only
 * (Sefaria.show_unreleased): an UNRELEASED badge and Release buttons for categories, books and versions.
 *
 * TEMPORARY (PR #3838 QA): the "QA: copy as unreleased" buttons, shown only where Sefaria.unreleased_qa_tools
 * is on. Remove them, and sefaria/helper/release_qa.py, before merging.
 */

async function releasePost(url, payload) {
  const response = await Sefaria.apiRequestWithBody(url, null, payload, 'POST', false);
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
  if (confirmText && !window.confirm(confirmText)) {
    return;
  }
  try {
    const result = await action();
    window.alert(describe(result));
    window.location.reload();
  } catch (e) {
    window.alert(`Failed: ${e.message}`);
  }
}

const refreshNote = (paths) =>
  paths && paths.length
    ? `\n\nThe public site keeps the library in memory. Open these there, logged in as staff, in order:\n${paths.join('\n')}`
    : '';

/** A default Hebrew name for a copy: the source's, marked as a copy, with a number so copies don't collide. */
const hebrewCopyName = (heSource) => `${heSource || ''} עותק ${Math.floor(1000 + Math.random() * 9000)}`.trim();

const UnreleasedBadge = ({ unreleased }) =>
  Sefaria.show_unreleased && unreleased ? (
    <span className="unreleasedBadge" title="Hidden on the public site until released">
      UNRELEASED
    </span>
  ) : null;

/** Whether the category at `path` is unreleased (the table of contents doesn't carry the flag). */
function useCategoryUnreleased(path) {
  const [unreleased, setUnreleased] = useState(false);
  const key = (path || []).join('/');
  useEffect(() => {
    if (!Sefaria.show_unreleased || !key) {
      return;
    }
    let cancelled = false;
    fetch(`/api/category/${path.map(encodeURIComponent).join('/')}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setUnreleased(!!d.unreleased);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);
  return unreleased;
}

/** Extra entries for CategoryHeader's admin menu on a category page. */
function releaseCategoryButtons(path, unreleased, heName) {
  const buttons = {};
  if (Sefaria.unreleased_qa_tools) {
    buttons.qaCopyCategory = [
      'QA: copy as unreleased',
      () => {
        const name = window.prompt(
          'English name of the unreleased copy (no hyphens):',
          `Zzz QA ${path[path.length - 1]}`
        );
        if (!name) {
          return;
        }
        const heCopyName = window.prompt('Hebrew name of the copy:', hebrewCopyName(heName));
        if (!heCopyName) {
          return;
        }
        run(
          null,
          () => releasePost('/_api/release/qa/copy-category', { path, name, heName: heCopyName }),
          (r) => `Created the unreleased category ${r.copied}.\nIt's empty: copy books into it from their book pages.`
        );
      },
    ];
  }
  if (Sefaria.show_unreleased && unreleased) {
    buttons.release = [
      'Release (make public)',
      () =>
        run(
          `Release the category ${path.join('/')}? This can't be undone from here.`,
          () => releasePost('/_api/release/category', { path }),
          (r) => `Released ${r.released}.` + refreshNote(r.refresh)
        ),
    ];
  }
  return buttons;
}

/** Extra entries for CategoryHeader's admin menu on a book page. */
function releaseBookButtons(title, categories, unreleased, heTitle) {
  const buttons = {};
  if (Sefaria.unreleased_qa_tools) {
    buttons.qaCopyBook = [
      'QA: copy as unreleased',
      () => {
        const newTitle = window.prompt('English title of the unreleased copy (no hyphens):', `Zzz QA ${title}`);
        if (!newTitle) {
          return;
        }
        const heCopyTitle = window.prompt('Hebrew title of the copy:', hebrewCopyName(heTitle));
        if (!heCopyTitle) {
          return;
        }
        const category = window.prompt(
          'Category of the copy (separate levels with /). Keep it, or name an unreleased category:',
          (categories || []).join('/')
        );
        if (!category) {
          return;
        }
        run(
          null,
          () =>
            releasePost('/_api/release/qa/copy-index', {
              title,
              newTitle,
              heTitle: heCopyTitle,
              categories: category.split('/').map((c) => c.trim()),
            }),
          (r) =>
            `Copying ${title} to the unreleased book ${r.copying} in the background.\n` +
            `A book with many versions takes a minute or two. Then open ${r.url} : it shows an UNRELEASED badge.`
        );
      },
    ];
  }
  if (Sefaria.show_unreleased && unreleased) {
    buttons.release = [
      'Release (make public)',
      () =>
        run(
          `Release ${title}, with its unreleased versions and links? This can't be undone from here.`,
          () => releasePost('/_api/release/index', { title, include_versions: true, include_links: true }),
          (r) =>
            `Released ${r.released}, ${r.versions.length} version(s) and ${r.links ? r.links.released : 0} link(s)` +
            (r.links && r.links.skipped.length
              ? ` (${r.links.skipped.length} link(s) skipped: their other book is still unreleased)`
              : '') +
            '.' +
            refreshNote(r.refresh)
        ),
    ];
  }
  return buttons;
}

/** Buttons in a version's moderator edit form. */
const VersionReleaseControls = ({ version }) => {
  if (!Sefaria.show_unreleased || !version) {
    return null;
  }
  const { title, versionTitle, language } = version;
  return (
    <div className="releaseVersionControls">
      {Sefaria.unreleased_qa_tools ? (
        <div
          className="button small"
          onClick={() => {
            const newVersionTitle = window.prompt(
              'Title of the unreleased copy of this version:',
              `${versionTitle} (unreleased QA copy)`
            );
            if (!newVersionTitle) {
              return;
            }
            run(
              null,
              () => releasePost('/_api/release/qa/copy-version', { title, versionTitle, language, newVersionTitle }),
              (r) => `Created the unreleased version ${r.copied}.`
            );
          }}
        >
          QA: copy as unreleased version
        </div>
      ) : null}
      {version.unreleased ? (
        <div
          className="button small"
          onClick={() =>
            run(
              `Release the version ${versionTitle}? This can't be undone from here.`,
              () => releasePost('/_api/release/version', { title, versionTitle, language }),
              (r) => `Released ${r.released}.` + refreshNote(r.refresh)
            )
          }
        >
          Release (make public)
        </div>
      ) : null}
    </div>
  );
};

export { UnreleasedBadge, useCategoryUnreleased, releaseCategoryButtons, releaseBookButtons, VersionReleaseControls };
