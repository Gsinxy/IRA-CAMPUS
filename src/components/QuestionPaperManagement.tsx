import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Calendar,
  Tag,
  Eye,
  X
} from 'lucide-react';
import { QuestionPaper } from '../types';

interface QuestionPaperManagementProps {
  adminEmail?: string;
  authHeader?: string;
}

export const QuestionPaperManagement: React.FC<QuestionPaperManagementProps> = ({ adminEmail, authHeader }) => {
  const [papers, setPapers] = useState<QuestionPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form Fields State
  const [department, setDepartment] = useState('Economics');
  const [programme, setProgramme] = useState('UG');
  const [semester, setSemester] = useState('Semester III');
  const [paper, setPaper] = useState('');
  const [course, setCourse] = useState('');
  const [year, setYear] = useState('2025');
  const [examType, setExamType] = useState('Regular');
  const [keywords, setKeywords] = useState('');

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');

  // Preview & Delete Confirmation State
  const [previewPaper, setPreviewPaper] = useState<QuestionPaper | null>(null);
  const [deletingPaper, setDeletingPaper] = useState<{ id: string; name: string } | null>(null);

  const departmentsList = [
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

  const programmesList = ['UG', 'PG', 'Honours', 'General', 'B.Tech', 'BCA', 'MCA'];

  const semestersList = [
    'Semester I',
    'Semester II',
    'Semester III',
    'Semester IV',
    'Semester V',
    'Semester VI',
    'Semester VII',
    'Semester VIII'
  ];

  const examTypesList = ['Regular', 'Back', 'Supplementary', 'Improvement'];

  const fetchPapers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/question-papers');
      if (res.ok) {
        const data = await res.json();
        setPapers(data);
      } else {
        setError('Failed to fetch existing question papers.');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        setError('Please upload a valid PDF document.');
        return;
      }
      setSelectedFile(file);
      setError(null);

      console.log('[QUESTION PAPER]');
      console.log('Selected file:');
      console.log('name:', file.name);
      console.log('size:', `${(file.size / 1024).toFixed(1)} KB`);
      console.log('type:', file.type);

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setFileBase64(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!department || !programme || !semester || !paper || !course || !year || !examType) {
      setError('Please fill in all required question paper metadata.');
      return;
    }

    if (!fileBase64 && !selectedFile) {
      setError('Please upload a Question Paper PDF file.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        department,
        programme,
        semester,
        paper,
        course,
        year,
        examType,
        keywords,
        fileBase64,
        fileName: selectedFile?.name || `${department}_${semester}_${paper}_${year}.pdf`,
        uploadedBy: adminEmail || 'Admin'
      };

      const res = await fetch('/api/question-papers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Question paper "${paper} - ${course}" uploaded successfully.`);
        setPaper('');
        setCourse('');
        setKeywords('');
        setSelectedFile(null);
        setFileBase64('');
        fetchPapers();
      } else {
        setError(data.error || 'Failed to upload question paper.');
      }
    } catch (err: any) {
      setError(err.message || 'Error submitting question paper.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (id: string, name: string) => {
    setDeletingPaper({ id, name });
  };

  const confirmDelete = async () => {
    if (!deletingPaper) return;
    const { id } = deletingPaper;
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/question-papers/${id}`, {
        method: 'DELETE',
        headers: {
          ...(authHeader ? { Authorization: authHeader } : {})
        }
      });
      if (res.ok) {
        setSuccess('Question paper record deleted successfully.');
        setDeletingPaper(null);
        fetchPapers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete record.');
      }
    } catch (err: any) {
      setError(err.message || 'Error deleting question paper.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload Form Card */}
      <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 lg:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-[#E7DDD0] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#C89B4A]/10 border border-[#C89B4A]/30 rounded-2xl text-[#C89B4A]">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#1B1B1B]">Upload Previous Year Question Paper</h2>
              <p className="text-xs text-[#6B6B6B] font-medium mt-0.5">
                Add official examination question papers with structured metadata to the campus repository.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Department */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Department <span className="text-rose-500">*</span>
              </label>
              <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors cursor-pointer"
                required
              >
                {departmentsList.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Programme */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Programme <span className="text-rose-500">*</span>
              </label>
              <select
                value={programme}
                onChange={e => setProgramme(e.target.value)}
                className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors cursor-pointer"
                required
              >
                {programmesList.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Semester <span className="text-rose-500">*</span>
              </label>
              <select
                value={semester}
                onChange={e => setSemester(e.target.value)}
                className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors cursor-pointer"
                required
              >
                {semestersList.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Paper Number */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Paper Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={paper}
                onChange={e => setPaper(e.target.value)}
                placeholder="e.g. Paper V, Paper VI"
                className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors"
                required
              />
            </div>

            {/* Course Name */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Course Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={course}
                onChange={e => setCourse(e.target.value)}
                placeholder="e.g. Microeconomics I, Macroeconomics I"
                className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors"
                required
              />
            </div>

            {/* Examination Year */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Examination Year <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={year}
                onChange={e => setYear(e.target.value)}
                placeholder="e.g. 2025, 2024"
                className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors"
                required
              />
            </div>

            {/* Exam Type */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Exam Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={examType}
                onChange={e => setExamType(e.target.value)}
                className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors cursor-pointer"
                required
              >
                {examTypesList.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Keywords (Optional) */}
            <div className="space-y-1.5 md:col-span-3">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Keywords (Optional)
              </label>
              <input
                type="text"
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                placeholder="e.g. Microeconomics, Consumer Theory, Demand Analysis (comma separated)"
                className="w-full bg-[#F7F4EF] border border-[#E7DDD0] focus:border-[#C89B4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1B1B1B] focus:outline-none transition-colors"
              />
            </div>

            {/* PDF Upload */}
            <div className="space-y-1.5 md:col-span-3">
              <label className="block text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider">
                Question Paper PDF File <span className="text-rose-500">*</span>
              </label>
              <div className="border-2 border-dashed border-[#E7DDD0] hover:border-[#C89B4A] rounded-2xl p-6 bg-[#F7F4EF]/50 text-center transition-colors cursor-pointer relative">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  required={!selectedFile}
                />
                <FileText className="h-8 w-8 text-[#C89B4A] mx-auto mb-2" />
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold text-[#1B1B1B]">{selectedFile.name}</p>
                    <p className="text-[10px] text-emerald-700 font-bold">
                      {(selectedFile.size / 1024).toFixed(1)} KB — Ready for upload
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold text-[#1B1B1B]">
                      Click or drag and drop Question Paper PDF file here
                    </p>
                    <p className="text-[10px] text-[#6B6B6B]">Supports PDF format up to 25MB</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#C89B4A] hover:bg-[#B98A32] text-white py-3 px-6 rounded-xl font-bold text-xs shadow-md shadow-[#C89B4A]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Uploading Question Paper...</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>Publish Question Paper to Bank</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Existing Papers List */}
      <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 lg:p-8 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-[#E7DDD0] pb-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#1B1B1B]">
            <BookOpen className="h-5 w-5 text-[#C89B4A]" />
            <span>Repository Question Papers ({papers.length})</span>
          </div>
          <button
            onClick={fetchPapers}
            className="text-xs font-bold text-[#C89B4A] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-xs font-semibold text-[#6B6B6B]">
            Loading stored question papers...
          </div>
        ) : papers.length === 0 ? (
          <div className="text-center py-12 text-xs font-semibold text-[#6B6B6B]">
            No question papers uploaded yet.
          </div>
        ) : (
          <div className="divide-y divide-[#E7DDD0]">
            {papers.map(p => (
              <div key={p.id} className="py-4 flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#1B1B1B]">
                      {p.department} ({p.programme}) – {p.semester}
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                      {p.year} {p.examType}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#C89B4A]">
                    {p.paper}: <span className="text-[#1B1B1B]">{p.course}</span>
                  </p>
                  <p className="text-[10px] text-[#6B6B6B]">
                    Uploaded by {p.uploadedBy || 'Admin'} on {new Date(p.uploadedAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setPreviewPaper(p)}
                    className="p-2 text-[#6B6B6B] hover:text-[#1B1B1B] hover:bg-[#F7F4EF] rounded-xl transition-colors cursor-pointer"
                    title="View Paper"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(p.id, `${p.paper} - ${p.course}`)}
                    className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    title="Delete Paper"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingPaper && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#E7DDD0] shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-5 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#1B1B1B]">Confirm Paper Deletion</h3>
                <p className="text-xs text-[#6B6B6B]">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-[#1B1B1B] bg-rose-50/60 p-3.5 rounded-2xl border border-rose-100">
              Are you sure you want to permanently delete <strong>"{deletingPaper.name}"</strong> from the repository?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPaper(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Paper
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewPaper && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#E7DDD0] shadow-2xl w-full max-w-3xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E7DDD0] pb-3">
              <h3 className="text-base font-extrabold text-[#1B1B1B]">
                {previewPaper.department} – {previewPaper.paper}: {previewPaper.course}
              </h3>
              <button
                onClick={() => setPreviewPaper(null)}
                className="p-1.5 text-[#6B6B6B] hover:text-[#1B1B1B] rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-[#F7F4EF] p-4 rounded-2xl text-xs space-y-2">
              <p>
                <strong>Department:</strong> {previewPaper.department}
              </p>
              <p>
                <strong>Programme:</strong> {previewPaper.programme}
              </p>
              <p>
                <strong>Semester:</strong> {previewPaper.semester}
              </p>
              <p>
                <strong>Paper:</strong> {previewPaper.paper}
              </p>
              <p>
                <strong>Course:</strong> {previewPaper.course}
              </p>
              <p>
                <strong>Year & Exam Type:</strong> {previewPaper.year} ({previewPaper.examType})
              </p>
              {previewPaper.keywords && previewPaper.keywords.length > 0 && (
                <p>
                  <strong>Keywords:</strong> {previewPaper.keywords.join(', ')}
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setPreviewPaper(null)}
                className="px-4 py-2 bg-[#1B1B1B] text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
