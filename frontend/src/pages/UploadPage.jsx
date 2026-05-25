import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FileSpreadsheet, Upload, AlertCircle, CheckCircle, 
  HelpCircle, Database, Play, Sparkles, FileJson
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MOCK_SAP_DATA = 
`Material,Plant,Menge,Einheit,Datum,Cost Center,Vendor
Heavy Diesel,DE01,"1.200,50",L,25.05.2026,CC-PROD-01,Shell
Gasoline,US02,500.00,GAL,2026-05-20,CC-SALES-02,Chevron
Natural Gas,IN03,3000,m3,05/18/2026,CC-OFFICE-03,GAIL
Heating Oil,DE01,"10.000",LIT,2026-05-22,CC-PROD-01,Total
Unknown Fuel,FR04,-100,GAL,invalid-date,CC-PROD-01,Total`;

const MOCK_UTILITY_DATA = 
`meter_id,billing_start_date,billing_end_date,kwh_usage,tariff_type,demand_charge
MTR-98327,2026-04-01,2026-04-30,12500.00,Commercial-Peak,120.00
MTR-98327,2026-05-01,2026-05-31,13200.50,Commercial-Peak,120.00
MTR-98327,2026-05-15,2026-06-15,10000.00,Commercial-Peak,120.00
MTR-98327,2026-07-01,2026-07-31,50000.00,Commercial-Peak,120.00
MTR-98327,2026-08-01,2026-08-31,-120.00,Commercial-Peak,120.00`;

const MOCK_TRAVEL_DATA = 
`[
  {
    "employee_id": "EMP-102",
    "trip_type": "flight",
    "origin_airport": "JFK",
    "destination_airport": "LAX",
    "activity_date": "2026-05-20"
  },
  {
    "employee_id": "EMP-102",
    "trip_type": "flight",
    "origin_airport": "LHR",
    "destination_airport": "SIN",
    "distance_km": 10842,
    "activity_date": "2026-05-22"
  },
  {
    "employee_id": "EMP-304",
    "trip_type": "hotel",
    "hotel_nights": 4,
    "activity_date": "2026-05-21"
  },
  {
    "employee_id": "EMP-508",
    "trip_type": "ground",
    "transport_mode": "train",
    "distance_km": 180,
    "activity_date": "2026-05-23"
  },
  {
    "employee_id": "EMP-102",
    "trip_type": "flight",
    "origin_airport": "ABC",
    "destination_airport": "XYZ",
    "activity_date": "2026-05-24"
  }
]`;

