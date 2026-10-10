import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

// The dashboard is the first screen; every other page loads when it is opened (and is precached
// by the service worker, so this costs nothing offline).
const NewSet = lazy(() => import('./pages/NewSet'));
const SavedSets = lazy(() => import('./pages/SavedSets'));
const SetDetail = lazy(() => import('./pages/SetDetail'));
const QuestionBank = lazy(() => import('./pages/QuestionBank'));
const SimulationHome = lazy(() => import('./pages/SimulationHome'));
const Simulation = lazy(() => import('./pages/Simulation'));
const ScoreReport = lazy(() => import('./pages/ScoreReport'));
const Progress = lazy(() => import('./pages/Progress'));
const ApiKeys = lazy(() => import('./pages/ApiKeys'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Help = lazy(() => import('./pages/Help'));
const PrintView = lazy(() => import('./pages/PrintView'));
const Practice = lazy(() => import('./pages/Practice'));
const Review = lazy(() => import('./pages/Review'));
const ImportSet = lazy(() => import('./pages/ImportSet'));
const ImportPhoto = lazy(() => import('./pages/ImportPhoto'));
const Kamus = lazy(() => import('./pages/Kamus'));
const Kartu = lazy(() => import('./pages/Kartu'));

/** Full-screen pages (exam, practice, print) wait for their code on their own; the rest under the layout's menu. */
const page = (el: ReactNode) => <Suspense fallback={null}>{el}</Suspense>;

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/print/:setId" element={page(<PrintView />)} />
        <Route path="/cat/:attemptId" element={page(<Simulation />)} />
        <Route path="/practice/:attemptId" element={page(<Practice />)} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<NewSet />} />
          <Route path="sets" element={<SavedSets />} />
          <Route path="sets/:setId" element={<SetDetail />} />
          <Route path="bank" element={<QuestionBank />} />
          <Route path="bank/import" element={<ImportPhoto />} />
          <Route path="simulation" element={<SimulationHome />} />
          <Route path="results/:attemptId" element={<ScoreReport />} />
          <Route path="review" element={<Review />} />
          <Route path="progress" element={<Progress />} />
          <Route path="keys" element={<ApiKeys />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="kamus" element={<Kamus />} />
          <Route path="kartu" element={<Kartu />} />
          <Route path="help" element={<Help />} />
          <Route path="import" element={<ImportSet />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
