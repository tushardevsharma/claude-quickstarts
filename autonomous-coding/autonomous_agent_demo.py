#!/usr/bin/env python3
"""
Autonomous Coding Agent Demo
============================

A minimal harness demonstrating long-running autonomous coding with Claude.
This script implements the two-agent pattern (initializer + coding agent) and
incorporates all the strategies from the long-running agents guide.

Example Usage:
    python autonomous_agent_demo.py --project-dir ./claude_clone_demo
    python autonomous_agent_demo.py --project-dir ./claude_clone_demo --max-iterations 5
"""

import argparse
import asyncio
import json
import os
from pathlib import Path

from agent import run_autonomous_agent


# Configuration
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"
# Default Bedrock model (cross-region inference profile; adjust for your region if needed)
DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6"


def load_claude_settings_env() -> None:
    """Load env vars from ~/.claude/settings.json (same as the Node server does).

    Only sets vars that aren't already in the environment, so explicit
    exports still take precedence.
    """
    settings_path = Path.home() / ".claude" / "settings.json"
    try:
        settings = json.loads(settings_path.read_text())
        env_vars = settings.get("env", {})
        loaded = []
        for key, value in env_vars.items():
            if key not in os.environ:
                os.environ[key] = str(value)
                loaded.append(key)
        if loaded:
            print(f"[Config] Loaded {len(loaded)} env vars from {settings_path}")
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Autonomous Coding Agent Demo - Long-running agent harness",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start fresh project
  python autonomous_agent_demo.py --project-dir ./claude_clone

  # Use AWS Bedrock
  python autonomous_agent_demo.py --project-dir ./claude_clone --bedrock

  # Use a specific model (or Bedrock model ID when using --bedrock)
  python autonomous_agent_demo.py --project-dir ./claude_clone --model claude-sonnet-4-5-20250929
  python autonomous_agent_demo.py --project-dir ./claude_clone --bedrock --model us.anthropic.claude-sonnet-4-6

  # Limit iterations for testing
  python autonomous_agent_demo.py --project-dir ./claude_clone --max-iterations 5

  # Continue existing project
  python autonomous_agent_demo.py --project-dir ./claude_clone

Environment Variables (Anthropic API):
  ANTHROPIC_API_KEY    Your Anthropic API key (required when not using --bedrock)

Environment Variables (AWS Bedrock, when using --bedrock):
  AWS_REGION          AWS region for Bedrock (e.g. us-east-1). Defaults to us-east-1.
  AWS_ACCESS_KEY_ID   Optional; use AWS CLI/default credential chain if unset.
  AWS_SECRET_ACCESS_KEY
  AWS_PROFILE         Optional; for SSO or named profile.
  AWS_BEARER_TOKEN_BEDROCK  Optional; Bedrock API key (simpler than full AWS creds).
        """,
    )

    parser.add_argument(
        "--bedrock",
        action="store_true",
        help="Use AWS Bedrock instead of Anthropic API (requires AWS credentials or AWS_BEARER_TOKEN_BEDROCK)",
    )

    parser.add_argument(
        "--aws-region",
        type=str,
        default=None,
        help="AWS region for Bedrock (default: AWS_REGION env or us-east-1). Only used with --bedrock.",
    )

    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path("./autonomous_demo_project"),
        help="Directory for the project (default: generations/autonomous_demo_project). Relative paths automatically placed in generations/ directory.",
    )

    parser.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="Maximum number of agent iterations (default: unlimited)",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Claude model to use (default: {DEFAULT_MODEL})",
    )

    return parser.parse_args()


def main() -> None:
    """Main entry point."""
    load_claude_settings_env()

    args = parse_args()

    # Auto-detect --bedrock from ~/.claude/settings.json if not explicitly passed
    use_bedrock = args.bedrock or os.environ.get("CLAUDE_CODE_USE_BEDROCK") == "1"

    if use_bedrock:
        has_creds = (
            os.environ.get("AWS_ACCESS_KEY_ID")
            or os.environ.get("AWS_PROFILE")
            or os.environ.get("AWS_BEARER_TOKEN_BEDROCK")
        )
        if not has_creds:
            print("Error: When using --bedrock, set AWS credentials or Bedrock API key.")
            print("\nOptions:")
            print("  1. AWS CLI: aws configure  (or set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)")
            print("  2. Profile: export AWS_PROFILE=your-profile  (e.g. after aws sso login)")
            print("  3. Bedrock API key: export AWS_BEARER_TOKEN_BEDROCK=your-bedrock-api-key")
            print("\nOptionally set region: export AWS_REGION=us-east-1")
            return
        model = args.model if args.model != DEFAULT_MODEL else DEFAULT_BEDROCK_MODEL
    else:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("Error: ANTHROPIC_API_KEY environment variable not set")
            print("\nGet your API key from: https://console.anthropic.com/")
            print("\nThen set it:")
            print("  export ANTHROPIC_API_KEY='your-api-key-here'")
            print("\nOr use AWS Bedrock: python autonomous_agent_demo.py --bedrock --project-dir ./my_project")
            return
        model = args.model

    # Automatically place projects in generations/ directory unless already specified
    project_dir = args.project_dir
    if not str(project_dir).startswith("generations/"):
        # Convert relative paths to be under generations/
        if project_dir.is_absolute():
            # If absolute path, use as-is
            pass
        else:
            # Prepend generations/ to relative paths
            project_dir = Path("generations") / project_dir

    # Run the agent
    try:
        asyncio.run(
            run_autonomous_agent(
                project_dir=project_dir,
                model=model,
                max_iterations=args.max_iterations,
                use_bedrock=use_bedrock,
                aws_region=args.aws_region,
            )
        )
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        print("To resume, run the same command again")
    except Exception as e:
        print(f"\nFatal error: {e}")
        raise


if __name__ == "__main__":
    main()
