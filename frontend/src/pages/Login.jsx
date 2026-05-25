import React, { useState } from 'react';
import axios from 'axios';
import { Database, ShieldAlert, Sparkles, Plus, Check } from 'lucide-react';

function Login({ onLogin, companies, setCompanies, API_BASE_URL }) {
  const [selectedUser, setSelectedUser] = useState('analyst_demo');
  const [selectedRole, setSelectedRole] = useState('analyst');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const handleSimulateSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Switch to first company if none is selected
    let companyId = selectedCompanyId;
    if (!companyId && companies.length > 0) {
      companyId = companies[0].id;
    }
    
    try {
      const response = await axios.get(`${API_BASE_URL}/users/me/`, {
        params: {
          user: selectedUser,
          role: selectedRole,
          company_id: companyId
        }
      });
      
      const company = companies.find(c => c.id === parseInt(companyId)) || companies[0];
      onLogin(response.data, company);
    } catch (err) {
      console.error("Authentication failed:", err);
      alert("Simulated authentication failed to configure tenant databases.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    
    try {
      const response = await axios.post(`${API_BASE_URL}/companies/`, {
        name: newCompanyName.trim()
      });
      
      setCompanies([...companies, response.data]);
      setSelectedCompanyId(response.data.id);
      setNewCompanyName('');
      setShowAddCompany(false);
    } catch (err) {
      console.error("Failed to create company:", err);
      alert("Company creation failed. Name might already be taken.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-6">
        
        {/* Banner Logo */}
        <div className="text-center flex flex-col items-center gap-2">
          <div className="bg-emerald-500/10 p-3.5 rounded-2xl border border-emerald-500/20 text-emerald-500 inline-block">
            <Database className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              BreatheSG
            </h1>
            <p className="text-xs text-slate-400 mt-1">Enterprise ESG Data Ingestion & Audit Platform</p>
          </div>
        </div>

        {/* Multi-tenancy Simulation console */}
        <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-850 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" /> Tenancy Simulation Sandbox
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Configure your testing credentials. This simulated gateway allows switches across tenant profiles without requiring corporate SSO federation setup.
          </p>
        </div>

        <form onSubmit={handleSimulateSubmit} className="flex flex-col gap-4">
          
          {/* User selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Simulated User Profile</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="analyst_demo">analyst_demo (Compliance Officer)</option>
              <option value="manager_demo">manager_demo (Sustainability Manager)</option>
              <option value="auditor_test">auditor_test (PricewaterhouseCoopers Audit Team)</option>
            </select>
          </div>

          {/* Role selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">System Role Scope</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'analyst', label: 'Analyst' },
                { id: 'manager', label: 'Manager' },
                { id: 'auditor', label: 'Auditor' }
              ].map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRole(role.id)}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                    selectedRole === role.id 
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' 
                    : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-800'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Client Company switcher */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-400">Client Tenant (Company)</label>
              <button
                type="button"
                onClick={() => setShowAddCompany(!showAddCompany)}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> New Tenant
              </button>
            </div>

            {!showAddCompany ? (
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                {companies.length === 0 && <option value="">No companies registered. Click 'New Tenant'...</option>}
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter tenant name..."
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleCreateCompany}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-100 p-2 rounded-lg transition-colors flex items-center justify-center"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || (companies.length === 0 && !showAddCompany)}
            className="mt-4 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 font-bold rounded-lg text-sm text-slate-100 shadow-md shadow-emerald-950/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {loading ? 'Initializing Database Connection...' : 'Ingest Simulation Terminal'}
          </button>
        </form>

        <div className="text-[10px] text-slate-500 text-center leading-relaxed flex items-center justify-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
          Enterprise internal gateway prototype environment.
        </div>

      </div>
    </div>
  );
}

export default Login;
