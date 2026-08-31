import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewChallengePage from './pages/NewChallengePage';
import EditChallengePage from './pages/EditChallengePage';
import BoardPage from './pages/BoardPage';
import SetupGuidePage from './pages/SetupGuidePage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-stone-950 text-stone-100">
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/new" element={<NewChallengePage />} />
          <Route path="/c/:slug" element={<BoardPage />} />
          <Route path="/c/:slug/edit" element={<EditChallengePage />} />
          <Route path="/c/:slug/setup" element={<SetupGuidePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
