import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ShieldAlert, ShieldCheck, CheckCircle2, XCircle, Clock,
  Filter, Search, Edit3, Lock, Check, X, Eye, 
  History, Calendar, Hash, ArrowRightLeft, FileText, ChevronRight
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

function ReviewDashboard({ currentCompany, currentUser, API_BASE_URL }) {
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  
  // Filtering states
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [sourceFilter, setSourceFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  
  // Action state modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editDate, setEditDate] = useState('');
  
  const [comment, setComment] = useState('');
  const [decisionsList, setDecisionsList] = useState([]);
  const [auditLogsList, setAuditLogsList] = useState([]);
  const [rightPanelTab, setRightPanelTab] = useState('detail'); // detail, history
  
  const [loading, setLoading] = useState(true);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/normalized-records/`, {
        headers: { 'X-Company-ID': currentCompany.id },
        params: {
          status: statusFilter,
          source_type: sourceFilter,
          scope_category: scopeFilter
        }
      });
      setRecords(response.data);
      
      // Auto-select first record if none is selected
      if (response.data.length > 0) {
        // If selectedRecord exists, keep it selected, else pick first
        const currentSelectedId = selectedRecord?.id;
        const exists = response.data.find(r => r.id === currentSelectedId);
        if (exists) {
          setSelectedRecord(exists);
        } else {
          loadRecordDetails(response.data[0]);
        }
      } else {
        setSelectedRecord(null);
      }
    } catch (err) {
      console.error("Failed to load records:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecordDetails = async (record) => {
    setSelectedRecord(record);
    setRightPanelTab('detail');
    setComment('');
    
    try {
      // 1. Fetch Review Decisions
      const decRes = await axios.get(`${API_BASE_URL}/review-decisions/`, {
        params: { record_id: record.id }
      });
      setDecisionsList(decRes.data);

      // 2. Fetch Audit Logs for this record
      const auditRes = await axios.get(`${API_BASE_URL}/audit-logs/`, {
        headers: { 'X-Company-ID': currentCompany.id },
        params: { target_model: 'NormalizedRecord', target_id: String(record.id) }
      });
      setAuditLogsList(auditRes.data);
    } catch (err) {
      console.error("Error loading record trackers:", err);
    }
  };

  useEffect(() => {
    if (currentCompany) {
      fetchRecords();
    }
  }, [currentCompany, statusFilter, sourceFilter, scopeFilter]);

  const handleOpenEditModal = () => {
    if (!selectedRecord) return;
    setEditQty(selectedRecord.quantity || '');
    setEditUnit(selectedRecord.unit || '');
    setEditDate(selectedRecord.activity_date || '');
    setEditModalOpen(true);
  };

  const handleSaveCorrection = async (e) => {
    e.preventDefault();
    if (!selectedRecord) return;

    try {
      const response = await axios.put(`${API_BASE_URL}/normalized-records/${selectedRecord.id}/`, {
        quantity: editQty,
        unit: editUnit,
        activity_date: editDate
      }, {
        headers: {
          'X-Company-ID': currentCompany.id,
          'X-Simulated-User': currentUser.username
        }
      });

      setEditModalOpen(false);
      // Reload details and list
      loadRecordDetails(response.data);
      fetchRecords();
    } catch (err) {
      console.error("Manual override correction failed:", err);
      alert(err.response?.data?.error || "Error applying corrections.");
    }
  };

  const handleDecision = async (decision) => {
    if (!selectedRecord) return;
    if (!comment.trim()) {
      alert("Please provide a reasoning comment for this workflow action.");
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/normalized-records/${selectedRecord.id}/make_decision/`, {
        decision,
        comment: comment.trim()
      }, {
        headers: {
          'X-Company-ID': currentCompany.id,
          'X-Simulated-User': currentUser.username
        }
      });
      
      setComment('');
      loadRecordDetails(response.data);
      fetchRecords();
    } catch (err) {
      console.error("Decision submission failed:", err);
      alert(err.response?.data?.error || "Error submitting review decision.");
    }
  };

  const handleLock = async () => {
    if (!selectedRecord) return;
    if (currentUser.role !== 'manager' && currentUser.role !== 'admin') {
      alert("Access Denied: Only sustainability managers can lock approved datasets.");
      return;
    }

    if (!window.confirm("Locking this record permanently seals it against edits for audits. Continue?")) {
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/normalized-records/${selectedRecord.id}/lock_record/`, {}, {
        headers: {
          'X-Company-ID': currentCompany.id,
          'X-Simulated-User': currentUser.username
        }
      });
      
      loadRecordDetails(response.data);
      fetchRecords();
    } catch (err) {
      console.error("Locking failed:", err);
      alert(err.response?.data?.error || "Error locking approved record.");
    }
  };

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-140px)] min-h-[500px]">
      
      {/* Search and Filters panel */}
      <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2 text-slate-300 text-sm font-bold uppercase tracking-wider">
          <Filter className="w-4 h-4 text-emerald-500" /> Filter Workspaces
        </div>
        
        <div className="flex flex-wrap items-center gap-4 text-xs">
          
          {/* Status filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-2 py-1 rounded-lg">
            <span className="text-slate-500 font-bold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-300 font-medium focus:outline-none"
            >
              <option value="">All States</option>
              <option value="pending">Pending Review</option>
              <option value="flagged">Flagged Anomaly</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="locked">Audit Locked</option>
            </select>
          </div>

          {/* Source Type filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-2 py-1 rounded-lg">
            <span className="text-slate-500 font-bold">Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-transparent text-slate-300 font-medium focus:outline-none"
            >
              <option value="">All Formats</option>
              <option value="SAP_CSV">SAP (CSV)</option>
              <option value="UTILITY_CSV">Utility Portals (CSV)</option>
              <option value="TRAVEL_API">Concur (JSON)</option>
            </select>
          </div>

          {/* Scope Category filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-2 py-1 rounded-lg">
            <span className="text-slate-500 font-bold">Scope:</span>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="bg-transparent text-slate-300 font-medium focus:outline-none"
            >
              <option value="">All Scopes</option>
              <option value="Scope 1">Scope 1 (Direct)</option>
              <option value="Scope 2">Scope 2 (Indirect)</option>
              <option value="Scope 3">Scope 3 (Value Chain)</option>
            </select>
          </div>

        </div>
      </div>

      {/* Main Workspace split panel layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        
        {/* Left Side: Normalized Record Table */}
        <div className="bg-slate-950/20 border border-slate-800 rounded-2xl overflow-hidden flex flex-col lg:col-span-2">
          
          <div className="bg-slate-950/40 px-4 py-3 border-b border-slate-800 flex justify-between items-center shrink-0">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Normalized Records ({records.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[250px]">
            {loading ? (
              <div className="py-24 text-center text-slate-500 text-xs">Querying ESG database schemas...</div>
            ) : records.length === 0 ? (
              <div className="py-24 text-center text-slate-500 text-xs">No records found matching filters.</div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase sticky top-0 bg-slate-900/90 backdrop-blur z-10">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Activity Type</th>
                      <th className="py-2.5 px-3">Original Qty</th>
                      <th className="py-2.5 px-3">Normalized Qty</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Anomalies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-slate-300 font-medium">
                    {records.map(r => (
                      <tr 
                        key={r.id} 
                        onClick={() => loadRecordDetails(r)}
                        className={`hover:bg-slate-850/40 cursor-pointer transition-colors ${
                          selectedRecord?.id === r.id ? 'bg-slate-850/60 border-l-2 border-emerald-500' : ''
                        }`}
                      >
                        <td className="py-3 px-3 font-mono text-slate-400">{r.activity_date || 'Missing Date'}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-200 capitalize">{r.activity_type.replace(/_/g, ' ')}</div>
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">{r.scope_category} &bull; {r.source_type}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 font-mono">
                          {r.quantity ? parseFloat(r.quantity).toLocaleString() : 'N/A'} {r.unit}
                        </td>
                        <td className="py-3 px-3 text-slate-100 font-mono font-semibold">
                          {r.normalized_quantity ? parseFloat(r.normalized_quantity).toLocaleString() : '0.00'} {r.normalized_unit}
                        </td>
                        <td className="py-3 px-3">
                          {r.status === 'locked' ? (
                            <span className="text-cyan-400 bg-cyan-400/5 px-2 py-0.5 rounded border border-cyan-500/10 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                              <ShieldCheck className="w-3 h-3" /> Locked
                            </span>
                          ) : r.status === 'approved' ? (
                            <span className="text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                              <CheckCircle2 className="w-3 h-3" /> Approved
                            </span>
                          ) : r.status === 'rejected' ? (
                            <span className="text-red-400 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                              <XCircle className="w-3 h-3" /> Rejected
                            </span>
                          ) : r.status === 'flagged' ? (
                            <span className="text-orange-400 bg-orange-500/5 px-2 py-0.5 rounded border border-orange-500/10 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide animate-pulse">
                              <ShieldAlert className="w-3 h-3" /> Flagged
                            </span>
                          ) : (
                            <span className="text-slate-400 bg-slate-500/5 px-2 py-0.5 rounded border border-slate-500/10 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {r.validation_flags?.length > 0 ? (
                            <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              {r.validation_flags.length} Flags
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px]">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Traceability & Action Panels */}
        <div className="bg-slate-950/20 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          
          {/* Header Panel Switcher */}
          <div className="bg-slate-950/40 border-b border-slate-800 px-4 py-2 flex justify-between shrink-0">
            <button
              onClick={() => setRightPanelTab('detail')}
              className={`py-1.5 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                rightPanelTab === 'detail' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Auditor Panel
            </button>
            <button
              onClick={() => setRightPanelTab('history')}
              className={`py-1.5 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                rightPanelTab === 'history' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Audit Trail ({auditLogsList.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            
            {!selectedRecord ? (
              <div className="py-24 text-center text-slate-500 text-xs">Select a record on the left to inspect lineages...</div>
            ) : rightPanelTab === 'detail' ? (
              <div className="flex flex-col gap-4">
                
                {/* Visual Lineage Flow chart */}
                <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-850 flex items-center justify-around text-center gap-1.5">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">1. Raw Source</p>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded inline-block mt-0.5">
                      {selectedRecord.source_type}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 mt-2" />
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">2. Standard</p>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/10 px-2 py-0.5 rounded inline-block mt-0.5">
                      {selectedRecord.scope_category}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 mt-2" />
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">3. Verification</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded inline-block mt-0.5 border capitalize ${
                      selectedRecord.status === 'locked' ? 'bg-cyan-500/10 border-cyan-500/10 text-cyan-400' :
                      selectedRecord.status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-400' :
                      'bg-slate-900 border-slate-850 text-slate-400'
                    }`}>
                      {selectedRecord.status}
                    </span>
                  </div>
                </div>

                {/* Validation Badges */}
                {selectedRecord.validation_flags?.length > 0 && (
                  <div className="bg-orange-500/5 border border-orange-500/20 p-3 rounded-xl flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> Pipeline Validation Flag(s)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedRecord.validation_flags.map((flag, idx) => (
                        <span key={idx} className="bg-orange-500/10 border border-orange-500/10 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded capitalize">
                          {flag.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Side-by-Side Raw vs. Normalized Data Grid */}
                <div className="bg-slate-950/40 rounded-xl border border-slate-850 overflow-hidden">
                  <div className="bg-slate-900 px-3 py-2 border-b border-slate-850 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-500" /> Lineage Line Item Mapping
                  </div>
                  
                  <div className="grid grid-cols-2 text-xs divide-x divide-slate-850">
                    
                    {/* Left: Original raw properties */}
                    <div className="p-3 flex flex-col gap-2.5">
                      <span className="text-[10px] font-extrabold uppercase text-slate-500">Unstructured CSV/JSON</span>
                      {selectedRecord.raw_payload ? Object.entries(selectedRecord.raw_payload).map(([k, v]) => (
                        <div key={k} className="leading-tight">
                          <p className="text-[10px] text-slate-500 font-semibold font-mono">{k}</p>
                          <p className="text-slate-300 font-bold text-xs truncate" title={String(v)}>{String(v)}</p>
                        </div>
                      )) : <div className="text-slate-500 text-[10px]">No raw payload trace found.</div>}
                    </div>

                    {/* Right: Normalized structural properties */}
                    <div className="p-3 flex flex-col gap-2.5 bg-slate-900/10">
                      <span className="text-[10px] font-extrabold uppercase text-emerald-500">Standardized Target Schema</span>
                      
                      <div>
                        <p className="text-[10px] text-slate-500 font-semibold font-mono">activity_date</p>
                        <p className="text-slate-300 font-bold text-xs flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {selectedRecord.activity_date}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-500 font-semibold font-mono">normalized_quantity</p>
                        <p className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                          <Hash className="w-3.5 h-3.5" /> {selectedRecord.normalized_quantity ? parseFloat(selectedRecord.normalized_quantity).toLocaleString() : '0.00'} {selectedRecord.normalized_unit}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-500 font-semibold font-mono">normalized_unit</p>
                        <p className="text-slate-300 font-bold text-xs">{selectedRecord.normalized_unit}</p>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-500 font-semibold font-mono">scope_category</p>
                        <p className="text-slate-300 font-bold text-xs">{selectedRecord.scope_category}</p>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-500 font-semibold font-mono">activity_type</p>
                        <p className="text-slate-300 font-bold text-xs capitalize">{selectedRecord.activity_type.replace(/_/g, ' ')}</p>
                      </div>

                    </div>

                  </div>
                </div>

                {/* Audit Workflow Actions */}
                {selectedRecord.status !== 'locked' ? (
                  <div className="bg-slate-950/30 p-3 rounded-xl border border-slate-800 flex flex-col gap-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Workflow Decision Center</span>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={handleOpenEditModal}
                        className="flex-1 py-1.5 px-3 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Analyst Correction
                      </button>

                      {selectedRecord.status === 'approved' && (currentUser.role === 'manager' || currentUser.role === 'admin') && (
                        <button
                          onClick={handleLock}
                          className="flex-1 py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-slate-100 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5" /> Seal & Lock
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-850">
                      <label className="text-[10px] font-semibold text-slate-500">Sign-Off Reasoning Comment</label>
                      <input
                        type="text"
                        placeholder="Explain approval or validation override..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleDecision('approved')}
                          className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-100 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve Row
                        </button>
                        <button
                          onClick={() => handleDecision('rejected')}
                          className="flex-1 py-1.5 px-3 bg-red-600 hover:bg-red-500 text-slate-100 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" /> Reject Row
                        </button>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="bg-cyan-500/5 p-4 rounded-xl border border-cyan-500/20 text-center flex flex-col items-center gap-2">
                    <ShieldCheck className="w-8 h-8 text-cyan-400" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Audit-Locked & Verified</h4>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        This row is sealed. Standard edits are blocked. Checked by <span className="text-cyan-400 font-bold">{selectedRecord.locked_by?.username || 'manager_demo'}</span> on {new Date(selectedRecord.locked_at).toLocaleDateString()}.
                      </p>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              /* History / Audit trail view */
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2">
                  <History className="w-4 h-4 text-emerald-500" /> Line Item Mutation History
                </span>
                
                {auditLogsList.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-[11px]">No overrides recorded. Record remains at pipeline baselines.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {auditLogsList.map(log => (
                      <div key={log.id} className="bg-slate-950/40 p-3 rounded-lg border border-slate-850 text-[11px] flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase">
                          <span className="text-emerald-400">{log.action.replace(/_/g, ' ')}</span>
                          <span className="text-slate-500">{log.username}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</p>
                        
                        {log.action === 'field_edited' && log.old_value && (
                          <div className="bg-slate-900/60 p-2 rounded text-[10px] font-mono mt-1 border border-slate-850 flex flex-col gap-1">
                            {Object.entries(log.old_value).map(([field, diff]) => (
                              <div key={field} className="flex justify-between">
                                <span className="text-slate-500">{field}:</span>
                                <span className="text-slate-300">
                                  <del className="text-red-400/80 mr-1.5">{diff.old}</del>
                                  <ins className="text-emerald-400 no-underline font-bold">{diff.new}</ins>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {log.action.startsWith('record_') && log.new_value?.comment && (
                          <div className="bg-slate-900/60 p-2 rounded italic text-slate-400 mt-1 border border-slate-850">
                            &ldquo;{log.new_value.comment}&rdquo;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Edit Correction Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <h3 className="text-md font-bold text-slate-200 flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-emerald-500" /> Manual Audit Correction
              </h3>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCorrection} className="flex flex-col gap-4 text-xs">
              
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-slate-400">Activity Date Override</label>
                <input
                  type="text"
                  placeholder="YYYY-MM-DD or DD.MM.YYYY"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-slate-400">Quantity Override</label>
                <input
                  type="text"
                  placeholder="e.g. 1500.50"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-slate-400">Unit of Measure Override</label>
                <input
                  type="text"
                  placeholder="e.g. L, GAL, kWh, km, nights"
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-850 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2 mt-2">
                <ShieldAlert className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                Saving overrides will write a detailed, fine-grained change diff to the append-only audit trail and re-trigger pipeline normalization scripts.
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="py-2 px-4 bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-400 font-bold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-100 font-bold rounded-lg transition-colors"
                >
                  Save Corrections
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default ReviewDashboard;
