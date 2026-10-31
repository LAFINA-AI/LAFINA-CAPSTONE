#!/usr/bin/env python3
"""Bounded Phase 08 emulator orchestration; never runs without an explicit command.

Examples (global options precede the command):
  python scripts/phase08-emulator-suite.py --serial emulator-5554 --run-id qa08ex baseline
  python scripts/phase08-emulator-suite.py --serial emulator-5554 --run-id qa08ex configure --lead 0 --reply text --quiet false --delivery true --full-screen false
  python scripts/phase08-emulator-suite.py --serial emulator-5554 --run-id qa08ex compose --action create --title "QA08 EX qa08ex A01"

This is an opt-in UI/storage runner, not a notification-tap, live-speech or phone
certificate. It never clears data, installs APKs, writes a device DB, changes OS
permissions/radios/time, kills an app or automatically records audio. The parent
operator owns those controlled conditions and their exact restoration.
"""

from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import traceback
from typing import Any
import uuid


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = "com.lafina.capstone"
RUNNER = PACKAGE + ".test/androidx.test.runner.AndroidJUnitRunner"
DATABASE = "databases/lafina-capstone.sqlite"
TITLE = re.compile(r"QA08 [A-Za-z0-9 _-]{1,100}\Z")
SAFE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,47}\Z")
PREFERENCE_KEYS = {"leadMinutes", "replyMode", "quietHoursEnabled"}
RESPONSE_MODES = ("answer", "ack", "snooze", "timeout")
LIFECYCLE_MODES = (
    "typed-snooze", "manual-ack", "close", "back", "review-cancel",
    "review-pause", "double-confirm", "expired-review", "replace",
    "external-review", "inspect",
    "stale-open", "review-delete-source",
    "refusal", "remove-main-task",
)
IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")


def utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def write_new(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write("\n")


def require(condition: bool, code: str) -> None:
    if not condition:
        raise RuntimeError(code)


def private_path(value: str | Path) -> Path:
    result = Path(value)
    if not result.is_absolute():
        result = ROOT / result
    result = result.resolve()
    require(result.is_relative_to((ROOT / ".local").resolve()), "BASELINE_MUST_BE_PRIVATE_LOCAL")
    return result


def valid_title(value: str) -> str:
    require(TITLE.fullmatch(value) is not None, "EXACT_SYNTHETIC_QA08_TITLE_REQUIRED")
    return value


def encoded(value: str) -> str:
    require(0 < len(value) <= 1024 and all(32 <= ord(c) <= 126 for c in value),
            "BOUNDED_PRINTABLE_ASCII_IDENTITY_REQUIRED")
    return base64.b64encode(value.encode("ascii")).decode("ascii")


def quoted_identifier(value: str) -> str:
    require(IDENTIFIER.fullmatch(value) is not None, "UNEXPECTED_SQL_IDENTIFIER")
    return '"' + value + '"'


def connect_readonly(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    require(connection.execute("PRAGMA quick_check").fetchone()[0] == "ok", "SNAPSHOT_CHECK_FAILED")
    return connection


def preferences(db: sqlite3.Connection) -> tuple[str, dict[str, Any]]:
    row = db.execute("SELECT payload FROM app_settings WHERE id=1").fetchone()
    require(row is not None, "SAVED_PREFERENCES_REQUIRED")
    payload = row[0]
    return payload, json.loads(payload)


def delivery(db: sqlite3.Connection) -> dict[str, bool]:
    row = db.execute("SELECT enabled,full_screen FROM native_delivery_settings WHERE id=1").fetchone()
    require(row is not None, "NATIVE_DELIVERY_SETTINGS_REQUIRED")
    return {"enabled": bool(row[0]), "fullScreen": bool(row[1])}


def fixture_state(db: sqlite3.Connection, title: str) -> list[dict[str, Any]]:
    valid_title(title)
    return [dict(row) for row in db.execute("""
      SELECT t.id taskId,t.status taskStatus,t.deleted_at deletedAt,
        j.id jobId,j.occurrence_key occurrenceKey,j.generation generation,
        j.status jobStatus,r.status reminderStatus,j.run_at runAt,
        j.ringing_deadline deadline,j.delivery_state deliveryState,
        (SELECT count(*) FROM native_alarm_registrations n WHERE n.job_id=j.id) registrations
      FROM tasks t LEFT JOIN reminders r ON r.task_id=t.id
        LEFT JOIN reminder_jobs j ON j.reminder_id=r.id WHERE t.title=?
      ORDER BY j.id
    """, (title,))]


def original_rows(before: sqlite3.Connection, after: sqlite3.Connection) -> dict[str, Any]:
    """Compare baseline rows by original PK without exposing their values or keys.

    Settings and delivery have separate exact comparisons. Bounded diagnostic
    event history is reported separately; a different event row is not silently
    treated as an unchanged planner row. New rows are counted, never deleted.
    """
    result: dict[str, Any] = {}
    for (table,) in before.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        name = quoted_identifier(table)
        old = [dict(row) for row in before.execute("SELECT * FROM " + name)]
        new = [dict(row) for row in after.execute("SELECT * FROM " + name)]
        keys = [row["name"] for row in sorted(before.execute("PRAGMA table_info(" + name + ")"),
                                              key=lambda row: row["pk"]) if row["pk"]]
        if not keys:
            unchanged = old == new
            added = max(0, len(new) - len(old))
            missing_or_changed = 0 if unchanged else 1
        else:
            indexed = {tuple(row[key] for key in keys): row for row in new}
            baseline_keys = {tuple(row[key] for key in keys) for row in old}
            missing_or_changed = sum(indexed.get(tuple(row[key] for key in keys)) != row for row in old)
            added = sum(key not in baseline_keys for key in indexed)
        separately_checked = table in {"app_settings", "native_delivery_settings"}
        diagnostic = "event" in table and table.startswith("native_")
        result[table] = {"baselineCount": len(old), "currentCount": len(new),
                         "originalRowsMissingOrChanged": missing_or_changed,
                         "addedRows": added, "separatelyChecked": separately_checked,
                         "boundedDiagnosticHistory": diagnostic}
    return result


class Suite:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        require(SAFE.fullmatch(args.run_id) is not None, "SAFE_RUN_ID_REQUIRED")
        self.run_dir = ROOT / ".local" / "phase08-emulator-suite" / args.run_id
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.invocation = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid.uuid4().hex[:8]
        self.private = self.run_dir / self.invocation
        self.private.mkdir()
        self.public = ROOT / "docs/reports/evidence/phase-08-emulator-expansion" / args.run_id
        self.public.mkdir(parents=True, exist_ok=True)
        self.evidence_file = self.public / (self.invocation + "-" + args.command + ".json")
        self.log_file = self.public / (self.invocation + "-" + args.command + ".log")
        self.baseline_file = private_path(args.baseline) if args.baseline else self.run_dir / "baseline.json"
        self.result: dict[str, Any] = {
            "schemaVersion": 1, "runId": args.run_id, "invocation": self.invocation,
            "command": args.command, "startedAt": utc(), "status": "RUNNING",
            "scope": "Explicit emulator UI driver plus independent read-only SQLite snapshots",
            "physicalAcceptance": "HUMAN_REQUIRED", "events": [],
            "limits": ["Direct private Activity intents do not certify actual notification taps or full-screen delivery.",
                       "No live microphone, audibility, physical phone, OEM or battery acceptance is implied."],
        }
        write_new(self.evidence_file, self.result)
        self.log("invocation_started")
        self.snapshot_index = 0

    def log(self, event: str, **values: Any) -> None:
        row = {"at": utc(), "event": event, **values}
        self.result["events"].append(row)
        with self.log_file.open("a", encoding="utf-8") as output:
            output.write(json.dumps(row, ensure_ascii=False) + "\n")
        # The evidence path, fixed event codes and synthetic values are safe for stdout.
        print(json.dumps(row, ensure_ascii=False), flush=True)

    def finish(self, status: str, **values: Any) -> None:
        self.result.update(status=status, completedAt=utc(), **values)
        # This file belongs only to the current invocation, whose creation used x.
        self.evidence_file.write_text(json.dumps(self.result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": status, "evidence": self.evidence_file.relative_to(ROOT).as_posix()}), flush=True)

    def adb(self, *values: str, timeout: int = 30, missing_ok: bool = False) -> bytes:
        call = [self.args.adb, "-s", self.args.serial, *values]
        completed = subprocess.run(call, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   timeout=timeout, shell=False, check=False)
        if completed.returncode:
            if missing_ok and completed.returncode == 1:
                return b""
            failure = self.private / ("adb-failure-" + uuid.uuid4().hex[:8] + ".txt")
            failure.write_bytes(completed.stdout + b"\n" + completed.stderr)
            raise RuntimeError("ADB_COMMAND_FAILED_PRIVATE_LOG_SAVED")
        return completed.stdout

    def connected(self) -> None:
        require(self.adb("get-state").strip() == b"device", "EXPLICIT_EMULATOR_NOT_READY")

    def snapshot(self) -> tuple[Path, sqlite3.Connection]:
        self.snapshot_index += 1
        folder = self.private / ("snapshot-" + str(self.snapshot_index))
        folder.mkdir()
        # Stable paired reads prevent accepting a main/WAL copy observed mid-commit.
        # No device checkpoint, sqlite write, file replacement or app stop occurs.
        def optional_wal() -> bytes:
            # Raw exec-out does not reliably propagate cat's remote exit status.
            # Use shell v2's status first, so missing-file error text cannot be
            # mistaken for a real WAL sidecar in the read-only host snapshot.
            probe = subprocess.run([self.args.adb, "-s", self.args.serial, "shell", "run-as",
                                    PACKAGE, "test", "-f", DATABASE + "-wal"],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=False)
            require(probe.returncode in (0, 1), "WAL_EXISTENCE_PROBE_FAILED")
            if probe.returncode == 1:
                return b""
            return self.adb("exec-out", "run-as", PACKAGE, "cat", DATABASE + "-wal")

        for attempt in range(4):
            first = self.adb("exec-out", "run-as", PACKAGE, "cat", DATABASE)
            wal = optional_wal()
            second = self.adb("exec-out", "run-as", PACKAGE, "cat", DATABASE)
            wal_again = optional_wal()
            if first == second and wal == wal_again:
                path = folder / "snapshot.sqlite"
                path.write_bytes(first)
                if wal:
                    Path(str(path) + "-wal").write_bytes(wal)
                try:
                    return path, connect_readonly(path)
                except (RuntimeError, sqlite3.Error):
                    if attempt == 3:
                        raise
                    folder = self.private / ("snapshot-" + str(self.snapshot_index) + "-retry-" + str(attempt))
                    folder.mkdir()
            time.sleep(0.15)
        raise RuntimeError("DATABASE_DID_NOT_STABILIZE_WITHIN_BOUND")

    def ui(self, class_name: str, mode: str, values: dict[str, str] | None = None) -> dict[str, Any]:
        require(class_name in {"ReminderSettingsUiTest", "ReminderResponseUiTest", "ReminderLifecycleUiTest",
                               "ReminderNotificationUiTest"},
                "UNSUPPORTED_UI_DRIVER")
        self.adb("shell", "cmd", "statusbar", "collapse")
        arguments = ["shell", "am", "instrument", "-w", "-r", "-e", "class",
                     PACKAGE + ".reminders." + class_name, "-e", "qa08_mode", mode]
        for key, value in (values or {}).items():
            require(re.fullmatch(r"qa08_[a-z0-9_]+", key) is not None, "UNEXPECTED_DRIVER_KEY")
            require(re.fullmatch(r"[A-Za-z0-9_+/= -]+", value) is not None, "UNSAFE_DRIVER_ARGUMENT")
            # ADB joins shell argv on Android. A fixed allowed response can contain
            # spaces; quote that one finite value for the remote shell as well.
            arguments.extend(["-e", key, "'" + value + "'" if " " in value else value])
        arguments.append(RUNNER)
        raw_path = self.private / ("instrumentation-" + uuid.uuid4().hex[:8] + ".txt")
        # Stream to a private file so a parent coordinating external-review can
        # observe its gateFile READY status while this bounded invocation runs.
        with raw_path.open("xb") as output:
            process = subprocess.Popen([self.args.adb, "-s", self.args.serial, *arguments], cwd=ROOT,
                                       stdout=output, stderr=subprocess.STDOUT, shell=False)
            try:
                code = process.wait(timeout=120)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
                raise RuntimeError("UI_DRIVER_HOST_TIMEOUT_PARENT_MUST_CHECK_DEVICE") from None
        text = raw_path.read_text(encoding="utf-8", errors="replace")
        reports = []
        for line in text.splitlines():
            match = re.match(r"INSTRUMENTATION_STATUS: phase08_[a-z_]+=(\{.*\})$", line.strip())
            if match:
                report = json.loads(match.group(1))
                # Allow-list known non-private stage metadata; never publish raw output.
                reports.append({key: report[key] for key in
                                ("kind", "mode", "outcome", "stages", "launch", "limits", "errorClass") if key in report})
        for report in reports:
            self.log("ui_driver", **report)
        require(code == 0 and "FAILURES!!!" not in text and "INSTRUMENTATION_FAILED" not in text
                and any(item.get("outcome") == "PASS" and item.get("mode") == mode for item in reports),
                "UI_DRIVER_DID_NOT_REPORT_PASS")
        return reports[-1]

    def load_baseline(self) -> tuple[dict[str, Any], sqlite3.Connection]:
        value = json.loads(self.baseline_file.read_text(encoding="utf-8"))
        # Compatibility is read-only: reuse the supplied old private baseline's
        # exact database path; never rewrite that manifest or database.
        path_value = value.get("snapshot") or value.get("database")
        require(isinstance(path_value, str), "BASELINE_DATABASE_PATH_REQUIRED")
        db = connect_readonly(private_path(path_value))
        _, actual = preferences(db)
        require(not value.get("preferences") or actual == value["preferences"], "BASELINE_PREFERENCES_INCONSISTENT")
        return value, db

    def owned(self) -> dict[str, Any]:
        path = self.run_dir / "owned-fixtures.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"runId": self.args.run_id, "titles": []}

    def remember(self, title: str) -> None:
        manifest = self.owned()
        require(title not in manifest["titles"], "OWNED_TITLE_ALREADY_REGISTERED")
        manifest["titles"].append(title)
        path = self.run_dir / "owned-fixtures.json"
        if path.exists():
            # Preserve each previous manifest; this file is only the current index.
            write_new(self.private / "previous-owned-fixtures.json", self.owned())
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    def state(self, title: str) -> list[dict[str, Any]]:
        _, db = self.snapshot()
        try:
            return fixture_state(db, title)
        finally:
            db.close()

    def assert_owned(self, title: str) -> None:
        require(valid_title(title) in self.owned()["titles"], "TITLE_NOT_CREATED_BY_THIS_RUN")

    def identity(self, title: str, generation: int | None = None, prefix: str = "qa08_") -> dict[str, str]:
        self.assert_owned(title)
        rows = self.state(title)
        if generation is not None:
            rows = [row for row in rows if row["generation"] == generation]
        require(len(rows) == 1 and rows[0]["jobId"] is not None, "EXACT_SINGLE_OWNED_JOB_REQUIRED")
        row = rows[0]
        return {prefix + "title_base64": encoded(title), prefix + "job_base64": encoded(row["jobId"]),
                prefix + "occurrence_base64": encoded(row["occurrenceKey"]),
                prefix + "generation": str(row["generation"])}

    def do_baseline(self) -> None:
        require(not self.baseline_file.exists(), "PRESERVE_EXISTING_BASELINE_CHOOSE_NEW_RUN_OR_PATH")
        path, db = self.snapshot()
        try:
            payload, prefs = preferences(db)
            active = db.execute("SELECT count(*) FROM reminder_jobs WHERE status IN ('PENDING','RINGING')").fetchone()[0]
            require(active == 0, "UNRELATED_ACTIVE_JOBS_REQUIRE_PARENT_REVIEW")
            settings = {}
            for namespace, keys in {"global": ("airplane_mode_on", "wifi_on", "mobile_data", "auto_time", "auto_time_zone", "low_power"),
                                    "system": ("font_scale", "accelerometer_rotation", "user_rotation")}.items():
                settings[namespace] = {key: self.adb("shell", "settings", "get", namespace, key).decode().strip() for key in keys}
            for label, command in {"package": ("shell", "dumpsys", "package", PACKAGE),
                                   "appops": ("shell", "cmd", "appops", "get", PACKAGE),
                                   "battery": ("shell", "dumpsys", "battery"),
                                   "idle": ("shell", "dumpsys", "deviceidle"),
                                   "audio": ("shell", "dumpsys", "audio")}.items():
                (self.private / ("baseline-" + label + ".txt")).write_bytes(self.adb(*command))
            baseline = {"schemaVersion": 1, "runId": self.args.run_id, "createdAt": utc(),
                        "snapshot": str(path.relative_to(ROOT)), "preferences": prefs,
                        "preferencesSha256": digest(payload.encode()), "delivery": delivery(db), "settings": settings,
                        "timezone": self.adb("shell", "getprop", "persist.sys.timezone").decode().strip(),
                        "privateSystemEvidence": str(self.private.relative_to(ROOT))}
            write_new(self.baseline_file, baseline)
            self.log("fresh_baseline_captured", schema=db.execute("PRAGMA user_version").fetchone()[0],
                     preferencesSha256=baseline["preferencesSha256"], activeJobs=active)
        finally:
            db.close()

    def do_configure(self) -> None:
        _, before = self.snapshot()
        try:
            _, old = preferences(before)
            old_delivery = delivery(before)
        finally:
            before.close()
        self.ui("ReminderSettingsUiTest", "preferences", {"qa08_lead": str(self.args.lead),
                "qa08_reply": self.args.reply, "qa08_quiet": self.args.quiet})
        _, after = self.snapshot()
        try:
            _, current = preferences(after)
            wanted = {**old, "leadMinutes": self.args.lead, "replyMode": self.args.reply,
                      "quietHoursEnabled": self.args.quiet == "true"}
            require(current == wanted, "PREFERENCE_COMPARISON_FAILED_PARENT_MUST_RESTORE")
            require(delivery(after) == old_delivery, "PREFERENCES_CHANGED_NATIVE_DELIVERY")
        finally:
            after.close()
        self.log("only_requested_preference_keys_changed", keys=sorted(PREFERENCE_KEYS))
        if self.args.delivery is not None:
            self.ui("ReminderSettingsUiTest", "delivery", {"qa08_enabled": self.args.delivery,
                    "qa08_full_screen": self.args.full_screen})
            _, after = self.snapshot()
            try:
                require(preferences(after)[1] == wanted, "DELIVERY_CHANGED_PREFERENCES")
                require(delivery(after) == {"enabled": self.args.delivery == "true",
                                           "fullScreen": self.args.full_screen == "true"}, "DELIVERY_COMPARISON_FAILED")
            finally:
                after.close()
            self.log("requested_native_delivery_flags_verified")

    def compose(self, action: str, title: str, minutes: int = 1) -> None:
        valid_title(title)
        rows = self.state(title)
        if action == "create":
            require(not rows, "PRESERVE_EXISTING_FIXTURE_TITLE")
            self.remember(title)  # Failed partial creations remain owned and recoverable.
            command = "Remind me to " + title + " in " + str(minutes) + " minutes"
        else:
            self.assert_owned(title)
            require(bool(rows), "OWNED_TASK_NOT_FOUND")
            if all(row["deletedAt"] is not None for row in rows):
                require(all(row["registrations"] == 0 and row["jobStatus"] not in ("PENDING", "RINGING") for row in rows),
                        "DELETED_FIXTURE_RETAINS_ACTIVE_WORK")
                self.log("owned_fixture_already_soft_removed", title=title)
                return
            command = 'Delete task "' + title + '"'
        self.ui("ReminderResponseUiTest", "compose", {"qa08_command_base64": encoded(command)})
        rows = self.state(title)
        if action == "create":
            require(len(rows) == 1 and rows[0]["taskStatus"] == "TODO" and rows[0]["jobStatus"] == "PENDING",
                    "CREATED_FIXTURE_STATE_INVALID")
        else:
            require(rows and all(row["deletedAt"] is not None and row["registrations"] == 0
                    and row["jobStatus"] not in ("PENDING", "RINGING") for row in rows), "REMOVED_FIXTURE_STATE_INVALID")
        self.log("owned_fixture_" + action, title=title, rows=rows, tombstonesRetained=action == "delete")

    def do_compose(self) -> None:
        self.compose(self.args.action, self.args.title, self.args.minutes)

    def do_state(self) -> None:
        self.assert_owned(self.args.title)
        self.log("owned_fixture_state", title=self.args.title, rows=self.state(self.args.title))

    def do_wait(self) -> None:
        self.assert_owned(self.args.title)
        until = time.monotonic() + self.args.timeout
        polls = 0
        rows = []
        while time.monotonic() <= until:
            rows = self.state(self.args.title)
            polls += 1
            if rows and all(row["jobStatus"] == self.args.status for row in rows):
                self.log("requested_owned_status_observed", title=self.args.title, status=self.args.status, polls=polls, rows=rows)
                return
            time.sleep(self.args.interval)
        self.log("owned_status_timeout", title=self.args.title, expected=self.args.status, polls=polls, rows=rows)
        raise RuntimeError("REQUESTED_OWNED_STATUS_NOT_OBSERVED")

    def do_response(self) -> None:
        values = self.identity(self.args.title, self.args.generation)
        self.ui("ReminderResponseUiTest", self.args.mode, values)
        rows = self.state(self.args.title)
        self.log("independent_owned_state_after_ui", title=self.args.title, rows=rows)
        self.assert_outcome(rows, self.args.mode, int(values["qa08_generation"]))

    def assert_outcome(self, rows: list[dict[str, Any]], mode: str, generation: int) -> None:
        require(len(rows) == 1 and rows[0]["taskStatus"] == "TODO" and rows[0]["deletedAt"] is None,
                "RESPONSE_MUST_LEAVE_ONE_UNCOMPLETED_TASK")
        row = rows[0]
        if mode in ("snooze", "typed-snooze"):
            wanted = ("PENDING", "SNOOZED", generation + 1, 1)
        elif mode in ("ack", "manual-ack", "double-confirm"):
            wanted = ("ACKNOWLEDGED", "ACKNOWLEDGED", generation, 0)
        elif mode in ("timeout", "expired-review"):
            wanted = ("MISSED", "MISSED", generation, 0)
        else:
            # No confirmation: the original response window/generation continues.
            # An elapsed window is not silently counted as this active assertion.
            wanted = ("RINGING", "RINGING", generation, row["registrations"])
        require((row["jobStatus"], row["reminderStatus"], row["generation"], row["registrations"]) == wanted,
                "INDEPENDENT_RESPONSE_STATE_ASSERTION_FAILED")
        self.log("independent_response_state_assertion_passed", mode=mode, taskStillTodo=True)

    def do_lifecycle(self) -> None:
        values = self.identity(self.args.title, self.args.generation)
        previous_rows = self.state(self.args.title)
        values["qa08_minutes"] = str(self.args.minutes)
        if self.args.mode == "replace":
            require(self.args.second_title is not None and self.args.second_title != self.args.title,
                    "SECOND_DISTINCT_OWNED_TITLE_REQUIRED")
            values.update(self.identity(self.args.second_title, prefix="qa08_second_"))
        if self.args.mode == "external-review":
            values["qa08_response"] = self.args.response
        if self.args.mode == "refusal":
            values["qa08_response_base64"] = encoded(self.args.refusal)
        if self.args.mode == "remove-main-task":
            require(len(previous_rows) == 1 and previous_rows[0]["jobStatus"] == "PENDING"
                    and previous_rows[0]["reminderStatus"] == "SCHEDULED" and previous_rows[0]["taskStatus"] == "TODO"
                    and previous_rows[0]["deletedAt"] is None and previous_rows[0]["registrations"] == 1,
                    "MAIN_TASK_REMOVAL_REQUIRES_ONE_PENDING_REGISTERED_TODO")
        self.ui("ReminderLifecycleUiTest", self.args.mode, values)
        rows = self.state(self.args.title)
        self.log("independent_owned_state_after_ui", title=self.args.title, rows=rows)
        if self.args.mode == "remove-main-task":
            require(rows == previous_rows and rows[0]["generation"] == int(values["qa08_generation"]),
                    "MAIN_TASK_REMOVAL_CHANGED_PENDING_DURABLE_STATE")
            self.log("app_owned_main_task_removal_preserved_exact_pending_todo", rows=rows,
                     scope="AppTask.finishAndRemoveTask only; not a System UI Recents gesture or OEM certification")
        elif self.args.mode == "stale-open":
            require(rows == previous_rows, "STALE_OPEN_CHANGED_OWNED_STATE")
            self.log("stale_open_preserved_exact_owned_state")
        elif self.args.mode in ("refusal", "review-cancel"):
            require(rows == previous_rows, "REFUSED_OR_CANCELLED_REVIEW_CHANGED_OWNED_STATE")
            self.assert_outcome(rows, self.args.mode, int(values["qa08_generation"]))
            self.log("refused_or_cancelled_review_preserved_exact_owned_state")
        elif self.args.mode == "review-delete-source":
            require(rows and all(row["deletedAt"] is not None and row["registrations"] == 0
                    and row["jobStatus"] not in ("PENDING", "RINGING") for row in rows),
                    "DELETED_SOURCE_RETAINED_ACTIVE_WORK")
            self.log("deleted_source_rejected_old_confirmation_and_has_no_active_work")
        elif self.args.mode != "external-review":
            self.assert_outcome(rows, self.args.mode, int(values["qa08_generation"]))
        else:
            self.log("external_mutation_assertion_requires_parent_case_expectation")
        if self.args.second_title:
            second = self.state(self.args.second_title)
            self.log("independent_second_owned_state_after_ui", title=self.args.second_title, rows=second)
            self.assert_outcome(second, "answer", int(values["qa08_second_generation"]))

    def do_notification(self) -> None:
        values = self.identity(self.args.title, self.args.generation)
        if self.args.duplicate:
            require(self.args.mode in ("ack", "snooze"), "DUPLICATE_REQUIRES_NOTIFICATION_ACK_OR_SNOOZE")
            values["qa08_duplicate"] = "true"
        self.ui("ReminderNotificationUiTest", self.args.mode, values)
        rows = self.state(self.args.title)
        self.log("independent_owned_state_after_system_notification", title=self.args.title, rows=rows,
                 entry="ACTUAL_SYSTEMUI_NOTIFICATION_SHADE")
        outcome = "answer" if self.args.mode == "open" else self.args.mode
        if self.args.mode in ("open-manual-ack", "open-typed-ack"):
            outcome = "ack"
        self.assert_outcome(rows, outcome,
                            int(values["qa08_generation"]))

    def do_cleanup(self) -> None:
        for title in self.args.title:
            self.assert_owned(title)
        for title in self.args.title:
            self.compose("delete", title)

    def do_restore_preferences(self) -> None:
        _, before = self.load_baseline()
        try:
            _, wanted = preferences(before)
            wanted_delivery = delivery(before)
        finally:
            before.close()
        _, current = self.snapshot()
        try:
            _, actual = preferences(current)
            require({key: value for key, value in actual.items() if key not in PREFERENCE_KEYS}
                    == {key: value for key, value in wanted.items() if key not in PREFERENCE_KEYS},
                    "UNSUPPORTED_PRIVATE_FIELD_CHANGED_PARENT_RECOVERY_REQUIRED")
        finally:
            current.close()
        self.ui("ReminderSettingsUiTest", "preferences", {"qa08_lead": str(wanted["leadMinutes"]),
                "qa08_reply": wanted["replyMode"], "qa08_quiet": str(wanted["quietHoursEnabled"]).lower()})
        self.ui("ReminderSettingsUiTest", "delivery", {"qa08_enabled": str(wanted_delivery["enabled"]).lower(),
                "qa08_full_screen": str(wanted_delivery["fullScreen"]).lower()})
        _, restored = self.snapshot()
        try:
            require(preferences(restored)[1] == wanted and delivery(restored) == wanted_delivery,
                    "BASELINE_PREFERENCES_OR_DELIVERY_NOT_RESTORED")
        finally:
            restored.close()
        self.log("baseline_preferences_and_delivery_restored_through_ui")

    def do_compare(self) -> None:
        _, before = self.load_baseline()
        _, after = self.snapshot()
        try:
            old_payload, old_prefs = preferences(before)
            new_payload, new_prefs = preferences(after)
            comparison = original_rows(before, after)
            changed = [name for name, row in comparison.items() if row["originalRowsMissingOrChanged"]
                       and not row["separatelyChecked"] and not row["boundedDiagnosticHistory"]]
            owned_rows = [row for title in self.owned()["titles"] for row in fixture_state(after, title)]
            owned_inactive = all(row["deletedAt"] is not None and row["registrations"] == 0
                                 and row["jobStatus"] not in ("PENDING", "RINGING") for row in owned_rows)
            result = {"completePreferenceValuesEqual": old_prefs == new_prefs,
                      "exactPreferencePayloadHashEqual": digest(old_payload.encode()) == digest(new_payload.encode()),
                      "nativeDeliveryEqual": delivery(before) == delivery(after), "originalRowComparison": comparison,
                      "ownedFixturesSoftRemovedAndInactive": owned_inactive,
                      "osPermissionRadioTimeAudioPowerRestoration": "PARENT_MUST_VERIFY_SEPARATELY"}
            self.log("baseline_comparison", **result)
            require(not changed and all((result["completePreferenceValuesEqual"], result["exactPreferencePayloadHashEqual"],
                                         result["nativeDeliveryEqual"], owned_inactive)), "FINAL_BASELINE_COMPARISON_FAILED")
        finally:
            before.close()
            after.close()


def bounded_int(minimum: int, maximum: int):
    def parse(value: str) -> int:
        number = int(value)
        if not minimum <= number <= maximum:
            raise argparse.ArgumentTypeError("value must be between " + str(minimum) + " and " + str(maximum))
        return number
    return parse


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument("--serial", required=True, choices=("emulator-5554",), help="Explicit emulator only; no physical serials")
    result.add_argument("--run-id", required=True, help="Safe unique cohort ID; no spaces/private content")
    result.add_argument("--adb", default=str(Path(os.environ.get("LOCALAPPDATA", "C:/Users/USER-PC/AppData/Local")) / "Android/Sdk/platform-tools/adb.exe"))
    result.add_argument("--baseline", help="Existing/fresh private .local JSON path; no manifest overwrite")
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("baseline", help="Capture a fresh private baseline; refuses unrelated active jobs")
    configure = commands.add_parser("configure", help="Explicit saved UI changes plus independent exact key comparison")
    configure.add_argument("--lead", required=True, type=bounded_int(0, 120))
    configure.add_argument("--reply", required=True, choices=("text", "voice", "both"))
    configure.add_argument("--quiet", required=True, choices=("true", "false"))
    configure.add_argument("--delivery", choices=("true", "false"))
    configure.add_argument("--full-screen", choices=("true", "false"))
    compose = commands.add_parser("compose", help="Create/delete one exact owned QA08 title through reviewed Chat")
    compose.add_argument("--title", required=True)
    compose.add_argument("--action", required=True, choices=("create", "delete"))
    compose.add_argument("--minutes", type=int, choices=(1, 2), default=1)
    state = commands.add_parser("state", help="Read only the exact title registered by this run")
    state.add_argument("--title", required=True)
    wait = commands.add_parser("wait", help="Bounded read-only poll of one owned fixture")
    wait.add_argument("--title", required=True)
    wait.add_argument("--status", required=True, choices=("PENDING", "RINGING", "ACKNOWLEDGED", "MISSED", "CANCELLED"))
    wait.add_argument("--timeout", type=bounded_int(1, 180), default=100)
    wait.add_argument("--interval", type=bounded_int(1, 10), default=2)
    for name, modes in (("response", RESPONSE_MODES), ("lifecycle", LIFECYCLE_MODES)):
        item = commands.add_parser(name, help="Opt-in private Activity UI driver; independent SQL state is recorded")
        item.add_argument("--title", required=True)
        item.add_argument("--mode", required=True, choices=modes)
        item.add_argument("--generation", type=bounded_int(1, 1000000))
        if name == "lifecycle":
            item.add_argument("--minutes", type=bounded_int(1, 120), default=5)
            item.add_argument("--second-title")
            item.add_argument("--response", choices=("acknowledge", "snooze for 5 minutes"), default="acknowledge")
            item.add_argument("--refusal", choices=("okay but remind me later", "delete this task", "delete all tasks", "mark this task complete"),
                              default="okay but remind me later", help="Bounded phrase for lifecycle refusal mode")
    notification = commands.add_parser("notification", help="Actual owned System UI notification open/ACK/snooze plus SQL assertion")
    notification.add_argument("--title", required=True)
    notification.add_argument("--mode", required=True,
                              choices=("open", "ack", "snooze", "open-manual-ack", "open-typed-ack"))
    notification.add_argument("--generation", type=bounded_int(1, 1000000))
    notification.add_argument("--duplicate", action="store_true", help="Replay the same owned ACK/snooze action node")
    cleanup = commands.add_parser("cleanup", help="Soft-remove only explicitly supplied titles created by this run")
    cleanup.add_argument("--title", required=True, action="append")
    commands.add_parser("restore-preferences", help="Restore supported preference/delivery controls through UI; fail on other changes")
    commands.add_parser("compare", help="Compare baseline original rows/preferences and verify owned fixture inactivity")
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.command == "configure" and (args.delivery is None) != (args.full_screen is None):
        parser().error("--delivery and --full-screen must be supplied together")
    suite: Suite | None = None
    try:
        suite = Suite(args)
        suite.connected()
        getattr(suite, "do_" + args.command.replace("-", "_"))()
        suite.finish("PASS", passScope="Requested bounded runner operation only; inspect case assertions and physical gates separately")
        return 0
    except Exception as error:
        if suite is not None:
            (suite.private / "failure.txt").write_text(traceback.format_exc(), encoding="utf-8")
            # RuntimeError messages are fixed codes generated above. Never echo raw
            # device/SQLite/subprocess exceptions or private baseline values.
            code = str(error) if isinstance(error, RuntimeError) and re.fullmatch(r"[A-Z0-9_]+", str(error)) else "PRIVATE_FAILURE_LOG_SAVED"
            suite.log("operation_failed", errorCode=code, errorType=type(error).__name__)
            suite.finish("FAIL", errorCode=code)
        else:
            print(json.dumps({"status": "FAIL", "errorCode": "RUNNER_INITIALIZATION_FAILED"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
