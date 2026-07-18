import React from 'react';
import { Trash2, Plus, AlertCircle } from 'lucide-react';
import { NavigationItem } from '../types';

interface NavigationIndexTableProps {
  items: NavigationItem[];
  onChange: (updatedItems: NavigationItem[]) => void;
  totalPages: number;
}

export const NavigationIndexTable: React.FC<NavigationIndexTableProps> = ({
  items,
  onChange,
  totalPages
}) => {
  const handleAddItem = () => {
    const newItem: NavigationItem = {
      id: `nav-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'course',
      title: 'New Course/Section Title',
      semester: 'Semester I',
      startPage: 1,
      endPage: 1
    };
    onChange([...items, newItem]);
  };

  const handleUpdateItem = (id: string, field: keyof NavigationItem, value: any) => {
    const updated = items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        // Ensure bounds validation
        if (field === 'startPage') {
          updatedItem.startPage = Math.max(1, Math.min(totalPages, Number(value) || 1));
          if (updatedItem.startPage > updatedItem.endPage) {
            updatedItem.endPage = updatedItem.startPage;
          }
        }
        if (field === 'endPage') {
          updatedItem.endPage = Math.max(1, Math.min(totalPages, Number(value) || 1));
          if (updatedItem.endPage < updatedItem.startPage) {
            updatedItem.startPage = updatedItem.endPage;
          }
        }
        return updatedItem;
      }
      return item;
    });
    onChange(updated);
  };

  const handleDeleteItem = (id: string) => {
    onChange(items.filter(item => item.id !== id));
  };

  return (
    <div className="bg-[#FDFBF7] border border-[#E7DDD0] rounded-2xl p-5 space-y-4 shadow-sm" id="unified-nav-index-table-container">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h5 className="text-xs font-black uppercase text-slate-900 tracking-wider">Unified Syllabus Navigation Index</h5>
          <p className="text-[10px] font-bold text-[#6B6B6B]">
            Map major Semesters, General Sections (MDC, SEC, etc.), or Specific Courses to their exact page ranges.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddItem}
          className="inline-flex items-center gap-1.5 bg-[#C89B4A] hover:bg-[#B98A32] text-white font-extrabold text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Navigation Item</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-[#E7DDD0] rounded-xl p-8 text-center bg-[#F2EEE8]/10 space-y-1.5">
          <AlertCircle className="h-5 w-5 text-[#C89B4A] mx-auto opacity-70" />
          <p className="text-xs font-extrabold text-[#1B1B1B] uppercase tracking-wide">No Index Records</p>
          <p className="text-[10px] text-[#6B6B6B] font-semibold max-w-sm mx-auto">
            Click "Add Navigation Item" or upload a fresh syllabus to extract headings automatically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#E7DDD0] rounded-xl bg-white shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F2EEE8]/80 text-[#6B6B6B] font-black uppercase text-[9px] tracking-wider border-b border-[#E7DDD0]">
                <th className="p-3 w-1/5">Type</th>
                <th className="p-3 w-1/4">Title / Heading</th>
                <th className="p-3 w-1/5">Semester</th>
                <th className="p-3 w-1/12 text-center">Start Page</th>
                <th className="p-3 w-1/12 text-center">End Page</th>
                <th className="p-3 w-1/12 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7DDD0]/60">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-[#F2EEE8]/20 transition-colors">
                  {/* Type Select */}
                  <td className="p-3">
                    <select
                      value={item.type}
                      onChange={(e) => handleUpdateItem(item.id, 'type', e.target.value)}
                      className="w-full bg-[#F2EEE8]/40 border border-[#E7DDD0] hover:border-[#C89B4A] text-xs font-bold px-2 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C89B4A] transition-colors"
                    >
                      <option value="semester">Semester</option>
                      <option value="section">Section (MDC/SEC/AEC)</option>
                      <option value="course">Course Syllabus</option>
                    </select>
                  </td>

                  {/* Title Input */}
                  <td className="p-3">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => handleUpdateItem(item.id, 'title', e.target.value)}
                      className="w-full bg-white border border-[#E7DDD0] focus:border-[#C89B4A] text-xs font-bold px-2 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C89B4A]"
                      placeholder="e.g. Econometrics I / Semester I / MDC"
                      required
                    />
                  </td>

                  {/* Semester Input */}
                  <td className="p-3">
                    <input
                      type="text"
                      value={item.semester || ''}
                      onChange={(e) => handleUpdateItem(item.id, 'semester', e.target.value)}
                      className="w-full bg-white border border-[#E7DDD0] focus:border-[#C89B4A] text-xs font-bold px-2 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C89B4A]"
                      placeholder="e.g. Semester I (Optional)"
                    />
                  </td>

                  {/* Start Page Input */}
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={item.startPage}
                      onChange={(e) => handleUpdateItem(item.id, 'startPage', e.target.value)}
                      className="w-16 bg-[#F2EEE8]/30 border border-[#E7DDD0] focus:border-[#C89B4A] text-xs font-bold text-center px-1.5 py-1 rounded-lg focus:outline-none"
                    />
                  </td>

                  {/* End Page Input */}
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={item.endPage}
                      onChange={(e) => handleUpdateItem(item.id, 'endPage', e.target.value)}
                      className="w-16 bg-[#F2EEE8]/30 border border-[#E7DDD0] focus:border-[#C89B4A] text-xs font-bold text-center px-1.5 py-1 rounded-lg focus:outline-none"
                    />
                  </td>

                  {/* Delete Button */}
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove from index"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
