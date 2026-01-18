/**
 * 认证上下文 (Authentication Context)
 * 
 * 提供用户登录状态管理和认证相关方法
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { trackFeature } from '../../utils/analytics';

// API 基础配置
const API_BASE = '/api/v1';

// 用户类型
interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  is_admin: boolean;
}

// 认证上下文类型
interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  getAuthHeaders: () => HeadersInit;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token 存储 key
const TOKEN_KEY = 'voc_auth_token';
const USER_KEY = 'voc_auth_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化时从 localStorage 恢复状态
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        // 清除无效数据
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    
    setIsLoading(false);
  }, []);

  // 获取带认证头的 headers
  function getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }
    return headers;
  }

  // 登录
  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.detail || '登录失败' };
      }
      
      if (data.success) {
        setToken(data.access_token);
        setUser(data.user);
        
        // 保存到 localStorage
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        
        // 追踪登录事件
        trackFeature('user_login', { email: data.user.email });
        
        // 尝试通知 Chrome 插件（如果已安装）
        notifyExtension(data.access_token, data.user);
        
        return { success: true };
      } else {
        return { success: false, error: '登录失败' };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '登录失败';
      return { success: false, error: message };
    }
  }

  // 登出
  function logout() {
    // 追踪登出事件
    if (user) {
      trackFeature('user_logout', { email: user.email });
    }
    
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    // 通知插件登出
    notifyExtensionLogout();
  }
  
  // 通知 Chrome 插件登录成功
  function notifyExtension(authToken: string, authUser: User) {
    try {
      // 使用 externally_connectable 通信
      // 需要获取插件 ID，这里通过尝试发送消息来实现
      const extensionId = getExtensionId();
      if (extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(extensionId, {
          type: 'WEB_AUTH_LOGIN',
          token: authToken,
          user: authUser
        }, (response: unknown) => {
          if (chrome.runtime.lastError) {
            console.log('[Auth] Extension not available:', chrome.runtime.lastError.message);
          } else {
            console.log('[Auth] Extension notified of login:', response);
          }
        });
      }
    } catch (e) {
      console.log('[Auth] Could not notify extension');
    }
  }
  
  // 通知 Chrome 插件登出
  function notifyExtensionLogout() {
    try {
      const extensionId = getExtensionId();
      if (extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(extensionId, {
          type: 'WEB_AUTH_LOGOUT'
        }, () => {
          if (chrome.runtime.lastError) {
            // Ignore errors
          }
        });
      }
    } catch (e) {
      console.log('[Auth] Could not notify extension logout');
    }
  }
  
  // 获取插件 ID（从 localStorage 或尝试检测）
  function getExtensionId(): string | null {
    // 可以硬编码插件 ID，或从某处获取
    // 在开发环境中，插件 ID 可能会变化
    // 这里返回 null，让用户在插件和网页分别登录
    // 如果需要同步，可以在这里返回固定的插件 ID
    return localStorage.getItem('voc_extension_id');
  }

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!token && !!user,
    login,
    logout,
    getAuthHeaders
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook 用于获取认证上下文
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
