#!/usr/bin/env python3
"""Background worker: reads a session, calls the LLM API, writes the response back."""
import json
import os
import sys
import time
import subprocess
import urllib.request
import urllib.error

SESSIONS_DIR = "/var/lib/ripperdoc/sessions"


def uci_get(key, default=""):
    try:
        r = subprocess.run(["uci", "get", key], capture_output=True, text=True, timeout=5)
        v = r.stdout.strip()
        return v if v else default
    except Exception:
        return default


def load_session(sid):
    with open(os.path.join(SESSIONS_DIR, sid + ".json")) as f:
        return json.load(f)


def save_session(session):
    with open(os.path.join(SESSIONS_DIR, session["id"] + ".json"), "w") as f:
        json.dump(session, f)


# ---- LLM API callers (stdlib only, no pip dependencies) ----

def call_anthropic(messages, model, api_key):
    system = "You are Ripperdoc, a helpful AI coding assistant running on an OpenWrt router. Be concise and helpful."
    api_msgs = [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] in ("user", "assistant")]
    body = json.dumps({"model": model, "max_tokens": 4096, "system": system, "messages": api_msgs}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data["content"][0]["text"]


def call_openai_compat(messages, model, api_key, base_url="https://api.openai.com"):
    system = "You are Ripperdoc, a helpful AI coding assistant running on an OpenWrt router. Be concise and helpful."
    api_msgs = [{"role": "system", "content": system}]
    api_msgs += [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] in ("user", "assistant")]
    body = json.dumps({"model": model, "messages": api_msgs}).encode()
    req = urllib.request.Request(base_url.rstrip("/") + "/v1/chat/completions", data=body, headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + api_key,
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


PROVIDER_MAP = {
    "claude":   ("anthropic", "anthropic_api_key", None),
    "gpt":      ("openai",    "openai_api_key",    "https://api.openai.com"),
    "o1":       ("openai",    "openai_api_key",    "https://api.openai.com"),
    "o3":       ("openai",    "openai_api_key",    "https://api.openai.com"),
    "deepseek": ("openai",    "deepseek_api_key",  "https://api.deepseek.com"),
    "moonshot": ("openai",    "kimi_api_key",      "https://api.moonshot.cn"),
    "kimi":     ("openai",    "kimi_api_key",      "https://api.moonshot.cn"),
    "qwen":     ("openai",    "qwen_api_key",      "https://dashscope.aliyuncs.com/compatible-mode"),
    "glm":      ("openai",    "glm_api_key",       "https://open.bigmodel.cn/api/paas"),
}


def detect_provider(model):
    for prefix, info in PROVIDER_MAP.items():
        if model.startswith(prefix):
            return info
    return ("openai", "openai_api_key", "https://api.openai.com")


def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    sid = sys.argv[1]
    session = load_session(sid)

    model = uci_get("ripperdoc.config.model", "claude-sonnet-4-20250514")
    custom = uci_get("ripperdoc.config.custom_model")
    if custom:
        model = custom

    provider_type, api_key_field, base_url = detect_provider(model)
    api_key = uci_get("ripperdoc.api_keys." + api_key_field)

    try:
        if not api_key:
            raise ValueError("No API key configured for " + api_key_field + ". Please set it in Services > Ripperdoc > Configuration.")

        if provider_type == "anthropic":
            text = call_anthropic(session["messages"], model, api_key)
        else:
            text = call_openai_compat(session["messages"], model, api_key, base_url)

        session["messages"].append({"role": "assistant", "content": text, "timestamp": time.time()})
    except Exception as e:
        session["messages"].append({"role": "assistant", "content": "**Error:** " + str(e), "timestamp": time.time()})
    finally:
        session["working"] = False
        save_session(session)


if __name__ == "__main__":
    main()
