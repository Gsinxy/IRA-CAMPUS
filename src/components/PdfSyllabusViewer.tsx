import React, { useEffect, useRef, useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  AlertCircle, 
  FileText, 
  Download, 
  X, 
  List,
  ChevronDown,
  Maximize2,
  Minimize2,
  BookOpen
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavigationItem } from '../types';

interface PdfSyllabusViewerProps {
  fileBase64: string;
  title: string;
  searchKeyword: string;
  onClose?: () => void;
  navigation?: {
    startPage: number;
    endPage: number;
    title: string;
    semester?: string;
    paper?: string;
    sectionTitle?: string;
  };
  semester_index?: Record<string, { start_page: number; end_page: number }>;
  section_index?: Record<string, { start_page: number; end_page: number }>;
  course_index?: Array<{
    course: string;
    semester?: string;
    start_page: number;
    end_page: number;
  }>;
}

interface MatchItem {
  pageNum: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PdfSyllabusViewer: React.FC<PdfSyllabusViewerProps> = ({
  fileBase64,
  title,
  searchKeyword,
  onClose,
  navigation,
  semester_index,
  section_index,
  course_index
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const renderedScaleRef = useRef<number>(1.2);
  
  const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState<number | 'fit'>('fit');
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  
  // Navigation Index Sidebar States (Drawer)
  const [showIndexSidebar, setShowIndexSidebar] = useState(false); // Collapsed by default
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [activeNavigationItem, setActiveNavigationItem] = useState<any>(null);
  const [expandedGroup, setExpandedGroup] = useState<'semesters' | 'sections' | 'courses' | null>('courses');
  
  // Success banner states
  const [isBannerExpanded, setIsBannerExpanded] = useState(true);
  
  // Full screen / Reading Mode state
  const [isReadingMode, setIsReadingMode] = useState(false);
  
  // Search state
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [highlights, setHighlights] = useState<MatchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 1. Dynamic script loader for PDF.js
  useEffect(() => {
    const loadPdfjs = () => {
      if ((window as any).pdfjsLib) {
        setPdfjsLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      script.async = true;
      script.onload = () => {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        setPdfjsLoaded(true);
      };
      script.onerror = () => {
        setError('Failed to load PDF engine. Please refresh or try again.');
      };
      document.head.appendChild(script);
    };

    loadPdfjs();
  }, []);

  // 2. Load PDF document from Base64
  useEffect(() => {
    if (!pdfjsLoaded || !fileBase64) return;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        
        // Convert Base64 to Uint8Array
        const binaryString = atob(fileBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setPageNum(navigation && navigation.startPage ? navigation.startPage : 1);
      } catch (err: any) {
        console.error('PDF loading error:', err);
        setError('Could not render syllabus PDF document. Please check file format.');
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [pdfjsLoaded, fileBase64]);

  // 3. Monitor container width for responsive fit sizing
  useEffect(() => {
    if (!containerRef.current) return;
    let timeoutId: any = null;
    
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        updateWidth();
      }, 100);
    });
    
    resizeObserver.observe(containerRef.current);
    
    window.addEventListener('resize', updateWidth);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  // Map indexes to standard structure
  const sems = React.useMemo(() => {
    return semester_index 
      ? (Object.entries(semester_index) as Array<[string, { start_page: number; end_page: number }]>).map(([key, val]) => ({
        id: `sem-${key}`,
        title: key,
        startPage: val.start_page,
        endPage: val.end_page,
        type: 'semester'
      }))
      : [];
  }, [semester_index]);

  const secs = React.useMemo(() => {
    return section_index 
      ? (Object.entries(section_index) as Array<[string, { start_page: number; end_page: number }]>).map(([key, val]) => ({
        id: `sec-${key}`,
        title: key,
        startPage: val.start_page,
        endPage: val.end_page,
        type: 'section'
      }))
      : [];
  }, [section_index]);

  const courses = React.useMemo(() => {
    return course_index 
      ? course_index.map((item, idx) => ({
        id: `course-${idx}`,
        title: item.course,
        startPage: item.start_page,
        endPage: item.end_page,
        semester: item.semester,
        type: 'course'
      }))
      : [];
  }, [course_index]);

  const filteredSems = React.useMemo(() => {
    return sems.filter(item => 
      item.title.toLowerCase().includes(sidebarSearch.toLowerCase())
    );
  }, [sems, sidebarSearch]);

  const filteredSecs = React.useMemo(() => {
    return secs.filter(item => 
      item.title.toLowerCase().includes(sidebarSearch.toLowerCase())
    );
  }, [secs, sidebarSearch]);

  const filteredCourses = React.useMemo(() => {
    return courses.filter(item => 
      item.title.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      (item.semester && item.semester.toLowerCase().includes(sidebarSearch.toLowerCase()))
    );
  }, [courses, sidebarSearch]);

  // Unified page range boundaries
  const startPageBound = navigation ? navigation.startPage : (activeNavigationItem ? activeNavigationItem.startPage : 1);
  const endPageBound = navigation ? navigation.endPage : (activeNavigationItem ? activeNavigationItem.endPage : totalPages || 1);

  // Jump to navigation start page when navigation changes
  useEffect(() => {
    if (navigation && navigation.startPage) {
      setPageNum(navigation.startPage);
    }
  }, [navigation]);

  // Collapse green banner after 3 seconds on navigation change
  useEffect(() => {
    if (navigation) {
      setIsBannerExpanded(true);
      const timer = setTimeout(() => {
        setIsBannerExpanded(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [navigation]);

  // Escape key listener for Reading Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isReadingMode) {
        setIsReadingMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReadingMode]);

  // Adjust pageNum to stay within active boundaries
  useEffect(() => {
    if (pageNum < startPageBound) {
      setPageNum(startPageBound);
    } else if (pageNum > endPageBound && endPageBound >= startPageBound) {
      setPageNum(endPageBound);
    }
  }, [startPageBound, endPageBound, pageNum]);

  // Synchronize activeNavigationItem based on pageNum and current indices
  useEffect(() => {
    const allItems = [...sems, ...secs, ...courses];
    if (allItems.length > 0) {
      const typePrecedence: Record<string, number> = { course: 1, section: 2, semester: 3 };
      const matched = allItems.filter(item => pageNum >= item.startPage && pageNum <= item.endPage);
      if (matched.length > 0) {
        matched.sort((a, b) => {
          return (typePrecedence[a.type] || 3) - (typePrecedence[b.type] || 3);
        });
        setActiveNavigationItem(matched[0]);
      } else {
        setActiveNavigationItem(null);
      }
    } else {
      setActiveNavigationItem(null);
    }
  }, [pageNum, sems, secs, courses]);

  // Auto-expand group based on active navigation item
  useEffect(() => {
    if (activeNavigationItem) {
      if (activeNavigationItem.type === 'semester') {
        setExpandedGroup('semesters');
      } else if (activeNavigationItem.type === 'section') {
        setExpandedGroup('sections');
      } else if (activeNavigationItem.type === 'course') {
        setExpandedGroup('courses');
      }
    }
  }, [activeNavigationItem]);

  // Auto-expand group based on search result
  useEffect(() => {
    if (sidebarSearch) {
      if (filteredCourses.length > 0) {
        setExpandedGroup('courses');
      } else if (filteredSecs.length > 0) {
        setExpandedGroup('sections');
      } else if (filteredSems.length > 0) {
        setExpandedGroup('semesters');
      }
    }
  }, [sidebarSearch, filteredCourses.length, filteredSecs.length, filteredSems.length]);

  // 4. Search logic across all pages when keyword or PDF changes
  useEffect(() => {
    if (!pdfDoc || !searchKeyword) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      const foundMatches: MatchItem[] = [];
      const queryLower = searchKeyword.toLowerCase();

      try {
        for (let p = 1; p <= pdfDoc.numPages; p++) {
          const page = await pdfDoc.getPage(p);
          const textContent = await page.getTextContent();
          
          // Concatenate all text items to test full matching
          const pageText = textContent.items.map((it: any) => it.str).join(' ');
          if (pageText.toLowerCase().includes(queryLower)) {
            let hasItemMatch = false;

            // Find exact matched text items and extract coordinates
            textContent.items.forEach((item: any) => {
              if (item.str && item.str.toLowerCase().includes(queryLower)) {
                const [scaleX, skewY, skewX, scaleY, x, y] = item.transform;
                
                foundMatches.push({
                  pageNum: p,
                  text: item.str,
                  x,
                  y,
                  w: item.width,
                  h: item.height
                });
                hasItemMatch = true;
              }
            });

            // If text is split across elements, fall back to marking the middle of the page
            if (!hasItemMatch) {
              foundMatches.push({
                pageNum: p,
                text: 'Section Match',
                x: 100,
                y: 500, // middle-ish height
                w: 300,
                h: 30
              });
            }
          }
        }

        setMatches(foundMatches);
        if (foundMatches.length > 0) {
          // Jump to the first match
          setCurrentMatchIndex(0);
          setPageNum(foundMatches[0].pageNum);
        } else {
          setCurrentMatchIndex(-1);
        }
      } catch (searchErr) {
        console.error('PDF search error:', searchErr);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [pdfDoc, searchKeyword]);

  // 5. Render Active Page and compute highlights overlay
  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        // Cancel any active rendering task before starting a new one
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (e) {
            // Task might already be completed, cancelled, or failed
          }
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Determine dynamic scale based on container width or manual setting
        let dynamicScale = 1.75;
        const pageViewport1 = page.getViewport({ scale: 1.0 });
        
        if (scale === 'fit') {
          if (containerWidth > 30 && pageViewport1.width > 30) {
            // Make the PDF occupy as much horizontal space as possible
            dynamicScale = containerWidth / pageViewport1.width;
            if (dynamicScale < 0.5) dynamicScale = 0.5;
            if (dynamicScale > 3.0) dynamicScale = 3.0;
          }
        } else {
          dynamicScale = scale;
        }

        renderedScaleRef.current = dynamicScale;

        const viewport = page.getViewport({ scale: dynamicScale });
        
        // Render PDF.js pages at high scale 1.75-2.0 and support crisp text on HiDPI displays
        const pixelRatio = Math.max(1.75, window.devicePixelRatio || 1);
        canvas.width = viewport.width * pixelRatio;
        canvas.height = viewport.height * pixelRatio;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        setViewportWidth(viewport.width);
        setViewportHeight(viewport.height);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;

        if (cancelled) return;
        renderTaskRef.current = null;

        // Compute screen coordinates for matched text items on THIS page
        const pageMatches = matches.filter(m => m.pageNum === pageNum);
        const screenHighlights: MatchItem[] = pageMatches.map(m => {
          const viewPoint = viewport.convertToViewportPoint(m.x, m.y);
          const scaledW = m.w * dynamicScale;
          const scaledH = m.h * dynamicScale;
          
          return {
            pageNum: m.pageNum,
            text: m.text,
            x: viewPoint[0],
            y: viewPoint[1] - scaledH, // Adjust top coordinate
            w: scaledW || 120,
            h: scaledH || 18
          };
        });

        setHighlights(screenHighlights);
      } catch (renderErr: any) {
        if (renderErr && renderErr.name === 'RenderingCancelledException') {
          return;
        }
        console.error('Error rendering PDF page:', renderErr);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNum, scale, containerWidth, matches]);

  // Next / Prev actions
  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIdx);
    setPageNum(matches[nextIdx].pageNum);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    setPageNum(matches[prevIdx].pageNum);
  };

  const downloadPdf = () => {
    try {
      const linkSource = `data:application/pdf;base64,${fileBase64}`;
      const downloadLink = document.createElement("a");
      const fileName = `${title.replace(/\s+/g, "_")}.pdf`;
      downloadLink.href = linkSource;
      downloadLink.download = fileName;
      downloadLink.click();
    } catch (e) {
      console.error('PDF download error:', e);
    }
  };

  const handleZoomOut = () => {
    setScale(Math.max(0.5, renderedScaleRef.current - 0.15));
  };

  const handleZoomIn = () => {
    setScale(Math.min(3.0, renderedScaleRef.current + 0.15));
  };

  const toggleGroup = (group: 'semesters' | 'sections' | 'courses') => {
    setExpandedGroup(prev => prev === group ? null : group);
  };

  const hasAnyIndices = sems.length > 0 || secs.length > 0 || courses.length > 0;

  return (
    <div 
      className={`flex flex-col transition-all duration-300 ${
        isReadingMode 
          ? 'fixed inset-0 z-50 bg-zinc-900 w-screen h-screen' 
          : 'h-full bg-white border-l border-[#E7DDD0]'
      }`} 
      ref={containerRef} 
      id="pdf-syllabus-navigator-root"
    >
      {/* Top Header */}
      <div className={`flex items-center justify-between px-5 py-3 border-b transition-colors ${
        isReadingMode 
          ? 'border-zinc-800 bg-zinc-950 text-white' 
          : 'border-[#E7DDD0] bg-[#FDFBF7] text-[#1B1B1B]'
      }`}>
        <div className="flex items-center space-x-2.5">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center border transition-colors ${
            isReadingMode 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-[#C89B4A]/10 text-[#C89B4A] border-[#C89B4A]/20'
          }`}>
            <FileText className="h-4.5 w-4.5" />
          </div>
          <div className="space-y-0.5 max-w-[150px] sm:max-w-[280px]">
            <h4 className={`text-xs font-black uppercase tracking-wide truncate`} title={title}>
              {title}
            </h4>
            <p className={`text-[9px] font-bold ${isReadingMode ? 'text-zinc-500' : 'text-[#6B6B6B]'}`}>
              Official University Syllabus
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1 sm:space-x-2">
          {hasAnyIndices && (
            <button
              onClick={() => setShowIndexSidebar(!showIndexSidebar)}
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${
                showIndexSidebar 
                  ? 'bg-[#C89B4A]/15 text-[#C89B4A] border border-[#C89B4A]/30' 
                  : isReadingMode
                    ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white border border-transparent'
                    : 'hover:bg-[#F2EEE8] text-[#6B6B6B] hover:text-[#1B1B1B] border border-transparent'
              }`}
              title="Toggle Navigation Index Drawer"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Index</span>
            </button>
          )}

          {/* Reading / Fullscreen Mode Toggle */}
          <button
            onClick={() => setIsReadingMode(!isReadingMode)}
            className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${
              isReadingMode
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'hover:bg-[#F2EEE8] text-[#6B6B6B] hover:text-[#1B1B1B] border border-transparent'
            }`}
            title={isReadingMode ? "Exit Reading Mode (Esc)" : "Enter Full Screen Reading Mode"}
          >
            {isReadingMode ? <Minimize2 className="h-4 w-4 text-emerald-400" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{isReadingMode ? "Exit Fullscreen" : "Fullscreen"}</span>
          </button>

          <button
            onClick={downloadPdf}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              isReadingMode 
                ? 'hover:bg-zinc-850 text-zinc-400 hover:text-white' 
                : 'hover:bg-[#F2EEE8] text-[#6B6B6B] hover:text-[#1B1B1B]'
            }`}
            title="Download PDF Syllabus"
          >
            <Download className="h-4.5 w-4.5" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                isReadingMode 
                  ? 'hover:bg-red-950/40 text-zinc-400 hover:text-red-400' 
                  : 'hover:bg-red-50 text-[#6B6B6B] hover:text-red-600'
              }`}
              title="Close PDF Panel"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation & Search Banner */}
      <div className={`px-5 py-2.5 border-b transition-colors ${
        isReadingMode 
          ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300' 
          : 'bg-[#F2EEE8]/40 border-[#E7DDD0] text-slate-800'
      }`}>
        <div className="flex flex-col space-y-2">
          {/* Collapsible Success Banner */}
          {navigation ? (
            isBannerExpanded ? (
              <div className="flex flex-col space-y-1 bg-[#E8F5E9] border border-emerald-200 rounded-xl px-4 py-2.5 relative">
                <div className="flex justify-between items-start">
                  <span className="text-sm font-black text-emerald-950 flex items-center gap-1 pr-8">
                    📖 {navigation.sectionTitle || navigation.title}
                  </span>
                  <button 
                    onClick={() => setIsBannerExpanded(false)}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 absolute right-4 top-2.5 cursor-pointer underline"
                  >
                    Collapse
                  </button>
                </div>
                {navigation.semester && (
                  <span className="text-xs font-bold text-emerald-800">
                    {navigation.semester}
                  </span>
                )}
                {navigation.paper && (
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
                    {navigation.paper}
                  </span>
                )}
                <span className="text-xs font-extrabold text-emerald-900 mt-1">
                  Pages {navigation.startPage}–{navigation.endPage}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 py-1.5 px-4 w-full bg-[#E8F5E9] border border-emerald-200 rounded-lg text-emerald-950 text-xs font-bold shadow-2xs">
                <span className="flex items-center gap-1 truncate max-w-[45%]">
                  📖 {navigation.sectionTitle || navigation.title}
                </span>
                {navigation.semester && (
                  <>
                    <span className="text-emerald-300">|</span>
                    <span className="text-emerald-800 truncate">{navigation.semester}</span>
                  </>
                )}
                <span className="text-emerald-300">|</span>
                <span className="text-emerald-900 whitespace-nowrap">Pages {navigation.startPage}–{navigation.endPage}</span>
                
                <button 
                  onClick={() => setIsBannerExpanded(true)}
                  className="ml-auto text-[10px] font-black uppercase text-emerald-700 hover:text-emerald-950 cursor-pointer"
                >
                  Details
                </button>
              </div>
            )
          ) : activeNavigationItem ? (
            <div className="flex items-center justify-between py-1.5 px-4 w-full bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-xs font-bold shadow-2xs">
              <div className="flex items-center space-x-2 truncate max-w-[85%]">
                <span className="truncate">📖 {activeNavigationItem.title}</span>
                {activeNavigationItem.semester && (
                  <>
                    <span className="text-amber-300">|</span>
                    <span className="text-amber-800 truncate">{activeNavigationItem.semester}</span>
                  </>
                )}
                <span className="text-amber-300">|</span>
                <span className="text-amber-950 whitespace-nowrap">Pages {activeNavigationItem.startPage}–{activeNavigationItem.endPage}</span>
              </div>
              <span className="text-[8px] font-black uppercase bg-[#C89B4A]/10 text-[#C89B4A] px-1.5 py-0.5 rounded-sm tracking-wider whitespace-nowrap">
                {activeNavigationItem.type}
              </span>
            </div>
          ) : searchKeyword && (
            <div className="flex items-center space-x-2 py-0.5">
              <span className="text-[10px] text-[#6B6B6B] font-extrabold uppercase tracking-wide">Showing results for:</span>
              <span className="bg-[#C89B4A] text-white text-[10px] px-2 py-0.5 rounded-lg font-black tracking-wide">
                "{searchKeyword}"
              </span>
            </div>
          )}

          {/* Controls Bar */}
          <div className="flex items-center justify-between pt-1">
            {/* Matches Navigation */}
            {!navigation && matches.length > 0 ? (
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  {currentMatchIndex + 1} of {matches.length} matches
                </span>
                <div className="flex space-x-1">
                  <button
                    onClick={handlePrevMatch}
                    className={`p-1 rounded-md border text-xs cursor-pointer transition-colors ${
                      isReadingMode
                        ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200'
                        : 'bg-white border-[#E7DDD0] hover:bg-[#F2EEE8] text-[#1B1B1B]'
                    }`}
                    title="Previous occurrence"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={handleNextMatch}
                    className={`p-1 rounded-md border text-xs cursor-pointer transition-colors ${
                      isReadingMode
                        ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200'
                        : 'bg-white border-[#E7DDD0] hover:bg-[#F2EEE8] text-[#1B1B1B]'
                    }`}
                    title="Next occurrence"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : !navigation && searchKeyword && !loading && !isSearching ? (
              <div className="flex items-center space-x-1 text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="text-[9px] font-black uppercase tracking-wider">No exact keyword match inside text</span>
              </div>
            ) : (
              <div className="w-1" />
            )}

            {/* Page & Zoom controllers */}
            <div className="flex items-center space-x-4">
              {/* Page Navigator */}
              <div className="flex items-center space-x-1 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded-lg">
                <button
                  disabled={pageNum <= startPageBound}
                  onClick={() => setPageNum(p => Math.max(startPageBound, p - 1))}
                  className={`p-1 rounded-md disabled:opacity-35 cursor-pointer transition-colors ${
                    isReadingMode ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-[#F2EEE8] text-[#6B6B6B]'
                  }`}
                  title="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-bold whitespace-nowrap min-w-[65px] text-center">
                  p. {pageNum} / {totalPages || '?'}
                </span>
                <button
                  disabled={pageNum >= endPageBound}
                  onClick={() => setPageNum(p => Math.min(endPageBound, p + 1))}
                  className={`p-1 rounded-md disabled:opacity-35 cursor-pointer transition-colors ${
                    isReadingMode ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-[#F2EEE8] text-[#6B6B6B]'
                  }`}
                  title="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleZoomOut}
                  className={`p-1 rounded-md cursor-pointer transition-colors ${
                    isReadingMode ? 'hover:bg-zinc-850 text-zinc-300' : 'hover:bg-[#F2EEE8] text-[#6B6B6B]'
                  }`}
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] font-mono font-black min-w-[34px] text-center">
                  {scale === 'fit' ? 'FIT' : `${Math.round(renderedScaleRef.current * 100)}%`}
                </span>
                <button
                  onClick={handleZoomIn}
                  className={`p-1 rounded-md cursor-pointer transition-colors ${
                    isReadingMode ? 'hover:bg-zinc-850 text-zinc-300' : 'hover:bg-[#F2EEE8] text-[#6B6B6B]'
                  }`}
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>

                {/* Fit Width toggle */}
                <button
                  onClick={() => setScale('fit')}
                  className={`px-2 py-1 text-[9px] font-black rounded-md uppercase transition-all cursor-pointer ${
                    scale === 'fit' 
                      ? 'bg-[#C89B4A]/15 text-[#C89B4A] border border-[#C89B4A]/30' 
                      : isReadingMode
                        ? 'hover:bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                        : 'hover:bg-[#F2EEE8] text-[#6B6B6B] border border-[#E7DDD0]'
                  }`}
                  title="Reset to Fit Width scale"
                >
                  Fit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Viewer Main Body split into absolute drawer index sidebar & center canvas container */}
      <div className="flex-1 flex overflow-hidden min-h-[400px] relative">
        
        {/* Backdrop overlay when sidebar drawer is open */}
        <AnimatePresence>
          {hasAnyIndices && showIndexSidebar && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowIndexSidebar(false)}
              className="absolute inset-0 bg-black/60 z-20 cursor-pointer"
            />
          )}
        </AnimatePresence>

        {/* Collapsible Index Drawer Sidebar */}
        <AnimatePresence>
          {hasAnyIndices && showIndexSidebar && (
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className={`absolute left-0 top-0 bottom-0 w-80 shadow-2xl z-30 flex flex-col overflow-hidden transition-colors ${
                isReadingMode ? 'bg-zinc-950 border-r border-zinc-800' : 'bg-[#FDFBF7] border-r border-[#E7DDD0]'
              }`}
              id="pdf-viewer-index-sidebar"
            >
              <div className={`p-4 border-b space-y-2.5 transition-colors ${
                isReadingMode ? 'bg-zinc-900 border-zinc-800' : 'bg-[#F2EEE8]/30 border-[#E7DDD0]'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-wider ${
                    isReadingMode ? 'text-zinc-400' : 'text-slate-800'
                  }`}>Syllabus Navigation Index</span>
                  <button 
                    onClick={() => setShowIndexSidebar(false)}
                    className={`p-1 rounded-md transition-colors ${
                      isReadingMode ? 'hover:bg-zinc-850 text-zinc-400 hover:text-white' : 'hover:bg-[#F2EEE8] text-[#6B6B6B]'
                    }`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search index sections..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    className={`w-full text-xs font-bold px-3 py-2 pl-8.5 rounded-lg focus:outline-none focus:ring-1 transition-all ${
                      isReadingMode 
                        ? 'bg-zinc-850 border-zinc-750 text-white placeholder-zinc-500 focus:border-emerald-500 focus:ring-emerald-500' 
                        : 'bg-white border-[#E7DDD0] text-slate-800 placeholder-slate-400 focus:border-[#C89B4A] focus:ring-[#C89B4A]'
                    }`}
                  />
                  <Search className={`absolute left-2.5 top-2.5 h-3.5 w-3.5 ${
                    isReadingMode ? 'text-zinc-500' : 'text-slate-400'
                  }`} />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Collapsible Groups */}
                
                {/* 1. Semesters Group */}
                <div className={`border rounded-xl overflow-hidden shadow-xs transition-colors ${
                  isReadingMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-[#E7DDD0] bg-white'
                }`}>
                  <button
                    onClick={() => toggleGroup('semesters')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 transition-colors cursor-pointer text-left ${
                      isReadingMode 
                        ? 'bg-zinc-900 hover:bg-zinc-850 text-zinc-200' 
                        : 'bg-[#F2EEE8]/30 hover:bg-[#F2EEE8]/70 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {expandedGroup === 'semesters' ? (
                        <ChevronDown className={`h-4 w-4 ${isReadingMode ? 'text-emerald-400' : 'text-[#C89B4A]'}`} />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-400" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-wider">Semesters ({filteredSems.length})</span>
                    </div>
                  </button>
                  
                  <AnimatePresence initial={false}>
                    {expandedGroup === 'semesters' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className={`p-2 space-y-1 max-h-56 overflow-y-auto border-t ${isReadingMode ? 'border-zinc-800 bg-zinc-950/40' : 'border-[#E7DDD0] bg-[#FDFBF7]'}`}>
                          {filteredSems.map(item => {
                            const isActive = activeNavigationItem?.id === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setPageNum(item.startPage);
                                  setActiveNavigationItem(item);
                                }}
                                className={`w-full text-left text-xs px-2.5 py-2 rounded-lg transition-all cursor-pointer font-bold ${
                                  isActive
                                    ? isReadingMode
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'bg-[#C89B4A] text-white shadow-sm'
                                    : isReadingMode
                                      ? 'hover:bg-zinc-800 text-zinc-300'
                                      : 'hover:bg-[#F2EEE8] text-slate-800'
                                }`}
                              >
                                <div className="truncate">{item.title}</div>
                                <div className={`text-[9px] font-medium mt-0.5 ${isActive ? 'text-white/80' : 'text-[#6B6B6B]'}`}>
                                  Pages {item.startPage}–{item.endPage}
                                </div>
                              </button>
                            );
                          })}
                          {filteredSems.length === 0 && (
                            <div className="text-[9px] text-center py-4 text-zinc-500 font-bold uppercase tracking-wider">No semesters match</div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 2. Sections Group */}
                <div className={`border rounded-xl overflow-hidden shadow-xs transition-colors ${
                  isReadingMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-[#E7DDD0] bg-white'
                }`}>
                  <button
                    onClick={() => toggleGroup('sections')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 transition-colors cursor-pointer text-left ${
                      isReadingMode 
                        ? 'bg-zinc-900 hover:bg-zinc-850 text-zinc-200' 
                        : 'bg-[#F2EEE8]/30 hover:bg-[#F2EEE8]/70 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {expandedGroup === 'sections' ? (
                        <ChevronDown className={`h-4 w-4 ${isReadingMode ? 'text-emerald-400' : 'text-[#C89B4A]'}`} />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-400" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-wider">Sections (VAC/SEC/MDC/AEC) ({filteredSecs.length})</span>
                    </div>
                  </button>
                  
                  <AnimatePresence initial={false}>
                    {expandedGroup === 'sections' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className={`p-2 space-y-1 max-h-56 overflow-y-auto border-t ${isReadingMode ? 'border-zinc-800 bg-zinc-950/40' : 'border-[#E7DDD0] bg-[#FDFBF7]'}`}>
                          {filteredSecs.map(item => {
                            const isActive = activeNavigationItem?.id === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setPageNum(item.startPage);
                                  setActiveNavigationItem(item);
                                }}
                                className={`w-full text-left text-xs px-2.5 py-2 rounded-lg transition-all cursor-pointer font-bold ${
                                  isActive
                                    ? isReadingMode
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'bg-[#C89B4A] text-white shadow-sm'
                                    : isReadingMode
                                      ? 'hover:bg-zinc-800 text-zinc-300'
                                      : 'hover:bg-[#F2EEE8] text-slate-800'
                                }`}
                              >
                                <div className="truncate">{item.title}</div>
                                <div className={`text-[9px] font-medium mt-0.5 ${isActive ? 'text-white/80' : 'text-[#6B6B6B]'}`}>
                                  Pages {item.startPage}–{item.endPage}
                                </div>
                              </button>
                            );
                          })}
                          {filteredSecs.length === 0 && (
                            <div className="text-[9px] text-center py-4 text-zinc-500 font-bold uppercase tracking-wider">No sections match</div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. Courses Group */}
                <div className={`border rounded-xl overflow-hidden shadow-xs transition-colors ${
                  isReadingMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-[#E7DDD0] bg-white'
                }`}>
                  <button
                    onClick={() => toggleGroup('courses')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 transition-colors cursor-pointer text-left ${
                      isReadingMode 
                        ? 'bg-zinc-900 hover:bg-zinc-850 text-zinc-200' 
                        : 'bg-[#F2EEE8]/30 hover:bg-[#F2EEE8]/70 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {expandedGroup === 'courses' ? (
                        <ChevronDown className={`h-4 w-4 ${isReadingMode ? 'text-emerald-400' : 'text-[#C89B4A]'}`} />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-400" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-wider">Courses ({filteredCourses.length})</span>
                    </div>
                  </button>
                  
                  <AnimatePresence initial={false}>
                    {expandedGroup === 'courses' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className={`p-2 space-y-1 max-h-80 overflow-y-auto border-t ${isReadingMode ? 'border-zinc-800 bg-zinc-950/40' : 'border-[#E7DDD0] bg-[#FDFBF7]'}`}>
                          {filteredCourses.map(item => {
                            const isActive = activeNavigationItem?.id === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setPageNum(item.startPage);
                                  setActiveNavigationItem(item);
                                }}
                                className={`w-full text-left text-xs px-2.5 py-2 rounded-lg transition-all cursor-pointer font-bold ${
                                  isActive
                                    ? isReadingMode
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'bg-[#C89B4A] text-white shadow-sm'
                                    : isReadingMode
                                      ? 'hover:bg-zinc-800 text-zinc-300'
                                      : 'hover:bg-[#F2EEE8] text-slate-800'
                                }`}
                              >
                                <div className="truncate" title={item.title}>{item.title}</div>
                                <div className="flex justify-between items-center text-[9px] mt-0.5">
                                  <span className={isActive ? 'text-white/85' : isReadingMode ? 'text-emerald-400' : 'text-[#C89B4A] font-extrabold'}>
                                    {item.semester || 'Course'}
                                  </span>
                                  <span className={isActive ? 'text-white/70' : 'text-zinc-500 font-bold'}>
                                    p. {item.startPage}–{item.endPage}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                          {filteredCourses.length === 0 && (
                            <div className="text-[9px] text-center py-4 text-zinc-500 font-bold uppercase tracking-wider">No courses match</div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Document View Canvas Container with zero padding to maximize reading area */}
        <div className={`flex-1 overflow-auto p-0 flex justify-center items-start min-h-[400px] relative transition-colors ${
          isReadingMode ? 'bg-zinc-800' : 'bg-slate-100'
        }`}>
          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-2.5 mt-24">
              <div className={`h-8 w-8 border-4 rounded-full animate-spin ${
                isReadingMode ? 'border-zinc-700 border-t-emerald-400' : 'border-[#C89B4A]/25 border-t-[#C89B4A]'
              }`}></div>
              <p className={`text-xs font-black uppercase tracking-wider ${isReadingMode ? 'text-zinc-400' : 'text-[#6B6B6B]'}`}>
                Assembling crisp vector layers...
              </p>
            </div>
          ) : error ? (
            <div className={`text-center p-8 border rounded-2xl max-w-sm mt-16 space-y-3.5 ${
              isReadingMode ? 'bg-zinc-950/60 border-red-900/45' : 'bg-red-50 border-red-200/60'
            }`}>
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
              <h5 className={`text-sm font-black uppercase tracking-wide ${isReadingMode ? 'text-red-400' : 'text-red-950'}`}>PDF Loading Error</h5>
              <p className={`text-xs leading-relaxed ${isReadingMode ? 'text-zinc-400' : 'text-red-800'}`}>{error}</p>
            </div>
          ) : (
            <div 
              className="relative shadow-2xl border border-slate-300 rounded-lg bg-white overflow-hidden transition-all duration-300"
              style={{ width: `${viewportWidth}px`, height: `${viewportHeight}px` }}
            >
              <canvas ref={canvasRef} className="block select-none w-full h-full" />
              
              {/* Real-time PDF Text Highlight Overlays */}
              {highlights.map((hl, idx) => (
                <div
                  key={idx}
                  className="absolute bg-yellow-400/35 border-b-2 border-yellow-500 rounded-sm animate-pulse pointer-events-none"
                  style={{
                    left: `${hl.x}px`,
                    top: `${hl.y}px`,
                    width: `${hl.w}px`,
                    height: `${hl.h}px`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