function UploadPage({ currentCompany, currentUser, API_BASE_URL }) {
  const navigate = useNavigate();
  const [dataSources, setDataSources] = useState([]);
  const [selectedDsId, setSelectedDsId] = useState('');
  const [activeDs, setActiveDs] = useState(null);
  
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [uploadStatus, setUploadStatus] = useState({ state: 'idle', message: '', data: null });
  const [loading, setLoading] = useState(true);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/data-sources/`, {
        headers: { 'X-Company-ID': currentCompany.id }
      });
      setDataSources(response.data);
      
      // If no sources exist, let's create default ones so the prototype works immediately!
      if (response.data.length === 0) {
        const defaults = [
          { name: "SAP Procurement (CSV Export)", source_type: "SAP_CSV" },
          { name: "Utility Electricity Billing Ledger", source_type: "UTILITY_CSV" },
          { name: "Concur Corporate Travel API", source_type: "TRAVEL_API" }
        ];
        
        const createdSources = [];
        for (const item of defaults) {
          const res = await axios.post(`${API_BASE_URL}/data-sources/`, item, {
            headers: { 'X-Company-ID': currentCompany.id }
          });
          createdSources.push(res.data);
        }
        setDataSources(createdSources);
        setSelectedDsId(createdSources[0].id);
        setActiveDs(createdSources[0]);
      } else {
        setSelectedDsId(response.data[0].id);
        setActiveDs(response.data[0]);
      }
    } catch (err) {
      console.error("Error fetching data sources:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentCompany) {
      fetchSources();
    }
  }, [currentCompany]);

  const handleDsChange = (id) => {
    setSelectedDsId(id);
    const ds = dataSources.find(s => s.id === parseInt(id));
    setActiveDs(ds);
    
    // Clear content
    setFileContent('');
    setFileName('');
    setUploadStatus({ state: 'idle', message: '', data: null });
  };

  const loadSampleData = () => {
    if (!activeDs) return;
    
    if (activeDs.source_type === 'SAP_CSV') {
      setFileContent(MOCK_SAP_DATA);
      setFileName('SAP_MB51_EXPORT_DE01_2026.csv');
    } else if (activeDs.source_type === 'UTILITY_CSV') {
      setFileContent(MOCK_UTILITY_DATA);
      setFileName('UTILITY_ELECTRICITY_MTR98327.csv');
    } else if (activeDs.source_type === 'TRAVEL_API') {
      setFileContent(MOCK_TRAVEL_DATA);
      setFileName('CONCUR_TRAVEL_API_PAYLOAD.json');
    }
    setUploadStatus({ state: 'idle', message: '', data: null });
  };

  const handleIngestionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDsId || !fileContent.trim()) {
      alert("Please load or enter file content first.");
      return;
    }

    setUploadStatus({ state: 'processing', message: 'Executing ingestion transaction pipeline...', data: null });
    
    try {
      const response = await axios.post(`${API_BASE_URL}/batches/upload_file/`, {
        data_source: selectedDsId,
        file_name: fileName || `${activeDs.source_type.toLowerCase()}_manual_upload.${activeDs.source_type === 'TRAVEL_API' ? 'json' : 'csv'}`,
        file_content: fileContent
      }, {
        headers: { 
          'X-Company-ID': currentCompany.id,
          'X-Simulated-User': currentUser.username
        }
      });
      
      setUploadStatus({ 
        state: 'success', 
        message: 'Normalisation complete! Data has been stored and validated.', 
        data: response.data 
      });
      
      // Clear values
      setFileContent('');
      setFileName('');
      
    } catch (err) {
      console.error("Ingestion failed:", err);
      setUploadStatus({ 
        state: 'error', 
        message: err.response?.data?.error || 'Pipeline execution failed. Review the formatting logs.',
        data: err.response?.data?.batch
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Left side: Upload Form Controls */}
      <div className="bg-slate-950/20 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-500" /> Ingestion Terminal
          </h2>
          <p className="text-slate-400 text-xs mt-1">Upload unstructured enterprise exports here.</p>
        </div>

        {loading ? (
          <div className="py-6 text-center text-slate-500 text-xs">Resolving tenant pipeline endpoints...</div>
        ) : (
          <div className="flex flex-col gap-4">
            
            {/* Pipeline Configuration Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Ingestion Profile Pipeline</label>
              <select
                value={selectedDsId}
                onChange={(e) => handleDsChange(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                {dataSources.map(ds => (
                  <option key={ds.id} value={ds.id}>{ds.name}</option>
                ))}
              </select>
            </div>

            {/* Simulated file upload */}
            <div className="bg-slate-950/30 border border-dashed border-slate-800 rounded-xl p-6 text-center flex flex-col items-center gap-3">
              <div className="bg-slate-900 p-2.5 rounded-lg text-emerald-500 border border-slate-850">
                {activeDs?.source_type === 'TRAVEL_API' ? <FileJson className="w-6 h-6" /> : <FileSpreadsheet className="w-6 h-6" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-300">Simulated Upload Sandbox</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  Enter your row ledger below, or bypass manual preparation by loading our built-in messy mock datasets.
                </p>
              </div>
              
              <button
                type="button"
                onClick={loadSampleData}
                className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/10 hover:border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> Load Sample Data
              </button>
            </div>

            {/* Ingest Button */}
            <button
              onClick={handleIngestionSubmit}
              disabled={!fileContent.trim() || uploadStatus.state === 'processing'}
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 font-bold rounded-lg text-xs text-slate-100 shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" /> Run Ingestion Engine
            </button>

          </div>
        )}

        {/* Pipeline Details */}
        {activeDs && (
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-850 flex flex-col gap-2 mt-4 text-[11px] leading-relaxed">
            <h4 className="font-bold text-slate-300 flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-emerald-500" /> Pipeline Processing Strategy
            </h4>
            {activeDs.source_type === 'SAP_CSV' && (
              <p className="text-slate-400">
                <strong>SAP normalization</strong>: Cleans German numeric comma notations, handles mixed date structures, converts gallons to liters, maps plant codes, and flags zero/negative entries.
              </p>
            )}
            {activeDs.source_type === 'UTILITY_CSV' && (
              <p className="text-slate-400">
                <strong>Utility ledger</strong>: Allocates billing kWh, compares historical utility cycles for meter overlaps/gaps, and flags daily average consumption spikes &gt;5x.
              </p>
            )}
            {activeDs.source_type === 'TRAVEL_API' && (
              <p className="text-slate-400">
                <strong>Concur API payload</strong>: Computes flight distances from airport geocodes using the <em>Haversine formula</em> if missing, and isolates into Scope 3 Categories.
              </p>
            )}
          </div>
        )}

      </div>

      {/* Right side: Editor & Ingestion Response Details */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        
        {/* Editor Screen */}
        <div className="bg-slate-950/20 border border-slate-800 rounded-2xl p-6 flex-1 flex flex-col gap-3">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <h3 className="text-md font-bold text-slate-200">Simulated Raw File Content</h3>
            <input
              type="text"
              placeholder="Filename (e.g. sap_data.csv)"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <textarea
            placeholder={`Click "Load Sample Data" on the left, or write custom ${activeDs?.source_type === 'TRAVEL_API' ? 'JSON' : 'CSV'} structures here...`}
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-emerald-500 resize-none min-h-[300px]"
          />
        </div>

        {/* Ingestion Response Console */}
        {uploadStatus.state !== 'idle' && (
          <div className={`p-4 rounded-xl border flex gap-3 ${
            uploadStatus.state === 'success' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' :
            uploadStatus.state === 'error' ? 'bg-red-500/5 border-red-500/20 text-red-400' :
            'bg-blue-500/5 border-blue-500/20 text-blue-400'
          }`}>
            <div className="shrink-0 mt-0.5">
              {uploadStatus.state === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-slate-200">
                {uploadStatus.state === 'processing' ? 'Processing Batch Ingestion' :
                 uploadStatus.state === 'success' ? 'Pipeline Completed Successfully' :
                 'Pipeline Failure'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{uploadStatus.message}</p>
              
              {uploadStatus.data && (
                <div className="mt-4 bg-slate-950/80 rounded-lg p-3 border border-slate-850 flex flex-col gap-2">
                  <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 pb-1.5 border-b border-slate-850">
                    <span>Summary Metadata</span>
                    <span className="text-emerald-400">Batch ID #{uploadStatus.data.id}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Total Processed</p>
                      <p className="text-slate-200 font-bold mt-0.5">{uploadStatus.data.summary?.total_rows || 0} rows</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Flagged Suspect</p>
                      <p className="text-orange-400 font-bold mt-0.5">{uploadStatus.data.summary?.flagged_rows || 0} rows</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Ingestion Status</p>
                      <p className="text-slate-200 font-bold mt-0.5 capitalize">{uploadStatus.data.status}</p>
                    </div>
                    <div className="flex items-end">
                      <button 
                        onClick={() => navigate('/review')}
                        className="py-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-100 text-[10px] font-bold rounded"
                      >
                        Inspect Records
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}

export default UploadPage;
