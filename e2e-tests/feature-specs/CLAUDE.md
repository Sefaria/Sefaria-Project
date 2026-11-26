# Feature specs: rules for agents

The `.feature` files in `features/` are **behavior specs written by product. They are a contract,
and they are locked.**

- **Never change a `.feature` file**, unless the user you're working with is a spec editor writing
  or amending a spec (the `write-feature-spec` skill). Only people listed in the `SPEC_EDITORS`
  repo variable may change them. The Feature Spec Lock CI check fails any PR where someone else
  did, and a Claude Code hook (`.claude/hooks/guard-feature-specs.sh`) blocks the edit locally.
- **Make the code satisfy the spec**, never the reverse. Engineers change the application code,
  the step definitions in `steps/`, page objects and fixtures. Those are not locked.
- **Don't work around the lock** with scripts, copies, renames, `@skip` or `@manual` tags, or by
  rewording a step's regex so it matches something the spec didn't mean.
- **If the spec seems wrong or impossible to meet, stop and say so.** Tell the user which scenario,
  what you think is wrong, and why. A spec editor decides and makes the change; see "Changing a
  spec" in [README.md](README.md).
- Steps follow the suite rules in [../CLAUDE.md](../CLAUDE.md) and the shared vocabulary in
  [STEP-VOCABULARY.md](STEP-VOCABULARY.md).

This file and the hook are locked too.
