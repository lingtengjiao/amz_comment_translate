import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toaster } from './components/ui/sonner';

// Lazy load route components
const TaskList = lazy(() => import('./components/TaskList').then(m => ({ default: m.TaskList })));
const ReviewReader = lazy(() => import('./components/ReviewReader').then(m => ({ default: m.ReviewReader })));
const ReportPage = lazy(() => import('./components/ReportPage').then(m => ({ default: m.ReportPage })));
const WorkbenchPage = lazy(() => import('./components/WorkbenchPage').then(m => ({ default: m.default })));

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
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<TaskList />} />
            <Route path="/analysis" element={<WorkbenchPage />} />
            <Route path="/reader/:taskId" element={<ReviewReader />} />
            <Route path="/report/:asin" element={<ReportPage />} />
            <Route path="/report/:asin/:reportId" element={<ReportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}