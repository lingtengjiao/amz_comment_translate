import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Toaster } from './components/ui/sonner';

// Lazy load route components
const LoginPage = lazy(() => import('./components/LoginPage'));
const HomePage = lazy(() => import('./components/home/HomePage'));
const TaskList = lazy(() => import('./components/TaskList').then(m => ({ default: m.TaskList })));
const ReviewReader = lazy(() => import('./components/ReviewReader').then(m => ({ default: m.ReviewReader })));
const ReportPage = lazy(() => import('./components/ReportPage').then(m => ({ default: m.ReportPage })));
const WorkbenchPage = lazy(() => import('./components/WorkbenchPage').then(m => ({ default: m.default })));
const AnalysisResultPage = lazy(() => import('./components/AnalysisResultPage').then(m => ({ default: m.default })));
const AnalyticsDashboard = lazy(() => import('./components/analytics/AnalyticsDashboard').then(m => ({ default: m.default })));
const ProductBoardPage = lazy(() => import('./components/product-board/ProductBoardPage').then(m => ({ default: m.default })));
const RufusDetailPage = lazy(() => import('./components/rufus/RufusDetailPage').then(m => ({ default: m.default })));
const PrivacyPolicyPage = lazy(() => import('./components/PrivacyPolicyPage').then(m => ({ default: m.default })));
const ShareViewPage = lazy(() => import('./components/share/ShareViewPage').then(m => ({ default: m.default })));

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
    <HelmetProvider>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
              {/* 公开页面 - 无需认证 */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/docs/PRIVACY" element={<PrivacyPolicyPage />} />
              <Route path="/share/:token" element={<ShareViewPage />} />
              
              {/* 受保护的路由 - 需要登录 */}
              <Route path="/" element={<Navigate to="/home/home" replace />} />
              <Route path="/home/:section" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
              <Route path="/tasks" element={<ProtectedRoute><TaskList /></ProtectedRoute>} />
              <Route path="/analysis" element={<ProtectedRoute><WorkbenchPage /></ProtectedRoute>} />
              <Route path="/analysis/:projectId" element={<ProtectedRoute><AnalysisResultPage /></ProtectedRoute>} />
              <Route path="/reader/:taskId" element={<ProtectedRoute><ReviewReader /></ProtectedRoute>} />
              <Route path="/report/:asin" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
              <Route path="/report/:asin/:reportId" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
              <Route path="/product-board/:collectionId" element={<ProtectedRoute><ProductBoardPage /></ProtectedRoute>} />
              <Route path="/rufus/session/:sessionId" element={<ProtectedRoute><RufusDetailPage /></ProtectedRoute>} />
              
              {/* 管理员专属路由 */}
              <Route path="/analytics" element={<AdminRoute><AnalyticsDashboard /></AdminRoute>} />
              
              {/* 默认重定向 */}
              <Route path="*" element={<Navigate to="/home/home" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </AuthProvider>
    </HelmetProvider>
  );
}