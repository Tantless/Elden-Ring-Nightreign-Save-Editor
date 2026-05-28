from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import Any

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

try:
    from electron_api.session import SaveEditorSession  # type: ignore[import-not-found]  # noqa: E402
except ImportError:
    try:
        from .session import SaveEditorSession  # type: ignore[import-not-found]  # noqa: E402
    except ImportError:
        from session import SaveEditorSession  # type: ignore[no-redef]  # noqa: E402


session = SaveEditorSession()


def handle(method: str, params: dict[str, Any]) -> Any:
    match method:
        case "ping":
            return session.ping()
        case "get_settings":
            return session.get_settings()
        case "update_settings":
            return session.update_settings(params)
        case "open_save":
            return session.open_save(str(params["filePath"]))
        case "open_last_save":
            return session.open_last_save()
        case "load_character":
            return session.load_character(int(params["index"]))
        case "open_import_save":
            return session.open_import_save(str(params["filePath"]))
        case "replace_character":
            return session.replace_character(int(params["importIndex"]))
        case "get_stats":
            return session.get_stats()
        case "update_stat":
            return session.update_stat(str(params["field"]), int(params["value"]))
        case "save_current_character":
            return session.save_current_character()
        case "get_save_metadata":
            return session.get_save_metadata()
        case "get_save_target_info":
            return session.get_save_target_info(str(params["outputFile"]))
        case "save_as":
            return session.save_as(
                str(params["outputFile"]),
                bool(params.get("resignSteamId", False)),
            )
        case "add_relic":
            return session.add_relic(
                str(params.get("relicType", "normal")),
                int(params.get("count", 1)),
            )
        case "delete_relic":
            return session.delete_relic(int(params["gaHandle"]))
        case "delete_relics":
            return session.delete_relics([int(ga) for ga in params.get("gaHandles", [])])
        case "toggle_favorite_relic":
            return session.toggle_favorite_relic(int(params["gaHandle"]))
        case "toggle_favorite_relics":
            return session.toggle_favorite_relics([int(ga) for ga in params.get("gaHandles", [])])
        case "copy_relic_effects":
            return session.copy_relic_effects([int(ga) for ga in params.get("gaHandles", [])])
        case "paste_relic_effects":
            return session.paste_relic_effects(
                [int(ga) for ga in params.get("gaHandles", [])],
                str(params["effectsText"]),
            )
        case "reindex_relics":
            return session.reindex_relics(
                int(params["targetIndex"]),
                [int(ga) for ga in params.get("gaHandles", [])],
            )
        case "delete_illegal_relics":
            return session.delete_illegal_relics()
        case "mass_fix_relics":
            return session.mass_fix_relics()
        case "update_relic":
            relic_id = params.get("relicId")
            effects = params.get("effects")
            return session.update_relic(
                int(params["gaHandle"]),
                int(relic_id) if relic_id is not None else None,
                [int(effect_id) for effect_id in effects] if effects is not None else None,
            )
        case "prepare_relic_edit":
            return session.prepare_relic_edit(
                int(params["relicId"]),
                [int(effect_id) for effect_id in params.get("effects", [])],
            )
        case "inspect_relic_edit":
            return session.inspect_relic_edit(
                int(params["relicId"]),
                [int(effect_id) for effect_id in params.get("effects", [])],
            )
        case "change_relic_color":
            return session.change_relic_color(
                int(params["gaHandle"]),
                int(params["relicId"]),
                [int(effect_id) for effect_id in params.get("effects", [])],
                str(params["targetColor"]),
            )
        case "list_relic_edit_options":
            return session.list_relic_edit_options(
                int(params["relicId"]),
                bool(params.get("safeMode", True)),
            )
        case "list_effect_edit_options":
            return session.list_effect_edit_options(
                int(params["relicId"]),
                int(params["slotIndex"]),
                [int(effect_id) for effect_id in params.get("effects", [])],
                bool(params.get("safeMode", True)),
            )
        case "export_relics_excel":
            return session.export_relics_excel(str(params["outputFile"]))
        case "import_relics_excel":
            return session.import_relics_excel(str(params["inputFile"]))
        case "list_relics":
            return session.list_relics()
        case "list_heroes":
            return session.list_heroes()
        case "list_vessels":
            return session.list_vessels(int(params.get("heroType", 1)))
        case "list_presets":
            return session.list_presets(int(params.get("heroType", 1)))
        case "list_vessel_relic_options":
            return session.list_vessel_relic_options(
                int(params.get("heroType", 1)),
                int(params["vesselId"]),
                int(params["slotIndex"]),
            )
        case "replace_vessel_relic":
            return session.replace_vessel_relic(
                int(params.get("heroType", 1)),
                int(params["vesselId"]),
                int(params["slotIndex"]),
                int(params["gaHandle"]),
            )
        case "replace_preset_relic":
            return session.replace_preset_relic(
                int(params.get("heroType", 1)),
                int(params["presetIndex"]),
                int(params["slotIndex"]),
                int(params["gaHandle"]),
            )
        case "save_vessel_as_preset":
            return session.save_vessel_as_preset(
                int(params.get("heroType", 1)),
                int(params["vesselId"]),
                str(params["name"]),
            )
        case "equip_preset":
            return session.equip_preset(
                int(params.get("heroType", 1)),
                int(params["presetIndex"]),
            )
        case "delete_preset":
            return session.delete_preset(
                int(params.get("heroType", 1)),
                int(params["presetIndex"]),
            )
        case "rename_preset":
            return session.rename_preset(
                int(params.get("heroType", 1)),
                int(params["presetIndex"]),
                str(params["name"]),
            )
        case "export_loadout":
            return session.export_loadout(
                int(params.get("heroType", 1)),
                str(params["outputFile"]),
            )
        case "preview_import_loadout":
            return session.preview_import_loadout(str(params["inputFile"]))
        case "cancel_import_loadout":
            return session.cancel_import_loadout()
        case "apply_import_loadout":
            return session.apply_import_loadout(
                [int(index) for index in params.get("vesselIndices", [])],
                [int(index) for index in params.get("presetIndices", [])],
            )
        case _:
            raise ValueError(f"Unknown method: {method}")


def write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            request_id = request.get("id")
            result = handle(request["method"], request.get("params") or {})
            write_response({"id": request_id, "ok": True, "result": result})
        except Exception as exc:
            write_response({
                "id": locals().get("request", {}).get("id"),
                "ok": False,
                "error": {
                    "code": exc.__class__.__name__,
                    "message": str(exc),
                    "detail": traceback.format_exc(),
                },
            })


if __name__ == "__main__":
    main()
