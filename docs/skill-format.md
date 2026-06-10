# Skill 目录规范（Cursor create-skill 兼容）

小马办公室自定义 Skill 存放在工作区 `skills/` 目录，格式与 [Cursor Agent Skill](https://cursor.com/docs/agent/skills) 一致，便于从外部批量导入成熟 Skill。

## 目录结构

```
skills/
├── README.md                 # 首次启动时自动生成
├── my-skill/                 # 目录名 = skill id（小写字母、数字、连字符）
│   ├── SKILL.md              # 必需
│   ├── reference.md          # 可选，注入 prompt 时附带
│   ├── examples.md           # 可选，注入 prompt 时附带
│   └── scripts/              # 可选，脚本库（小马用 run_skill_script 执行，可联网）
└── code-review/
    ├── SKILL.md
    └── reference.md
```

## SKILL.md 格式

```markdown
---
name: my-skill
description: 一句话说明用途与触发场景（第三人称，含 WHEN）
disable-model-invocation: true
---

# 指令标题

正文：步骤、清单、模板……
```

### frontmatter 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 展示名称，≤64 字符 |
| `description` | 是 | 列表展示用的一句话描述 |
| `disable-model-invocation` | 否 | 兼容 Cursor 字段；小马办公室通过勾选小马 Skill 启用 |

## 批量导入

1. 将外部 Skill 目录复制到 `WORKSPACE_DIR/skills/`（默认 `文档/PonyOffice工作区/skills/`）
2. 确保每个目录内有 `SKILL.md`，目录名符合 id 规则
3. 打开应用 → 设置 → Skill 库 → **重新扫描**

`reference.md` / `examples.md` 会在小马执行时一并注入 system prompt。

### scripts/ 脚本库

勾选该 Skill 的小马会获得 `run_skill_script` 工具，可执行 `scripts/` 下脚本（支持 `.py` `.js` `.sh` `.ps1` 等），**允许发起网络请求**（如 `fetch`、`requests`、`axios`）。

```json
{
  "skill": "my-skill",
  "script": "fetch_data.py",
  "args": ["--city", "北京"]
}
```

脚本在 Skill 目录内运行；依赖请在本机安装（或通过 `.env` 的 `EXTRA_PATH` / `MCP_PYTHON` 指定解释器）。

## 项目内模板

可复制仓库 `assets/skill-template/` 到工作区作为起点。

## 与预置 Skill 的关系

- **预置 Skill**（邮件草稿、工作总结、归档命名）：存在应用数据库，`builtin: true`
- **自定义 Skill**：仅存在于工作区 `skills/` 目录，应用内编辑器只改写 `SKILL.md`，不删除同目录下的 `reference.md` 等文件
