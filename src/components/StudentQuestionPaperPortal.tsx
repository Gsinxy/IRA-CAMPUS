import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Eye,
  Calendar,
  BookOpen,
  GraduationCap,
  Filter,
  X,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Layers
} from 'lucide-react';
import { QuestionPaper } from '../types';

interface StudentQuestionPaperPortalProps {
  userProfile?: any;
}

export const StudentQuestionPaperPortal: React.FC<StudentQuestionPaperPortalProps> = ({ userProfile }) => {
  const [questionPapers, setQuestionPapers] = useState<QuestionPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [selectedDept, setSelectedDept] = useState<string>('Economics');
  const [selectedProg, setSelectedProg] = useState<string>('All');
  const [selectedSem, setSelectedSem] = useState<string>('Semester III');
  const [selectedYear, setSelectedYear] = useState<string>('All');

  // Preview Modal State
  const [previewPaper, setPreviewPaper] = useState<QuestionPaper | null>(null);

  // Departments List
  const departments = [
    'All',
    'Economics',
    'Computer Science',
    'History',
    'Physics',
    'Chemistry',
    'Mathematics',
    'Commerce',
    'Sociology',
    'Political Science',
    'English',
    'Botany',
    'Zoology',
    'Psychology'
  ];

  const programmes = ['All', 'UG', 'PG', 'Honours', 'General', 'B.Tech', 'BCA', 'MCA'];

  const semesters = [
    'All',
    'Semester I',
    'Semester II',
    'Semester III',
    'Semester IV',
    'Semester V',
    'Semester VI',
    'Semester VII',
    'Semester VIII'
  ];

  const academicYears = ['All', '2025', '2024', '2023', '2022', '2021', '2020'];

  const fetchQuestionPapers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/question-papers');
      if (res.ok) {
        const data = await res.json();
        data.forEach((paper: QuestionPaper) => {
          console.log("Retrieved Firestore document:", paper);
          console.log("PDF URL:", paper.pdfUrl);
        });
        setQuestionPapers(data);
      } else {
        setError('Failed to fetch previous year question papers.');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to question bank service.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestionPapers();
  }, []);

  // Filter papers
  const filteredPapers = questionPapers.filter(paper => {
    if (selectedDept !== 'All' && paper.department.toLowerCase() !== selectedDept.toLowerCase()) return false;
    if (selectedProg !== 'All' && paper.programme.toLowerCase() !== selectedProg.toLowerCase()) return false;
    if (selectedSem !== 'All' && paper.semester.toLowerCase() !== selectedSem.toLowerCase()) return false;
    if (selectedYear !== 'All' && paper.year !== selectedYear) return false;
    return true;
  });

  // Group papers semester-wise
  const groupedBySemester: Record<string, QuestionPaper[]> = {};

  filteredPapers.forEach(paper => {
    const sem = paper.semester || 'Other Semesters';
    if (!groupedBySemester[sem]) {
      groupedBySemester[sem] = [];
    }
    groupedBySemester[sem].push(paper);
  });

  // Sort semesters logically
  const semOrder = [
    'Semester I',
    'Semester II',
    'Semester III',
    'Semester IV',
    'Semester V',
    'Semester VI',
    'Semester VII',
    'Semester VIII'
  ];

  const sortedSemesterKeys = Object.keys(groupedBySemester).sort((a, b) => {
    const idxA = semOrder.indexOf(a);
    const idxB = semOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  // Color helper for paper badge accent
  const getPaperTheme = (paperNum: string) => {
    const num = paperNum.toLowerCase();
    if (num.includes('v') && !num.includes('vi') && !num.includes('vii')) {
      return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', badge: '📘' };
    }
    if (num.includes('vi') && !num.includes('vii')) {
      return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', badge: '📗' };
    }
    if (num.includes('vii')) {
      return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900', badge: '📙' };
    }
    return { bg: 'bg-[#F2EEE8]', border: 'border-[#E7DDD0]', text: 'text-[#1B1B1B]', badge: '📘' };
  };

  const handleDownload = (paper: QuestionPaper) => {
    if (paper.pdfUrl) {
      console.log("Downloading", paper.pdfUrl);
      const a = document.createElement('a');
      a.href = paper.pdfUrl;
      a.download = paper.fileName || `${paper.department}_${paper.semester}_${paper.paper}_${paper.year}.pdf`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    } else {
      alert('This question paper was uploaded to legacy storage and must be re-uploaded to Firebase Storage.');
    }
  };

  const handleOpenNewWindow = (paper: QuestionPaper) => {
    if (paper.pdfUrl) {
      console.log("Opening");
      console.log(paper.pdfUrl);
      window.open(paper.pdfUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const getPdfSrc = (paper: QuestionPaper | null) => {
    if (!paper || !paper.pdfUrl) return null;
    return paper.pdfUrl;
  };

  useEffect(() => {
    if (previewPaper && previewPaper.pdfUrl) {
      console.log("Opening PDF:", previewPaper.pdfUrl);
      const src = getPdfSrc(previewPaper);
      console.log("iframe src =", src);
      if (src) {
        fetch(src)
          .then(res => {
            console.log("HTTP Status:", res.status, res.statusText);
            console.log("Content-Type:", res.headers.get('content-type'));
            console.log("Response Headers:");
            res.headers.forEach((val, key) => console.log(`  ${key}: ${val}`));
            if (!res.ok) {
              if (res.status === 401) console.error("Storage returned 401: Unauthorized access to PDF file");
              else if (res.status === 403) console.error("Storage returned 403: Forbidden - Access denied");
              else if (res.status === 404) console.error("Storage returned 404: Question paper PDF file not found");
              else if (res.status === 500) console.error("Storage returned 500: Server error retrieving PDF file");
              else console.error(`Storage returned ${res.status}: ${res.statusText}`);
            }
          })
          .catch(err => {
            console.error("Fetch error for PDF URL:", err);
          });
      }
    }
  }, [previewPaper]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-stone-900 to-amber-950 text-white rounded-3xl p-6 lg:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 pointer-events-none" />
        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C89B4A]/20 border border-[#C89B4A]/40 text-[#E2B768] text-xs font-bold uppercase tracking-wider">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Digital University Question Bank</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Previous Year Question Papers Portal
          </h1>
          <p className="text-sm text-amber-100/80 font-medium leading-relaxed">
            Browse, view, and download official previous year examination question papers categorized by department, semester, and course.
          </p>
        </div>
      </div>

      {/* Filters Bar at Top */}
      <div className="bg-white border border-[#E7DDD0] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#E7DDD0] pb-3">
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
            <Filter className="h-4 w-4 text-[#C89B4A]" />
            <span>Filter Question Papers</span>
          </div>
          <button
            onClick={() => {
              setSelectedDept('Economics');
              setSelectedProg('All');
              setSelectedSem('Semester III');
              setSelectedYear('All');
            }}
            className="text-[11px] font-bold text-[#C89B4A] hover:underline cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Reset Filters</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Department Filter */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-[#1B1B1B] uppercase tracking-wider">
              Department
            </label>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3 py-2 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors cursor-pointer"
            >
              {departments.map(d => (
                <option key={d} value={d}>
                  {d === 'All' ? 'All Departments' : d}
                </option>
              ))}
            </select>
          </div>

          {/* Programme Filter */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-[#1B1B1B] uppercase tracking-wider">
              Programme
            </label>
            <select
              value={selectedProg}
              onChange={e => setSelectedProg(e.target.value)}
              className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3 py-2 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors cursor-pointer"
            >
              {programmes.map(p => (
                <option key={p} value={p}>
                  {p === 'All' ? 'All Programmes' : p}
                </option>
              ))}
            </select>
          </div>

          {/* Semester Filter */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-[#1B1B1B] uppercase tracking-wider">
              Semester
            </label>
            <select
              value={selectedSem}
              onChange={e => setSelectedSem(e.target.value)}
              className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3 py-2 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors cursor-pointer"
            >
              {semesters.map(s => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All Semesters' : s}
                </option>
              ))}
            </select>
          </div>

          {/* Academic Year Filter */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-[#1B1B1B] uppercase tracking-wider">
              Academic Year (Optional)
            </label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3 py-2 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors cursor-pointer"
            >
              {academicYears.map(y => (
                <option key={y} value={y}>
                  {y === 'All' ? 'All Examination Years' : y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-[#E7DDD0] rounded-3xl space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#C89B4A]" />
          <p className="text-xs text-[#6B6B6B] font-semibold">Loading question papers from university bank...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-rose-700 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchQuestionPapers}
            className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : sortedSemesterKeys.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E7DDD0] rounded-3xl p-8 space-y-4">
          <div className="inline-flex p-4 bg-[#F7F4EF] border border-[#E7DDD0] rounded-2xl text-[#C89B4A]">
            <BookOpen className="h-8 w-8" />
          </div>
          <h3 className="text-base font-extrabold text-[#1B1B1B]">No Question Papers Found</h3>
          <p className="text-xs text-[#6B6B6B] max-w-md mx-auto font-medium">
            There are no question papers matching your selected criteria ({selectedDept}, {selectedSem}, {selectedYear}). Try selecting different filter combinations.
          </p>
          <button
            onClick={() => {
              setSelectedDept('All');
              setSelectedProg('All');
              setSelectedSem('All');
              setSelectedYear('All');
            }}
            className="px-4 py-2 bg-[#C89B4A] text-white rounded-xl text-xs font-bold hover:bg-[#B98A32] transition-colors cursor-pointer"
          >
            Show All Papers
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {sortedSemesterKeys.map(semKey => {
            const papersInSem = groupedBySemester[semKey];
            return (
              <div key={semKey} className="space-y-4">
                {/* Semester Heading - Show Semester heading ONLY ONCE per group */}
                <div className="flex items-center gap-3 border-b-2 border-[#C89B4A]/30 pb-2">
                  <div className="p-2 bg-[#C89B4A]/10 border border-[#C89B4A]/30 rounded-xl text-[#C89B4A]">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-extrabold text-[#1B1B1B] tracking-tight">
                    {semKey}
                  </h2>
                  <span className="text-xs font-bold text-[#6B6B6B] bg-[#F7F4EF] border border-[#E7DDD0] px-2.5 py-0.5 rounded-full">
                    {papersInSem.length} {papersInSem.length === 1 ? 'Paper' : 'Papers'}
                  </span>
                </div>

                {/* Cards Grid for this Semester */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                  {papersInSem.map(paper => {
                    const theme = getPaperTheme(paper.paper);
                    const programmeText = paper.programme && paper.programme !== 'UG' && paper.programme !== 'PG'
                      ? paper.programme
                      : `${paper.department} ${paper.programme === 'UG' ? 'Honours' : paper.programme}`;

                    return (
                      <div
                        key={paper.id}
                        className="bg-white border border-[#E7DDD0] hover:border-[#C89B4A]/60 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5 group"
                      >
                        {/* Top Metadata */}
                        <div className="space-y-4">
                          {/* 📚 Dept & Programme Header */}
                          <div className="flex items-start justify-between gap-2 border-b border-[#E7DDD0] pb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">📚</span>
                              <span className="text-xs font-extrabold text-[#1B1B1B] tracking-wide">
                                {programmeText} – {paper.semester}
                              </span>
                            </div>
                          </div>

                          {/* 📘 Paper Number & Course Name */}
                          <div className={`p-4 rounded-2xl border ${theme.bg} ${theme.border} space-y-1`}>
                            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#1B1B1B]">
                              <span>{theme.badge}</span>
                              <span className="uppercase tracking-wider">{paper.paper}</span>
                            </div>
                            <h3 className={`text-base font-extrabold leading-snug ${theme.text}`}>
                              {paper.course}
                            </h3>
                          </div>

                          {/* Detailed Specifications */}
                          <div className="space-y-2 text-xs font-semibold text-[#4A4A4A]">
                            {/* Examination Year & Type */}
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-[#C89B4A] shrink-0" />
                              <span>
                                <strong>Examination:</strong> {paper.year} ({paper.examType})
                              </span>
                            </div>

                            {/* Previous Year Label */}
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-[#C89B4A] shrink-0" />
                              <span>Previous Year Question Paper</span>
                            </div>

                            {/* PDF Status */}
                            {paper.isLegacy ? (
                              <div className="flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                                <span>⚠️</span>
                                <span>Legacy Record (Requires Re-upload to Firebase Storage)</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                                <span>📄</span>
                                <span>PDF Available (Firebase Storage)</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E7DDD0]">
                          <button
                            onClick={() => setPreviewPaper(paper)}
                            className="w-full bg-[#F7F4EF] hover:bg-[#C89B4A] text-[#1B1B1B] hover:text-white py-2.5 px-3 rounded-xl border border-[#E7DDD0] transition-all font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>

                          <button
                            onClick={() => handleDownload(paper)}
                            className="w-full bg-[#1B1B1B] hover:bg-[#C89B4A] text-white py-2.5 px-3 rounded-xl transition-all font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download PDF</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clean PDF Preview Modal */}
      {previewPaper && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-[#E7DDD0] shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#1B1B1B] text-white p-5 flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">📚</span>
                  <span className="text-sm font-extrabold tracking-wide text-amber-300">
                    {previewPaper.department} {previewPaper.programme} – {previewPaper.semester}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{previewPaper.paper}:</span>
                  <span className="text-amber-100">{previewPaper.course}</span>
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                    {previewPaper.year} ({previewPaper.examType})
                  </span>
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDownload(previewPaper)}
                  className="bg-[#C89B4A] hover:bg-[#B98A32] text-white px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download PDF</span>
                </button>

                {getPdfSrc(previewPaper) && (
                  <button
                    onClick={() => handleOpenNewWindow(previewPaper)}
                    className="bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Open Full Screen</span>
                  </button>
                )}

                <button
                  onClick={() => setPreviewPaper(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body - Embedded Viewer */}
            <div className="flex-1 bg-slate-100 p-4 relative overflow-hidden flex items-center justify-center">
              {getPdfSrc(previewPaper) ? (
                <div className="w-full h-full relative rounded-2xl overflow-hidden border border-slate-300 shadow-inner bg-slate-900">
                  <object
                    data={getPdfSrc(previewPaper)!}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <embed
                      src={getPdfSrc(previewPaper)!}
                      type="application/pdf"
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 bg-white flex flex-col items-center justify-center p-6 text-center space-y-4">
                      <FileText className="h-12 w-12 text-[#C89B4A]" />
                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-[#1B1B1B]">
                          Inline PDF Viewer
                        </h3>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          Click below to open or download the PDF file directly.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <a
                          href={getPdfSrc(previewPaper)!}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-[#C89B4A] hover:bg-[#B98A32] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
                        >
                          <Maximize2 className="h-4 w-4" />
                          Open PDF in New Window
                        </a>
                        <button
                          onClick={() => handleDownload(previewPaper)}
                          className="bg-[#1B1B1B] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                        >
                          <Download className="h-4 w-4" />
                          Download File
                        </button>
                      </div>
                    </div>
                  </object>
                </div>
              ) : (
                <div className="text-center p-8 bg-white rounded-3xl border border-[#E7DDD0] space-y-3 max-w-md">
                  <FileText className="h-12 w-12 text-[#C89B4A] mx-auto" />
                  <h3 className="text-base font-extrabold text-[#1B1B1B]">Question Paper Ready</h3>
                  <p className="text-xs text-[#6B6B6B] font-medium">
                    The PDF for {previewPaper.paper} ({previewPaper.course}) is available in the university records bank.
                  </p>
                  <button
                    onClick={() => handleDownload(previewPaper)}
                    className="w-full bg-[#C89B4A] text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Download Question Paper PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
