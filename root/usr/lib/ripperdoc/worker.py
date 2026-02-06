#!/usr/bin/env python3
"""Background worker: reads session + ~/.ripperdoc.json, calls LLM API, writes response."""
import json
import os
import sys
import time
import urllib.request
import urllib.error

SESSIONS_DIR = "/var/lib/ripperdoc/sessions"
CONFIG_FILE = os.path.expanduser("~/.ripperdoc.json")


def load_session(sid):
    with open(os.path.join(SESSIONS_DIR, sid + ".json")) as f:
        return json.load(f)


def save_session(session):
    with open(os.path.join(SESSIONS_DIR, session["id"] + ".json"), "w") as f:
        json.dump(session, f)


def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    return {}


# ---- LLM API callers (stdlib only) ----

def call_anthropic(messages, model, api_key, api_base, max_tokens):
    system = "You are Ripperdoc, a helpful AI coding assistant running on an OpenWrt router. Be concise and helpful."
    api_msgs = [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] in ("user", "assistant")]
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": api_msgs,
    }).encode()
    url = (api_base.rstrip("/") if api_base else "https://api.anthropic.com") + "/v1/messages"
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data["content"][0]["text"]


def call_openai_compat(messages, model, api_key, api_base, max_tokens):
    system = "You are Ripperdoc, a helpful AI coding assistant running on an OpenWrt router. Be concise and helpful."
    api_msgs = [{"role": "system", "content": system}]
    api_msgs += [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] in ("user", "assistant")]
    body = json.dumps({"model": model, "messages": api_msgs, "max_tokens": max_tokens}).encode()
    url = (api_base.rstrip("/") if api_base else "https://api.openai.com") + "/v1/chat/completions"
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + api_key,
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    sid = sys.argv[1]
    session = load_session(sid)
    cfg = load_config()

    profile = (cfg.get("model_profiles") or {}).get("default") or {}
    provider = profile.get("provider", "anthropic")
    model = profile.get("model", "claude-sonnet-4-20250514")
    api_key = profile.get("api_key", "")
    api_base = profile.get("api_base") or None
    max_tokens = profile.get("max_tokens") or 4096

    try:
        if not api_key:
            raise ValueError("No API key configured. Go to Services > Ripperdoc > Configuration to set it.")

        if provider == "anthropic":
            text = call_anthropic(session["messages"], model, api_key, api_base, max_tokens)
        else:
            text = call_openai_compat(session["messages"], model, api_key, api_base, max_tokens)

        session["messages"].append({"role": "assistant", "content": text, "timestamp": time.time()})
    except Exception as e:
        session["messages"].append({"role": "assistant", "content": "**Error:** " + str(e), "timestamp": time.time()})
    finally:
        session["working"] = False
        save_session(session)


if __name__ == "__main__":
    main()
