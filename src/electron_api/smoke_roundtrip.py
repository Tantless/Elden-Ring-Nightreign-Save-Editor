from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Any

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from electron_api.session import SaveEditorSession  # noqa: E402


def run_roundtrip(save_file: Path, output_file: Path | None) -> dict[str, Any]:
    if not save_file.is_file():
        raise FileNotFoundError(f"Save file not found: {save_file}")

    with tempfile.TemporaryDirectory(prefix="nightreign-electron-smoke-") as temp_dir:
        temp_path = Path(temp_dir)
        first_session = SaveEditorSession(work_dir=temp_path / "unpacked")
        config_snapshot = dict(first_session.config.config)
        try:
            opened = first_session.open_save(str(save_file))
            if not opened.get("selectedCharacter"):
                raise RuntimeError("No character found in save file")

            before_stats = first_session.get_stats()
            expected_murks = (before_stats["murks"] + 1) & 0xFFFFFFFF
            first_session.update_stat("murks", expected_murks)

            target_output = output_file or temp_path / f"roundtrip{save_file.suffix or '.sl2'}"
            first_session.save_as(str(target_output))

            second_session = SaveEditorSession(work_dir=temp_path / "reopened")
            reopened = second_session.open_save(str(target_output))
            selected = reopened.get("selectedCharacter")
            if not isinstance(selected, dict):
                raise RuntimeError("Saved file did not reopen with a selected character")
            reopened_stats = selected["stats"]
            if reopened_stats["murks"] != expected_murks:
                raise AssertionError(
                    f"Murks round-trip mismatch: expected {expected_murks}, got {reopened_stats['murks']}"
                )

            return {
                "input": str(save_file),
                "output": str(target_output),
                "character": selected["name"],
                "beforeMurks": before_stats["murks"],
                "afterMurks": reopened_stats["murks"],
            }
        finally:
            first_session.config.config.clear()
            first_session.config.config.update(config_snapshot)
            first_session.config.save()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Smoke-test Electron Python session round-trip with a local save file."
    )
    parser.add_argument("save_file", type=Path)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    result = run_roundtrip(args.save_file, args.output)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
