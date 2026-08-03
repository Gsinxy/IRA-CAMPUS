import React, { useState, useEffect, useRef } from 'react';
import { 
  Code, Save, CheckCircle2, AlertCircle, RefreshCw, 
  Trash2, Edit2, Sparkles, FileText, Check, Copy, Download, Upload, Search, FileCode
} from 'lucide-react';
import { ProgrammeStructure } from '../types';

interface Props {
  adminToken?: string;
}

const DEFAULT_DEPARTMENTS = [
  "Economics", "Commerce", "Physics", "Chemistry", "Mathematics", 
  "Political Science", "History", "English", "Odia", "Education", "Botany", 
  "Zoology", "Computer Science"
];

const PROGRAMMES = ["UG", "PG", "B.A. Honours", "B.Sc. Honours", "B.Com. Honours", "Diploma"];

const SEMESTERS = [
  "Semester I", "Semester II", "Semester III", "Semester IV",
  "Semester V", "Semester VI", "Semester VII", "Semester VIII"
];

const DEFAULT_JSON_EXAMPLE = {
  department: "Economics",
  programme: "UG",
  semester: "Semester III",
  title: "Economics Honours Semester III",
  keywords: [
    "economics semester 3",
    "semester iii",
    "subjects",
    "course structure"
  ],
  content: {
    corePapers: [
      { paperNumber: "Paper V", courseName: "Microeconomics I" },
      { paperNumber: "Paper VI", courseName: "Macroeconomics I" },
      { paperNumber: "Paper VII", courseName: "Mathematical Methods for Economics I" }
    ],
    minor: ["Introductory Sociology"],
    sec: ["Quantitative and Logical Thinking"],
    vac: ["Environmental Studies"],
    aec: ["Communicative English"],
    mdc: ["Political Science"]
  }
};

