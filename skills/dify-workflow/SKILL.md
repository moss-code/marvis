---
name: dify-workflow
description: Call a configured Dify Workflow through a bundled Python script and summarize the returned result. Use when a pony needs to delegate a task to the local Dify workflow API, pass a query or inputs object, and interpret Dify streaming or blocking responses.
---

# Dify Workflow

Use this skill when a task should be handled by the configured Dify Workflow.

## How to call

Run `scripts/call_dify_workflow.py` with the `run_skill_script` tool. Do not look for a separate `run_dify_workflow` tool; this skill's supported execution path is the bundled Python script.

Required environment:

- `DIFY_API_KEY`: Dify app key. Do not write the key into prompts, logs, or files.

The script automatically loads `.env` via `python-dotenv` when available. If
`python-dotenv` is not installed, it uses a built-in `.env` parser. It searches
`DIFY_DOTENV_PATH`, the current working directory, and parent directories.

Optional environment:

- `DIFY_BASE_URL`: defaults to `http://localhost/v1`
- `DIFY_USER`: defaults to `abc-123`
- `DIFY_RESPONSE_MODE`: defaults to `streaming`
- `MCP_PYTHON`: absolute Python interpreter path for Pony Office script execution, for example `C:\Program Files\Python313\python.exe`

Typical tool input:

```json
{
  "skill": "dify-workflow",
  "script": "call_dify_workflow.py",
  "args": ["--query", "用户问题或任务描述"]
}
```

For custom workflow inputs, pass a JSON object:

```json
{
  "skill": "dify-workflow",
  "script": "call_dify_workflow.py",
  "args": ["--inputs-json", "{\"query\":\"用户问题或任务描述\"}"]
}
```

## Result handling

The script prints JSON to stdout. Do not require a fixed business schema. Read the returned `events`, `outputs`, `answer`, `text`, or raw payload fields and summarize the useful result in Chinese.

If the script reports `ok: false`, explain the error honestly and do not invent a Dify result.
