import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Toaster } from './components/ui/sonner';

// Lazy load route components
const LoginPage = lazy(() => import('./components/LoginPage'));
const TaskList = lazy(() => import('./components/TaskList').then(m => ({ default: m.TaskList })));
const ReviewReader = lazy(() => import('./components/ReviewReader').then(m => ({ default: m.ReviewReader })));
const ReportPage = lazy(() => import('./components/ReportPage').then(m => ({ default: m.ReportPage })));
const WorkbenchPage = lazy(() => import('./components/WorkbenchPage').then(m => ({ default: m.default })));
const AnalysisResultPage = lazy(() => import('./components/AnalysisResultPage').then(m => ({ default: m.default })));

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">加载中...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* 登录页 - 无需认证 */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* 受保护的路由 - 需要登录 */}
              <Route path="/" element={<ProtectedRoute><TaskList /></ProtectedRoute>} />
              <Route path="/analysis" element={<ProtectedRoute><WorkbenchPage /></ProtectedRoute>} />
              <Route path="/analysis/:projectId" element={<ProtectedRoute><AnalysisResultPage /></ProtectedRoute>} />
              <Route path="/reader/:taskId" element={<ProtectedRoute><ReviewReader /></ProtectedRoute>} />
              <Route path="/report/:asin" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
              <Route path="/report/:asin/:reportId" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
              
              {/* 默认重定向 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </AuthProvider>
  );
}