export const ProgrammeStructureManagement: React.FC<Props> = ({ adminToken }) => {
  const [structures, setStructures] = useState<ProgrammeStructure[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Header field states
  const [selectedDept, setSelectedDept] = useState('Economics');
  const [customDept, setCustomDept] = useState('');
  const [programme, setProgramme] = useState('UG');
  const [semester, setSemester] = useState('Semester III');
  const [title, setTitle] = useState('Economics Honours Semester III');
  const [keywordsInput, setKeywordsInput] = useState('economics semester 3, semester iii, subjects, course structure');

  // JSON Code Editor state
  const [jsonString, setJsonString] = useState(JSON.stringify(DEFAULT_JSON_EXAMPLE, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isValidJson, setIsValidJson] = useState(true);

  // AI Extraction Modal State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTextContent, setAiTextContent] = useState('');
  const [aiExtracting, setAiExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchStructures();
  }, []);

  // Sync Header Inputs to JSON code when header inputs change
  const syncHeaderToJson = (deptVal: string, progVal: string, semVal: string, titleVal: string, kwVal: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      const kwArray = kwVal.split(',').map(s => s.trim()).filter(Boolean);
      const updated = {
        ...parsed,
        department: deptVal,
        programme: progVal,
        semester: semVal,
        title: titleVal,
        keywords: kwArray
      };
      setJsonString(JSON.stringify(updated, null, 2));
      setIsValidJson(true);
      setJsonError(null);
    } catch {
      // If JSON is invalid, don't overwrite user's raw edit
    }
  };

  const getEffectiveDept = () => {
    return selectedDept === 'CUSTOM' ? (customDept.trim() || 'Custom Department') : selectedDept;
  };

  const fetchStructures = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/programme-structure');
      if (res.ok) {
        const data = await res.json();
        setStructures(data || []);
      } else {
        setErrorMsg('Failed to load programme structures from server');
      }
    } catch (err: any) {
      setErrorMsg(`Error loading data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Format JSON
  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonString);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonString(formatted);
      setIsValidJson(true);
      setJsonError(null);
      setSuccessMsg('JSON code formatted successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setIsValidJson(false);
      setJsonError(`JSON Syntax Error: ${err.message}`);
    }
  };

  // Validate JSON
  const handleValidateJson = () => {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.department || !parsed.semester) {
        setIsValidJson(false);
        setJsonError('Validation Warning: "department" and "semester" fields are required in JSON root.');
        return false;
      }
      setIsValidJson(true);
      setJsonError(null);
      setSuccessMsg('✓ Valid JSON structure! Ready to save.');
      setTimeout(() => setSuccessMsg(''), 3000);
      return true;
    } catch (err: any) {
      setIsValidJson(false);
      setJsonError(`JSON Parse Error: ${err.message}`);
      return false;
    }
  };

  // Save Programme Structure
  const handleSave = async () => {
    const isValid = handleValidateJson();
    if (!isValid) return;

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const parsed = JSON.parse(jsonString);
      const dept = getEffectiveDept();
      const kwArray = keywordsInput.split(',').map(s => s.trim()).filter(Boolean);

      const payload: ProgrammeStructure = {
        id: editingId || '',
        department: dept,
        programme: programme || 'UG',
        semester,
        title: title || `${dept} ${programme || 'UG'} ${semester}`,
        keywords: kwArray,
        content: parsed.content || parsed
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (adminToken) {
        headers['Authorization'] = `Bearer ${adminToken}`;
      }

      const res = await fetch('/api/programme-structure', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        setSuccessMsg(`Programme Structure Knowledge JSON for "${dept}" (${semester}) saved successfully!`);
        fetchStructures();
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || 'Failed to save programme structure');
      }
    } catch (err: any) {
      setErrorMsg(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // AI Extraction Handler
  const handleAiExtract = async (file?: File) => {
    setAiExtracting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let bodyData: any = {
        department: getEffectiveDept(),
        programme,
        semester
      };

      if (file) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const res = reader.result as string;
            const base64 = res.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;

        bodyData.fileBase64 = base64;
        bodyData.mimeType = file.type || 'application/pdf';
      } else if (aiTextContent.trim()) {
        bodyData.textContent = aiTextContent.trim();
      } else {
        setErrorMsg('Please upload a PDF file or enter syllabus text to extract.');
        setAiExtracting(false);
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (adminToken) {
        headers['Authorization'] = `Bearer ${adminToken}`;
      }

      const res = await fetch('/api/programme-structure/extract-ai', {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.extractedJson) {
          const ext = data.extractedJson;
          if (ext.department) {
            if (DEFAULT_DEPARTMENTS.includes(ext.department)) {
              setSelectedDept(ext.department);
            } else {
              setSelectedDept('CUSTOM');
              setCustomDept(ext.department);
            }
          }
          if (ext.programme) setProgramme(ext.programme);
          if (ext.semester) setSemester(ext.semester);
          if (ext.title) setTitle(ext.title);
          if (Array.isArray(ext.keywords)) setKeywordsInput(ext.keywords.join(', '));

          const formatted = JSON.stringify(ext, null, 2);
          setJsonString(formatted);
          setIsValidJson(true);
          setJsonError(null);

          setSuccessMsg('✨ AI successfully extracted Programme Structure JSON! Preview below and click Save.');
          setShowAiModal(false);
          setTimeout(() => setSuccessMsg(''), 5000);
        }
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || 'AI Extraction failed');
      }
    } catch (err: any) {
      setErrorMsg(`AI Extraction error: ${err.message}`);
    } finally {
      setAiExtracting(false);
    }
  };

  const handleDelete = async (id: string, dept: string, sem: string) => {
    setDeletingId(id);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const headers: Record<string, string> = {};
      if (adminToken) {
        headers['Authorization'] = `Bearer ${adminToken}`;
      }

      const res = await fetch(`/api/programme-structure/${id}`, {
        method: 'DELETE',
        headers
      });

      if (res.ok) {
        setSuccessMsg(`Deleted Programme Structure Knowledge JSON for ${dept} (${sem}).`);
        fetchStructures();
        if (editingId === id) {
          handleResetForm();
        }
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || 'Failed to delete programme structure');
      }
    } catch (err: any) {
      setErrorMsg(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditRecord = (rec: ProgrammeStructure) => {
    setEditingId(rec.id);
    if (DEFAULT_DEPARTMENTS.includes(rec.department)) {
      setSelectedDept(rec.department);
      setCustomDept('');
    } else {
      setSelectedDept('CUSTOM');
      setCustomDept(rec.department);
    }
    setProgramme(rec.programme || 'UG');
    setSemester(rec.semester || 'Semester I');
    setTitle(rec.title || `${rec.department} ${rec.programme || 'UG'} ${rec.semester}`);
    setKeywordsInput(rec.keywords ? rec.keywords.join(', ') : '');

    const fullObj = {
      department: rec.department,
      programme: rec.programme || 'UG',
      semester: rec.semester,
      title: rec.title || `${rec.department} ${rec.programme || 'UG'} ${rec.semester}`,
      keywords: rec.keywords || [],
      content: rec.content || {
        corePapers: rec.corePapers || [],
        minor: rec.minor || [],
        sec: rec.sec || [],
        vac: rec.vac || [],
        aec: rec.aec || [],
        mdc: rec.mdc || []
      }
    };

    setJsonString(JSON.stringify(fullObj, null, 2));
    setIsValidJson(true);
    setJsonError(null);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetForm = () => {
    setEditingId(null);
    setSelectedDept('Economics');
    setCustomDept('');
    setProgramme('UG');
    setSemester('Semester III');
    setTitle('Economics Honours Semester III');
    setKeywordsInput('economics semester 3, semester iii, subjects, course structure');
    setJsonString(JSON.stringify(DEFAULT_JSON_EXAMPLE, null, 2));
    setIsValidJson(true);
    setJsonError(null);
  };

  const filteredStructures = structures.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.id?.toLowerCase().includes(term) ||
      s.department?.toLowerCase().includes(term) ||
      s.semester?.toLowerCase().includes(term) ||
      s.programme?.toLowerCase().includes(term) ||
      s.title?.toLowerCase().includes(term)
    );
  });

  const lineCount = jsonString.split('\n').length;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 md:p-8 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#C89B4A]/10 border border-[#C89B4A]/20 flex items-center justify-center text-[#C89B4A]">
              <FileCode className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#1B1B1B] tracking-tight">Programme Structure Knowledge Editor</h2>
              <p className="text-xs text-[#6B6B6B] font-medium">
                Store and edit structured JSON documents per Department + Programme + Semester for instant AI chat responses.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-amber-600 to-[#C89B4A] hover:from-amber-700 hover:to-[#A67C33] rounded-2xl shadow-sm transition-all shrink-0 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Extract JSON with AI</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl p-4 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-2xl p-4 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Primary JSON Knowledge Editor Card */}
      <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-[#E7DDD0] pb-4">
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-[#C89B4A]" />
            <h3 className="text-sm font-extrabold text-[#1B1B1B] uppercase tracking-wider">
              {editingId ? `Editing Structure: ${editingId}` : 'New Programme Structure JSON'}
            </h3>
          </div>
          {editingId && (
            <button
              onClick={handleResetForm}
              className="text-xs text-[#8C827A] hover:text-[#1B1B1B] underline font-bold"
            >
              Cancel Edit & Reset
            </button>
          )}
        </div>

        {/* Top Field Controls: Department, Programme, Semester, Title, Keywords */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-extrabold text-[#6B6B6B] uppercase tracking-wider mb-1.5">
              Department *
            </label>
            <select
              value={selectedDept}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedDept(val);
                const effective = val === 'CUSTOM' ? customDept : val;
                syncHeaderToJson(effective, programme, semester, title, keywordsInput);
              }}
              className="w-full px-3 py-2.5 text-xs bg-[#FAF8F5] border border-[#E7DDD0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C89B4A] font-medium"
            >
              {DEFAULT_DEPARTMENTS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
              <option value="CUSTOM">+ Custom Department</option>
            </select>
            {selectedDept === 'CUSTOM' && (
              <input
                type="text"
                placeholder="Enter Department Name"
                value={customDept}
                onChange={(e) => {
                  setCustomDept(e.target.value);
                  syncHeaderToJson(e.target.value, programme, semester, title, keywordsInput);
                }}
                className="mt-2 w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E7DDD0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C89B4A]"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-extrabold text-[#6B6B6B] uppercase tracking-wider mb-1.5">
              Programme *
            </label>
            <select
              value={programme}
              onChange={(e) => {
                setProgramme(e.target.value);
                syncHeaderToJson(getEffectiveDept(), e.target.value, semester, title, keywordsInput);
              }}
              className="w-full px-3 py-2.5 text-xs bg-[#FAF8F5] border border-[#E7DDD0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C89B4A] font-medium"
            >
              {PROGRAMMES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold text-[#6B6B6B] uppercase tracking-wider mb-1.5">
              Semester *
            </label>
            <select
              value={semester}
              onChange={(e) => {
                setSemester(e.target.value);
                syncHeaderToJson(getEffectiveDept(), programme, e.target.value, title, keywordsInput);
              }}
              className="w-full px-3 py-2.5 text-xs bg-[#FAF8F5] border border-[#E7DDD0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C89B4A] font-bold"
            >
              {SEMESTERS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-extrabold text-[#6B6B6B] uppercase tracking-wider mb-1.5">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                syncHeaderToJson(getEffectiveDept(), programme, semester, e.target.value, keywordsInput);
              }}
              placeholder="e.g. Economics Honours Semester III"
              className="w-full px-3 py-2.5 text-xs bg-[#FAF8F5] border border-[#E7DDD0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C89B4A] font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold text-[#6B6B6B] uppercase tracking-wider mb-1.5">
              Keywords (Comma-separated)
            </label>
            <input
              type="text"
              value={keywordsInput}
              onChange={(e) => {
                setKeywordsInput(e.target.value);
                syncHeaderToJson(getEffectiveDept(), programme, semester, title, e.target.value);
              }}
              placeholder="e.g. economics semester 3, subjects, course structure"
              className="w-full px-3 py-2.5 text-xs bg-[#FAF8F5] border border-[#E7DDD0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C89B4A] font-medium"
            />
          </div>
        </div>

        {/* JSON CODE EDITOR CONTAINER */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Programme Structure JSON
              </label>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isValidJson ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                {isValidJson ? '✓ Valid JSON' : '✕ Parse Error'}
              </span>
            </div>

            {/* Action buttons bar above JSON editor */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                <span>Extract JSON with AI</span>
              </button>

              <button
                type="button"
                onClick={handleFormatJson}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1B1B1B] bg-[#FAF8F5] hover:bg-[#E7DDD0]/50 border border-[#E7DDD0] rounded-xl transition-all cursor-pointer"
              >
                <Code className="h-3.5 w-3.5 text-[#C89B4A]" />
                <span>Format JSON</span>
              </button>

              <button
                type="button"
                onClick={handleValidateJson}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1B1B1B] bg-[#FAF8F5] hover:bg-[#E7DDD0]/50 border border-[#E7DDD0] rounded-xl transition-all cursor-pointer"
              >
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>Validate JSON</span>
              </button>
            </div>
          </div>

          {jsonError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono p-3 rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{jsonError}</span>
            </div>
          )}

          {/* Large Code Editor Textarea */}
          <div className="relative rounded-2xl border border-[#3B3B4F] bg-[#1E1E2E] shadow-inner overflow-hidden flex">
            {/* Line Numbers Sidebar */}
            <div className="w-10 bg-[#181825] border-r border-[#313244] text-[#6C7086] text-xs font-mono py-3 select-none text-right pr-2 space-y-0.5 shrink-0 hidden sm:block">
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Code Textarea */}
            <textarea
              value={jsonString}
              onChange={(e) => {
                setJsonString(e.target.value);
                try {
                  JSON.parse(e.target.value);
                  setIsValidJson(true);
                  setJsonError(null);
                } catch (err: any) {
                  setIsValidJson(false);
                  setJsonError(err.message);
                }
              }}
              rows={18}
              spellCheck={false}
              className="w-full bg-transparent text-[#CDD6F4] font-mono text-xs p-3 leading-relaxed focus:outline-none resize-y"
              placeholder='{\n  "department": "Economics",\n  "programme": "UG",\n  "semester": "Semester III",\n  "content": {}\n}'
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#8C827A] px-1 pt-1">
            <span>Lines: {lineCount} | Characters: {jsonString.length}</span>
            <span>Target Doc ID: <code className="font-mono bg-[#FAF8F5] px-1.5 py-0.5 rounded border border-[#E7DDD0] font-bold text-[#1B1B1B]">{`${getEffectiveDept().toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${programme.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${semester.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`}</code></span>
          </div>
        </div>

        {/* SAVE ACTION BUTTON */}
        <div className="flex items-center justify-end gap-3 border-t border-[#E7DDD0] pt-4">
          <button
            type="button"
            onClick={handleResetForm}
            className="px-4 py-2 text-xs font-bold text-[#6B6B6B] hover:text-[#1B1B1B] transition-colors"
          >
            Reset Form
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isValidJson}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold text-white bg-[#C89B4A] hover:bg-[#A67C33] rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Programme Structure</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* STORED KNOWLEDGE DOCUMENTS LIST */}
      <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 md:p-8 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#E7DDD0] pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-[#1B1B1B] uppercase tracking-wider">Stored Knowledge JSON Documents</h3>
            <p className="text-xs text-[#6B6B6B]">Total saved semester structures: {structures.length}</p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="h-3.5 w-3.5 text-[#8C827A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search department, sem, doc id..."
                className="pl-8 pr-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#E7DDD0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C89B4A] w-full sm:w-56"
              />
            </div>

            <button
              onClick={fetchStructures}
              disabled={loading}
              className="p-2 text-[#8C827A] hover:text-[#1B1B1B] transition-colors"
              title="Refresh Records"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-medium text-[#8C827A] flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-[#C89B4A]" />
            <span>Loading stored structures...</span>
          </div>
        ) : filteredStructures.length === 0 ? (
          <div className="py-12 text-center text-xs font-medium text-[#8C827A] space-y-1">
            <p className="font-bold text-[#1B1B1B]">No Programme Structure Documents Found</p>
            <p>Save a new structure using the JSON editor above or click "Extract JSON with AI".</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStructures.map((struct) => (
              <div
                key={struct.id}
                className="bg-[#FAF8F5] border border-[#E7DDD0] rounded-2xl p-5 space-y-3 relative hover:border-[#C89B4A]/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#1B1B1B]">{struct.department}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-[#C89B4A]/10 text-[#C89B4A] rounded-full">
                        {struct.programme || 'UG'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-neutral-200 text-neutral-800 rounded-full font-mono">
                        {struct.semester}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-[#1B1B1B] mt-1">{struct.title}</p>
                    <p className="text-[10px] text-[#8C827A] font-mono">ID: {struct.id}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditRecord(struct)}
                      className="p-1.5 text-[#8C827A] hover:text-[#1B1B1B] transition-colors"
                      title="Edit in JSON Editor"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(struct.id, struct.department, struct.semester)}
                      disabled={deletingId === struct.id}
                      className="p-1.5 text-[#8C827A] hover:text-red-600 transition-colors disabled:opacity-30"
                      title="Delete Structure"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {struct.keywords && struct.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {struct.keywords.slice(0, 5).map((kw, idx) => (
                      <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-white border border-[#E7DDD0] rounded text-[#6B6B6B]">
                        #{kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI EXTRACTION MODAL */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 md:p-8 max-w-xl w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E7DDD0] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#C89B4A]" />
                <h3 className="text-sm font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                  Extract JSON with AI
                </h3>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="text-xs text-[#8C827A] hover:text-[#1B1B1B]"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-[#6B6B6B]">
              Upload a syllabus PDF or paste raw text. Gemini AI will automatically parse courses, papers, core subjects, minor, SEC, VAC, MDC and generate valid Programme Structure JSON.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold text-[#6B6B6B] uppercase tracking-wider mb-1.5">
                  Option 1: Upload Syllabus PDF File
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.txt,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAiExtract(file);
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={aiExtracting}
                  className="w-full py-4 border-2 border-dashed border-[#C89B4A]/50 bg-[#FAF8F5] hover:bg-[#C89B4A]/5 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Upload className="h-6 w-6 text-[#C89B4A]" />
                  <span className="text-xs font-bold text-[#1B1B1B]">Click to Select PDF File</span>
                  <span className="text-[10px] text-[#8C827A]">Supports .pdf, .txt syllabus documents</span>
                </button>
              </div>

              <div className="relative flex items-center justify-center">
                <span className="bg-white px-2 text-[10px] font-bold text-[#8C827A] uppercase">OR</span>
                <div className="absolute inset-0 border-t border-[#E7DDD0] -z-10" />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-[#6B6B6B] uppercase tracking-wider mb-1.5">
                  Option 2: Paste Syllabus Text directly
                </label>
                <textarea
                  value={aiTextContent}
                  onChange={(e) => setAiTextContent(e.target.value)}
                  placeholder="Paste syllabus text here..."
                  rows={4}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E7DDD0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C89B4A]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#E7DDD0] pt-4">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 text-xs font-bold text-[#6B6B6B] hover:text-[#1B1B1B]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleAiExtract()}
                disabled={aiExtracting || !aiTextContent.trim()}
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold text-white bg-[#C89B4A] hover:bg-[#A67C33] rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {aiExtracting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Extracting with Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Extract JSON</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
