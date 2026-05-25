import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import axios from 'axios';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/UploadPage';
import ReviewDashboard from './pages/ReviewDashboard';
import { Database, Shield, LogOut, FileSpreadsheet, ListTodo, Building } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : 'http://127.0.0.1:8000/api';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentCompany, setCurrentCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  
  useEffect(() => {
    // Check if session has stored user
    const storedUser = localStorage.getItem('esg_user');
    const storedCompany = localStorage.getItem('esg_company');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
    if (storedCompany) {
      setCurrentCompany(JSON.parse(storedCompany));
    }
    
    // Fetch initial companies list
    axios.get(`${API_BASE_URL}/companies/`)
      .then(res => {
        setCompanies(res.data);
        if (res.data.length > 0 && !storedCompany) {
          setCurrentCompany(res.data[0]);
          localStorage.setItem('esg_company', JSON.stringify(res.data[0]));
        }
      })
      .catch(err => {
        console.error("Error fetching companies:", err);
      });
  }, []);

  const handleLogin = (user, company) => {
    setCurrentUser(user);
    setCurrentCompany(company);
    localStorage.setItem('esg_user', JSON.stringify(user));
    localStorage.setItem('esg_company', JSON.stringify(company));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('esg_user');
  };

  const handleCompanyChange = (companyId) => {
    const selected = companies.find(c => c.id === parseInt(companyId));
    if (selected) {
      setCurrentCompany(selected);
      localStorage.setItem('esg_company', JSON.stringify(selected));
      // Reload page to re-fetch data for new tenant context
      window.location.reload();
    }
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} companies={companies} setCompanies={setCompanies} API_BASE_URL={API_BASE_URL} />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        {/* Navigation Header */}
        <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              <Database className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                BreatheSG
              </h1>
              <p className="text-xs text-slate-400">Enterprise ESG Ingestion & Audit Platform</p>
            </div>
          </div>

          <nav className="flex items-center gap-6">
            <Link to="/" className="text-sm font-medium hover:text-emerald-400 transition-colors flex items-center gap-2">
              <Building className="w-4 h-4" /> Dashboard
            </Link>
            <Link to="/upload" className="text-sm font-medium hover:text-emerald-400 transition-colors flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Ingestion Console
            </Link>
            <Link to="/review" className="text-sm font-medium hover:text-emerald-400 transition-colors flex items-center gap-2">
              <Shield className="w-4 h-4" /> Audit Console
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            {/* Tenant Switcher */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <span className="font-semibold text-slate-500">Tenant:</span>
              <select 
                value={currentCompany?.id || ''} 
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="bg-transparent font-medium focus:outline-none border-none text-slate-200"
              >
                {companies.map(c => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">{c.name}</option>
                ))}
              </select>
            </div>

            {/* User Session Profile */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-300">{currentUser.username}</p>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                  {currentUser.role_display}
                </span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 rounded-lg bg-slate-900 border border-slate-850 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard currentCompany={currentCompany} currentUser={currentUser} API_BASE_URL={API_BASE_URL} />} />
            <Route path="/upload" element={<UploadPage currentCompany={currentCompany} currentUser={currentUser} API_BASE_URL={API_BASE_URL} />} />
            <Route path="/review" element={<ReviewDashboard currentCompany={currentCompany} currentUser={currentUser} API_BASE_URL={API_BASE_URL} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        
        <footer className="py-4 text-center border-t border-slate-800 text-[10px] text-slate-500">
          Prototype Environment &bull; Local MySQL Backend Connected &bull; BreatheSG &copy; 2026
        </footer>
      </div>
    </Router>
  );
}

export default App;
