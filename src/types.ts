export type DocType = 'pdf' | 'docx' | 'txt' | 'csv' | 'excel' | 'pptx' | 'image' | 'url' | 'json';

export interface StructuredEntities {
  departments?: string[];
  facultyMembers?: string[];
  courses?: string[];
  fees?: { courseOrService: string; amount: string }[];
  contacts?: string[];
  dates?: string[];
}

export interface CollegeDocument {
  id: string;
  title: string;
  type: DocType;
  category: string;
  content: string;
  size?: string;
  uploadedAt: string;
  uploadedBy: string;
  chunks?: { id: string; text: string; embedding: number[] }[];
  keywords?: string[];
  summary?: string;
  faqs?: { question: string; answer: string }[];
  metadata?: { key: string; value: string }[];
  entities?: StructuredEntities;
  sourceUrl?: string;
  importDate?: string;
  lastUpdated?: string;
  importedBy?: string;
  rawJson?: any;
  fileName?: string;
  fileBase64?: string;
  mimeType?: string;
  aiStatus?: 'Pending' | 'Processing' | 'Completed' | 'Retry Required' | 'Waiting for AI Processing';
  aiError?: string | null;
  embedding?: number[];
  updatedAt?: string;
}

export interface AISettings {
  provider: 'OpenRouter';
  model: string;
  temperature: number;
  maxTokens: number;
  retryAttempts: number;
  delayBetweenRequests: number;
}

export interface AILogEntry {
  id: string;
  timestamp: string;
  model: string;
  processingTimeMs: number;
  tokens?: number;
  cost?: number;
  status: 'Success' | 'Failed';
  retries: number;
  error?: string;
  promptSnippet?: string;
}

export interface Citation {
  docId: string;
  title: string;
  snippet: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestions?: string[];
  citations?: Citation[];
  pdfNavigation?: {
    docId: string;
    keyword?: string;
    title: string;
    startPage?: number;
    endPage?: number;
    documentId?: string;
    semester?: string;
  };
  debug?: {
    retrievedChunks: { docTitle: string; text: string; score: number }[];
    retrievedEntities: any[];
    totalTokens: number;
    finalPromptContext: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt?: string;
  isPinned?: boolean;
  modelUsed?: string;
  totalTokens?: number;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  date: string;
  category: 'academic' | 'admission' | 'event' | 'general';
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  documentId?: string;
}

export interface AnalyticsSummary {
  totalQuestions: number;
  userSatisfaction: number; // percentage
  aiAccuracy: number; // percentage
  averageResponseTime: number; // in ms
  dailyActiveUsers: number;
  popularQuestions: { question: string; count: number }[];
  popularDocs: { title: string; count: number }[];
  dailyQuestions: { date: string; count: number }[];
}

export interface NavigationItem {
  id: string;
  type: 'semester' | 'section' | 'course';
  title: string;
  semester?: string;
  startPage: number;
  endPage: number;
}

export interface OfficialDocument {
  documentId: string;
  title: string;
  category: 'Syllabus' | 'Prospectus' | 'Academic Calendar' | 'Examination Rules' | 'Circulars' | 'Other Documents';
  department?: string;
  programme?: 'UG' | 'PG';
  nepVersion?: string;
  academicYear: string;
  pdfUrl?: string;
  uploadDate: string;
  uploadedBy: string;
  fileSize: string;
  totalPages: number;
  fileBase64?: string;
  semester_index?: Record<string, { start_page: number; end_page: number }>;
  section_index?: Record<string, { start_page: number; end_page: number }>;
  course_index?: Array<{
    course: string;
    semester?: string;
    start_page: number;
    end_page: number;
  }>;
}

