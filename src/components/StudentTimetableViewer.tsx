import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  Download, 
  ExternalLink, 
  RefreshCw,
  Search,
  ChevronDown,
  FileText,
  AlertCircle
} from 'lucide-react';
import { Timetable } from '../types';
import { TIMETABLE_DEPARTMENTS, TIMETABLE_SEMESTERS } from './TimetableManagement';

interface StudentTimetableViewerProps {
  userProfile?: {
    department?: string;
    semester?: string;
  } | null;
}

export const StudentTimetableViewer: React.FC<StudentTimetableViewerProps> = ({ userProfile }) => {
  // State
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Dropdown Selections (Defaulted to user profile if exists)
  const [selectedDept, setSelectedDept] = useState('Economics');
  const [selectedSem, setSelectedSem] = useState('UG 1st Sem');

  // View States
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Initialize from profile if available
  useEffect(() => {
    if (userProfile?.department) {
      // Find matching department in standard list or default to profile value
      const matchedDept = TIMETABLE_DEPARTMENTS.find(
        d => d.toLowerCase() === userProfile.department?.toLowerCase()
      ) || userProfile.department;
      setSelectedDept(matchedDept);
    }
    if (userProfile?.semester) {
      // Pre-select semester if matching
      const matchedSem = TIMETABLE_SEMESTERS.find(
        s => s.toLowerCase() === userProfile.semester?.toLowerCase()
      ) || userProfile.semester;
      setSelectedSem(matchedSem);
    }
  }, [userProfile]);

  // Load all timetables
  useEffect(() => {
    loadTimetables();
  }, []);

  const loadTimetables = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/timetables');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setTimetables(data);
      } else {
        throw new Error('Failed to fetch timetable repository');
      }
    } catch (err: any) {
      setError(err.message || 'Could not fetch schedules. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Find matching timetable for current combination
  const activeTimetable = timetables.find(
    tt => tt.department.toLowerCase() === selectedDept.toLowerCase() &&
          tt.semester.toLowerCase() === selectedSem.toLowerCase()
  );

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setZoomLevel(1);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Search Header Selector */}
      <div className="bg-white border border-[#E7DDD0] rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-10 h-10 rounded-2xl bg-[#C89B4A]/10 text-[#C89B4A] flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#1B1B1B] uppercase tracking-wider">
              📅 Official Departmental Timetable
            </h3>
            <p className="text-[10px] text-[#6B6B6B] font-semibold">
              Select department and semester to view official timetables
            </p>
          </div>
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 gap-2.5 w-full md:w-auto md:flex md:items-center">
          
          {/* Department Select */}
          <div className="relative">
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setZoomLevel(1);
              }}
              className="w-full md:w-[180px] bg-[#F2EEE8]/60 hover:bg-[#F2EEE8] border border-[#E7DDD0] text-[11px] font-bold text-[#1B1B1B] rounded-xl pl-3 py-2.5 pr-8 focus:outline-none transition-all appearance-none cursor-pointer"
            >
              {TIMETABLE_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
              {/* Fallback if user profile has a custom department not in list */}
              {userProfile?.department && !TIMETABLE_DEPARTMENTS.includes(userProfile.department) && (
                <option value={userProfile.department}>{userProfile.department}</option>
              )}
            </select>
            <ChevronDown className="absolute right-2.5 top-3.5 h-3.5 w-3.5 text-[#6B6B6B] pointer-events-none" />
          </div>

          {/* Semester Select */}
          <div className="relative">
            <select
              value={selectedSem}
              onChange={(e) => {
                setSelectedSem(e.target.value);
                setZoomLevel(1);
              }}
              className="w-full md:w-[150px] bg-[#F2EEE8]/60 hover:bg-[#F2EEE8] border border-[#E7DDD0] text-[11px] font-bold text-[#1B1B1B] rounded-xl pl-3 py-2.5 pr-8 focus:outline-none transition-all appearance-none cursor-pointer"
            >
              {TIMETABLE_SEMESTERS.map((sem) => (
                <option key={sem} value={sem}>{sem}</option>
              ))}
              {userProfile?.semester && !TIMETABLE_SEMESTERS.includes(userProfile.semester) && (
                <option value={userProfile.semester}>{userProfile.semester}</option>
              )}
            </select>
            <ChevronDown className="absolute right-2.5 top-3.5 h-3.5 w-3.5 text-[#6B6B6B] pointer-events-none" />
          </div>

          {/* Quick Refresh Button */}
          <button
            onClick={loadTimetables}
            disabled={isLoading}
            className="p-2.5 border border-[#E7DDD0] rounded-xl hover:bg-[#F2EEE8]/50 text-[#6B6B6B] hover:text-[#1B1B1B] transition-all cursor-pointer flex items-center justify-center col-span-2 md:col-span-1"
            title="Refresh database"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-[#C89B4A]' : ''}`} />
          </button>

        </div>
      </div>

      {/* Main Display Area */}
      {isLoading ? (
        <div className="bg-white border border-[#E7DDD0] rounded-3xl p-20 flex flex-col items-center justify-center space-y-4 shadow-sm">
          <RefreshCw className="h-8 w-8 text-[#C89B4A] animate-spin" />
          <p className="text-xs text-[#6B6B6B] font-bold uppercase tracking-wider">Fetching official schedule...</p>
        </div>
      ) : activeTimetable ? (
        <div className="space-y-4">
          
          {/* Metadata Bar */}
          <div className="bg-white border border-[#E7DDD0] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold">
              <div>
                <span className="text-[#6B6B6B] text-[10px] uppercase font-extrabold block">Department</span>
                <span className="text-[#1B1B1B] font-bold">{activeTimetable.department}</span>
              </div>
              <div>
                <span className="text-[#6B6B6B] text-[10px] uppercase font-extrabold block">Semester</span>
                <span className="text-[#C89B4A] font-extrabold font-mono">{activeTimetable.semester}</span>
              </div>
              <div>
                <span className="text-[#6B6B6B] text-[10px] uppercase font-extrabold block">Academic Session</span>
                <span className="text-[#1B1B1B] font-bold">{activeTimetable.session}</span>
              </div>
              <div>
                <span className="text-[#6B6B6B] text-[10px] uppercase font-extrabold block">Last Updated</span>
                <span className="text-[#1B1B1B] font-semibold">{new Date(activeTimetable.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center gap-1.5 ml-auto">
              {activeTimetable.fileType === 'image' && (
                <>
                  <button
                    onClick={handleZoomOut}
                    className="p-2 bg-[#F2EEE8] hover:bg-[#E7DDD0] rounded-xl text-[#1B1B1B] transition-colors cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleZoomReset}
                    className="px-2.5 py-2 bg-[#F2EEE8] hover:bg-[#E7DDD0] rounded-xl text-[#1B1B1B] text-[10px] font-bold transition-colors cursor-pointer"
                    title="Reset Zoom"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                  <button
                    onClick={handleZoomIn}
                    className="p-2 bg-[#F2EEE8] hover:bg-[#E7DDD0] rounded-xl text-[#1B1B1B] transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setIsLightboxOpen(true)}
                    className="p-2 bg-[#F2EEE8] hover:bg-[#E7DDD0] rounded-xl text-[#C89B4A] transition-colors cursor-pointer"
                    title="Full Screen View"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </>
              )}
              <a
                href={activeTimetable.fileUrl}
                download={activeTimetable.fileName || 'timetable'}
                target="_blank"
                rel="referrer noopener"
                className="p-2 bg-[#C89B4A] hover:bg-[#B98A32] text-white rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                title="Download File"
              >
                <Download className="h-4 w-4" />
              </a>
              <a
                href={activeTimetable.fileUrl}
                target="_blank"
                rel="referrer noopener"
                className="p-2 bg-[#F2EEE8] hover:bg-[#E7DDD0] text-[#1B1B1B] rounded-xl transition-colors flex items-center justify-center cursor-pointer font-bold gap-1 text-[10px]"
                title="Open Original"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Original</span>
              </a>
            </div>
          </div>

          {/* Document Content Canvas */}
          <div className="bg-white border border-[#E7DDD0] rounded-3xl p-4 shadow-sm flex justify-center items-center overflow-hidden min-h-[350px] relative">
            {activeTimetable.fileType === 'pdf' ? (
              <div className="w-full h-[650px] rounded-2xl overflow-hidden border border-[#E7DDD0] bg-slate-50 relative">
                {/* PDF Embedded Frame */}
                <iframe
                  src={activeTimetable.fileUrl.startsWith('data:') ? activeTimetable.fileUrl : `https://docs.google.com/viewer?url=${encodeURIComponent(activeTimetable.fileUrl)}&embedded=true`}
                  className="w-full h-full border-none"
                  title="Official PDF Timetable"
                  referrerPolicy="no-referrer"
                />
                
                {/* Overlay link in case standard Google docs viewer rate limits or is blocked */}
                <div className="absolute bottom-4 right-4 bg-[#1B1B1B] text-white px-3 py-2 rounded-xl flex items-center gap-1.5 text-[10px] font-bold shadow-md hover:bg-slate-800 transition-colors">
                  <FileText className="h-3.5 w-3.5 text-red-400" />
                  <a href={activeTimetable.fileUrl} target="_blank" rel="noreferrer noopener">
                    Problem viewing? Open original PDF
                  </a>
                </div>
              </div>
            ) : (
              <div className="overflow-auto max-w-full w-full max-h-[600px] flex justify-center items-center p-2 scrollbar-thin">
                <div 
                  className="transition-transform duration-200 ease-out origin-center select-none"
                  style={{ transform: `scale(${zoomLevel})` }}
                >
                  <img
                    src={activeTimetable.fileUrl}
                    alt={`${selectedDept} Department Timetable`}
                    className="max-w-full h-auto max-h-[550px] rounded-xl shadow-xs object-contain pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* No schedule uploaded state */
        <div className="bg-white border border-[#E7DDD0] rounded-3xl p-16 text-center space-y-4 shadow-sm">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#F7F4EF] flex items-center justify-center text-[#6B6B6B]/40 border border-[#E7DDD0]">
            <Calendar className="h-6 w-6" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h4 className="text-sm font-black text-[#1B1B1B] uppercase tracking-wide">
              No Official Timetable Found
            </h4>
            <p className="text-xs text-[#6B6B6B] font-semibold leading-relaxed">
              The official class timetable for the <strong className="text-[#1B1B1B]">{selectedDept}</strong> department (<strong className="text-[#1B1B1B]">{selectedSem}</strong>) has not been uploaded by the administrators yet.
            </p>
          </div>
          <div className="pt-2 border-t border-[#E7DDD0]/40 max-w-xs mx-auto">
            <p className="text-[10px] text-[#C89B4A] font-extrabold uppercase tracking-wide">
              Please contact your department HOD
            </p>
          </div>
        </div>
      )}

      {/* Lightbox Overlay Modal */}
      {isLightboxOpen && activeTimetable && activeTimetable.fileType === 'image' && (
        <div className="fixed inset-0 z-50 bg-[#1B1B1B]/95 flex flex-col justify-between p-4 animate-in fade-in duration-200">
          
          {/* Lightbox header */}
          <div className="flex justify-between items-center text-white p-3 border-b border-white/10">
            <div className="space-y-0.5">
              <h4 className="text-xs font-black uppercase tracking-wide text-[#C89B4A]">
                {activeTimetable.department} Department Schedule
              </h4>
              <p className="text-[10px] text-gray-400 font-semibold">
                {activeTimetable.semester} &bull; Session {activeTimetable.session}
              </p>
            </div>
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="p-2 hover:bg-white/10 rounded-xl transition-all cursor-pointer text-white font-bold"
              title="Close Full Screen"
            >
              <Minimize2 className="h-5 w-5" />
            </button>
          </div>

          {/* Lightbox center image */}
          <div className="flex-1 flex justify-center items-center overflow-auto p-4">
            <img
              src={activeTimetable.fileUrl}
              alt="Full Resolution Timetable"
              className="max-w-full max-h-[85vh] rounded-lg object-contain shadow-2xl select-none"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Lightbox footer info */}
          <div className="text-center text-[10px] text-gray-500 font-semibold p-2 uppercase tracking-widest">
            Press escape or click minimize button to exit full screen view
          </div>

        </div>
      )}

    </div>
  );
};
