"""
Prompt Loading Utilities
========================

Functions for loading prompt templates from the prompts directory.
"""

import hashlib
import shutil
from pathlib import Path


PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name: str) -> str:
    """Load a prompt template from the prompts directory."""
    prompt_path = PROMPTS_DIR / f"{name}.md"
    return prompt_path.read_text()


def get_initializer_prompt() -> str:
    """Load the initializer prompt."""
    return load_prompt("initializer_prompt")


def get_coding_prompt() -> str:
    """Load the coding agent prompt."""
    return load_prompt("coding_prompt")


def get_spec_sync_prompt() -> str:
    """Load the spec sync prompt."""
    return load_prompt("spec_sync_prompt")


def get_spec_checksum() -> str:
    """Return the SHA-256 checksum of the canonical app_spec.txt in prompts/."""
    spec_path = PROMPTS_DIR / "app_spec.txt"
    return hashlib.sha256(spec_path.read_bytes()).hexdigest()


def copy_spec_to_project(project_dir: Path) -> None:
    """Copy the app spec file into the project directory for the agent to read.

    Always overwrites so the project copy stays in sync with prompts/app_spec.txt.
    """
    spec_source = PROMPTS_DIR / "app_spec.txt"
    spec_dest = project_dir / "app_spec.txt"
    shutil.copy(spec_source, spec_dest)
    print("Synced app_spec.txt to project directory")
