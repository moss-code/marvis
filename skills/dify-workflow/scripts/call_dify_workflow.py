#!/usr/bin/env python3
"""Call a Dify Workflow and print the raw result as JSON."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://localhost/v1"
DEFAULT_USER = "abc-123"
MAX_EVENT_COUNT = 200


def read_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists() or not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def load_env_files() -> None:
    """Load DIFY_* vars from .env files, letting nearer files override inherited env."""
    candidates: list[Path] = []

    # Low priority first, high priority last.
    for parent in reversed(Path(__file__).resolve().parents):
        candidates.append(parent / ".env")
    candidates.append(Path.cwd() / ".env")

    explicit = os.getenv("DIFY_DOTENV_PATH", "").strip()
    if explicit:
        candidates.append(Path(explicit))

    seen: set[Path] = set()
    for path in candidates:
        path = path.resolve()
        if path in seen:
            continue
        seen.add(path)
        for key, value in read_dotenv(path).items():
            if key.startswith("DIFY_"):
                os.environ[key] = value


def normalize_api_key(raw: str) -> str:
    value = raw.strip()
    lower = value.lower()
    if lower.startswith("authorization:"):
        value = value.split(":", 1)[1].strip()
        lower = value.lower()
    if lower.startswith("bearer "):
        value = value[7:].strip()
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Call Dify workflow API")
    parser.add_argument("--query", default="", help="Value for inputs.query")
    parser.add_argument(
        "--inputs-json",
        default="",
        help='Full inputs JSON object, for example: {"query":"hello"}',
    )
    parser.add_argument("--base-url", default=os.getenv("DIFY_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--user", default=os.getenv("DIFY_USER", DEFAULT_USER))
    parser.add_argument(
        "--response-mode",
        default=os.getenv("DIFY_RESPONSE_MODE", "streaming"),
        choices=["streaming", "blocking"],
    )
    parser.add_argument("--timeout", type=int, default=int(os.getenv("DIFY_TIMEOUT", "120")))
    return parser.parse_args()


def load_inputs(args: argparse.Namespace) -> dict[str, Any]:
    if args.inputs_json:
        value = json.loads(args.inputs_json)
        if not isinstance(value, dict):
            raise ValueError("--inputs-json must be a JSON object")
        return value
    return {"query": args.query}


def workflow_url(base_url: str) -> str:
    return base_url.rstrip("/") + "/workflows/run"


def print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def parse_sse(raw: bytes) -> dict[str, Any]:
    events: list[Any] = []
    outputs: Any = None
    answer_parts: list[str] = []

    text = raw.decode("utf-8", errors="replace")
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data or data == "[DONE]":
            continue
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            event = {"raw": data}
        events.append(event)
        if len(events) > MAX_EVENT_COUNT:
            events = events[-MAX_EVENT_COUNT:]

        if isinstance(event, dict):
            event_data = event.get("data")
            if isinstance(event_data, dict):
                if "outputs" in event_data:
                    outputs = event_data["outputs"]
                if isinstance(event_data.get("answer"), str):
                    answer_parts.append(event_data["answer"])
            if isinstance(event.get("answer"), str):
                answer_parts.append(event["answer"])

    return {
        "events": events,
        "outputs": outputs,
        "answer": "".join(answer_parts) if answer_parts else None,
    }


def main() -> int:
    load_env_files()
    args = parse_args()
    api_key = normalize_api_key(os.getenv("DIFY_API_KEY", ""))
    if not api_key:
        print_json({"ok": False, "error": "Missing DIFY_API_KEY environment variable"})
        return 2

    try:
        inputs = load_inputs(args)
    except Exception as exc:
        print_json({"ok": False, "error": f"Invalid inputs: {exc}"})
        return 2

    body = {
        "inputs": inputs,
        "response_mode": args.response_mode,
        "user": args.user,
    }
    request = urllib.request.Request(
        workflow_url(args.base_url),
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "")
            if args.response_mode == "streaming" or "text/event-stream" in content_type:
                parsed = parse_sse(raw)
            else:
                parsed = json.loads(raw.decode("utf-8"))
            print_json({"ok": True, "request": body, "result": parsed})
            return 0
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print_json({"ok": False, "status": exc.code, "error": detail})
        return 1
    except Exception as exc:
        print_json({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
