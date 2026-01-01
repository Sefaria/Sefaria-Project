/**
 * ModTools Module - Main entry point
 *
 * This module contains all moderator tools for the Sefaria admin interface.
 * Access at /modtools (requires staff permissions).
 *
 * Components:
 * - BulkVersionEditor: Edit Version metadata across multiple indices
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
export { default as BulkVersionEditor } from './components/BulkVersionEditor';
export { default as BulkIndexEditor } from './components/BulkIndexEditor';
export { default as AutoLinkCommentaryTool } from './components/AutoLinkCommentaryTool';
export { default as NodeTitleEditor } from './components/NodeTitleEditor';

// Shared components
export * from './components/shared';

// Constants
export * from './constants/fieldMetadata';
