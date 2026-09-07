#!/usr/bin/env python3
"""
Extract JUST the triage bucket from a reconcile_deploy_ready.py report,
plus the minimal safe context an explainer needs, into a separate,
structurally isolated document.

Today reconcile_deploy_ready.py's triage bucket is reported as
`reason=no_qualifying_pr` (or `non_standard_workflow_or_state`) plus raw
diagnostic fields, which leaves a human to open every story and work out
each one individually. An OPT-IN workflow step
(.github/workflows/prod-release-notes.yaml) runs a headless `claude -p`
over exactly the document this script produces to propose a short
hypothesis and a suggested next action per triage story -- but the LLM
call itself lives entirely in that workflow step, never here. This script
is a plain, deterministic JSON transform: no API client, no `claude`
invocation, no network. Keeping reconcile_deploy_ready.py (and this
sibling script) stdlib-only and LLM-free, with the model's role confined
to writing English from a document it's handed, is the same design
principle the rest of this pipeline already follows (see
reconcile_deploy_ready.py's and shipped_stories.py's own docstrings).

Why a SEPARATE document rather than just telling the model "only look at
the triage section" of the full report: the full report's `shipped` and
`pending` buckets, and reconcile_deploy_ready.py's own JSON write-back
comment content, must never be visible to, scored by, or able to
influence this explainer -- and a prompt instruction is not a security
boundary against a prompt-injection path. A triage story's `description`
and `comments` fields are CONTRIBUTOR-CONTROLLED TEXT (see the workflow
step's own comment for why that scopes its allowed tools). Rather than
trust the model to honor "ignore the other buckets" against adversarial
input embedded in the very document it's reading, this script simply never
puts shipped/pending data into the file the explainer is given at all --
there is nothing there to leak or be steered by, structurally, not merely
by convention.

This script also owns the opt-in DECISION (resolve_enabled /
`resolve-enabled` subcommand) for the same single-source-of-truth reason:
without it, "is the explainer enabled" would be a small bash string
comparison duplicated (and possibly drifted) inline in the workflow YAML,
untested by anything. Putting it here means the workflow's `run:` block
just calls this script and the actual rule lives in one tested place.

Usage:
    python3 triage_explainer.py extract --report reconcile-deploy-ready-report.json --out triage-only.json
    python3 triage_explainer.py resolve-enabled --event-name workflow_dispatch --explain-triage-input true --enable-var ""

All story ids in this file's docstring and comments (e.g. 11111) are
placeholders, not real Shortcut story ids.
"""

import argparse
import json
import sys

# Keys from a reconcile_deploy_ready.py report that this script MUST NEVER
# copy into its output, even if a future edit to that report adds new
# top-level keys carelessly. Listed explicitly (rather than an
# allow-only-"triage" approach implemented by construction below) as a
# second, redundant line of defense -- see extract_triage_only.
EXCLUDED_REPORT_KEYS = frozenset({
    "shipped", "pending", "applied", "comment_posted", "comment_failed",
})


def die(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def extract_triage_only(report):
    """Build the explainer's ENTIRE input: the triage list verbatim, as
    reconcile_deploy_ready.py already enriched each entry (description,
    comments, linked_prs with per-PR guard diagnostics -- see
    reconcile_deploy_ready.classify_stories / _triage_context /
    _diagnose_linked_pr), plus `prod_tag` (so an explanation can say "as of
    <tag>" without guessing) and a `triage_count` the caller can check
    cheaply to skip the whole explainer step when there's nothing to
    explain. This is constructed as an explicit allow-list (only these
    three keys are ever read from `report` and copied out) rather than
    "copy everything except EXCLUDED_REPORT_KEYS" -- an allow-list can't
    accidentally leak a new field a future report format adds; a
    deny-list could."""
    triage = report.get("triage") or []
    result = {
        "prod_tag": report.get("prod_tag"),
        "triage_count": len(triage),
        "triage": triage,
    }
    # Defensive, should be unreachable given the allow-list above -- kept
    # as a loud assertion rather than silently trusting the allow-list
    # forever stays correct.
    leaked = EXCLUDED_REPORT_KEYS & result.keys()
    if leaked:
        die(f"internal error: triage-only extraction would have leaked {sorted(leaked)} -- refusing to write it")
    return result


def resolve_enabled(event_name, explain_triage_input, enable_var):
    """Whether the opt-in triage explainer should run this trigger. Pure
    decision logic, no I/O -- both inputs default to disabled on any falsy
    or unrecognized value, never enabled by omission or by an unexpected
    string:

    - A `workflow_dispatch` run opts in per-run via its own
      `explain_triage` boolean input.
    - The `repository_dispatch` trigger (the real automatic
      post-promotion path -- see the workflow header) carries no such
      input at all, so it instead opts in via a repo-level Actions
      variable (`vars.ENABLE_TRIAGE_EXPLAINER`), which a human sets
      independently of any single run.

    Only an exact case-insensitive "true" enables anything; every other
    value (empty, "false", "1", a typo, ...) is treated as disabled. This
    means the feature ships fully OFF by default on every trigger path
    until a human explicitly flips one of the two switches."""
    value = explain_triage_input if event_name == "workflow_dispatch" else enable_var
    return str(value).strip().lower() == "true"


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Extract the triage bucket from a reconcile_deploy_ready.py report, or "
                     "resolve whether the opt-in triage explainer should run -- for the "
                     "opt-in triage-explainer workflow step.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract_parser = subparsers.add_parser(
        "extract", help="Write the triage-only document for a reconcile report to --out.",
    )
    extract_parser.add_argument("--report", required=True, help="Path to a reconcile_deploy_ready.py --out report JSON")
    extract_parser.add_argument("--out", required=True, help="Output path for the triage-only document")

    enabled_parser = subparsers.add_parser(
        "resolve-enabled",
        help="Print 'true' or 'false' to stdout: should the explainer run for this trigger?",
    )
    enabled_parser.add_argument("--event-name", required=True, help="github.event_name, e.g. workflow_dispatch")
    enabled_parser.add_argument("--explain-triage-input", default="", help="inputs.explain_triage (workflow_dispatch only)")
    enabled_parser.add_argument("--enable-var", default="", help="vars.ENABLE_TRIAGE_EXPLAINER")

    return parser


def main():
    args = build_arg_parser().parse_args()

    if args.command == "resolve-enabled":
        print("true" if resolve_enabled(args.event_name, args.explain_triage_input, args.enable_var) else "false")
        return

    # command == "extract"
    try:
        with open(args.report, encoding="utf-8") as f:
            report = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        die(f"Could not read/parse --report {args.report!r}: {e}")

    triage_only = extract_triage_only(report)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(triage_only, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
