/** 只读 SQL 守卫：仅放行单条 SELECT / WITH 查询 */
export function guardSelect(sql: string): string {
  const cleaned = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .replace(/;+\s*$/, '')
  if (cleaned.length === 0) throw new Error('SQL 为空')
  if (cleaned.includes(';')) throw new Error('只允许单条 SQL 语句')
  if (!/^(select|with)\b/i.test(cleaned)) throw new Error('只允许 SELECT 查询')
  const forbidden =
    /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex|replace|truncate)\b/i
  const m = cleaned.match(forbidden)
  if (m) throw new Error(`检测到禁用关键词 ${m[0].toUpperCase()}，只允许只读查询`)
  return cleaned
}
