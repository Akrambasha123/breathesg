import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ShieldAlert, ShieldCheck, FileText, Activity, Clock, 
  ArrowRight, RefreshCw, Layers, CheckCircle2, XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

function Dashboard({ currentCompany, currentUser, API_BASE_URL }) {
  const [batches, setBatches] = useState([]);
  const [stats, setStats] = useState({
    totalRecords: 0,
    flaggedRecords: 0,
    approvedRecords: 0,
    lockedRecords: 0,
    readinessRate: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Batches
      const batchRes = await axios.get(`${API_BASE_URL}/batches/`, {
        headers: { 'X-Company-ID': currentCompany.id }
      });
      setBatches(batchRes.data);

      // 2. Fetch Normalized Records for Stats
      const recordsRes = await axios.get(`${API_BASE_URL}/normalized-records/`, {
        headers: { 'X-Company-ID': currentCompany.id }
      });
      const records = recordsRes.data;
      
      const total = records.length;
      const flagged = records.filter(r => r.status === 'flagged').length;
      const approved = records.filter(r => r.status === 'approved').length;
      const locked = records.filter(r => r.status === 'locked').length;
      const readiness = total > 0 ? Math.round(((approved + locked) / total) * 100) : 0;

      setStats({
        totalRecords: total,
        flaggedRecords: flagged,
        approvedRecords: approved,
        lockedRecords: locked,
        readinessRate: readiness
      });
    } catch (err) {
      console.error("Error loading dashboard metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentCompany) {
      fetchDashboardData();
    }
  }, [currentCompany]);

  return (
    <div className="flex flex-col gap-8">
      
      {/* Welcome Banner */}
      <div className="flex justify-between items-center bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-2xl font-bold">Metrics Console</h2>
          <p className="text-slate-400 text-sm mt-1">Tenant Overview for <span className="font-semibold text-emerald-400">{currentCompany?.name}</span></p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="p-2 rounded-lg bg-slate-900 border border-slate-850 hover:bg-slate-800 transition-colors flex items-center gap-2 text-xs font-semibold text-slate-300"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Total Records */}
        <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Rows</span>
            <h3 className="text-2xl font-extrabold mt-1 text-slate-100">{stats.totalRecords}</h3>
          </div>
          <div className="bg-slate-900 p-2.5 rounded-lg text-slate-400 border border-slate-850">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Flagged Records */}
        <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Flagged Suspect</span>
            <h3 className="text-2xl font-extrabold mt-1 text-orange-500">{stats.flaggedRecords}</h3>
          </div>
          <div className="bg-orange-500/10 p-2.5 rounded-lg text-orange-500 border border-orange-500/10">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        {/* Approved Records */}
        <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Approved</span>
            <h3 className="text-2xl font-extrabold mt-1 text-emerald-400">{stats.approvedRecords}</h3>
          </div>
          <div className="bg-emerald-500/10 p-2.5 rounded-lg text-emerald-400 border border-emerald-500/10">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Locked Records */}
        <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Audit Locked</span>
            <h3 className="text-2xl font-extrabold mt-1 text-cyan-400">{stats.lockedRecords}</h3>
          </div>
          <div className="bg-cyan-500/10 p-2.5 rounded-lg text-cyan-400 border border-cyan-500/10">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Audit Readiness rate */}
        <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-4 flex items-center justify-between col-span-1 sm:col-span-2 lg:col-span-1">
          <div>
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Audit Readiness</span>
            <h3 className="text-2xl font-extrabold mt-1 text-emerald-500">{stats.readinessRate}%</h3>
          </div>
          <div className="bg-emerald-500/10 p-2.5 rounded-lg text-emerald-500 border border-emerald-500/10">
            <Activity className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Main Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Upload batches log */}
        <div className="bg-slate-950/20 border border-slate-800 rounded-2xl p-6 lg:col-span-2 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-lg font-bold text-slate-200">Ingestion History Logs</h3>
            <Link to="/upload" className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
              File Ingestion Hub <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">Querying active ingestion ledgers...</div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl flex flex-col items-center gap-3">
              <FileText className="w-10 h-10 text-slate-600" />
              <div>
                <p className="text-sm font-semibold text-slate-400">No data batches ingested</p>
                <p className="text-xs text-slate-500 mt-1">Ingest your first SAP, Utility, or travel payload to start.</p>
              </div>
              <Link to="/upload" className="mt-2 py-1.5 px-3 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-bold rounded-lg text-emerald-400">
                Upload Data
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase">
                    <th className="py-2.5 px-3">Batch ID</th>
                    <th className="py-2.5 px-3">Data Source</th>
                    <th className="py-2.5 px-3">File Name</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Ingestion Stats</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300 font-medium">
                  {batches.map(b => (
                    <tr key={b.id} className="hover:bg-slate-850/20">
                      <td className="py-3 px-3 font-semibold text-slate-400">#{b.id}</td>
                      <td className="py-3 px-3">
                        <span className="bg-slate-900 text-slate-300 border border-slate-850 px-2.5 py-0.5 rounded-full">
                          {b.data_source_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-200">{b.file_name}</td>
                      <td className="py-3 px-3">
                        {b.status === 'completed' ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Normalised
                          </span>
                        ) : b.status === 'failed' ? (
                          <span className="text-red-400 flex items-center gap-1 text-[11px] font-bold" title={b.summary?.error}>
                            <XCircle className="w-3.5 h-3.5" /> Failed
                          </span>
                        ) : (
                          <span className="text-slate-400 flex items-center gap-1 text-[11px] font-bold">
                            <Clock className="w-3.5 h-3.5" /> Processing
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        {b.status === 'completed' && (
                          <span>
                            {b.summary?.total_rows} rows parsed ({b.summary?.flagged_rows} flagged)
                          </span>
                        )}
                        {b.status === 'failed' && (
                          <span className="text-red-400/80 line-clamp-1 max-w-[150px]" title={b.summary?.error}>
                            {b.summary?.error || 'Unknown error'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono">
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Side: Compliance Workspace Quicklinks */}
        <div className="bg-slate-950/20 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 justify-between">
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-3">Audit Readiness Tasks</h3>
            
            <div className="flex flex-col gap-3.5">
              
              <div className="bg-slate-950/30 border border-slate-850 p-3.5 rounded-xl flex items-start gap-3">
                <div className="bg-orange-500/10 p-2 rounded-lg text-orange-500 border border-orange-500/10 shrink-0">
                  <ShieldAlert className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-300">Flagged Records Pending Analyst Resolution</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    There are <span className="text-orange-500 font-bold">{stats.flaggedRecords} records</span> flagged due to date parsing mismatches, unit anomalies, or billing cycle drifts.
                  </p>
                  <Link to="/review?status=flagged" className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mt-2">
                    Resolve Flags <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              <div className="bg-slate-950/30 border border-slate-850 p-3.5 rounded-xl flex items-start gap-3">
                <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-500 border border-emerald-500/10 shrink-0">
                  <CheckCircle2 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-300">Lock Approved Batches for Third-Party Verification</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    There are <span className="text-emerald-400 font-bold">{stats.approvedRecords} records</span> approved but not locked. Managers must review and seal these prior to external audit.
                  </p>
                  <Link to="/review?status=approved" className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mt-2">
                    Lock Approved Data <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

            </div>
          </div>

          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-850 flex flex-col gap-1.5 mt-4">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Auditor Mode Enabled
            </h4>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              External verifiers see a read-only audit log ledger containing hashes and diff logs of corrections, mapping a clear lineage back to original raw payloads.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}

export default Dashboard;
