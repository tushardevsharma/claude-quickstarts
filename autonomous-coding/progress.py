"""
Progress Tracking Utilities
===========================

Functions for tracking and displaying progress of the autonomous coding agent.
"""

import json
from collections import defaultdict
from pathlib import Path


# Width of progress bars in characters
BAR_WIDTH = 40
CATEGORY_BAR_WIDTH = 20


def check_spec_changed(project_dir: Path, current_checksum: str) -> bool:
    """Return True if app_spec.txt has changed since feature_list.json was last synced.

    Reads the stored checksum from feature_list.json's top-level "spec_checksum"
    field and compares it to current_checksum.  Returns True (spec changed) when:
    - feature_list.json does not exist yet
    - the "spec_checksum" field is missing
    - the stored checksum differs from current_checksum
    """
    tests_file = project_dir / "feature_list.json"
    if not tests_file.exists():
        return True
    try:
        data = json.loads(tests_file.read_text())
        if isinstance(data, list):
            # Old bare-list format — no checksum stored, treat as changed
            return True
        stored = data.get("spec_checksum", "")
        return stored != current_checksum
    except (json.JSONDecodeError, IOError):
        return True


def _load_features(project_dir: Path) -> list[dict]:
    """Load the features list from feature_list.json. Returns [] on any error."""
    tests_file = project_dir / "feature_list.json"
    if not tests_file.exists():
        return []
    try:
        data = json.loads(tests_file.read_text())
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("features", [])
    except (json.JSONDecodeError, IOError):
        pass
    return []


def count_passing_tests(project_dir: Path) -> tuple[int, int]:
    """
    Count passing and total tests in feature_list.json.

    Returns:
        (passing_count, total_count)
    """
    features = _load_features(project_dir)
    total = len(features)
    passing = sum(1 for f in features if isinstance(f, dict) and f.get("passes", False))
    return passing, total


def _render_bar(passing: int, total: int, width: int = BAR_WIDTH) -> str:
    """Render a filled/empty progress bar string."""
    if total == 0:
        return "[" + "-" * width + "]"
    filled = round(passing / total * width)
    return "[" + "\u2588" * filled + "\u2591" * (width - filled) + "]"


def _load_snapshot(project_dir: Path) -> set[int]:
    """Load the set of passing feature IDs recorded at the start of the last session."""
    snapshot_file = project_dir / ".progress_snapshot.json"
    try:
        return set(json.loads(snapshot_file.read_text()))
    except (FileNotFoundError, json.JSONDecodeError, IOError):
        return set()


def save_snapshot(project_dir: Path) -> None:
    """Save the current passing feature IDs so we can detect new wins next session."""
    features = _load_features(project_dir)
    passing_ids = [f["id"] for f in features if isinstance(f, dict) and f.get("passes") and "id" in f]
    snapshot_file = project_dir / ".progress_snapshot.json"
    try:
        snapshot_file.write_text(json.dumps(passing_ids))
    except IOError:
        pass


def print_session_header(session_num: int, is_initializer: bool) -> None:
    """Print a formatted header for the session."""
    session_type = "INITIALIZER" if is_initializer else "CODING AGENT"

    print("\n" + "=" * 70)
    print(f"  SESSION {session_num}: {session_type}")
    print("=" * 70)
    print()


def print_progress_summary(project_dir: Path) -> None:
    """Print a visual progress summary with overall bar, category breakdown, and next steps."""
    features = _load_features(project_dir)

    if not features:
        print("\nProgress: feature_list.json not yet created")
        return

    total = len(features)
    passing = sum(1 for f in features if isinstance(f, dict) and f.get("passes", False))
    pct = passing / total * 100

    print()
    print("  PROGRESS")
    print("  " + "-" * 50)

    # Overall bar
    bar = _render_bar(passing, total, BAR_WIDTH)
    print(f"  Overall  {bar}  {passing}/{total}  ({pct:.1f}%)")
    print()

    # Category breakdown
    category_stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # [passing, total]
    for f in features:
        if not isinstance(f, dict):
            continue
        cat = f.get("category", "Uncategorized")
        category_stats[cat][1] += 1
        if f.get("passes"):
            category_stats[cat][0] += 1

    print("  By category:")
    for cat, (cat_pass, cat_total) in sorted(category_stats.items(), key=lambda x: x[0]):
        bar = _render_bar(cat_pass, cat_total, CATEGORY_BAR_WIDTH)
        status = "DONE" if cat_pass == cat_total else f"{cat_pass}/{cat_total}"
        print(f"  {cat:<32} {bar}  {status}")

    # Recent wins (features that were failing last session and now pass)
    prev_passing = _load_snapshot(project_dir)
    if prev_passing:
        new_wins = [
            f for f in features
            if isinstance(f, dict)
            and f.get("passes")
            and "id" in f
            and f["id"] not in prev_passing
        ]
        if new_wins:
            print()
            print(f"  New this session ({len(new_wins)}):")
            for f in new_wins:
                print(f"    + [{f['id']:>3}] {f.get('name', '?')}")

    # Next up: first few failing features
    failing = [f for f in features if isinstance(f, dict) and not f.get("passes")]
    if failing:
        print()
        print(f"  Next up ({len(failing)} remaining):")
        for f in failing[:5]:
            print(f"    - [{f.get('id', '?'):>3}] {f.get('category', '?')}: {f.get('name', '?')}")
        if len(failing) > 5:
            print(f"    ... and {len(failing) - 5} more")

    print()
