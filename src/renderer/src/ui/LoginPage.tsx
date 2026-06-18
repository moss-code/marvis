import { useState } from 'react'

interface LoginPageProps {
  onLogin(name: string): void
}

export function LoginPage({ onLogin }: LoginPageProps): React.JSX.Element {
  const [account, setAccount] = useState('demo@wingai.cn')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!account.trim() || !password.trim()) return
    setLoading(true)
    window.setTimeout(() => onLogin(account.split('@')[0] || '企业用户'), 450)
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">翼</span>
          <div>
            <strong>翼智小马</strong>
            <span>多智能体协同平台</span>
          </div>
        </div>

        <div className="login-hero-copy">
          <span className="eyebrow">ENTERPRISE AI WORKFORCE</span>
          <h1>让每一种企业能力，<br />都成为可交付的数字员工。</h1>
          <p>统一接入、智能编排、可信运行。将数字员工、知识与业务工具组合为可授权、可计量、可复制的企业解决方案。</p>
          <div className="login-capabilities">
            <span>多智能体协同</span>
            <span>云网安一体化</span>
            <span>全链路审计</span>
          </div>
        </div>

        <div className="login-proof">
          <div><strong>3</strong><span>首批行业方案</span></div>
          <div><strong>99.9%</strong><span>平台可用性目标</span></div>
          <div><strong>100%</strong><span>关键操作留痕</span></div>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-heading">
            <span className="login-status"><i /> 企业服务已就绪</span>
            <h2>欢迎回来</h2>
            <p>登录您的企业工作空间</p>
          </div>

          <label className="login-field">
            <span>企业账号</span>
            <input value={account} onChange={(event) => setAccount(event.target.value)} placeholder="请输入企业邮箱或账号" autoFocus />
          </label>
          <label className="login-field">
            <span>密码</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="演示环境输入任意密码" />
          </label>

          <div className="login-options">
            <label><input type="checkbox" defaultChecked /> 保持登录</label>
            <button type="button">忘记密码？</button>
          </div>

          <button className="login-submit" disabled={!account.trim() || !password.trim() || loading}>
            {loading ? '正在进入工作空间...' : '登录企业控制台'}
          </button>
          <button className="login-sso" type="button" onClick={() => onLogin('内部试点用户')}>使用统一身份认证登录</button>

          <p className="login-demo-note">演示账号已预填，输入任意密码即可体验</p>
        </form>

        <footer className="login-footer">数据不出域 · 最小权限 · 可信审计 · 中国电信云网能力支撑</footer>
      </section>
    </main>
  )
}
