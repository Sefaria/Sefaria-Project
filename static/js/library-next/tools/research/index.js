/**
 * Scholar reader tools, registered under the ids in `PERSONAS.scholar.readerTools`: versions
 * (Versions compare), manuscripts, lexicon, cite (Copy / cite, replacing the built-in with a
 * scholar-aware one that keeps the built-in body for other personas) and linkGraph
 * (Cross-references). Importing this module registers them.
 */
import React from 'react';
import { registerReaderTool } from '../../reader/tools/registry';
import VersionsTool from './VersionsTool';
import ManuscriptsTool from './ManuscriptsTool';
import LexiconTool from './LexiconTool';
import CiteTool from './CiteTool';
import LinkGraphTool from './LinkGraphTool';
import './strings';
import './styles.css';

export const RESEARCH_TOOL_IDS = ['versions', 'manuscripts', 'lexicon', 'cite', 'linkGraph'];

const graphIcon = (
  <svg className="ln-tool-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="18" r="2" />
    <path d="M10.2 10.6L6.5 7.4M13.8 10.6l3.7-3.2M10.2 13.4l-3.7 3.2M13.8 13.4l3.7 3.2" />
  </svg>
);

export function registerResearchTools() {
  registerReaderTool({ id: 'versions', personas: ['scholar'], icon: 'versions', label: 'research.versions.label', component: VersionsTool });
  registerReaderTool({ id: 'manuscripts', personas: ['scholar'], icon: 'manuscript', label: 'research.manuscripts.label', component: ManuscriptsTool });
  registerReaderTool({ id: 'lexicon', personas: ['scholar'], icon: 'lexicon', label: 'research.lexicon.label', component: LexiconTool });
  registerReaderTool({ id: 'cite', personas: 'all', icon: 'cite', label: 'tool.cite.label', component: CiteTool });
  registerReaderTool({ id: 'linkGraph', personas: ['scholar'], icon: graphIcon, label: 'research.graph.label', component: LinkGraphTool });
}

registerResearchTools();
