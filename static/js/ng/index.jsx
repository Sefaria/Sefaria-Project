/**
 * NG mobile reader entry for both Node SSR (node/server.js) and the browser (./client.jsx).
 * This graph must stay small and SSR-safe: no ReaderApp.jsx, no Misc.jsx, no CSS imports,
 * no ESM-only packages (the server bundle require()s node_modules at runtime).
 */
import Sefaria from '../sefaria/sefaria';
import VersionPreferences from '../sefaria/VersionPreferences';
import NgReaderApp from './NgReaderApp';

/** Same reset-and-load as ReaderApp's sefariaSetup; `true` clears the per-request caches. */
export function ngSetup(sharedData, props) {
  Sefaria.setup(sharedData, props, true);
}

/**
 * Seed the data layer from NG props: the base fields it reads, version preferences, and the
 * initial path. The initial text is not cached: NG renders it from props, and later loads go
 * through getTextFromCurrVersions, which keys its cache on the resolved versions.
 */
export function ngUnpackProps(props) {
  Sefaria.unpackBaseProps(props);
  Sefaria.versionPreferences = new VersionPreferences(props.versionPrefsByCorpus);
  Sefaria.util._initialPath = props.initialPath || '/';
}

export {NgReaderApp};
