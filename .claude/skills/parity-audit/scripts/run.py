#!/usr/bin/env python3
"""Build a fresh shared auditor and collect detailed parity without user profiles."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="new evidence directory; existing paths are refused")
    parser.add_argument("--shared-source", type=Path, help="an isolated cli-messaging worktree for testing auditor changes")
    parser.add_argument("--skip-checks", action="store_true", help="capture only; tests stay explicitly not-run")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    reports = repo / "docs_ai/plans/parity"
    output = (args.output or ((reports if reports.is_dir() else Path(tempfile.gettempdir())) / f"audit-{stamp}")).resolve()
    if output.exists():
        parser.error(f"output already exists: {output}")
    scratch = Path(tempfile.mkdtemp(prefix="parity-skill-"))
    home = scratch / "home"
    home.mkdir()
    env = {
        "PATH": os.environ.get("PATH", ""), "HOME": str(home), "TMPDIR": str(scratch),
        "XDG_CONFIG_HOME": str(home / "config"), "XDG_STATE_HOME": str(home / "state"),
        "XDG_CACHE_HOME": str(home / "cache"), "XDG_DATA_HOME": str(home / "data"),
        "NO_COLOR": "1",
    }
    shared = args.shared_source.resolve() if args.shared_source else scratch / "shared"
    print(f"retained auditor workspace: {scratch}", file=sys.stderr, flush=True)
    try:
        if not args.shared_source:
            subprocess.run(["git", "clone", "--branch", "main", "--depth", "1", "https://github.com/WireCatLabs/cli-messaging.git", str(shared)], env=env, check=True)
        if not (shared / "scripts/parity/deep-audit.ts").is_file():
            raise RuntimeError("shared source lacks deep-audit tooling; update cli-messaging main before running this skill")
        subprocess.run(["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], cwd=shared, env=env, check=True)
        argv = ["pnpm", "-s", "parity:audit", "--fresh", "--deep", "--output", str(output)]
        if args.skip_checks:
            argv.append("--skip-checks")
        result = subprocess.run(argv, cwd=shared, env=env)
        print(f"report: {output / 'report.md'}", flush=True)
        return result.returncode
    except (subprocess.CalledProcessError, OSError, RuntimeError) as error:
        print(f"audit failed: {error}; artifacts retained at {scratch}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
