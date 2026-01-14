/**
 * ModeratorToolsPanel - Main container for Sefaria moderator tools
 *
 * Access at /modtools (requires staff permissions via Sefaria.is_moderator).
 *
 * This panel provides internal admin tools for:
 * - Bulk downloading text versions
 * - CSV upload of texts
 * - Workflowy OPML outline upload
 * - Links management (upload/download/remove)
 * - Bulk editing of Version metadata
 * - Editing node titles in Index schemas (NodeTitleEditor)
 *
 * Documentation:
 * - See /docs/modtools/MODTOOLS_GUIDE.md for quick reference
 * - See /docs/modtools/COMPONENT_LOGIC.md for implementation details
 *
 * CSS: Styles are in /static/css/modtools.css
 */
import Sefaria from './sefaria/sefaria';

// Note: modtools.css is loaded via <link> tag in base.html for CI compatibility

// Import tool components
import BulkDownloadText from './modtools/components/BulkDownloadText';
import BulkUploadCSV from './modtools/components/BulkUploadCSV';
import WorkflowyModeratorTool from './modtools/components/WorkflowyModeratorTool';
import UploadLinksFromCSV from './modtools/components/UploadLinksFromCSV';
import DownloadLinks from './modtools/components/DownloadLinks';
import RemoveLinksFromCsv from './modtools/components/RemoveLinksFromCsv';
import BulkVersionEditor from './modtools/components/BulkVersionEditor';
import NodeTitleEditor from './modtools/components/NodeTitleEditor';


/**
 * ModeratorToolsPanel - Main container component
 *
 * Renders all modtools sections when user has moderator permissions.
 * Tools are organized in logical order:
 * 1. Download/Upload (bulk operations)
 * 2. Links management
 * 3. Bulk editing (Index, Version)
 * 4. Commentary tools
 * 5. Schema tools
 */
function ModeratorToolsPanel() {
  // Check moderator access
  if (!Sefaria.is_moderator) {
    return (
      <div className="modTools">
        <div className="message error">
          Tools are only available to logged-in moderators.
        </div>
      </div>
    );
  }

  return (
    // Outer container is full-width; inner has max-width so side margins allow scrolling
    <div className="modTools">
      <div className="modToolsInner">
        {/* Download/Upload Tools */}
        <BulkDownloadText />
        <BulkUploadCSV />
        <WorkflowyModeratorTool />

        {/* Links Management */}
        <UploadLinksFromCSV />
        <DownloadLinks />
        <RemoveLinksFromCsv />

        {/* Bulk Editing Tools */}
        {/* TODO: BulkIndexEditor temporarily disabled - open ticket to reintroduce */}
        {/* <BulkIndexEditor /> */}
        <BulkVersionEditor />

        {/* Schema Tools */}
        <NodeTitleEditor />
      </div>
    </div>
  );
}

export default ModeratorToolsPanel;
