import type { AutomationJobDraft, AutomationJobTemplate } from '../../shared/types'

const defaultNotify = {
  inApp: true,
  desktop: true,
  wechat: false,
  onSuccess: true,
  onFailure: true
} as const

export const AUTOMATION_TEMPLATES: AutomationJobTemplate[] = [
  {
    id: 'tpl-daily-report',
    name: '每日经营日报',
    description: '自动汇总营业厅经营指标，生成日报与关键结论',
    icon: 'chart',
    draft: {
      mode: 'solution',
      solutionId: 'business-insight',
      prompt: '分析各营业厅昨日与近 7 日业务表现，生成经营日报，包含 KPI、排名与改进建议。',
      schedule: {
        kind: 'periodic',
        periodicUnit: 'daily',
        hour: 9,
        minute: 0,
        timezone: 'Asia/Shanghai'
      },
      ignoreRisk: false,
      notify: defaultNotify
    }
  },
  {
    id: 'tpl-marketing-list',
    name: '营销名单筛选',
    description: '按规则筛选高价值客户，输出画像摘要与触达要点',
    icon: 'users',
    draft: {
      mode: 'solution',
      solutionId: 'smart-marketing',
      prompt: '基于现有客户数据筛选高价值营销目标，输出分层名单、画像标签与触达话术要点。',
      schedule: {
        kind: 'periodic',
        periodicUnit: 'weekly',
        weekday: 1,
        hour: 10,
        minute: 0,
        timezone: 'Asia/Shanghai'
      },
      ignoreRisk: false,
      notify: defaultNotify
    }
  },
  {
    id: 'tpl-duty-inspection',
    name: '数据班组值班巡检',
    description: '定时检查存储过程与巡检项状态，汇总异常与待办',
    icon: 'shield',
    draft: {
      mode: 'solution',
      solutionId: 'business-insight',
      prompt:
        '作为数据班组值班巡检任务：检查当前已导入数据的完整性，汇总关键指标是否异常，列出需人工跟进项与建议处理顺序。',
      schedule: {
        kind: 'periodic',
        periodicUnit: 'daily',
        hour: 9,
        minute: 0,
        timezone: 'Asia/Shanghai'
      },
      ignoreRisk: false,
      notify: defaultNotify
    }
  },
  {
    id: 'tpl-invoice-summary',
    name: '发票报销汇总',
    description: '汇总报销明细，按类别统计并输出待审清单',
    icon: 'invoice',
    draft: {
      mode: 'solution',
      solutionId: 'general-office',
      prompt: '汇总本周期发票报销明细，按类别与金额统计，输出待审核清单与异常项说明。',
      schedule: {
        kind: 'periodic',
        periodicUnit: 'weekly',
        weekday: 5,
        hour: 17,
        minute: 0,
        timezone: 'Asia/Shanghai'
      },
      ignoreRisk: false,
      notify: defaultNotify
    }
  },
  {
    id: 'tpl-audit-order',
    name: '调账工单稽核',
    description: '按稽核规则检查调账工单，输出异常与退回建议',
    icon: 'audit',
    draft: {
      mode: 'solution',
      solutionId: 'audit-automation',
      prompt: '稽核本批次调账工单，检查调账类型与备注是否一致，输出异常清单与退回说明。',
      schedule: {
        kind: 'periodic',
        periodicUnit: 'weekly',
        weekday: 1,
        hour: 10,
        minute: 0,
        timezone: 'Asia/Shanghai'
      },
      ignoreRisk: true,
      notify: defaultNotify
    }
  },
  {
    id: 'tpl-approval-reminder',
    name: '审批超时提醒',
    description: '主 Agent 汇总待审批与超时项，推送提醒摘要',
    icon: 'reminder',
    draft: {
      mode: 'agent',
      prompt:
        '根据今日日期，汇总可能存在的待审批与超时事项（基于通用办公场景），生成简洁提醒摘要与 3-5 条待办建议。',
      schedule: {
        kind: 'periodic',
        periodicUnit: 'daily',
        hour: 8,
        minute: 30,
        timezone: 'Asia/Shanghai'
      },
      skillIds: [],
      mcpServerIds: [],
      ignoreRisk: false,
      notify: defaultNotify
    }
  }
]

export function listAutomationTemplates(): AutomationJobTemplate[] {
  return AUTOMATION_TEMPLATES
}

export function templateToDraft(templateId: string, name?: string): AutomationJobDraft | null {
  const tpl = AUTOMATION_TEMPLATES.find((t) => t.id === templateId)
  if (!tpl) return null
  return {
    name: name ?? tpl.name,
    ...tpl.draft
  }
}
