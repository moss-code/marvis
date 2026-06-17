const DISPATCH_HINTS = [
  '派单',
  '派给',
  '报表马',
  '数据马',
  '文件马',
  '文书马',
  'dispatch',
  '生成报告并',
  '让小马',
  '交给.*马'
]

export function detectDispatchPrompt(prompt: string): boolean {
  const text = prompt.toLowerCase()
  return DISPATCH_HINTS.some((hint) => {
    if (hint.includes('.*')) return new RegExp(hint, 'i').test(prompt)
    return text.includes(hint.toLowerCase())
  })
}

export function dispatchPromptWarning(): string {
  return '检测到提示词涉及派单或多小马协作。这类任务请改用「方案任务」模式，以便领队马正确调度数字员工。'
}
