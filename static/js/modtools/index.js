/**
 * ModTools Module - Main entry point
 *
 * This module contains all moderator tools for the Sefaria admin interface.
 * Access at /modtools (requires staff permissions).
 *
 * Components:
 * - BulkDownloadText: Download text versions in bulk by pattern matching
 * - BulkUploadCSV: Upload text content from CSV files
 * - WorkflowyModeratorTool: Upload Workflowy OPML exports
 * - UploadLinksFromCSV: Create links between refs from CSV
 * - DownloadLinks: Download links as CSV
 * - RemoveLinksFromCsv: Delete links from CSV
 * - BulkVersionEditor: Edit Version metadata across multiple indices
 *
 * NOTE: The following components are temporarily disabled (open tickets to reintroduce):
 * - BulkIndexEditor: Edit Index metadata across multiple indices
 * - AutoLinkCommentaryTool: Create links between commentaries and base texts
 * - NodeTitleEditor: Edit node titles within an Index schema
 *
 * For AI agents:
 * - See /docs/modtools/AI_AGENT_GUIDE.md for detailed documentation
 * - Constants in ./constants/fieldMetadata.js define editable fields
 * - Shared components in ./components/shared/ provide consistent UI
 */

// Main container (legacy, still in parent directory)
export { default as ModeratorToolsPanel } from '../ModeratorToolsPanel';

// Individual components
export { default as BulkDownloadText } from './components/BulkDownloadText';
export { default as BulkUploadCSV } from './components/BulkUploadCSV';
export { default as WorkflowyModeratorTool } from './components/WorkflowyModeratorTool';
export { default as UploadLinksFromCSV } from './components/UploadLinksFromCSV';
export { default as DownloadLinks } from './components/DownloadLinks';
export { default as RemoveLinksFromCsv } from './components/RemoveLinksFromCsv';
export { default as BulkVersionEditor } from './components/BulkVersionEditor';

// TODO: The following exports are temporarily disabled - open tickets to reintroduce:
// export { default as BulkIndexEditor } from './components/BulkIndexEditor';
// export { default as AutoLinkCommentaryTool } from './components/AutoLinkCommentaryTool';
// export { default as NodeTitleEditor } from './components/NodeTitleEditor';

// Shared components
export * from './components/shared';

// Constants
export * from './constants/fieldMetadata';

// Utils
export * from './utils';
