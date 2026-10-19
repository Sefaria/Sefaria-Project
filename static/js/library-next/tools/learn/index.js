/**
 * Newcomer and learner reader tools. Importing this module registers them with the reader's
 * tool registry (ids match PERSONAS[*].readerTools in persona.js) and mounts the highlight
 * decorator. `registerLearnTools()` re-registers after a registry reset (tests).
 *
 *   newcomer: explain, whosWho, readAloud
 *   learner:  highlight, note, flashcard, markRead, vocab
 */
import { registerReaderTool } from '../../reader/tools/registry';
import ExplainTool from './ExplainTool';
import WhosWhoTool, { personIcon } from './WhosWhoTool';
import ReadAloudTool, { speakerIcon } from './ReadAloudTool';
import HighlightTool from './HighlightTool';
import NoteTool from './NoteTool';
import FlashcardTool from './FlashcardTool';
import MarkReadTool from './MarkReadTool';
import VocabTool from './VocabTool';
import { mountHighlightDecorator } from './highlights';
import './strings';
import './styles.css';

export { useHighlights, highlightMap, applyHighlights } from './highlights';

export const LEARN_TOOL_IDS = ['explain', 'whosWho', 'readAloud', 'highlight', 'note', 'flashcard', 'markRead', 'vocab'];

export function registerLearnTools() {
  registerReaderTool({ id: 'explain', personas: ['newcomer'], icon: 'info', label: 'learn.explain.label', component: ExplainTool });
  registerReaderTool({ id: 'whosWho', personas: ['newcomer'], icon: personIcon, label: 'learn.whosWho.label', component: WhosWhoTool });
  registerReaderTool({ id: 'readAloud', personas: ['newcomer'], icon: speakerIcon, label: 'learn.readAloud.label', component: ReadAloudTool });
  registerReaderTool({ id: 'highlight', personas: ['learner'], icon: 'highlight', label: 'learn.highlight.label', component: HighlightTool });
  registerReaderTool({ id: 'note', personas: ['learner'], icon: 'note', label: 'learn.note.label', component: NoteTool });
  registerReaderTool({ id: 'flashcard', personas: ['learner'], icon: 'flashcard', label: 'learn.flashcard.label', component: FlashcardTool });
  registerReaderTool({ id: 'markRead', personas: ['learner'], icon: 'check', label: 'learn.markRead.label', component: MarkReadTool });
  registerReaderTool({ id: 'vocab', personas: ['learner'], icon: 'lexicon', label: 'learn.vocab.label', component: VocabTool });
}

registerLearnTools();
mountHighlightDecorator();
