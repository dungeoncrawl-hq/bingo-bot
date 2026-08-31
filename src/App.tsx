import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewChallengePage from './pages/NewChallengePage';
import EditChallengePage from './pages/EditChallengePage';
import BoardPage from './pages/BoardPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/new" element={<NewChallengePage />} />
          <Route path="/c/:slug" element={<BoardPage />} />
          <Route path="/c/:slug/edit" element={<EditChallengePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
