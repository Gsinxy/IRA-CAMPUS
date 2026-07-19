import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  Trash2, 
  Image as ImageIcon, 
  FileText, 
  AlertCircle, 
  Check, 
  RefreshCw, 
  Calendar,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { Timetable } from '../types';
import { auth } from '../firebase';

interface TimetableManagementProps {
  adminEmail: string;
}

export const TIMETABLE_DEPARTMENTS = [
  "Economics",
  "Odia",
  "English",
  "History",
  "Political Science",
  "Education",
  "Sociology",
  "Philosophy",
  "Hindi",
  "Sanskrit",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Botany",
  "Zoology",
  "Computer Science",
  "Commerce"
];

export const TIMETABLE_SEMESTERS = [
  "UG 1st Sem",
  "UG 2nd Sem",
  "UG 3rd Sem",
  "UG 4th Sem",
  "UG 5th Sem",
  "UG 6th Sem",
  "PG 1st Sem",
  "PG 2nd Sem",
  "PG 3rd Sem",
  "PG 4th Sem"
];

export const TimetableManagement: React.FC<TimetableManagementProps> = ({ adminEmail }) => {
  // Form State
  const [department, setDepartment] = useState('');
  const [isCustomDept, setIsCustomDept] = useState(false);
  const [customDept, setCustomDept] = useState('');
  const [semester, setSemester] = useState('');
  const [session, setSession] = useState('2026-27');
  
  // File State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileError, setFileError] = useState('');

  // Operations State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [existingTimetables, setExistingTimetables] = useState<Timetable[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  
  // Check if target timetable already exists for overwrite check
  const [targetExists, setTargetExists] = useState<Timetable | null>(null);

  useEffect(() => {
    fetchTimetables();
  }, []);

  // Recalculate overwrite check
  useEffect(() => {
    const finalDept = isCustomDept ? customDept.trim() : department;
    if (finalDept && semester && session && existingTimetables.length > 0) {
      const match = existingTimetables.find(
        tt => tt.department.toLowerCase() === finalDept.toLowerCase() &&
              tt.semester.toLowerCase() === semester.toLowerCase() &&
              tt.session.toLowerCase() === session.toLowerCase()
      );
      setTargetExists(match || null);
    } else {
      setTargetExists(null);
    }
  }, [department, customDept, isCustomDept, semester, session, existingTimetables]);

  const getAuthHeader = async () => {
    try {
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        return { 'Authorization': `Bearer ${token}` };
      }
    } catch (e) {
      console.error('Failed to get auth token:', e);
    }
    return {};
  };

  const fetchTimetables = async () => {
    setIsLoadingList(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/timetables', {
        headers: {
          ...authHeader
        }
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setExistingTimetables(data);
      } else {
        const text = await res.text();
        console.warn('Non-JSON response in fetchTimetables:', text.substring(0, 200));
      }
    } catch (e) {
      console.error('Failed to fetch timetables:', e);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    setUploadError('');
    setUploadSuccess('');
    if (!file) return;

    // Validate type: JPG, JPEG, PNG, WEBP, PDF
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(extension)) {
      setFileError('Invalid file type. Only JPG, JPEG, PNG, WEBP, and PDF files are allowed.');
      setSelectedFile(null);
      setPreviewUrl('');
      setFileBase64('');
      return;
    }

    // Check file size (max 800 KB)
    if (file.size > 800 * 1024) {
      setFileError('File is too large. Please select a timetable file smaller than 800 KB to ensure proper storage compatibility.');
      setSelectedFile(null);
      setPreviewUrl('');
      setFileBase64('');
      return;
    }

    setSelectedFile(file);

    // Read as Base64 for transmission & Preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setFileBase64(result);
      if (file.type !== 'application/pdf') {
        setPreviewUrl(result);
      } else {
        setPreviewUrl('pdf'); // PDF flag for placeholder preview
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async (e: React.FormEvent, forceReplace = false) => {
    e.preventDefault();
    setUploadError('');
    setUploadSuccess('');

    const finalDept = isCustomDept ? customDept.trim() : department;
    if (!finalDept) {
      setUploadError('Please select or specify a department.');
      return;
    }
    if (!semester) {
      setUploadError('Please select a semester.');
      return;
    }
    if (!session.trim()) {
      setUploadError('Academic session is required.');
      return;
    }
    if (!selectedFile || !fileBase64) {
      setUploadError('Please choose a timetable file to upload.');
      return;
    }

    // Overwrite safety block if not explicitly forced
    if (targetExists && !forceReplace) {
      setUploadError('A timetable already exists for this Department, Semester, and Session. Click "Replace Existing Timetable" to replace.');
      return;
    }

    setIsUploading(true);
    try {
      const payload = {
        department: finalDept,
        semester,
        session: session.trim(),
        fileBase64,
        fileName: selectedFile.name,
        fileType: selectedFile.type === 'application/pdf' ? 'pdf' : 'image',
        uploadedBy: adminEmail || 'Admin'
      };

      const authHeader = await getAuthHeader();
      const res = await fetch('/api/timetables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type');
      let data: any = null;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('Server returned non-JSON response on timetable upload:', text);
        throw new Error('Upload failed. Please try again.');
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed. Please try again.');
      }

      setUploadSuccess(`Timetable uploaded successfully.`);
      
      // Clear form inputs except session & department choice for ease of next entry
      setSelectedFile(null);
      setFileBase64('');
      setPreviewUrl('');
      setTargetExists(null);

      // Refresh list
      await fetchTimetables();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this timetable? This action is permanent and cannot be undone.')) {
      return;
    }

    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/timetables/${id}`, {
        method: 'DELETE',
        headers: {
          ...authHeader
        }
      });

      const contentType = res.headers.get('content-type');
      let data: any = null;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('Server returned non-JSON response on timetable delete:', text);
        throw new Error('Deletion failed. Please try again.');
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Deletion failed. Please try again.');
      }

      fetchTimetables();
    } catch (err: any) {
      alert(err.message || 'Deletion failed. Please try again.');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Title block */}
      <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none">
          <Calendar className="h-28 w-28 text-[#C89B4A]" />
        </div>
        <div className="max-w-2xl space-y-2">
          <span className="text-[10px] bg-[#C89B4A]/10 text-[#C89B4A] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
            Admin Management
          </span>
          <h2 className="text-xl md:text-2xl font-black text-[#1B1B1B] uppercase tracking-wide">
            📅 Departmental Timetable Management
          </h2>
          <p className="text-xs md:text-sm text-[#6B6B6B] leading-relaxed font-medium">
            Upload and replace department-specific class timetables. Students will automatically receive and view the latest official files directly on their portal, aligned with their program and semester profile.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        
        {/* Left column: Upload form (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 shadow-sm">
            <h3 className="text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider mb-5 flex items-center gap-1.5 border-b border-[#E7DDD0]/50 pb-3">
              <Upload className="h-4 w-4 text-[#C89B4A]" />
              <span>Upload Timetable Form</span>
            </h3>

            <form onSubmit={(e) => handleUpload(e, false)} className="space-y-4 text-xs font-semibold">
              
              {/* Department Dropdown / Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-[#6B6B6B] font-extrabold uppercase tracking-wide">
                  Department
                </label>
                <div className="flex gap-2">
                  {!isCustomDept ? (
                    <div className="relative flex-1">
                      <select
                        value={department}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setIsCustomDept(true);
                            setDepartment('');
                          } else {
                            setDepartment(e.target.value);
                          }
                        }}
                        className="w-full bg-[#F2EEE8]/60 border border-[#E7DDD0] text-xs text-[#1B1B1B] rounded-xl px-3.5 py-3 focus:outline-none focus:ring-1 focus:ring-[#C89B4A] focus:border-[#C89B4A] transition-all appearance-none cursor-pointer pr-10"
                      >
                        <option value="">-- Select Department --</option>
                        {TIMETABLE_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                        <option value="__custom__">+ Other (Enter custom department)</option>
                      </select>
                      <ChevronDown className="absolute right-3.5 top-3.5 h-4 w-4 text-[#6B6B6B] pointer-events-none" />
                    </div>
                  ) : (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={customDept}
                        onChange={(e) => setCustomDept(e.target.value)}
                        placeholder="e.g. Anthropology, Zoology"
                        className="flex-1 bg-white border border-[#E7DDD0] rounded-xl px-3.5 py-3 text-xs focus:ring-1 focus:ring-[#C89B4A] focus:border-[#C89B4A] focus:outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomDept(false);
                          setCustomDept('');
                        }}
                        className="px-3.5 bg-[#F2EEE8] hover:bg-[#E7DDD0] rounded-xl transition-all font-bold"
                        title="Back to list"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Semester Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-[#6B6B6B] font-extrabold uppercase tracking-wide">
                  Semester
                </label>
                <div className="relative">
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full bg-[#F2EEE8]/60 border border-[#E7DDD0] text-xs text-[#1B1B1B] rounded-xl px-3.5 py-3 focus:outline-none focus:ring-1 focus:ring-[#C89B4A] focus:border-[#C89B4A] transition-all appearance-none cursor-pointer pr-10"
                  >
                    <option value="">-- Select Semester --</option>
                    {TIMETABLE_SEMESTERS.map((sem) => (
                      <option key={sem} value={sem}>{sem}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3.5 h-4 w-4 text-[#6B6B6B] pointer-events-none" />
                </div>
              </div>

              {/* Academic Session */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-[#6B6B6B] font-extrabold uppercase tracking-wide">
                  Academic Session
                </label>
                <input
                  type="text"
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  placeholder="e.g. 2026-27"
                  className="w-full bg-white border border-[#E7DDD0] rounded-xl px-3.5 py-3 focus:ring-1 focus:ring-[#C89B4A] focus:border-[#C89B4A] focus:outline-none transition-all"
                />
              </div>

              {/* File Upload Zone */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-[#6B6B6B] font-extrabold uppercase tracking-wide">
                  Upload Official Timetable (JPG, PNG, WEBP, PDF)
                </label>
                <div className="border-2 border-dashed border-[#E7DDD0] hover:border-[#C89B4A]/50 rounded-2xl p-5 text-center bg-[#F7F4EF]/20 relative transition-all cursor-pointer">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="space-y-2">
                    <div className="mx-auto w-10 h-10 rounded-xl bg-[#F2EEE8] flex items-center justify-center text-[#C89B4A]">
                      {selectedFile ? (
                        selectedFile.type === 'application/pdf' ? (
                          <FileText className="h-5 w-5" />
                        ) : (
                          <ImageIcon className="h-5 w-5" />
                        )
                      ) : (
                        <Upload className="h-5 w-5" />
                      )}
                    </div>
                    <div className="text-[11px] text-[#6B6B6B]">
                      {selectedFile ? (
                        <p className="font-bold text-[#1B1B1B] truncate">{selectedFile.name}</p>
                      ) : (
                        <p>Click or drag-and-drop timetable file here</p>
                      )}
                    </div>
                  </div>
                </div>
                {fileError && <p className="text-[10px] text-red-500 font-bold mt-1">{fileError}</p>}
              </div>

              {/* Preview Box */}
              {previewUrl && (
                <div className="border border-[#E7DDD0] rounded-2xl p-3 bg-[#F2EEE8]/30 space-y-2">
                  <span className="text-[9px] text-[#6B6B6B] uppercase font-bold tracking-wide block">
                    Upload Preview
                  </span>
                  {previewUrl === 'pdf' ? (
                    <div className="flex items-center gap-3 p-2 bg-white border border-[#E7DDD0] rounded-xl">
                      <FileText className="h-8 w-8 text-[#C89B4A]" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[#1B1B1B] truncate">{selectedFile?.name}</p>
                        <p className="text-[9px] text-[#6B6B6B] font-semibold">PDF Syllabus / Schedule</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-[#E7DDD0] max-h-40 bg-white flex justify-center items-center">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-40 object-contain w-auto"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Operation Messages */}
              {uploadError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                  <p className="text-[11px] leading-relaxed font-bold">{uploadError}</p>
                </div>
              )}

              {uploadSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-[#5B8A5A] p-3 rounded-xl flex items-start gap-2 animate-in fade-in">
                  <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
                  <p className="text-[11px] leading-relaxed font-bold">{uploadSuccess}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col gap-2">
                {!targetExists ? (
                  <button
                    type="submit"
                    disabled={isUploading || !selectedFile}
                    className="w-full bg-[#C89B4A] hover:bg-[#B98A32] disabled:bg-[#E6DED3] text-white py-3 rounded-xl transition-all font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-[#C89B4A]/15 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Uploading Timetable...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        <span>Upload Timetable</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-[#C89B4A]/5 border border-[#C89B4A]/20 p-3 rounded-xl flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#C89B4A]" />
                      <p className="text-[11px] text-[#B98A32] font-semibold leading-relaxed">
                        A timetable already exists for <strong>{targetExists.department}</strong> - <strong>{targetExists.semester}</strong>. You can overwrite it instantly.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleUpload(e, true)}
                      disabled={isUploading || !selectedFile}
                      className="w-full bg-[#C89B4A] hover:bg-[#B98A32] disabled:bg-[#E6DED3] text-white py-3 rounded-xl transition-all font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-[#C89B4A]/15 cursor-pointer"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Replacing Timetable...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          <span>Replace Existing Timetable</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

            </form>
          </div>
        </div>

        {/* Right column: Timetable Directory Table (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white border border-[#E7DDD0] rounded-3xl p-6 shadow-sm min-h-[400px] flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#E7DDD0]/50 pb-3">
                <Calendar className="h-4 w-4 text-[#C89B4A]" />
                <span>Uploaded Timetables Directory</span>
                <span className="ml-auto bg-[#F2EEE8] text-[#C89B4A] text-[9px] font-extrabold font-mono px-2 py-0.5 rounded-full">
                  {existingTimetables.length} Total
                </span>
              </h3>

              {isLoadingList ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="h-8 w-8 text-[#C89B4A] animate-spin" />
                  <p className="text-xs text-[#6B6B6B] font-semibold">Loading timetables database...</p>
                </div>
              ) : existingTimetables.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-[#E7DDD0] rounded-2xl space-y-3 p-6">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-[#F7F4EF] flex items-center justify-center text-[#6B6B6B]/40">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1B1B1B] uppercase">No timetables found</h4>
                    <p className="text-[11px] text-[#6B6B6B] font-semibold mt-1 max-w-sm mx-auto">
                      Fill out the form on the left to upload the first departmental/semester timetable sheet.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#E7DDD0] text-[10px] text-[#6B6B6B] font-extrabold uppercase tracking-wider">
                        <th className="py-3 px-2">Department / Session</th>
                        <th className="py-3 px-2">Semester</th>
                        <th className="py-3 px-2">Type / Size</th>
                        <th className="py-3 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7DDD0]/50 font-semibold text-[#1B1B1B]">
                      {existingTimetables.map((tt) => (
                        <tr key={tt.id} className="hover:bg-[#F7F4EF]/30 transition-colors">
                          <td className="py-3.5 px-2">
                            <div className="font-bold">{tt.department}</div>
                            <div className="text-[9px] text-[#6B6B6B] font-semibold mt-0.5">Session: {tt.session}</div>
                          </td>
                          <td className="py-3.5 px-2 font-mono text-[11px] text-[#C89B4A]">
                            {tt.semester}
                          </td>
                          <td className="py-3.5 px-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold">
                              {tt.fileType === 'pdf' ? (
                                <FileText className="h-3 w-3 text-red-500" />
                              ) : (
                                <ImageIcon className="h-3 w-3 text-emerald-500" />
                              )}
                              <span className="uppercase">{tt.fileType}</span>
                              <span className="text-[#6B6B6B] font-semibold">({tt.fileSize || 'N/A'})</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <a
                                href={tt.fileUrl}
                                target="_blank"
                                rel="referrer noopener"
                                className="p-2 hover:bg-[#F2EEE8] text-[#C89B4A] hover:text-[#B98A32] rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                                title="Open Original File"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button
                                onClick={() => handleDelete(tt.id)}
                                className="p-2 hover:bg-rose-50 text-rose-600 hover:text-rose-700 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                                title="Delete Timetable"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border-t border-[#E7DDD0] pt-4 mt-6 text-[10px] text-[#6B6B6B] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>All changes automatically sync with students instantly</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
