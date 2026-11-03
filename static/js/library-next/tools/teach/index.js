/**
 * Educator reader tools, registered under the ids in `PERSONAS.educator.readerTools`:
 * lessonBuilder (Add to lesson), discussionPrompts (Discussion questions), handout (Handout
 * snippet) and translations (Compare translations). Importing this module registers them.
 */
import { registerReaderTool } from '../../reader/tools/registry';
import AddToLessonTool from './AddToLessonTool';
import DiscussionTool from './DiscussionTool';
import HandoutTool from './HandoutTool';
import TranslationsTool from './TranslationsTool';
import './strings';
import './styles.css';

export const TEACH_TOOL_IDS = ['lessonBuilder', 'discussionPrompts', 'handout', 'translations'];

export function registerTeachTools() {
  registerReaderTool({ id: 'lessonBuilder', personas: ['educator'], icon: 'lesson', label: 'teach.add.label', component: AddToLessonTool });
  registerReaderTool({ id: 'discussionPrompts', personas: ['educator'], icon: 'question', label: 'teach.discussion.label', component: DiscussionTool });
  registerReaderTool({ id: 'handout', personas: ['educator'], icon: 'print', label: 'teach.handout.label', component: HandoutTool });
  registerReaderTool({ id: 'translations', personas: ['educator'], icon: 'versions', label: 'teach.translations.label', component: TranslationsTool });
}

registerTeachTools();
