// Steps about the Library text reader. Plumbing only: the assertion lives in the
// SourceTextPage page object, so other specs and steps can reuse it.
import { Then } from '../fixtures';

Then('the reader shows the text of {string}', async ({ visitor }, ref: string) => {
  const pm = await visitor.pm();
  await pm.onSourceTextPage().expectSegmentHasText(ref);
});
