# Skill 目录说明

本目录遵循 [Cursor Agent Skill](https://cursor.com/docs/agent/skills) 规范，可直接从外部批量复制成熟 Skill 目录。

## 目录结构

```
skills/
├── README.md                 # 本说明
├── my-skill/                 # 每个 Skill 一个子目录（目录名 = skill id）
│   ├── SKILL.md              # 必需：YAML frontmatter + 指令正文
│   ├── reference.md          # 可选：详细参考
│   ├── examples.md           # 可选：示例
│   └── scripts/              # 可选：工具脚本（保留供人工使用，不自动执行）
└── another-skill/
    └── SKILL.md
```

## SKILL.md frontmatter

```yaml
---
name: my-skill
description: 一句话说明用途与触发场景（第三人称）
disable-model-invocation: true
---
```

复制外部 Skill 后重启应用或打开设置页即可自动扫描。预置 Skill 仍在应用数据库中，与本目录无关。
