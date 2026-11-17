// Preloaded into `bddgen` by generate-step-stubs.cjs (node -r). Do not run directly.
//
// bddgen's own report of missing steps is meant for people: it prints at most 10 snippets and
// then exits, so a desktop config with missing steps also stops the mobile config from being
// checked. This preload replaces that one method so that every missing step, from every BDD
// config, is appended as a JSON line to the file in BDD_MISSING_STEPS_OUT, and generation
// carries on. Worker threads inherit `-r`, so the mobile config is captured too.
//
// It reaches into playwright-bdd internals (dist/generate, dist/snippets), so package.json pins
// playwright-bdd to an exact version. After upgrading it, run
// `node build/ci/bdd-stubs/generate-step-stubs.cjs --check` against a branch with a new step.
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.env.BDD_MISSING_STEPS_OUT;
if (!OUT) throw new Error('capture-missing-steps.cjs: BDD_MISSING_STEPS_OUT is not set');

const bddRoot = path.dirname(require.resolve('playwright-bdd/package.json'));
const { TestFilesGenerator } = require(path.join(bddRoot, 'dist/generate/index.js'));
const { Snippet } = require(path.join(bddRoot, 'dist/snippets/snippet.js'));

if (typeof TestFilesGenerator?.prototype?.checkMissingSteps !== 'function' || typeof Snippet !== 'function') {
  throw new Error(
    'capture-missing-steps.cjs: playwright-bdd internals changed (TestFilesGenerator.checkMissingSteps ' +
      'or Snippet not found). Update this preload for the installed playwright-bdd version.'
  );
}

TestFilesGenerator.prototype.checkMissingSteps = function captureMissingSteps() {
  const lines = [];
  for (const file of this.files) {
    for (const step of file.getMissingSteps()) {
      const snippet = new Snippet(step, { isPlaywrightStyle: true, isTypeScript: true, isDecorator: false });
      const expr = snippet.generatedExpression;
      const arg = step.pickleStep.argument;
      lines.push(
        JSON.stringify({
          keyword: snippet.getStepType(), // Given | When | Then
          text: step.pickleStep.text,
          gherkinKeyword: step.gherkinStep.keyword.trim(),
          expression: expr.source,
          params: expr.parameterNames.map((n) => (n.startsWith('string') ? 'string' : 'number')),
          extraArg: arg ? (arg.dataTable ? 'dataTable' : 'docString') : null,
          location: String(step.location),
          featureUri: file.gherkinDocument?.uri ?? null,
        })
      );
    }
  }
  if (lines.length) fs.appendFileSync(OUT, lines.join('\n') + '\n');
};
