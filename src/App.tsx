import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewChallengePage from './pages/NewChallengePage';
import EditChallengePage from './pages/EditChallengePage';
import BoardPage from './pages/BoardPage';
import SetupGuidePage from './pages/SetupGuidePage';
import AboutPage from './pages/AboutPage';
import AccountPage from './pages/AccountPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminParticipantsPage from './pages/AdminParticipantsPage';
import AdminGrowthPage from './pages/AdminGrowthPage';
import AdminRandomizeSettingsPage from './pages/AdminRandomizeSettingsPage';
import AdminDiscordTemplatesPage from './pages/AdminDiscordTemplatesPage';
import AdminAccountsPage from './pages/AdminAccountsPage';
import AdminFeedbackPage from './pages/AdminFeedbackPage';

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-stone-950 text-stone-100">
        <Header />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/new" element={<NewChallengePage />} />
            <Route path="/c/:slug" element={<BoardPage />} />
            <Route path="/c/:slug/edit" element={<EditChallengePage />} />
            <Route path="/c/:slug/setup" element={<SetupGuidePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/dungeon-master-admin" element={<AdminDashboardPage />} />
            <Route path="/dungeon-master-admin/participants" element={<AdminParticipantsPage />} />
            <Route path="/dungeon-master-admin/growth" element={<AdminGrowthPage />} />
            <Route path="/dungeon-master-admin/randomize-settings" element={<AdminRandomizeSettingsPage />} />
            <Route path="/dungeon-master-admin/discord-templates" element={<AdminDiscordTemplatesPage />} />
            <Route path="/dungeon-master-admin/accounts" element={<AdminAccountsPage />} />
            <Route path="/dungeon-master-admin/feedback" element={<AdminFeedbackPage />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  )
}

export default App
