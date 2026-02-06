#!/usr/bin/env python3
"""Background worker: calls ripperdoc CLI to handle user requests with real tool execution."""
import json
import os
import sys
import time
import subprocess

SESSIONS_DIR = "/var/lib/ripperdoc/sessions"


def load_session(sid):
    with open(os.path.join(SESSIONS_DIR, sid + ".json")) as f:
        return json.load(f)


def save_session(session):
    with open(os.path.join(SESSIONS_DIR, session["id"] + ".json"), "w") as f:
        json.dump(session, f)


def call_ripperdoc(message):
    """Call the real ripperdoc CLI with -p flag for non-interactive execution."""
    try:
        result = subprocess.run(
            ["ripperdoc", "-p", message, "--yolo", "--output-format", "text"],
            capture_output=True,
            text=True,
            timeout=300,
            cwd="/root",
        )
        output = result.stdout.strip()
        if not output:
            output = result.stderr.strip() or "Ripperdoc completed with no output."
        return output
    except subprocess.TimeoutExpired:
        return "**Error:** Request timed out after 5 minutes."
    except FileNotFoundError:
        return None  # ripperdoc not installed
    except Exception as e:
        return "**Error:** " + str(e)


def call_ripperdoc_json(message):
    """Call ripperdoc with JSON output to capture tool usage details."""
    try:
        result = subprocess.run(
            ["ripperdoc", "-p", message, "--yolo", "--output-format", "json"],
            capture_output=True,
            text=True,
            timeout=300,
            cwd="/root",
        )
        stdout = result.stdout.strip()
        if not stdout:
            return None

        data = json.loads(stdout)
        # Extract text response and tool usage from JSON output
        text_parts = []
        tools_used = []

        if isinstance(data, dict):
            # Single response object
            items = [data]
        elif isinstance(data, list):
            items = data
        else:
            return stdout

        for item in items:
            if item.get("type") == "text" or "text" in item:
                text_parts.append(item.get("text", ""))
            elif item.get("type") == "tool_use":
                tools_used.append({
                    "name": item.get("name", "unknown"),
                    "input": item.get("input", {}),
                })
            elif item.get("type") == "result":
                text_parts.append(item.get("result", ""))
            elif item.get("content"):
                # Anthropic-style response
                for block in item["content"]:
                    if block.get("type") == "text":
                        text_parts.append(block["text"])

        response = "\n".join(text_parts).strip()
        if tools_used:
            tool_summary = "\n\n---\n**Tools used:** " + ", ".join(
                t["name"] for t in tools_used
            )
            response += tool_summary

        return response if response else None
    except (json.JSONDecodeError, subprocess.TimeoutExpired, Exception):
        return None


def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    sid = sys.argv[1]
    session = load_session(sid)

    # Get the last user message
    last_msg = ""
    for m in reversed(session["messages"]):
        if m["role"] == "user":
            last_msg = m["content"]
            break

    if not last_msg:
        session["working"] = False
        save_session(session)
        return

    try:
        # Try JSON output first for richer responses
        text = call_ripperdoc_json(last_msg)

        # Fall back to text output
        if text is None:
            text = call_ripperdoc(last_msg)

        # If ripperdoc is not installed at all, show error
        if text is None:
            text = "**Error:** `ripperdoc` command not found. Please install ripperdoc: `pip3 install ripperdoc`"

        session["messages"].append({
            "role": "assistant",
            "content": text,
            "timestamp": time.time(),
        })
    except Exception as e:
        session["messages"].append({
            "role": "assistant",
            "content": "**Error:** " + str(e),
            "timestamp": time.time(),
        })
    finally:
        session["working"] = False
        save_session(session)


if __name__ == "__main__":
    main()
