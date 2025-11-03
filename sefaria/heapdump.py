"""
Utilities for generating and retrieving on-demand Python heap dumps.

This module exposes a Django view that captures a snapshot of the current
Gunicorn worker process, serialises both a human readable report and a
tracemalloc snapshot to disk, and returns them within a zipped archive for
download. Access to the handler is restricted to authenticated Django staff members
via the @staff_member_required decorator to prevent accidental or unauthorized triggering
of heap dumps.
"""
from __future__ import annotations

import io
import gc
import logging
import os
import signal
import threading
import time
import tracemalloc
import zipfile
from datetime import datetime
from typing import List, Optional, Sequence

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.contrib.admin.views.decorators import staff_member_required

from pympler import muppy, summary as pympler_summary

logger = logging.getLogger(__name__)

_SNAPSHOT_LOCK = threading.Lock()
_LAST_SNAPSHOT: Optional[tracemalloc.Snapshot] = None


def _ensure_tracemalloc_running() -> None:
    """
    Start tracemalloc if it is not already collecting allocations.
    """
    if not tracemalloc.is_tracing():
        tracemalloc.start()


def _take_snapshot() -> tracemalloc.Snapshot:
    """
    Run garbage collection and capture a tracemalloc snapshot of the current
    process.
    """
    gc.collect()
    _ensure_tracemalloc_running()
    return tracemalloc.take_snapshot()


def _format_pympler_summary(limit: int = 20) -> List[str]:
    """
    Collect all objects tracked by Pympler and return a formatted summary of
    the largest object types.
    """
    try:
        objects = muppy.get_objects()
        summary_by_type = pympler_summary.summarize(objects)
        formatted = pympler_summary.format_(summary_by_type, limit=limit)
        if isinstance(formatted, str):
            return formatted.splitlines()
        return [str(item) for item in formatted]
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Failed to generate Pympler summary.", exc_info=exc)
        return [f"Failed to generate Pympler summary: {exc}"]


def _format_tracemalloc_stats(snapshot: tracemalloc.Snapshot, key_type: str = "lineno", limit: int = 20) -> List[str]:
    """
    Produce a list of human readable lines describing the heaviest allocations
    in the provided snapshot.
    """
    stats = snapshot.statistics(key_type)
    if not stats:
        return ["No allocation statistics available."]

    formatted = []
    for index, stat in enumerate(stats[:limit], start=1):
        formatted.append(f"{index:>2}. {stat}")
    return formatted


def _format_growth(previous: Optional[tracemalloc.Snapshot], current: tracemalloc.Snapshot, limit: int = 20) -> List[str]:
    """
    Compare the current snapshot with the previous one and return the largest
    growth entries.
    """
    if previous is None:
        return ["No previous snapshot available for growth comparison."]

    stats = current.compare_to(previous, "lineno")
    if not stats:
        return ["No allocation growth recorded since the prior snapshot."]

    lines = []
    for index, stat in enumerate(stats[:limit], start=1):
        sign = "+" if stat.size_diff >= 0 else "-"
        size_kib = abs(stat.size_diff) / 1024.0
        lines.append(f"{index:>2}. {sign}{size_kib:.1f} KiB in {stat.count_diff:+d} blocks | {stat.traceback}")
    return lines


def _write_summary_file(
    destination: str,
    pid: int,
    timestamp: str,
    snapshot: tracemalloc.Snapshot,
    previous_snapshot: Optional[tracemalloc.Snapshot],
    elapsed_seconds: float,
) -> None:
    """
    Persist a human-readable summary of the captured heap information to disk.
    """
    lines: List[str] = [
        f"Heap dump generated at {timestamp}Z",
        f"Worker PID: {pid}",
        f"Elapsed collection time: {elapsed_seconds:.3f}s",
        f"Termination signals monitored: {[signal.Signals(sig).name for sig in _TERMINATION_SIGNALS]}",
        "",
        "Top object types by size (Pympler):",
    ]
    lines.extend(_format_pympler_summary(limit=20))
    lines.extend(
        [
            "",
            "Allocation growth since previous snapshot:",
        ]
    )
    lines.extend(_format_growth(previous_snapshot, snapshot, limit=20))
    lines.extend(
        [
            "",
            "Top allocation locations (tracemalloc):",
        ]
    )
    lines.extend(_format_tracemalloc_stats(snapshot, key_type="lineno", limit=20))
    lines.append("")

    with open(destination, "w", encoding="utf-8") as outfile:
        outfile.write("\n".join(lines))


def _persist_heap_files(
    pid: int,
    timestamp: str,
    snapshot: tracemalloc.Snapshot,
    previous_snapshot: Optional[tracemalloc.Snapshot],
    elapsed_seconds: float,
) -> List[str]:
    """
    Write both the human readable summary and the tracemalloc snapshot to /tmp.
    """
    base_filename = f"heap-{pid}-{timestamp}"
    tmp_dir = "/tmp"
    summary_path = os.path.join(tmp_dir, f"{base_filename}.txt")
    snapshot_path = os.path.join(tmp_dir, f"{base_filename}.tracemalloc")

    _write_summary_file(summary_path, pid, timestamp, snapshot, previous_snapshot, elapsed_seconds)
    snapshot.dump(snapshot_path)

    return [summary_path, snapshot_path]


def _zip_files(file_paths: Sequence[str]) -> bytes:
    """
    Bundle the provided files into an in-memory zip archive and return the
    resulting bytes.
    """
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in file_paths:
            archive.write(path, arcname=os.path.basename(path))
    return buffer.getvalue()


@staff_member_required
def heapdump_view(request: HttpRequest) -> HttpResponse:
    """
    Trigger a heap dump for the current Gunicorn worker and return the results
    in a downloadable zip archive.
    """
    if request.method not in {"GET", "POST"}:
        return JsonResponse({"status": "error", "message": "Method not allowed."}, status=405)

    pid = os.getpid()
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    file_paths: List[str] = []

    try:
        start_time = time.perf_counter()
        with _SNAPSHOT_LOCK:
            global _LAST_SNAPSHOT
            previous_snapshot = _LAST_SNAPSHOT
            snapshot = _take_snapshot()
            _LAST_SNAPSHOT = snapshot
        elapsed = time.perf_counter() - start_time

        file_paths = _persist_heap_files(pid, timestamp, snapshot, previous_snapshot, elapsed)
        zip_bytes = _zip_files(file_paths)
        archive_name = f"heap-{pid}-{timestamp}.zip"

        response = HttpResponse(zip_bytes, content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{archive_name}"'
        response["Content-Length"] = str(len(zip_bytes))
        return response
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Heap dump generation failed.")
        return JsonResponse({"status": "error", "message": str(exc)}, status=500)
    finally:
        for path in file_paths:
            try:
                os.remove(path)
            except OSError:
                logger.warning("Failed to remove temporary heap dump file.", extra={"path": path})
