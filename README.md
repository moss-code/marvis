# 小马办公室（Pony Office）

Marvis 式多 Agent 桌面应用：用户向「领队马」下达任务，领队马把活儿派给数据马、报表马等职能小马，协作过程在一间暖色极简风的 2D 侧视办公室里以动画演出。详见 [prd.md](./prd.md)。

## 技术栈

Electron + Vite（electron-vite）· React · TypeScript · PixiJS v8 · Vercel AI SDK · Node SQLite · MCP · SheetJS · ECharts

## 快速开始

```bash
npm install
npm run make-demo      # 生成演示数据 assets/demo/电信业务数据.xlsx
copy .env.example .env # 填写国内模型的 OpenAI 兼容接口配置
npm run dev
```

## 使用

1. 点击「上传数据」选择 `assets/demo/电信业务数据.xlsx`
2. 对领队马说：「分析各营业厅业务表现并出一份报告」
3. 观看小马们协作；报告完成后点击白板查看，可导出 PDF
4. 右侧任务日志可查看派单内容、SQL 语句与工具调用明细

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发模式 |
| `npm run typecheck` | 主/渲染两端类型检查 |
| `npm run make-demo` | 重新生成演示 xlsx |
