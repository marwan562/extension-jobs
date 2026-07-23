import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';

const Overview = lazy(() => import('../pages/Overview'));
const Jobs = lazy(() => import('../pages/Jobs'));
const Applications = lazy(() => import('../pages/Applications'));
const ResumeStudio = lazy(() => import('../pages/ResumeStudio'));
const Campaigns = lazy(() => import('../pages/Campaigns'));
const Approvals = lazy(() => import('../pages/Approvals'));
const Connectors = lazy(() => import('../pages/Connectors'));
const Activity = lazy(() => import('../pages/Activity'));
const Settings = lazy(() => import('../pages/Settings'));

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('extension-jobs-theme') ?? 'system');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('extension-jobs-theme', theme);
  }, [theme]);
  return (
    <Shell theme={theme} onThemeChange={setTheme}>
      <Suspense fallback={<div className="route-loader" aria-label="Loading page"><div className="loader" /></div>}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:jobId" element={<Jobs />} />
          <Route path="applications" element={<Applications />} />
          <Route path="applications/:applicationId" element={<Applications />} />
          <Route path="resume-studio" element={<ResumeStudio />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="connectors" element={<Connectors />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<Settings theme={theme} onThemeChange={setTheme} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

