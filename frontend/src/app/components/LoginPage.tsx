/**
 * 登录页面 - 洞察大王新设计
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { EyeIcon } from './EyeIcon';
import { Toaster, toast } from 'sonner';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // 获取重定向路径
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('请输入邮箱和密码');
      return;
    }

    if (password.length < 6) {
      toast.error('密码长度不能少于6位');
      return;
    }

    setIsLoading(true);
    
    try {
      const result = await login(email, password);
      
      if (result.success) {
        const name = email.split('@')[0];
        toast.success('登录成功', {
          description: `欢迎回来，${name}！`,
        });
        navigate(from, { replace: true });
      } else {
        toast.error('登录失败', {
          description: result.error || '请检查邮箱和密码',
        });
      }
    } catch (err: any) {
      toast.error('登录失败', {
        description: err.message || '请稍后重试',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <div className="h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <EyeIcon className="w-16 h-16" withBackground />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">洞察大王</h1>
            <p className="text-slate-600">欢迎回来，让我们一起探索用户的声音</p>
          </div>

          {/* Login Form */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <form onSubmit={handleSubmit}>
              <div className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-900 mb-2">
                    邮箱
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                    placeholder="your@email.com"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-900 mb-2">
                    密码
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                    placeholder="输入你的密码"
                  />
                </div>
                <Button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {isLoading ? '登录中...' : '登录'}
                </Button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="text-center mt-6 space-y-2">
            <p className="text-sm text-slate-400">
              © 2026 洞察大王 · 让数据洞察触手可及
            </p>
            <p className="text-xs text-slate-400">
              <a 
                href="https://beian.miit.gov.cn" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-rose-500 transition-colors"
              >
                浙ICP备2020037731号-3
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default LoginPage;
