/** 修复报表马 LLM 产出的 HTML/JS 常见问题，避免 ECharts 整段脚本静默失败 */

/** 常见笔误：colorStops 对象用 ] 闭合而非 } */
export function fixChartScriptErrors(code: string): string {
  return code
    .replace(/color:'(rgba\([^']+\))'\]/g, "color:'$1'}")
    .replace(/color:"(rgba\([^"]+\))"\]/g, 'color:"$1"}')
}

export function validateChartScript(code: string): string | null {
  try {
    new Function(code)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * 把正文里的 inline script 挪到末尾，并在 DOM 就绪后执行。
 */
export function normalizeReportBody(body: string): string {
  const scripts: string[] = []
  const html = body.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, code: string) => {
    scripts.push(fixChartScriptErrors(code.trim()))
    return ''
  })

  if (scripts.length === 0) return body

  const merged = scripts.join('\n\n')
  const syntaxErr = validateChartScript(merged)
  const boot = syntaxErr ? wrapChartInitsSafely(merged) : merged

  return `${html.trim()}
<script>
(function () {
  function bootCharts() {
    ${boot}
    document.querySelectorAll('.chart').forEach(function (el) {
      var inst = typeof echarts !== 'undefined' ? echarts.getInstanceByDom(el) : null;
      if (inst) inst.resize();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootCharts);
  } else {
    bootCharts();
  }
  window.addEventListener('resize', function () {
    document.querySelectorAll('.chart').forEach(function (el) {
      var inst = typeof echarts !== 'undefined' ? echarts.getInstanceByDom(el) : null;
      if (inst) inst.resize();
    });
  });
})();
</script>`
}

/** 从已存完整 HTML 提取正文并重新清洗 */
export function repairStoredReportHtml(_title: string, html: string): string {
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/i)
  if (!bodyMatch) return html
  const scripts: string[] = []
  const htmlOnly = bodyMatch[1].replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, code: string) => {
    scripts.push(code.trim())
    return ''
  })
  const body = scripts.length
    ? `${htmlOnly.trim()}\n<script>${scripts.join('\n\n')}</script>`
    : htmlOnly.trim()
  return body
}

/** 将 var chartN = echarts.init... 拆成独立 try 块 */
function wrapChartInitsSafely(code: string): string {
  const fixed = fixChartScriptErrors(code)
  const parts = fixed.split(/(?=\/\/ =+ 图表|var chart\d+ = echarts\.init)/)
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `try {\n${part}\n} catch (e) { console.error('chart block failed', e); }`)
    .join('\n')
}
