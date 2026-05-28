from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable


SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


StepFn = Callable[[], Any]


class ParitySmoke:
    def __init__(self, save_file: Path, temp_path: Path):
        os.environ["NIGHTREIGN_ELECTRON_WORK_DIR"] = str(temp_path)
        os.environ["NIGHTREIGN_ELECTRON_CONFIG_DIR"] = str(temp_path / "config")

        from electron_api.session import SaveEditorSession

        self.session_cls = SaveEditorSession
        self.save_file = save_file
        self.temp_path = temp_path
        self.session = SaveEditorSession()
        self.results: list[dict[str, Any]] = []
        self.selected_index = 0
        self.expected_stats: dict[str, int] | None = None
        self.created_preset_name = f"Parity{os.getpid() % 10000}"

    def step(self, name: str, fn: StepFn, *, optional: bool = False) -> Any:
        try:
            result = fn()
        except Exception as exc:
            if optional:
                self.results.append({
                    "name": name,
                    "status": "skipped",
                    "reason": str(exc),
                })
                return None
            self.results.append({
                "name": name,
                "status": "failed",
                "reason": str(exc),
            })
            raise

        self.results.append({
            "name": name,
            "status": "passed",
            "detail": result,
        })
        return result

    def run(self) -> dict[str, Any]:
        source_before = self._file_snapshot(self.save_file)

        opened = self.step("open save", self._open_save)
        self.step("restore last save", self._restore_last_save)
        self.step("switch character", self._switch_character)
        self.step("replace character from same save", self._replace_character_from_same_save)
        self.step("edit murks and sigs", self._edit_stats)
        self.step("add edit delete normal and deep relics", self._add_edit_delete_relics)
        self.step("relic edit search helpers", self._relic_edit_search_helpers)
        self.step("copy paste selected relic effects", self._copy_paste_relic_effects)
        self.step("relic batch utility operations", self._relic_batch_utility_operations)
        self.step("export import relic excel", self._export_import_relic_excel)
        self.step("replace vessel relic with current value", self._replace_vessel_relic_with_current_value, optional=True)
        self.step("manage vessel preset", self._manage_vessel_preset, optional=True)
        self.step("replace preset relic with current value", self._replace_preset_relic_with_current_value, optional=True)
        self.step("export preview apply loadout", self._export_preview_apply_loadout, optional=True)
        saved = self.step("save as and reopen", self._save_as_and_reopen)

        source_after = self._file_snapshot(self.save_file)
        if source_before != source_after:
            raise AssertionError("Source save changed during parity smoke")

        passed = sum(1 for result in self.results if result["status"] == "passed")
        skipped = sum(1 for result in self.results if result["status"] == "skipped")
        return {
            "input": str(self.save_file),
            "output": saved["output"] if isinstance(saved, dict) else None,
            "openedCharacter": opened["selectedName"],
            "stepsPassed": passed,
            "stepsSkipped": skipped,
            "sourceUnchanged": True,
            "steps": self.results,
        }

    def _open_save(self) -> dict[str, Any]:
        opened = self.session.open_save(str(self.save_file))
        if not opened.get("selectedCharacter"):
            raise RuntimeError("No selected character after open_save")
        if not opened.get("characters"):
            raise RuntimeError("No characters found")
        return {
            "characters": len(opened["characters"]),
            "selectedName": opened["selectedCharacter"]["name"],
            "selectedStats": opened["selectedCharacter"]["stats"],
            "relics": len(opened["selectedCharacter"]["relics"]),
            "vessels": len(opened["selectedCharacter"]["vessels"]),
            "presets": len(opened["selectedCharacter"]["presets"]),
        }

    def _restore_last_save(self) -> dict[str, Any]:
        restore_session = self.session_cls(work_dir=self.temp_path / "restore-unpacked")
        restored = restore_session.open_last_save()
        if not restored or not restored.get("selectedCharacter"):
            raise RuntimeError("open_last_save did not restore the previous save")
        return {
            "savePath": restored["savePath"],
            "selected": restored["selectedCharacter"]["name"],
        }

    def _switch_character(self) -> dict[str, Any]:
        if len(self.session.characters) > 1:
            self.selected_index = 1
        selected = self.session.load_character(self.selected_index)
        return {
            "index": selected["index"],
            "name": selected["name"],
        }

    def _replace_character_from_same_save(self) -> dict[str, Any]:
        imported = self.session.open_import_save(str(self.save_file))
        if not imported.get("characters"):
            raise RuntimeError("No import characters found")
        selected = self.session.replace_character(self.selected_index)
        return {
            "importCharacters": len(imported["characters"]),
            "selected": selected["name"],
        }

    def _edit_stats(self) -> dict[str, int]:
        stats = self.session.get_stats()
        murks = (stats["murks"] + 1) & 0xFFFFFFFF
        sigs = (stats["sigs"] + 1) & 0xFFFFFFFF
        self.session.update_stat("murks", murks)
        selected = self.session.update_stat("sigs", sigs)
        self.expected_stats = {
            "murks": murks,
            "sigs": sigs,
        }
        if selected["stats"]["murks"] != murks or selected["stats"]["sigs"] != sigs:
            raise AssertionError("Updated stats were not reflected in selected character")
        return self.expected_stats

    def _add_edit_delete_relics(self) -> dict[str, int]:
        before_count = len(self.session.inventory.relic_gas)
        added_normal = self.session.add_relic("normal", 1)
        normal_ga = int(added_normal["lastGaHandle"])
        normal_state = self.session.inventory.relics[normal_ga].state
        color_changed = self.session.change_relic_color(
            normal_ga,
            normal_state.real_item_id,
            list(normal_state.effects_and_curses),
            "Blue",
        )
        self.session.update_relic(normal_ga, normal_state.real_item_id, list(normal_state.effects_and_curses))
        self.session.delete_relic(normal_ga)

        added_deep = self.session.add_relic("deep", 1)
        deep_ga = int(added_deep["lastGaHandle"])
        deep_state = self.session.inventory.relics[deep_ga].state
        self.session.update_relic(deep_ga, deep_state.real_item_id, list(deep_state.effects_and_curses))
        self.session.delete_relic(deep_ga)

        after_count = len(self.session.inventory.relic_gas)
        if after_count != before_count:
            raise AssertionError(f"Relic add/delete count mismatch: before {before_count}, after {after_count}")
        return {
            "before": before_count,
            "after": after_count,
            "colorCandidate": color_changed["relicId"],
        }

    def _relic_edit_search_helpers(self) -> dict[str, int]:
        ga_handle = self._first_relic_handle()
        relic = self.session.inventory.relics[ga_handle].state
        effects = list(relic.effects_and_curses)
        prepared = self.session.prepare_relic_edit(relic.real_item_id, effects)
        relic_options = self.session.list_relic_edit_options(relic.real_item_id, True)
        effect_options = self.session.list_effect_edit_options(relic.real_item_id, 0, effects, True)
        if not relic_options:
            raise RuntimeError("No relic edit options returned")
        if not effect_options or effect_options[0]["id"] != 0xFFFFFFFF:
            raise RuntimeError("Effect edit options did not include empty option first")
        return {
            "preparedRelicId": prepared["relicId"],
            "relicOptions": len(relic_options),
            "effectOptions": len(effect_options),
        }

    def _copy_paste_relic_effects(self) -> dict[str, Any]:
        ga_handle = self._first_relic_handle()
        copied = self.session.copy_relic_effects([ga_handle])
        pasted = self.session.paste_relic_effects([ga_handle], copied["effectsText"])
        if pasted["failed"]:
            raise RuntimeError(pasted["message"])
        return {
            "copied": copied["count"],
            "message": pasted["message"],
        }

    def _relic_batch_utility_operations(self) -> dict[str, Any]:
        added = self.session.add_relic("normal", 1)
        ga_handle = int(added["lastGaHandle"])
        single = self.session.toggle_favorite_relic(ga_handle)
        batch_favorite = self.session.toggle_favorite_relics([ga_handle])
        reindexed = self.session.reindex_relics(0, [ga_handle])
        delete_illegal = self.session.delete_illegal_relics()
        mass_fix = self.session.mass_fix_relics()
        deleted = self.session.delete_relics([ga_handle])
        if deleted["deleted"] != 1:
            raise AssertionError("Batch delete did not remove the temporary relic")
        return {
            "singleFavorite": single["favorite"],
            "batchFavorite": batch_favorite["message"],
            "reindex": reindexed["message"],
            "deleteIllegal": delete_illegal["message"],
            "massFix": mass_fix["message"],
            "deleted": deleted["deleted"],
        }

    def _export_import_relic_excel(self) -> dict[str, Any]:
        output = self.temp_path / "relics.xlsx"
        exported = self.session.export_relics_excel(str(output))
        imported = self.session.import_relics_excel(str(output))
        if not output.is_file():
            raise RuntimeError("Relic Excel export was not created")
        return {
            "exported": exported["count"],
            "added": imported["added"],
            "existing": imported["existing"],
        }

    def _replace_vessel_relic_with_current_value(self) -> dict[str, Any]:
        group, row = self._first_vessel_slot()
        options = self.session.list_vessel_relic_options(group["heroType"], group["vesselId"], row["slot"] - 1)
        selected = self.session.replace_vessel_relic(
            group["heroType"],
            group["vesselId"],
            row["slot"] - 1,
            row["gaHandle"],
        )
        return {
            "options": len(options),
            "heroType": selected["vessels"][0]["heroType"] if selected.get("vessels") else group["heroType"],
        }

    def _manage_vessel_preset(self) -> dict[str, Any]:
        created: dict[str, Any] | None = None
        created_group: dict[str, Any] | None = None
        created_row: dict[str, Any] | None = None
        original_ga = 0

        state = self.session._current_character_state()
        for group in state["vessels"]:
            if not group.get("unlocked"):
                continue
            for row in group["rows"]:
                original_ga = int(row["gaHandle"])
                options = self.session.list_vessel_relic_options(
                    group["heroType"],
                    group["vesselId"],
                    row["slot"] - 1,
                )
                for option in options:
                    candidate_ga = int(option["gaHandle"])
                    if candidate_ga == original_ga or candidate_ga == 0:
                        continue
                    try:
                        self.session.replace_vessel_relic(
                            group["heroType"],
                            group["vesselId"],
                            row["slot"] - 1,
                            candidate_ga,
                        )
                        created = self.session.save_vessel_as_preset(
                            group["heroType"],
                            group["vesselId"],
                            self.created_preset_name,
                        )
                        created_group = group
                        created_row = row
                        break
                    except Exception:
                        self.session.replace_vessel_relic(
                            group["heroType"],
                            group["vesselId"],
                            row["slot"] - 1,
                            original_ga,
                        )
                if created is not None:
                    break
            if created is not None:
                break

        if created is None or created_group is None or created_row is None:
            raise RuntimeError("No vessel slot could produce a unique preset combination")

        try:
            created_preset = self._find_preset(created["presets"], self.created_preset_name)
            renamed_name = f"P{os.getpid() % 10000}Renamed"
            renamed = self.session.rename_preset(created_group["heroType"], created_preset["index"], renamed_name)
            renamed_preset = self._find_preset(renamed["presets"], renamed_name)
            self.session.equip_preset(created_group["heroType"], renamed_preset["index"])
            deleted = self.session.delete_preset(created_group["heroType"], renamed_preset["index"])
            if any(preset["name"] == renamed_name for preset in deleted["presets"]):
                raise AssertionError("Created preset still exists after delete")
        finally:
            self.session.replace_vessel_relic(
                created_group["heroType"],
                created_group["vesselId"],
                created_row["slot"] - 1,
                original_ga,
            )

        return {
            "createdIndex": created_preset["index"],
            "deleted": renamed_name,
        }

    def _replace_preset_relic_with_current_value(self) -> dict[str, Any]:
        presets = self.session.list_presets(1)
        if not presets:
            raise RuntimeError("No presets available")
        preset = presets[0]
        if not preset["rows"]:
            raise RuntimeError("Preset has no relic rows")
        row = preset["rows"][0]
        selected = self.session.replace_preset_relic(
            preset["heroType"],
            preset["index"],
            row["slot"] - 1,
            row["gaHandle"],
        )
        return {
            "preset": preset["name"],
            "returnedPresets": len(selected["presets"]),
        }

    def _export_preview_apply_loadout(self) -> dict[str, Any]:
        output = self.temp_path / "loadout.json"
        exported = self.session.export_loadout(1, str(output))
        preview = self.session.preview_import_loadout(str(output))
        canceled = self.session.cancel_import_loadout()
        preview_again = self.session.preview_import_loadout(str(output))
        applied = self.session.apply_import_loadout([], [])
        if not output.is_file():
            raise RuntimeError("Loadout export was not created")
        return {
            "path": exported["path"],
            "previewVessels": len(preview["vessels"]),
            "cancelRestored": canceled["restored"],
            "applyMessages": len(applied["messages"]),
            "secondPreviewPresets": len(preview_again["presets"]),
        }

    def _save_as_and_reopen(self) -> dict[str, Any]:
        if self.expected_stats is None:
            raise RuntimeError("Expected stats not set")

        output = self.temp_path / f"parity{self.save_file.suffix or '.sl2'}"
        metadata = self.session.get_save_metadata()
        target = self.session.get_save_target_info(str(output))
        saved = self.session.save_as(str(output))
        reopened_session = self.session_cls(work_dir=self.temp_path / "reopened-unpacked")
        reopened = reopened_session.open_save(str(output), preferred_character_index=self.selected_index)
        selected = reopened.get("selectedCharacter")
        if not isinstance(selected, dict):
            raise RuntimeError("Saved output did not reopen")
        stats = selected["stats"]
        if stats["murks"] != self.expected_stats["murks"] or stats["sigs"] != self.expected_stats["sigs"]:
            raise AssertionError("Saved output did not preserve edited stats")
        return {
            "output": str(output),
            "mode": saved["mode"],
            "metadataMode": metadata["mode"],
            "steamIdMismatch": target["steamIdMismatch"],
            "reopened": selected["name"],
        }

    def _first_relic_handle(self) -> int:
        if not self.session.inventory.relic_gas:
            raise RuntimeError("No relics available")
        return int(self.session.inventory.relic_gas[0])

    def _first_vessel_slot(self) -> tuple[dict[str, Any], dict[str, Any]]:
        state = self.session._current_character_state()
        for group in state["vessels"]:
            if not group.get("unlocked"):
                continue
            for row in group["rows"]:
                return group, row
        raise RuntimeError("No unlocked vessel slots available")

    @staticmethod
    def _find_preset(presets: list[dict[str, Any]], name: str) -> dict[str, Any]:
        for preset in presets:
            if preset["name"] == name:
                return preset
        raise RuntimeError(f"Preset not found: {name}")

    @staticmethod
    def _file_snapshot(path: Path) -> tuple[int, int]:
        stat = path.stat()
        return stat.st_size, stat.st_mtime_ns


def run_parity_smoke(save_file: Path) -> dict[str, Any]:
    if not save_file.is_file():
        raise FileNotFoundError(f"Save file not found: {save_file}")

    with tempfile.TemporaryDirectory(prefix="nightreign-electron-parity-") as temp_dir:
        smoke = ParitySmoke(save_file, Path(temp_dir))
        return smoke.run()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Non-destructive Electron Python parity smoke for a local save file."
    )
    parser.add_argument("save_file", type=Path)
    args = parser.parse_args()

    result = run_parity_smoke(args.save_file)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
