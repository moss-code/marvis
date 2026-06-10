import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** 办公室工作区目录（filesystem MCP、报告归档、自定义 Skill 根路径） */
export function getWorkspaceDir(): string {
  const fromEnv = process.env.WORKSPACE_DIR?.trim()
  const dir = fromEnv || join(app.getPath('documents'), 'PonyOffice工作区')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 自定义 Skill 存放目录（WORKSPACE_DIR/skills） */
export function getSkillsDir(): string {
  const dir = join(getWorkspaceDir(), 'skills')
  mkdirSync(dir, { recursive: true })
  return dir
}
