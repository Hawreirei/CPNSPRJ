import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import NewSet from './pages/NewSet';
import SavedSets from './pages/SavedSets';
import SetDetail from './pages/SetDetail';
import QuestionBank from './pages/QuestionBank';
import SimulationHome from './pages/SimulationHome';
import Simulation from './pages/Simulation';
import ScoreReport from './pages/ScoreReport';
import Progress from './pages/Progress';
import ApiKeys from './pages/ApiKeys';
import SettingsPage from './pages/Settings';
import Help from './pages/Help';
import PrintView from './pages/PrintView';
import Practice from './pages/Practice';
import Review from './pages/Review';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/print/:setId" element={<PrintView />} />
        <Route path="/cat/:attemptId" element={<Simulation />} />
        <Route path="/practice/:attemptId" element={<Practice />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<NewSet />} />
          <Route path="sets" element={<SavedSets />} />
          <Route path="sets/:setId" element={<SetDetail />} />
          <Route path="bank" element={<QuestionBank />} />
          <Route path="simulation" element={<SimulationHome />} />
          <Route path="results/:attemptId" element={<ScoreReport />} />
          <Route path="review" element={<Review />} />
          <Route path="progress" element={<Progress />} />
          <Route path="keys" element={<ApiKeys />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help" element={<Help />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
