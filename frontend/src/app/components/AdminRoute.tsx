/**
 * 管理员路由守卫组件
 * 
 * 保护需要管理员权限的路由，非管理员用户会被重定向到首页
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // 加载中显示 loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">验证登录状态...</p>
        </div>
      </div>
    );
  }

  // 未登录，重定向到登录页
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 已登录但不是管理员，重定向到首页
  if (!user?.is_admin) {
    return <Navigate to="/home/home" replace />;
  }

  // 已登录且是管理员，渲染子组件
  return <>{children}</>;
}

export default AdminRoute;
