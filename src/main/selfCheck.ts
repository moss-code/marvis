import { generateText } from 'ai'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SelfCheckItem } from '../shared/types'
import { listDataTables, listMcpServers } from './db'
import { getEffectiveEnvPath } from './envPath'
import { getModel } from './llm'
import { testServer } from './mcp'
import { getEchartsRuntimeSize } from './reports'
import { getWorkspaceDir } from './workspace'

const MODEL_TIMEOUT_MS = 5000

async function checkEnv(): Promise<SelfCheckItem> {
  const name = '环境配置'
  try {
    const key = process.env.OPENAI_API_KEY?.trim()
    const base = process.env.OPENAI_BASE_URL?.trim()
    const model = process.env.MODEL?.trim()
    const pathHint = getEffectiveEnvPath()
    if (!key) {
      return {
        name,
        ok: false,
        detail: `OPENAI_API_KEY 未配置，复制 .env.example 为 .env 并填写（当前生效路径：${pathHint}）`
      }
    }
    if (!base) {
      return {
        name,
        ok: false,
        detail: `OPENAI_BASE_URL 未配置（当前生效路径：${pathHint}）`
      }
    }
    if (!model) {
      return {
        name,
        ok: false,
        detail: `MODEL 未配置（当前生效路径：${pathHint}）`
      }
    }
    return {
      name,
      ok: true,
      detail: `已配置 MODEL=${model}，生效路径：${pathHint}`
    }
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err)
    }
  }
}

async function checkModel(): Promise<SelfCheckItem> {
  const name = '模型连通'
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
    try {
      await generateText({
        model: getModel(),
        prompt: '回复OK',
        abortSignal: controller.signal
      })
      return { name, ok: true, detail: '模型响应正常' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const timedOut = msg.includes('abort') || msg.includes('Abort')
      return {
        name,
        ok: false,
        detail: timedOut ? '请求超时：检查网络或 OPENAI_BASE_URL' : msg
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err)
    }
  }
}

async function checkTables(): Promise<SelfCheckItem> {
  const name = '数据表'
  try {
    const tables = listDataTables()
    if (tables.length === 0) {
      return {
        name,
        ok: false,
        detail: '没有数据表：npm run make-demo 后在应用内上传'
      }
    }
    return {
      name,
      ok: true,
      detail: `已入库 ${tables.length} 张表（如 ${tables[0]?.table.replace(/^data_/, '')}）`
    }
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err)
    }
  }
}

async function checkMcp(): Promise<SelfCheckItem> {
  const name = 'MCP servers'
  try {
    const servers = listMcpServers()
    const failures: string[] = []
    for (const s of servers) {
      const st = await testServer(s.id)
      if (st.state === 'error') {
        failures.push(`${s.name} 连接失败：${st.error ?? '未知错误'}`)
      }
    }
    if (failures.length > 0) {
      return { name, ok: false, detail: failures.join('；') }
    }
    return {
      name,
      ok: true,
      detail: `${servers.length} 个 server 均已连接`
    }
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err)
    }
  }
}

async function checkWorkspace(): Promise<SelfCheckItem> {
  const name = '工作区'
  try {
    const dir = getWorkspaceDir()
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.pony-probe-${Date.now()}.tmp`)
    writeFileSync(probe, 'ok', 'utf8')
    unlinkSync(probe)
    return { name, ok: true, detail: `目录可写：${dir}` }
  } catch (err) {
    return {
      name,
      ok: false,
      detail: `目录不可写：检查权限（${err instanceof Error ? err.message : String(err)}）`
    }
  }
}

async function checkEcharts(): Promise<SelfCheckItem> {
  const name = '报告引擎'
  try {
    const size = getEchartsRuntimeSize()
    if (size <= 100_000) {
      return {
        name,
        ok: false,
        detail: `echarts 资源缺失或过小（${size} 字节）：npm i 后重试`
      }
    }
    return { name, ok: true, detail: `ECharts runtime ${Math.round(size / 1024)} KB` }
  } catch (err) {
    return {
      name,
      ok: false,
      detail: `echarts 资源缺失：npm i 后重试（${err instanceof Error ? err.message : String(err)}）`
    }
  }
}

/** 串行演示自检，单项异常不导致整体抛错 */
export async function runSelfCheck(): Promise<SelfCheckItem[]> {
  const checks = [
    checkEnv,
    checkModel,
    checkTables,
    checkMcp,
    checkWorkspace,
    checkEcharts
  ]
  const items: SelfCheckItem[] = []
  for (const fn of checks) {
    try {
      items.push(await fn())
    } catch (err) {
      items.push({
        name: '未知检查',
        ok: false,
        detail: err instanceof Error ? err.message : String(err)
      })
    }
  }
  return items
}
