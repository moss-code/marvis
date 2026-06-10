import ReactDOM from 'react-dom/client'
import { App } from './App'
import './theme.css'

// 注：不用 StrictMode —— 它在 dev 下双挂载会让 Pixi Application 重复初始化
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
