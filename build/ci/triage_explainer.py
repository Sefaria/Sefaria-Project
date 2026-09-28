#!/usr/bin/env python3
"""
Extracts the triage bucket from a reconcile_deploy_ready.py report into a
separate, isolated document, and resolves whether the opt-in triage
explainer should run.

Usage:
    python3 triage_explainer.py extract --report reconcile-deploy-ready-report.json --out triage-only.json
    python3 triage_explainer.py resolve-enabled --event-name workflow_dispatch --explain-triage-input true --enable-var ""
"""

import argparse
import json
import sys

# Must never appear in the explainer's output.
EXCLUDED_REPORT_KEYS = frozenset({"shipped", "pending", "applied"})


def die(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def extract_triage_only(report):
    """Build the explainer's entire input via an explicit allow-list: triage list, prod_tag, and triage_count."""
    triage = report.get("triage") or []
    result = {
        "prod_tag": report.get("prod_tag"),
        "triage_count": len(triage),
        "triage": triage,
    }
    # Defensive: should be unreachable given the allow-list above.
    leaked = EXCLUDED_REPORT_KEYS & result.keys()
    if leaked:
        die(f"internal error: triage-only extraction would have leaked {sorted(leaked)} -- refusing to write it")
    return result


def resolve_enabled(event_name, explain_triage_input, enable_var):
    """Whether the opt-in triage explainer should run: workflow_dispatch opts in via its own input, other triggers via the ENABLE_TRIAGE_EXPLAINER repo variable."""
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
