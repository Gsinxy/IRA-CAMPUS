import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Search,
  FileText,
  Trash2,
  Plus,
  Pencil,
  RefreshCw,
  BookOpen,
  Users,
  Phone,
  Shield,
  Activity,
  LogOut,
  MapPin,
  Calendar,
  CloudLightning,
  GraduationCap,
  Award,
  DollarSign,
  Home,
  ArrowRight,
  Clock,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Share2,
  Lock,
  Upload,
  Info,
  Globe,
  Image,
  ChevronRight,
  ChevronLeft,
  Settings,
  Paperclip,
  PieChart,
  BarChart3,
  Database,
  ExternalLink,
  MessageSquare,
  Mic,
  MicOff,
  X,
  Menu,
  Pin,
  Download,
  CheckSquare,
  Square,
  Terminal,
  ChevronDown,
  ShieldAlert
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart as RePieChart,
  Pie
} from 'recharts';
import {
  DocType,
  CollegeDocument,
  Citation,
  Message,
  Conversation,
  Notice,
  FAQ,
  AnalyticsSummary
} from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { saveConversationToFirestore, loadConversationsFromFirestore, deleteConversationFromFirestore, deleteConversationsFromFirestore } from './services/firebaseService';

// Helper to generate elegant titles from queries
function generateTitleFromQuery(query: string): string {
  let clean = query.trim();
  const lowercase = clean.toLowerCase();
  
  // Strip common query prefixes
  const prefixes = [
    "what is the ", "what is ", "what are the ", "what are ", "how to ", "how do i ", 
    "tell me about the ", "tell me about ", "can you tell me about ", "please tell me about ",
    "do you have ", "information on ", "info about ", "details on ", "please provide details on ",
    "could you help me with "
  ];
  
  for (const prefix of prefixes) {
    if (lowercase.startsWith(prefix)) {
      clean = clean.substring(prefix.length);
      break;
    }
  }
  
  // Capitalize first letter of each word (Title Case)
  clean = clean.replace(/\b\w/g, c => c.toUpperCase());
  
  // Clean up punctuation at the end (like question marks)
  clean = clean.replace(/[?.,!/]+$/, "").trim();
  
  // If empty, fallback
  if (!clean) {
    return "New Conversation";
  }
  
  // Specific neat mappings
  if (clean.toLowerCase().includes("hostel fee")) return "Hostel Fees";
  if (clean.toLowerCase().includes("admission process")) return "Admission Process";
  if (clean.toLowerCase().includes("bca syllabus")) return "BCA Syllabus";
  if (clean.toLowerCase().includes("placement record")) return "Placement Record";
  
  // Tokenize and limit to 4 words
  const words = clean.split(/\s+/);
  if (words.length > 4) {
    return words.slice(0, 4).join(" ") + "...";
  }
  
  return clean;
}

// Group conversations by date intervals and pins
function groupConversationsByDate(conversations: Conversation[]) {
  const groups: {
    pinned: Conversation[];
    today: Conversation[];
    yesterday: Conversation[];
    last7Days: Conversation[];
    last30Days: Conversation[];
    older: Conversation[];
  } = {
    pinned: [],
    today: [],
    yesterday: [],
    last7Days: [],
    last30Days: [],
    older: []
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7DaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;
  const startOf30DaysAgo = startOfToday - 30 * 24 * 60 * 60 * 1000;

  conversations.forEach(c => {
    if (c.isPinned) {
      groups.pinned.push(c);
      return;
    }
    const updateTime = new Date(c.updatedAt || c.createdAt).getTime();
    if (updateTime >= startOfToday) {
      groups.today.push(c);
    } else if (updateTime >= startOfYesterday) {
      groups.yesterday.push(c);
    } else if (updateTime >= startOf7DaysAgo) {
      groups.last7Days.push(c);
    } else if (updateTime >= startOf30DaysAgo) {
      groups.last30Days.push(c);
    } else {
      groups.older.push(c);
    }
  });

  return groups;
}

export default function App() {
  // Navigation & tabs state: 'chat' | 'admin'
  const [activeTab, setActiveTab] = useState<'chat' | 'admin'>('chat');
  
  // Custom non-blocking modal confirmation / alert state
  const [customDialog, setCustomDialog] = useState<{
    isOpen: boolean;
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: ''
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel = 'Confirm', cancelLabel = 'Cancel') => {
    setCustomDialog({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      confirmLabel,
      cancelLabel,
      onConfirm: () => {
        setCustomDialog(prev => ({ ...prev, isOpen: false }));
        onConfirm();
      },
      onCancel: () => {
        setCustomDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const showAlert = (title: string, message: string, onConfirm?: () => void) => {
    setCustomDialog({
      isOpen: true,
      type: 'alert',
      title,
      message,
      confirmLabel: 'OK',
      onConfirm: () => {
        setCustomDialog(prev => ({ ...prev, isOpen: false }));
        if (onConfirm) onConfirm();
      }
    });
  };

  const [selectedDebugMessage, setSelectedDebugMessage] = useState<Message | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const stored = localStorage.getItem('ira_guest_conversations');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load conversations from localStorage:", e);
    }
    return [
      {
        id: `conv-${Date.now()}`,
        title: 'New Conversation',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPinned: false
      }
    ];
  });

  const [currentConvId, setCurrentConvId] = useState<string>(() => {
    try {
      const storedId = localStorage.getItem('ira_guest_current_conv_id') || (conversations[0]?.id || '');
      if (storedId) {
        return storedId;
      }
    } catch (e) {
      console.error("Failed to load currentConvId from localStorage:", e);
    }
    return conversations[0]?.id || '';
  });

  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

  // Firebase Auth and Sync states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authIsSignUp, setAuthIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHistoryRestoring, setIsHistoryRestoring] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isUserAdmin, setIsUserAdmin] = useState(false);

  // Guest to Cloud sync states
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [isLoggingInProcess, setIsLoggingInProcess] = useState(false);

  // Sync cloud history helper
  const syncCloudHistory = async (user: any, guestConvsToSave: Conversation[]) => {
    setIsSyncing(true);
    try {
      if (guestConvsToSave.length > 0) {
        for (const c of guestConvsToSave) {
          await saveConversationToFirestore(user.uid, c);
        }
      }
      
      const cloudConvs = await loadConversationsFromFirestore(user.uid);
      if (cloudConvs.length > 0) {
        setConversations(prevLocal => {
          const mergedMap = new Map<string, Conversation>();
          if (guestConvsToSave.length > 0) {
            guestConvsToSave.forEach(c => mergedMap.set(c.id, c));
          }
          cloudConvs.forEach(c => {
            const existing = mergedMap.get(c.id);
            if (!existing || new Date(c.updatedAt || c.createdAt) > new Date(existing.updatedAt || existing.createdAt)) {
              mergedMap.set(c.id, c);
            }
          });
          const mergedList = Array.from(mergedMap.values());
          mergedList.forEach(c => {
            saveConversationToFirestore(user.uid, c);
          });
          if (mergedList.length > 0) {
            setCurrentConvId(mergedList[0].id);
          }
          return mergedList;
        });
      } else {
        if (guestConvsToSave.length > 0) {
          setConversations(guestConvsToSave);
          setCurrentConvId(guestConvsToSave[0].id);
        } else {
          const newId = `conv-${Date.now()}`;
          const defaultConv: Conversation = {
            id: newId,
            title: 'New Conversation',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isPinned: false
          };
          setConversations([defaultConv]);
          setCurrentConvId(newId);
          await saveConversationToFirestore(user.uid, defaultConv);
        }
      }
    } catch (err) {
      console.error("Error syncing cloud history:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Start fresh cloud history helper
  const startFreshCloudHistory = async (user: any) => {
    setIsSyncing(true);
    try {
      const newId = `conv-${Date.now()}`;
      const defaultConv: Conversation = {
        id: newId,
        title: 'New Conversation',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPinned: false
      };
      await saveConversationToFirestore(user.uid, defaultConv);
      const cloudConvs = await loadConversationsFromFirestore(user.uid);
      const filteredCloud = cloudConvs.filter(c => c.id !== newId);
      const finalConvs = [defaultConv, ...filteredCloud];
      setConversations(finalConvs);
      setCurrentConvId(newId);
    } catch (err) {
      console.error("Error starting fresh cloud history:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Multiple selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedConvIds, setSelectedConvIds] = useState<string[]>([]);

  // Start a fresh conversation thread
  const handleNewChat = () => {
    const newId = `conv-${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPinned: false
    };
    
    setConversations(prev => [newConv, ...prev]);
    setCurrentConvId(newId);
    setActiveTab('chat');
    
    if (currentUser) {
      saveConversationToFirestore(currentUser.uid, newConv);
    }
  };

  // Delete single conversation thread
  const handleDeleteChat = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    showConfirm(
      'Delete Conversation?',
      'Are you sure you want to delete this conversation?',
      async () => {
        const updated = conversations.filter(c => c.id !== id);
        setConversations(updated);
        
        if (currentUser) {
          await deleteConversationFromFirestore(id);
        }

        if (currentConvId === id) {
          if (updated.length > 0) {
            setCurrentConvId(updated[0].id);
          } else {
            // Fallback: create fresh if everything's deleted
            const resetId = `conv-${Date.now()}`;
            const defaultConv: Conversation = {
              id: resetId,
              title: 'New Conversation',
              messages: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isPinned: false
            };
            setConversations([defaultConv]);
            setCurrentConvId(resetId);
            if (currentUser) {
              saveConversationToFirestore(currentUser.uid, defaultConv);
            }
          }
        }
      }
    );
  };

  // Toggle Favorite / Pinning
  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => prev.map(c => {
      if (c.id === id) {
        const updated = { ...c, isPinned: !c.isPinned, updatedAt: new Date().toISOString() };
        if (currentUser) {
          saveConversationToFirestore(currentUser.uid, updated);
        }
        return updated;
      }
      return c;
    }));
  };

  // Inline rename save handler
  const handleSaveRename = (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      setConversations(prev => prev.map(c => {
        if (c.id === id) {
          const updated = { ...c, title: newTitle.trim(), updatedAt: new Date().toISOString() };
          if (currentUser) {
            saveConversationToFirestore(currentUser.uid, updated);
          }
          return updated;
        }
        return c;
      }));
    }
    setEditingConvId(null);
  };

  // Multiple batch deletion
  const handleBatchDelete = async () => {
    if (selectedConvIds.length === 0) return;
    
    showConfirm(
      'Delete Selected Conversations?',
      `Are you sure you want to delete ${selectedConvIds.length} selected conversations?`,
      async () => {
        const updated = conversations.filter(c => !selectedConvIds.includes(c.id));
        setConversations(updated);

        if (currentUser) {
          await deleteConversationsFromFirestore(selectedConvIds);
        }

        setSelectedConvIds([]);
        setIsSelectionMode(false);

        if (selectedConvIds.includes(currentConvId)) {
          if (updated.length > 0) {
            setCurrentConvId(updated[0].id);
          } else {
            handleNewChat();
          }
        }
      }
    );
  };

  // Delete all conversations
  const handleDeleteAllChats = async () => {
    showConfirm(
      'Delete All Conversations?',
      'Are you sure you want to delete ALL conversations? This action is permanent and cannot be undone.',
      async () => {
        const allIds = conversations.map(c => c.id);
        setConversations([]);

        if (currentUser) {
          await deleteConversationsFromFirestore(allIds);
        }

        setSelectedConvIds([]);
        setIsSelectionMode(false);
        handleNewChat();
      }
    );
  };

  // Export handlers
  const exportAsTXT = (conversation: Conversation) => {
    let content = `Chat Title: ${conversation.title}\n`;
    content += `Created: ${new Date(conversation.createdAt).toLocaleString()}\n`;
    content += `==========================================\n\n`;
    conversation.messages.forEach(m => {
      const role = m.role === 'user' ? 'USER' : 'AI ASSISTANT';
      content += `[${m.timestamp}] ${role}:\n${m.content}\n\n`;
    });
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversation.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_history.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsMarkdown = (conversation: Conversation) => {
    let content = `# ${conversation.title}\n\n`;
    content += `*Exported on: ${new Date().toLocaleString()}*\n\n---\n\n`;
    conversation.messages.forEach(m => {
      const role = m.role === 'user' ? '**User**' : '**IRA Campus AI**';
      content += `### ${role} *(${m.timestamp})*\n\n${m.content}\n\n---\n\n`;
    });
    
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversation.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_history.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsPDF = (conversation: Conversation) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to export as PDF");
      return;
    }
    
    let html = `
      <html>
        <head>
          <title>${conversation.title}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; max-width: 800px; margin: 0 auto; line-height: 1.6; }
            h1 { color: #6c5ce7; font-size: 28px; margin-bottom: 5px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
            .meta { font-size: 12px; color: #64748b; margin-bottom: 30px; font-weight: 500; }
            .msg { margin-bottom: 25px; padding: 15px 20px; border-radius: 12px; }
            .user { background: #f8fafc; border-left: 4px solid #6c5ce7; }
            .ai { background: #f5f3ff; border-left: 4px solid #8b5cf6; }
            .role { font-weight: bold; font-size: 13px; color: #475569; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
            .time { font-size: 11px; color: #94a3b8; float: right; }
            .content { font-size: 14px; white-space: pre-wrap; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h1>${conversation.title}</h1>
          <div class="meta">Conversation exported on ${new Date().toLocaleString()}</div>
          <div>
    `;
    
    conversation.messages.forEach(m => {
      const roleName = m.role === 'user' ? 'User' : 'IRA Campus AI';
      const className = m.role === 'user' ? 'user' : 'ai';
      html += `
        <div class="msg ${className}">
          <span class="time">${m.timestamp}</span>
          <div class="role">${roleName}</div>
          <div class="content">${m.content}</div>
        </div>
      `;
    });
    
    html += `
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Sync auth updates
  useEffect(() => {
    setIsHistoryRestoring(true);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        
        if (isLoggingInProcess) {
          setIsHistoryRestoring(false);
          return;
        }

        // Session restore on page reload: load cached user-specific conversations first
        let cachedConvs: Conversation[] = [];
        try {
          const stored = localStorage.getItem(`ira_conversations_${user.uid}`);
          if (stored) {
            cachedConvs = JSON.parse(stored);
          }
        } catch (e) {}
        
        if (cachedConvs.length > 0) {
          setConversations(cachedConvs);
          const cachedId = localStorage.getItem(`ira_current_conv_id_${user.uid}`) || cachedConvs[0].id;
          setCurrentConvId(cachedId);
        }
        
        // Fetch up-to-date cloud data
        setIsSyncing(true);
        try {
          const cloudConvs = await loadConversationsFromFirestore(user.uid);
          if (cloudConvs.length > 0) {
            setConversations(cloudConvs);
            setCurrentConvId(cloudConvs[0].id);
          } else {
            // Start fresh if no cloud history is present
            const newId = `conv-${Date.now()}`;
            const defaultConv: Conversation = {
              id: newId,
              title: 'New Conversation',
              messages: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isPinned: false
            };
            setConversations([defaultConv]);
            setCurrentConvId(newId);
            await saveConversationToFirestore(user.uid, defaultConv);
          }
        } catch (err) {
          console.error("Error restoring session:", err);
        } finally {
          setIsSyncing(false);
        }
      } else {
        setCurrentUser(null);
        // Load guest conversations
        let guestConvs: Conversation[] = [];
        try {
          const stored = localStorage.getItem('ira_guest_conversations');
          if (stored) {
            guestConvs = JSON.parse(stored);
          }
        } catch (e) {}
        
        if (!Array.isArray(guestConvs) || guestConvs.length === 0) {
          const guestId = `conv-${Date.now()}`;
          guestConvs = [{
            id: guestId,
            title: 'New Conversation',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isPinned: false
          }];
        }
        setConversations(guestConvs);
        const guestId = localStorage.getItem('ira_guest_current_conv_id') || guestConvs[0].id;
        setCurrentConvId(guestId);
      }
      setIsHistoryRestoring(false);
    });
    return () => unsubscribe();
  }, [isLoggingInProcess]);

  // Sync state to local storage
  useEffect(() => {
    if (isHistoryRestoring) return;
    try {
      if (currentUser) {
        localStorage.setItem(`ira_conversations_${currentUser.uid}`, JSON.stringify(conversations));
      } else {
        localStorage.setItem('ira_guest_conversations', JSON.stringify(conversations));
      }
    } catch (e) {
      console.error("Failed to save conversations to localStorage:", e);
    }
  }, [conversations, currentUser, isHistoryRestoring]);

  // Sync active ID to local storage
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(`ira_current_conv_id_${currentUser.uid}`, currentConvId);
      } else {
        localStorage.setItem('ira_guest_current_conv_id', currentConvId);
      }
    } catch (e) {
      console.error("Failed to save currentConvId to localStorage:", e);
    }
  }, [currentConvId, currentUser]);

  // Auth Submit handler
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    setIsLoggingInProcess(true);
    
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please enter both email and password.');
      setAuthLoading(false);
      setIsLoggingInProcess(false);
      return;
    }

    if (authIsSignUp) {
      if (!authName.trim()) {
        setAuthError('Please enter your full name.');
        setAuthLoading(false);
        setIsLoggingInProcess(false);
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setAuthError('Passwords do not match.');
        setAuthLoading(false);
        setIsLoggingInProcess(false);
        return;
      }
    }
    
    try {
      if (authIsSignUp) {
        const credential = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
        const user = credential.user;
        
        const userRef = doc(db, 'users', user.uid);
        const nameVal = authName.trim() || user.displayName || user.email?.split('@')[0] || 'User';
        const newProfile = {
          uid: user.uid,
          name: nameVal,
          email: user.email,
          photoURL: user.photoURL || null,
          role: "student",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(userRef, newProfile);
        setUserProfile(newProfile);

        setShowAuthModal(false);
        setCurrentUser(user);
        
        const activeGuestConvs = conversations.filter(c => c.messages && c.messages.length > 0);
        if (activeGuestConvs.length > 0) {
          setPendingUser(user);
          setShowSyncPrompt(true);
        } else {
          await syncCloudHistory(user, []);
        }
      } else {
        const credential = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
        const user = credential.user;
        
        setShowAuthModal(false);
        setCurrentUser(user);
        
        const activeGuestConvs = conversations.filter(c => c.messages && c.messages.length > 0);
        if (activeGuestConvs.length > 0) {
          setPendingUser(user);
          setShowSyncPrompt(true);
        } else {
          await syncCloudHistory(user, []);
        }
      }
      setAuthEmail('');
      setAuthPassword('');
      setAuthConfirmPassword('');
      setAuthName('');
    } catch (err: any) {
      console.error("Authentication failed:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError('Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('Email is already registered.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('Password should be at least 6 characters.');
      } else {
        setAuthError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setAuthLoading(false);
      setIsLoggingInProcess(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthLoading(true);
    setIsLoggingInProcess(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const nameVal = user.displayName || user.email?.split('@')[0] || 'User';
      const newProfile = {
        uid: user.uid,
        name: nameVal,
        email: user.email,
        photoURL: user.photoURL || null,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (!userSnap.exists()) {
        await setDoc(userRef, newProfile);
        setUserProfile(newProfile);
      } else {
        setUserProfile(userSnap.data());
      }
      
      setShowAuthModal(false);
      setCurrentUser(user);
      
      const activeGuestConvs = conversations.filter(c => c.messages && c.messages.length > 0);
      if (activeGuestConvs.length > 0) {
        setPendingUser(user);
        setShowSyncPrompt(true);
      } else {
        await syncCloudHistory(user, []);
      }
    } catch (err: any) {
      console.error("Google Sign-In failed:", err);
      setAuthError(err.message || 'Google Sign-In failed. Please try again.');
    } finally {
      setAuthLoading(false);
      setIsLoggingInProcess(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await handleAdminLogout();
      setActiveTab('chat');
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };
  const [inputMessage, setInputMessage] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);

  const startSpeechRecognition = (onResult: (text: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please try Chrome, Edge, or Safari.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        alert("Microphone access is blocked or not allowed. Please enable microphone permissions in your browser settings (often found near the address bar or lock icon) to use voice input.");
      } else if (event.error === 'no-speech') {
        alert("No speech was detected. Please make sure your microphone is connected and try speaking again.");
      } else if (event.error === 'network') {
        alert("Network error occurred during speech recognition. Please check your connection.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.start();
  };

  const handleVoiceInput = () => {
    startSpeechRecognition((text) => {
      setInputMessage(text);
    });
  };

  // Course Explorer State
  const [selectedCourse, setSelectedCourse] = useState<'btech' | 'bca' | 'mca'>('btech');
  const [calculatorTuition, setCalculatorTuition] = useState('btech');
  const [calculatorHostel, setCalculatorHostel] = useState('none');

  // Notices State
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isNoticesLoading, setIsNoticesLoading] = useState(false);

  // FAQs State
  const [faqs, setFaqs] = useState<FAQ[]>([]);

  // Admin Portal State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [adminToken, setAdminToken] = useState<string>('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [copiedDev, setCopiedDev] = useState(false);
  const [copiedPre, setCopiedPre] = useState(false);
  
  const ADMIN_EMAILS = [
    "naiknirmal654@gmail.com"
  ];
  
  // Admin Document uploads
  const [adminDocs, setAdminDocs] = useState<any[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Admissions');
  const [uploadType, setUploadType] = useState<DocType>('txt');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadFileBase64, setUploadFileBase64] = useState('');
  const [uploadMimeType, setUploadMimeType] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // AI Knowledge Extraction System State
  const [pastedContent, setPastedContent] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState('');
  const [extractionSuccess, setExtractionSuccess] = useState(false);
  const [extractedTitle, setExtractedTitle] = useState('');
  const [extractedCategory, setExtractedCategory] = useState('Admissions');
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  const [extractedSummary, setExtractedSummary] = useState('');
  const [extractedFaqs, setExtractedFaqs] = useState<{ question: string; answer: string }[]>([]);
  const [extractedChunks, setExtractedChunks] = useState<string[]>([]);
  const [extractedMetadata, setExtractedMetadata] = useState<{ key: string; value: string }[]>([]);

  // Editable Entities State
  const [extractedDepartments, setExtractedDepartments] = useState<string[]>([]);
  const [extractedFacultyMembers, setExtractedFacultyMembers] = useState<string[]>([]);
  const [extractedCourses, setExtractedCourses] = useState<string[]>([]);
  const [extractedContacts, setExtractedContacts] = useState<string[]>([]);
  const [extractedDates, setExtractedDates] = useState<string[]>([]);
  const [extractedFees, setExtractedFees] = useState<{ courseOrService: string; amount: string }[]>([]);

  // Import from Website URL System State
  const [extractionMethod, setExtractionMethod] = useState<'paste' | 'url' | 'json'>('paste');
  const [importUrl, setImportUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [importError, setImportError] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const [showDuplicateUrlDialog, setShowDuplicateUrlDialog] = useState(false);
  const [duplicateUrlInfo, setDuplicateUrlInfo] = useState<{ docId: string; title: string; message: string } | null>(null);
  const [isUpdateExisting, setIsUpdateExisting] = useState(false);
  const [updateDocId, setUpdateDocId] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState(false);

  // Batch JSON Import State
  const [pendingJsonDocs, setPendingJsonDocs] = useState<any[]>([]);
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [jsonImportError, setJsonImportError] = useState('');
  const [jsonImportSuccess, setJsonImportSuccess] = useState(false);
  const [jsonImportLogs, setJsonImportLogs] = useState<string[]>([]);

  // Intelligent Website Crawler & Knowledge Extractor State
  const [detectedLinks, setDetectedLinks] = useState<{ url: string; label: string; category: string }[]>([]);
  const [isScanningLinks, setIsScanningLinks] = useState(false);
  const [scanError, setScanError] = useState('');
  const [selectedLinks, setSelectedLinks] = useState<string[]>([]);
  const [importQueue, setImportQueue] = useState<{
    url: string;
    label: string;
    category: string;
    status: 'pending' | 'fetching' | 'cleaning' | 'extracting' | 'generating' | 'embedding' | 'saving' | 'completed' | 'failed';
    error?: string;
    failedStage?: string;
    httpStatus?: number | null;
    logs?: string[];
  }[]>([]);
  const [isImportingBatch, setIsImportingBatch] = useState(false);
  const [batchImportCompleted, setBatchImportCompleted] = useState(false);
  const [batchImportSummary, setBatchImportSummary] = useState<{ successful: number; failed: number }>({ successful: 0, failed: 0 });

  // Crawler Logs states
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logsModalTitle, setLogsModalTitle] = useState('');
  const [logsModalContent, setLogsModalContent] = useState<string[]>([]);

  const handleOpenLogsModal = (title: string, logs: string[]) => {
    setLogsModalTitle(title);
    setLogsModalContent(logs || []);
    setLogsModalOpen(true);
  };
  
  // Admin FAQ Creator
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqCategory, setFaqCategory] = useState('General');
  
  // Admin Notice Creator
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeCategory, setNoticeCategory] = useState<'academic' | 'admission' | 'event' | 'general'>('general');

  // Rebuilding Vector state
  const [isRebuildingVectors, setIsRebuildingVectors] = useState(false);
  const [isRetryingDocs, setIsRetryingDocs] = useState(false);

  // Analytics Dashboard state
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  // Browser/device session ID for DAU tracking
  const [sessionId] = useState<string>(() => {
    let sId = localStorage.getItem('ira_campus_session_id');
    if (!sId) {
      sId = `sess-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      localStorage.setItem('ira_campus_session_id', sId);
    }
    return sId;
  });

  // Redirect to admin tab if URL path is /admin
  useEffect(() => {
    if (window.location.pathname === '/admin') {
      setActiveTab('admin');
    }
  }, []);

  // Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsCheckingAuth(true);
      if (user) {
        const userEmail = user.email || '';
        const isAdminEmail = userEmail.toLowerCase() === 'naiknirmal654@gmail.com';
        
        console.log(`[AUTH] Logged-in email: "${userEmail}"`);
        console.log(`[AUTH] Admin detection result: is admin email? ${isAdminEmail}`);

        // Fetch/create users profile from firestore
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          const profileRole = isAdminEmail ? "admin" : "student";
          
          if (userSnap.exists()) {
            const existingProfile = userSnap.data();
            // If it's the admin, ensure the database document role is strictly "admin"
            if (isAdminEmail && existingProfile.role !== 'admin') {
              const updatedProfile = {
                ...existingProfile,
                role: 'admin',
                updatedAt: new Date().toISOString()
              };
              await setDoc(userRef, updatedProfile);
              setUserProfile(updatedProfile);
            } else {
              setUserProfile(existingProfile);
            }
          } else {
            const newProfile = {
              uid: user.uid,
              name: user.displayName || user.email?.split('@')[0] || 'User',
              email: user.email,
              photoURL: user.photoURL || null,
              role: profileRole,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          }
        } catch (err) {
          console.error("Error with user document:", err);
        }

        // Determine admin status using the "admins" collection
        try {
          const adminRef = doc(db, 'admins', user.uid);
          let adminSnap = await getDoc(adminRef);
          let isSourcedAdmin = adminSnap.exists();

          // Auto-seed/create admin document if email is naiknirmal654@gmail.com
          if (isAdminEmail) {
            if (!isSourcedAdmin) {
              await setDoc(adminRef, {
                email: "naiknirmal654@gmail.com",
                role: "admin",
                createdAt: serverTimestamp()
              });
              isSourcedAdmin = true;
              console.log("[AUTH] Admin document successfully seeded in Firestore 'admins' collection.");
            } else {
              console.log("[AUTH] Admin document already exists in Firestore 'admins' collection.");
            }
          }

          // In case of any other user matching ADMIN_EMAILS (fallback for safety)
          if (!isSourcedAdmin && user.email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase())) {
            await setDoc(adminRef, {
              email: user.email,
              role: 'admin',
              createdAt: serverTimestamp()
            });
            isSourcedAdmin = true;
          }

          const finalAssignedRole = (isSourcedAdmin || isAdminEmail) ? 'admin' : 'student';
          console.log(`[AUTH] Final assigned role: ${finalAssignedRole}`);

          if (isSourcedAdmin || isAdminEmail) {
            const token = await user.getIdToken();
            setAdminToken(token);
            setAdminUser(user);
            setIsAdminLoggedIn(true);
            setIsUserAdmin(true);
            setIsAccessDenied(false);
          } else {
            setAdminUser(null);
            setAdminToken('');
            setIsAdminLoggedIn(false);
            setIsUserAdmin(false);
            setIsAccessDenied(true);
          }
        } catch (err) {
          console.error("Error querying admins:", err);
          // If there was an error but the email is the admin email, fallback gracefully to admin state
          if (isAdminEmail) {
            console.log("[AUTH] Graceful fallback to administrator state for naiknirmal654@gmail.com due to collection lookup error");
            console.log(`[AUTH] Final assigned role: admin`);
            const token = await user.getIdToken();
            setAdminToken(token);
            setAdminUser(user);
            setIsAdminLoggedIn(true);
            setIsUserAdmin(true);
            setIsAccessDenied(false);
          } else {
            setAdminUser(null);
            setAdminToken('');
            setIsAdminLoggedIn(false);
            setIsUserAdmin(false);
          }
        }
      } else {
        setUserProfile(null);
        setAdminUser(null);
        setAdminToken('');
        setIsAdminLoggedIn(false);
        setIsUserAdmin(false);
        setIsAccessDenied(false);
      }
      setIsCheckingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  // Local shadowed fetch helper to auto-inject Authorization token header
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const options = { ...init };
    
    // Check if it's an API route that is NOT public
    if (url.startsWith('/api/') && !url.startsWith('/api/chat') && !url.startsWith('/api/feedback')) {
      const isPublicGet = (url === '/api/notices' || url === '/api/faqs') && (!init || !init.method || init.method.toUpperCase() === 'GET');
      
      if (!isPublicGet) {
        const token = adminToken || (auth.currentUser ? await auth.currentUser.getIdToken() : null);
        if (token) {
          options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
          };
        }
      }
    }
    return window.fetch(input, options);
  };

  // SSE Subscription for real-time live analytics updates
  useEffect(() => {
    if (activeTab === 'admin' && isAdminLoggedIn) {
      const eventSource = new EventSource(`/api/analytics/live?token=${adminToken}`);
      
      eventSource.onmessage = (event) => {
        try {
          const updatedData = JSON.parse(event.data);
          setAnalytics(updatedData);
        } catch (err) {
          console.error('Failed to parse SSE live analytics update:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('SSE connection error, falling back to manual fetch:', err);
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    }
  }, [activeTab, isAdminLoggedIn]);

  // Interaction feedbacks
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<{ [key: string]: 'up' | 'down' }>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load notices, faqs, documents, and analytics
  useEffect(() => {
    fetchNotices();
    fetchFAQs();
    if (activeTab === 'admin' && isAdminLoggedIn) {
      fetchAdminDocs();
      fetchAnalytics();
    }
  }, [activeTab, isAdminLoggedIn]);

  useEffect(() => {
    if (activeTab === 'chat') {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [activeTab, conversations, isAiTyping]);

  const fetchNotices = async () => {
    setIsNoticesLoading(true);
    try {
      const res = await fetch('/api/notices');
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }
      const data = await res.json();
      setNotices(data);
    } catch (err) {
      console.error('Failed to load notices:', err);
    } finally {
      setIsNoticesLoading(false);
    }
  };

  const fetchFAQs = async () => {
    try {
      const res = await fetch('/api/faqs');
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }
      const data = await res.json();
      setFaqs(data);
    } catch (err) {
      console.error('Failed to load FAQs:', err);
    }
  };

  const fetchAdminDocs = async () => {
    setIsDocsLoading(true);
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }
      const data = await res.json();
      setAdminDocs(data);
    } catch (err) {
      console.error('Failed to load admin documents:', err);
    } finally {
      setIsDocsLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics');
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  };

  const exportAnalyticsData = (format: 'csv' | 'json') => {
    if (!analytics) return;
    let dataStr = '';
    let mimeType = '';
    let fileName = '';

    if (format === 'json') {
      dataStr = JSON.stringify(analytics, null, 2);
      mimeType = 'application/json';
      fileName = `ira_campus_analytics_${Date.now()}.json`;
    } else {
      const headers = ['ID', 'Timestamp', 'Question', 'ResponseTimeMs', 'Citations', 'Feedback'];
      const rows = (analytics.recentChats || []).map(chat => [
        chat.id,
        chat.timestamp || '',
        `"${chat.question.replace(/"/g, '""')}"`,
        chat.responseTimeMs,
        `"${(chat.sourcesUsed || []).join(', ').replace(/"/g, '""')}"`,
        chat.feedback || 'none'
      ]);
      dataStr = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      mimeType = 'text/csv';
      fileName = `ira_campus_chats_${Date.now()}.csv`;
    }

    const blob = new Blob([dataStr], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearAnalytics = async () => {
    if (!window.confirm('Are you absolutely sure you want to clear all analytics data? This will permanently delete chat logs, feedback, performance logs, and statistics across all Firestore collections.')) {
      return;
    }
    
    try {
      const res = await fetch('/api/analytics/clear', { method: 'POST' });
      if (res.ok) {
        setAnalytics(null);
        fetchAnalytics();
      } else {
        alert('Failed to clear analytics data');
      }
    } catch (err: any) {
      console.error('Error clearing analytics:', err);
    }
  };

  // Triggers AI Query from any part of the app (homepage, card clicking, suggest buttons)
  const triggerAiInquiry = async (query: string) => {
    if (!query.trim()) return;
    
    // Switch to Chat tab
    setActiveTab('chat');
    
    const conv = conversations.find(c => c.id === currentConvId) || conversations[0];
    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Temp message for streaming response
    const assistantMsgId = `msg-${Date.now()}-ai`;
    const tempAssistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Correctly define updatedConv containing BOTH user and assistant messages as starting state
    const updatedConv = {
      ...conv,
      messages: [...conv.messages, userMsg, tempAssistantMsg],
      updatedAt: new Date().toISOString()
    };
    
    setConversations(prev => prev.map(c => c.id === updatedConv.id ? updatedConv : c));
    setInputMessage('');
    setIsAiTyping(true);

    try {
      // Gather conversation history to send to server
      // Exclude the current user query and temp assistant message from history payload sent to server
      const chatHistory = conv.messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      console.log('[DEBUG] Outgoing Request:', {
        query,
        chatHistory
      });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: chatHistory,
          sessionId: sessionId
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned an error response: ${res.status} ${res.statusText}`);
      }

      console.log('[DEBUG] Server response received successfully');

      const contentType = res.headers.get('Content-Type') || '';
      let accumulatedText = '';
      let citations: Citation[] = [];
      let streamFinished = false;
      let debugData: any = null;

      if (contentType.includes('text/event-stream')) {
        // Read SSE stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;
                
                try {
                  const data = JSON.parse(dataStr);
                  console.log('[DEBUG] Incoming chunk parse:', data);
                  
                  if (data.error) {
                    accumulatedText += `\n\n⚠️ **OpenRouter API Error**:\n\`\`\`\n${data.error}\n\`\`\``;
                    // Update UI dynamically with error details
                    setConversations(prev => prev.map(c => {
                      if (c.id === updatedConv.id) {
                        return {
                          ...c,
                          messages: c.messages.map(m => {
                            if (m.id === assistantMsgId) {
                              return {
                                ...m,
                                content: accumulatedText
                              };
                            }
                            return m;
                          })
                        };
                      }
                      return c;
                    }));
                  }

                  if (data.text) {
                    accumulatedText += data.text;
                    // Update UI dynamically with streaming text
                    setConversations(prev => prev.map(c => {
                      if (c.id === updatedConv.id) {
                        return {
                          ...c,
                          messages: c.messages.map(m => {
                            if (m.id === assistantMsgId) {
                              return {
                                ...m,
                                content: accumulatedText
                              };
                            }
                            return m;
                          })
                        };
                      }
                      return c;
                    }));
                  }
                  
                  if (data.done) {
                    streamFinished = true;
                    if (data.citations) {
                      citations = data.citations;
                    }
                    if (data.debug) {
                      debugData = data.debug;
                    }
                  }
                } catch (e) {
                  console.warn("[DEBUG] Error parsing stream line:", e);
                }
              }
            }
          }
        }
      } else {
        // Normal JSON response (fallback/mock mode)
        const data = await res.json();
        console.log('[DEBUG] Normal JSON response data:', data);
        accumulatedText = data.text || '';
        citations = data.citations || [];
        if (data.debug) {
          debugData = data.debug;
        }
        streamFinished = true;
      }

      console.log('[DEBUG] Response completed. Final text:', accumulatedText);

      // Parse suggestions block if model sent it in format [SUGGESTIONS]: Q1 | Q2
      let finalSuggestions: string[] = [
        'How do I apply for admission?',
        'What are the course fees?',
        'Are there any scholarships?',
        'Tell me about hostel accommodation'
      ];

      if (accumulatedText.includes('[SUGGESTIONS]:')) {
        const parts = accumulatedText.split('[SUGGESTIONS]:');
        accumulatedText = parts[0].trim();
        const suggestionsStr = parts[1].trim();
        finalSuggestions = suggestionsStr.split('|').map(s => s.trim()).filter(s => s.length > 0);
      }

      // Generate a nice title if it was "New Conversation" or has only the user's first query
      const isNewChat = updatedConv.messages.length <= 3 || conv.title === 'New Conversation';
      const finalTitle = isNewChat ? generateTitleFromQuery(query) : conv.title;

      const finalMessages = updatedConv.messages.map(m => {
        if (m.id === assistantMsgId) {
          return {
            ...m,
            content: accumulatedText,
            suggestions: finalSuggestions.slice(0, 4),
            citations: citations,
            debug: debugData
          };
        }
        return m;
      });

      const finalConvState: Conversation = {
        ...updatedConv,
        title: finalTitle,
        messages: finalMessages,
        updatedAt: new Date().toISOString()
      };

      setConversations(prev => prev.map(c => c.id === updatedConv.id ? finalConvState : c));

      if (currentUser) {
        saveConversationToFirestore(currentUser.uid, finalConvState);
      }

    } catch (err: any) {
      console.error('[DEBUG] Error occurred during chat flow:', err);
      // Update with error details politely but include unhidden details
      const errorMsg = err?.message || String(err);
      const errorMessages = updatedConv.messages.map(m => {
        if (m.id === assistantMsgId) {
          return {
            ...m,
            content: `Pardon me, but I encountered a network error while connecting to the college knowledge server. Please verify your internet connection or try again shortly.\n\n**Detailed Error Response**:\n\`\`\`\n${errorMsg}\n\`\`\`\n\nYou can also contact the administrative office at info@iracampus.edu.`,
            suggestions: ['Tell me about the admission prospectus', 'What are the college fees?']
          };
        }
        return m;
      });

      const errorConvState: Conversation = {
        ...updatedConv,
        messages: errorMessages,
        updatedAt: new Date().toISOString()
      };

      setConversations(prev => prev.map(c => c.id === updatedConv.id ? errorConvState : c));

      if (currentUser) {
        saveConversationToFirestore(currentUser.uid, errorConvState);
      }
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim()) return;
    triggerAiInquiry(inputMessage);
  };

  // Utility to copy response
  const copyMessageToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Utility to handle user satisfaction ratings
  const handleFeedback = async (id: string, type: 'up' | 'down') => {
    setFeedbacks(prev => ({
      ...prev,
      [id]: prev[id] === type ? undefined : type as any
    }));

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId: id,
          value: type === 'up' ? 'positive' : 'negative'
        })
      });
    } catch (err) {
      console.error('Failed to send feedback to server:', err);
    }
  };

  // Utility to regenerate response
  const handleRegenerate = (id: string) => {
    const conv = conversations.find(c => c.id === currentConvId) || conversations[0];
    const msgIdx = conv.messages.findIndex(m => m.id === id);
    if (msgIdx > 0) {
      const prevUserMsg = conv.messages[msgIdx - 1];
      if (prevUserMsg && prevUserMsg.role === 'user') {
        // Remove the old response & loader before triggering a fresh response
        setConversations(prev => prev.map(c => {
          if (c.id === conv.id) {
            return {
              ...c,
              messages: c.messages.filter(m => m.id !== id)
            };
          }
          return c;
        }));
        triggerAiInquiry(prevUserMsg.content);
      }
    }
  };

  // Admin login logic (Google Sign-In integration)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    setIsAccessDenied(false);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      if (user && user.email) {
        const email = user.email.toLowerCase();
        if (ADMIN_EMAILS.map(et => et.toLowerCase()).includes(email)) {
          const token = await user.getIdToken();
          setAdminToken(token);
          setAdminUser(user);
          setIsAdminLoggedIn(true);
          setIsAccessDenied(false);
          
          // Log Audit login event in backend
          try {
            await fetch('/api/admin/login-event', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
          } catch (err) {
            console.error('Failed to log login audit event:', err);
          }
        } else {
          // Log out immediately from firebase to not keep unauthorized session
          await signOut(auth);
          setIsAdminLoggedIn(false);
          setIsAccessDenied(true);
          setLoginError('You are not authorized to access the IRA Campus Admin Portal.');
        }
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      if (err.code === 'auth/unauthorized-domain' || (err.message && err.message.includes('unauthorized-domain'))) {
        setLoginError('unauthorized-domain');
      } else {
        setLoginError(`Google Sign-In failed: ${err.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      let token = adminToken;
      if (!token && auth.currentUser) {
        token = await auth.currentUser.getIdToken();
      }
      if (token) {
        try {
          await fetch('/api/admin/logout-event', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (e) {}
      }
    } catch (err) {
      console.error('Logout logging failed:', err);
    }
    
    await signOut(auth);
    setIsAdminLoggedIn(false);
    setAdminToken('');
    setAdminUser(null);
    setIsAccessDenied(false);
    setLoginError('');
  };

  // Document file selection / base64 extraction
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadTitle(file.name.split('.')[0]);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setUploadFileBase64(base64Data);
      setUploadMimeType(file.type);
      
      // Map file extension to doc category
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') setUploadType('pdf');
      else if (ext === 'docx') setUploadType('docx');
      else if (ext === 'xlsx' || ext === 'xls') setUploadType('excel');
      else if (ext === 'pptx') setUploadType('pptx');
      else if (ext === 'csv') setUploadType('csv');
      else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) setUploadType('image');
      else setUploadType('txt');
    };
    reader.readAsDataURL(file);
  };

  // AI Knowledge Extraction Handlers
  const handleFetchAndExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) {
      setImportError('Please enter a website URL.');
      return;
    }

    // Basic URL validation
    try {
      new URL(importUrl);
    } catch (_) {
      setImportError('Unable to fetch the webpage. Please verify the URL.');
      return;
    }

    setImportError('');
    setIsFetchingUrl(true);
    setImportProgress(10);
    setImportStatusText('Checking if URL was previously imported...');
    setImportSuccessMessage(false);
    setExtractionSuccess(false);

    try {
      const checkRes = await fetch('/api/documents/check-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() })
      });

      if (!checkRes.ok) {
        throw new Error('Failed to check duplicate URL.');
      }

      const checkData = await checkRes.json();
      if (checkData.exists) {
        setIsFetchingUrl(false);
        setDuplicateUrlInfo({
          docId: checkData.docId,
          title: checkData.title,
          message: checkData.message
        });
        setShowDuplicateUrlDialog(true);
        return;
      }

      // If does not exist, proceed immediately
      await proceedFetchAndExtract(importUrl.trim(), false, null);
    } catch (err: any) {
      console.error('URL check failed:', err);
      setImportError('Unable to fetch the webpage. Please verify the URL.');
      setIsFetchingUrl(false);
      setImportProgress(0);
    }
  };

  const proceedFetchAndExtract = async (url: string, updateMode: boolean, existingId: string | null) => {
    setIsUpdateExisting(updateMode);
    setUpdateDocId(existingId);
    setShowDuplicateUrlDialog(false);
    setIsFetchingUrl(true);
    setImportProgress(25);
    setImportStatusText('Fetching webpage content and parsing HTML structure...');
    setImportError('');

    try {
      // 1. Fetch web page and clean
      const fetchRes = await fetch('/api/documents/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!fetchRes.ok) {
        throw new Error('Unable to fetch the webpage. Please verify the URL.');
      }

      const fetchData = await fetchRes.json();
      const rawText = fetchData.rawText;
      
      // Save original cleaned content in the text state for the review panel
      setPastedContent(rawText);
      setImportProgress(50);
      setImportStatusText('Webpage content parsed successfully! Analyzing with Gemini...');

      // 2. Call AI Extract
      const extractRes = await fetch('/api/documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: rawText })
      });

      if (!extractRes.ok) {
        const errorData = await extractRes.json();
        throw new Error(errorData.error || 'Gemini extraction failed.');
      }

      const data = await extractRes.json();
      setExtractedTitle(data.title || 'Extracted Webpage Document');
      setExtractedCategory(data.category || 'Admissions');
      setExtractedKeywords(data.keywords || []);
      setExtractedSummary(data.summary || '');
      setExtractedFaqs(data.faqs || []);
      setExtractedChunks(data.chunks || []);
      setExtractedMetadata(data.metadata || []);

      const ents = data.entities || {};
      setExtractedDepartments(ents.departments || []);
      setExtractedFacultyMembers(ents.facultyMembers || []);
      setExtractedCourses(ents.courses || []);
      setExtractedContacts(ents.contacts || []);
      setExtractedDates(ents.dates || []);
      setExtractedFees(ents.fees || []);
      
      setImportProgress(100);
      setExtractionSuccess(true);
    } catch (err: any) {
      console.error('Fetch and extract failed:', err);
      setImportError(err.message || 'Unable to fetch the webpage. Please verify the URL.');
      setImportProgress(0);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Scan Website for Internal Links
  const handleScanWebsiteLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) {
      setScanError('Please enter a website URL.');
      return;
    }

    try {
      new URL(importUrl);
    } catch (_) {
      setScanError('Please enter a valid website URL (e.g. https://gacs.ac.in).');
      return;
    }

    setScanError('');
    setIsScanningLinks(true);
    setDetectedLinks([]);
    setSelectedLinks([]);
    setBatchImportCompleted(false);

    try {
      const res = await fetch('/api/documents/detect-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() })
      });

      if (!res.ok) {
        throw new Error('Failed to scan website structure.');
      }

      const data = await res.json();
      if (data.detectedLinks && data.detectedLinks.length > 0) {
        setDetectedLinks(data.detectedLinks);
        // Pre-select all matching internal links to save admin clicks
        setSelectedLinks(data.detectedLinks.map((l: any) => l.url));
      } else {
        setScanError('No internal links detected. Make sure the website is crawlable.');
      }
    } catch (err: any) {
      console.error('Scan website links failed:', err);
      setScanError(err.message || 'An error occurred while scanning the website links.');
    } finally {
      setIsScanningLinks(false);
    }
  };

  const handleToggleLinkSelection = (url: string) => {
    setSelectedLinks(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  const handleToggleAllLinks = () => {
    if (selectedLinks.length === detectedLinks.length) {
      setSelectedLinks([]);
    } else {
      setSelectedLinks(detectedLinks.map(l => l.url));
    }
  };

  const handleToggleCategoryLinks = (category: string) => {
    const categoryUrls = detectedLinks.filter(l => l.category === category).map(l => l.url);
    const selectedCategoryUrls = selectedLinks.filter(url => categoryUrls.includes(url));

    if (selectedCategoryUrls.length === categoryUrls.length) {
      // Deselect all in category
      setSelectedLinks(prev => prev.filter(url => !categoryUrls.includes(url)));
    } else {
      // Select all in category
      const remaining = categoryUrls.filter(url => !selectedLinks.includes(url));
      setSelectedLinks(prev => [...prev, ...remaining]);
    }
  };

  const importSingleQueueItem = async (index: number, currentQueue: any[]) => {
    const current = currentQueue[index];

    const updateStatus = async (
      status: 'pending' | 'fetching' | 'cleaning' | 'extracting' | 'generating' | 'embedding' | 'saving' | 'completed' | 'failed', 
      error?: string, 
      failedStage?: string, 
      httpStatus?: number | null, 
      logs?: string[]
    ) => {
      currentQueue[index] = {
        ...currentQueue[index],
        status,
        error,
        failedStage,
        httpStatus,
        logs
      };
      setImportQueue([...currentQueue]);
      // Delay to allow rendering of steps beautifully
      await new Promise(resolve => setTimeout(resolve, 80));
    };

    try {
      // 1. Fetching
      await updateStatus('fetching');
      await new Promise(resolve => setTimeout(resolve, 200));

      // 2. Cleaning
      await updateStatus('cleaning');
      await new Promise(resolve => setTimeout(resolve, 200));

      // 3. Extracting
      await updateStatus('extracting');
      await new Promise(resolve => setTimeout(resolve, 200));

      // 4. Generating AI knowledge / Saving
      await updateStatus('generating');

      const response = await fetch('/api/documents/import-single-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: current.url,
          label: current.label,
          category: current.category === 'General' ? 'Campus Info' : current.category,
          importedBy: 'Intelligent Crawler'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // We failed at some backend stage
        const stage = data.stage || 'AI Extraction';
        const errMsg = data.error || 'Failed to import webpage';
        const status = data.status !== undefined ? data.status : response.status;
        const logs = data.logs || [`Error response: ${errMsg}`];
        throw { message: errMsg, stage, status, logs };
      }

      // If backend was successful but fell back due to extraction failure, keep note of the logs
      const completedLogs = data.logs || ['Import completed successfully.'];

      // 5. Creating embeddings...
      await updateStatus('embedding');
      await new Promise(resolve => setTimeout(resolve, 250));

      // 6. Saving documents...
      await updateStatus('saving');
      await new Promise(resolve => setTimeout(resolve, 200));

      await updateStatus('completed', undefined, undefined, undefined, completedLogs);
      return true;
    } catch (err: any) {
      console.error(`Error importing ${current.label}:`, err);
      const stage = err.stage || 'AI Extraction';
      const msg = err.message || err.error || 'Import failed';
      const status = err.status !== undefined ? err.status : null;
      const logs = err.logs || [`Exception caught during import: ${msg}`];
      
      await updateStatus('failed', msg, stage, status, logs);
      return false;
    }
  };

  const handleRetryImport = async (index: number) => {
    setIsImportingBatch(true);
    setBatchImportCompleted(false);
    
    const queue = [...importQueue];
    const success = await importSingleQueueItem(index, queue);
    
    // Recalculate summary
    const successfulCount = queue.filter(item => item.status === 'completed').length;
    const failedCount = queue.filter(item => item.status === 'failed').length;
    setBatchImportSummary({ successful: successfulCount, failed: failedCount });
    
    // If all pending/running are done, mark batch completed
    const hasRunning = queue.some(item => ['fetching', 'cleaning', 'extracting', 'generating', 'embedding', 'saving'].includes(item.status));
    if (!hasRunning) {
      setBatchImportCompleted(true);
      setIsImportingBatch(false);
    }
    
    fetchAdminDocs();
  };

  const handleStartBatchImport = async () => {
    if (selectedLinks.length === 0) {
      setScanError('Please select at least one webpage to import.');
      return;
    }

    setIsImportingBatch(true);
    setBatchImportCompleted(false);
    setScanError('');

    const queue = detectedLinks
      .filter(link => selectedLinks.includes(link.url))
      .map(link => ({
        url: link.url,
        label: link.label,
        category: link.category,
        status: 'pending' as const,
        error: undefined as string | undefined,
        failedStage: undefined as string | undefined,
        httpStatus: undefined as number | null | undefined,
        logs: undefined as string[] | undefined
      }));

    setImportQueue(queue);

    let successfulCount = 0;
    let failedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      // Add a small 2-second delay between requests to respect Gemini free tier rate limits
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      const success = await importSingleQueueItem(i, queue);
      if (success) {
        successfulCount++;
      } else {
        failedCount++;
      }
    }

    setBatchImportSummary({ successful: successfulCount, failed: failedCount });
    setBatchImportCompleted(true);
    setIsImportingBatch(false);

    // Refresh document lists
    fetchAdminDocs();
  };

  const handleAiExtract = async () => {
    if (!pastedContent.trim()) {
      setExtractionError('Please paste webpage content or college records into the text editor before extracting.');
      return;
    }

    setIsExtracting(true);
    setExtractionError('');
    setExtractionSuccess(false);
    setImportSuccessMessage(false);

    try {
      const res = await fetch('/api/documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: pastedContent })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Gemini extraction failed.');
      }

      const data = await res.json();
      setExtractedTitle(data.title || 'Extracted Knowledge Document');
      setExtractedCategory(data.category || 'Admissions');
      setExtractedKeywords(data.keywords || []);
      setExtractedSummary(data.summary || '');
      setExtractedFaqs(data.faqs || []);
      setExtractedChunks(data.chunks || []);
      setExtractedMetadata(data.metadata || []);

      const ents = data.entities || {};
      setExtractedDepartments(ents.departments || []);
      setExtractedFacultyMembers(ents.facultyMembers || []);
      setExtractedCourses(ents.courses || []);
      setExtractedContacts(ents.contacts || []);
      setExtractedDates(ents.dates || []);
      setExtractedFees(ents.fees || []);

      setExtractionSuccess(true);
    } catch (err: any) {
      console.error('AI Extraction failed:', err);
      setExtractionError(err.message || 'Error occurred during AI extraction.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveExtracted = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extractedTitle.trim()) {
      setExtractionError('Document title is required.');
      return;
    }
    if (extractedChunks.length === 0 || extractedChunks.some(c => !c.trim())) {
      setExtractionError('You must have at least one valid non-empty searchable knowledge chunk.');
      return;
    }

    setIsUploading(true);
    setExtractionError('');

    try {
      const isUrlImport = extractionMethod === 'url';
      const res = await fetch('/api/documents/save-extracted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isUrlImport && isUpdateExisting ? updateDocId : undefined,
          title: extractedTitle,
          category: extractedCategory,
          content: pastedContent,
          keywords: extractedKeywords,
          summary: extractedSummary,
          faqs: extractedFaqs,
          chunks: extractedChunks,
          metadata: extractedMetadata,
          entities: {
            departments: extractedDepartments,
            facultyMembers: extractedFacultyMembers,
            courses: extractedCourses,
            contacts: extractedContacts,
            dates: extractedDates,
            fees: extractedFees
          },
          sourceUrl: isUrlImport ? importUrl : undefined,
          importedBy: currentUser?.email || 'admin@iracampus.edu'
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save extracted knowledge');
      }

      if (isUrlImport) {
        setImportSuccessMessage(true);
      } else {
        alert('AI-Extracted Knowledge successfully saved and indexed into the vector store!');
      }

      setUploadSuccess(true);
      
      // Clean up states
      if (!isUrlImport) {
        setPastedContent('');
        setImportUrl('');
      }
      setExtractedTitle('');
      setExtractedCategory('Admissions');
      setExtractedKeywords([]);
      setExtractedSummary('');
      setExtractedFaqs([]);
      setExtractedChunks([]);
      setExtractedMetadata([]);
      
      setExtractedDepartments([]);
      setExtractedFacultyMembers([]);
      setExtractedCourses([]);
      setExtractedContacts([]);
      setExtractedDates([]);
      setExtractedFees([]);

      setExtractionSuccess(false);
      
      fetchAdminDocs();
      fetchFAQs(); // Sync global FAQ lists
    } catch (err: any) {
      setExtractionError(err.message || 'Error saving extracted knowledge document.');
    } finally {
      setIsUploading(false);
    }
  };

  // Inline editors for extraction review panel
  const handleFaqQuestionChange = (index: number, val: string) => {
    const updated = [...extractedFaqs];
    updated[index].question = val;
    setExtractedFaqs(updated);
  };

  const handleFaqAnswerChange = (index: number, val: string) => {
    const updated = [...extractedFaqs];
    updated[index].answer = val;
    setExtractedFaqs(updated);
  };

  const handleFaqDelete = (index: number) => {
    setExtractedFaqs(extractedFaqs.filter((_, i) => i !== index));
  };

  const handleFaqAdd = () => {
    setExtractedFaqs([...extractedFaqs, { question: '', answer: '' }]);
  };

  const handleChunkChange = (index: number, val: string) => {
    const updated = [...extractedChunks];
    updated[index] = val;
    setExtractedChunks(updated);
  };

  const handleChunkDelete = (index: number) => {
    setExtractedChunks(extractedChunks.filter((_, i) => i !== index));
  };

  const handleChunkAdd = () => {
    setExtractedChunks([...extractedChunks, '']);
  };

  const handleMetadataKeyChange = (index: number, val: string) => {
    const updated = [...extractedMetadata];
    updated[index].key = val;
    setExtractedMetadata(updated);
  };

  const handleMetadataValueChange = (index: number, val: string) => {
    const updated = [...extractedMetadata];
    updated[index].value = val;
    setExtractedMetadata(updated);
  };

  const handleMetadataDelete = (index: number) => {
    setExtractedMetadata(extractedMetadata.filter((_, i) => i !== index));
  };

  const handleMetadataAdd = () => {
    setExtractedMetadata([...extractedMetadata, { key: '', value: '' }]);
  };

  // Inline editors for fee entities
  const handleFeeCourseChange = (index: number, val: string) => {
    const updated = [...extractedFees];
    updated[index].courseOrService = val;
    setExtractedFees(updated);
  };

  const handleFeeAmountChange = (index: number, val: string) => {
    const updated = [...extractedFees];
    updated[index].amount = val;
    setExtractedFees(updated);
  };

  const handleFeeDelete = (index: number) => {
    setExtractedFees(extractedFees.filter((_, i) => i !== index));
  };

  const handleFeeAdd = () => {
    setExtractedFees([...extractedFees, { courseOrService: '', amount: '' }]);
  };

  // Batch JSON Import Handlers
  const handleJsonFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setJsonImportError('');
    setJsonImportSuccess(false);
    
    const parsedDocs: any[] = [];
    const logs: string[] = [];

    const log = (msg: string) => {
      logs.push(`[Client] ${msg}`);
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      log(`Reading file: ${file.name}`);
      try {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });

        const json = JSON.parse(text);

        const normalizeItem = (item: any, index?: number) => {
          if (!item || typeof item !== 'object') return null;

          // Infer title from filename if title is missing
          let title = item.title;
          if (!title) {
            const baseName = file.name.replace(/\.json$/i, '');
            const readableName = baseName.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            title = index !== undefined ? `${readableName} Part ${index + 1}` : readableName;
          }

          // Build content from other fields if content is missing
          let content = item.content || '';
          if (!content) {
            const parts: string[] = [];
            for (const [key, val] of Object.entries(item)) {
              if (['title', 'content', 'chunks', 'rawJson', 'fileName'].includes(key)) continue;
              if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                parts.push(`${key}: ${val}`);
              } else if (Array.isArray(val)) {
                parts.push(`${key}:\n` + val.map(v => typeof v === 'object' ? JSON.stringify(v) : `  - ${v}`).join('\n'));
              } else if (typeof val === 'object' && val !== null) {
                parts.push(`${key}:\n` + JSON.stringify(val, null, 2));
              }
            }
            content = parts.join('\n\n');
          }

          return {
            ...item,
            title,
            content,
            fileName: file.name,
            rawJson: item
          };
        };

        if (Array.isArray(json)) {
          log(`Parsed file ${file.name} as array of ${json.length} items.`);
          json.forEach((item: any, idx: number) => {
            const normalized = normalizeItem(item, idx);
            if (normalized) {
              parsedDocs.push(normalized);
            } else {
              log(`Skipped item #${idx + 1} in ${file.name}: invalid structure.`);
            }
          });
        } else if (json && typeof json === 'object') {
          const normalized = normalizeItem(json);
          if (normalized) {
            log(`Parsed single document from ${file.name}: "${normalized.title}"`);
            parsedDocs.push(normalized);
          } else {
            log(`Skipped ${file.name}: invalid structure.`);
          }
        } else {
          log(`Skipped ${file.name}: format is neither a JSON object nor array.`);
        }
      } catch (err: any) {
        log(`Failed to parse ${file.name}: ${err.message}`);
      }
    }

    setPendingJsonDocs(parsedDocs);
    setJsonImportLogs(logs);
    if (parsedDocs.length === 0) {
      setJsonImportError('No valid document structures could be extracted from the uploaded files.');
    }
  };

  const handleImportJson = async () => {
    if (pendingJsonDocs.length === 0) {
      setJsonImportError('No valid JSON documents loaded.');
      return;
    }

    setIsImportingJson(true);
    setJsonImportError('');
    setJsonImportSuccess(false);

    try {
      const res = await fetch('/api/documents/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: pendingJsonDocs,
          importedBy: currentUser?.email || 'admin@iracampus.edu'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import JSON documents');
      }

      setJsonImportLogs(prev => [...prev, ... (data.logs || []), `[Client] Successfully imported and vectorized ${data.importedCount} documents!`]);

      // Verify that each document exists in Firestore and contains all required fields
      const importedIds = data.importedIds || [];
      const requiredFields = [
        'title',
        'summary',
        'content',
        'faqs',
        'keywords',
        'entities',
        'metadata',
        'sourceUrl',
        'rawJson',
        'embedding',
        'updatedAt'
      ];

      setJsonImportLogs(prev => [...prev, `[Client] Verifying Firestore persistence for ${importedIds.length} documents...`]);

      for (const id of importedIds) {
        const docRef = doc(db, 'knowledge', id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          throw new Error(`Verification failed: Document with ID "${id}" was not created in Firestore.`);
        }
        const docData = docSnap.data();
        for (const field of requiredFields) {
          if (docData[field] === undefined) {
            throw new Error(`Verification failed: Document with ID "${id}" in Firestore is missing required field "${field}".`);
          }
        }
      }

      setJsonImportLogs(prev => [...prev, `[Client] Verified all imported documents successfully in Firestore!`]);
      setJsonImportSuccess(true);
      setPendingJsonDocs([]);
      fetchAdminDocs();
    } catch (err: any) {
      setJsonImportError(err.message || 'Error occurred during JSON import.');
    } finally {
      setIsImportingJson(false);
    }
  };

  // Document submit uploader
  const handleDocUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim()) return;
    if (uploadType === 'txt' && !uploadContent.trim()) {
      setUploadError('Please write or paste the document content.');
      return;
    }
    if (uploadType === 'url' && !uploadUrl.trim()) {
      setUploadError('Please specify a valid URL path to index.');
      return;
    }
    if (['pdf', 'image', 'docx', 'excel', 'pptx'].includes(uploadType) && !uploadFileBase64) {
      setUploadError('Please browse and select a file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError('');
    setUploadSuccess(false);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: uploadTitle,
          type: uploadType,
          category: uploadCategory,
          content: uploadContent,
          url: uploadUrl,
          fileBase64: uploadFileBase64,
          mimeType: uploadMimeType
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Server upload failed');
      }

      setUploadSuccess(true);
      setUploadTitle('');
      setUploadContent('');
      setUploadUrl('');
      setUploadFileBase64('');
      setUploadMimeType('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchAdminDocs();
    } catch (err: any) {
      setUploadError(err.message || 'Error occurred during indexing.');
    } finally {
      setIsUploading(false);
    }
  };

  // Delete Document
  const handleDeleteDoc = (id: string) => {
    showConfirm(
      'Delete Document?',
      'Are you sure you want to permanently delete this document from the AI Knowledge Base? This action is permanent and cannot be undone.',
      async () => {
        try {
          const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
          if (res.ok) {
            fetchAdminDocs();
          }
        } catch (err) {
          console.error('Failed to delete document:', err);
        }
      },
      'Yes, Delete',
      'No, Cancel'
    );
  };

  // Rebuild Vectors
  const handleRebuildVectors = async () => {
    setIsRebuildingVectors(true);
    try {
      const res = await fetch('/api/documents/rebuild', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'AI Knowledge Base vectors completely rebuilt successfully!');
      } else {
        alert(data.error || 'Failed to rebuild vectors.');
      }
    } catch (err) {
      console.error('Error rebuilding vectors:', err);
    } finally {
      setIsRebuildingVectors(false);
    }
  };

  const handleRetryDocument = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/retry/${id}`, { method: 'POST' });
      if (res.ok) {
        fetchAdminDocs();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to retry document AI extraction.');
      }
    } catch (err) {
      console.error('Error retrying document:', err);
    }
  };

  const handleRetryAllFailed = async () => {
    setIsRetryingDocs(true);
    try {
      const res = await fetch('/api/documents/retry-all', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        fetchAdminDocs();
        if (data.count > 0) {
          alert(`Successfully re-queued ${data.count} failed documents for AI extraction!`);
        } else {
          alert('No failed documents found to retry.');
        }
      } else {
        alert(data.error || 'Failed to retry documents.');
      }
    } catch (err) {
      console.error('Error retrying all failed documents:', err);
    } finally {
      setIsRetryingDocs(false);
    }
  };

  // Create FAQ
  const handleCreateFAQ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    try {
      const res = await fetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: faqQuestion, answer: faqAnswer, category: faqCategory })
      });
      if (res.ok) {
        setFaqQuestion('');
        setFaqAnswer('');
        fetchFAQs();
        alert('FAQ successfully published!');
      }
    } catch (err) {
      console.error('Error creating FAQ:', err);
    }
  };

  // Delete FAQ
  const handleDeleteFAQ = (id: string) => {
    showConfirm(
      'Delete FAQ?',
      'Are you sure you want to delete this FAQ?',
      async () => {
        try {
          const res = await fetch(`/api/faqs/${id}`, { method: 'DELETE' });
          if (res.ok) {
            fetchFAQs();
          }
        } catch (err) {
          console.error('Error deleting FAQ:', err);
        }
      },
      'Yes, Delete',
      'No, Cancel'
    );
  };

  // Create Notice
  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeContent.trim()) return;
    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: noticeTitle, content: noticeContent, category: noticeCategory })
      });
      if (res.ok) {
        setNoticeTitle('');
        setNoticeContent('');
        fetchNotices();
        alert('Notice published successfully!');
      }
    } catch (err) {
      console.error('Error creating notice:', err);
    }
  };

  // Delete Notice
  const handleDeleteNotice = (id: string) => {
    showConfirm(
      'Retract/Delete Notice?',
      'Are you sure you want to retract/delete this notice?',
      async () => {
        try {
          const res = await fetch(`/api/notices/${id}`, { method: 'DELETE' });
          if (res.ok) {
            fetchNotices();
          }
        } catch (err) {
          console.error('Error deleting notice:', err);
        }
      },
      'Yes, Delete',
      'No, Cancel'
    );
  };

  // Simple Markdown and tables text parser for cleaner Chat Bubbles
  const parseMarkdown = (text: string) => {
    if (!text) return '';
    
    // Replace citations [Source X] with clickable superscripts
    let parsedText = text;
    
    // Replace markdown links with clickable elements (either button or hyperlink)
    parsedText = parsedText.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
      if (url.includes('ira-ai-production.up.railway.app')) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-5 py-2.5 my-2 bg-[#6C5CE7] hover:bg-[#5b4cd1] text-white font-bold text-sm rounded-xl shadow-md shadow-[#6C5CE7]/20 hover:shadow-lg transition-all duration-150 cursor-pointer no-underline decoration-transparent">🚀 Open IRA AI</a>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-[#6C5CE7] hover:underline font-bold">${label}</a>`;
    });

    // Basic formatting
    parsedText = parsedText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-red-600 px-1 py-0.5 rounded text-sm font-mono">$1</code>');

    // Split text by lists or paragraphs
    const lines = parsedText.split('\n');
    let inList = false;
    let listHTML = '';
    const outputHTML: string[] = [];

    // Check for Tables
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    for (let line of lines) {
      // Parse Table Rows (e.g., | Header 1 | Header 2 |)
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const columns = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        
        // Skip separator row (e.g., | :--- | :--- |)
        if (line.includes('---')) {
          continue;
        }

        if (!inTable) {
          inTable = true;
          tableHeaders = columns;
        } else {
          tableRows.push(columns);
        }
        continue;
      } else if (inTable) {
        // Table finished, render it
        let tableHTML = '<div class="overflow-x-auto my-4 shadow-sm border border-gray-200 rounded-lg"><table class="min-w-full divide-y divide-gray-200 text-sm text-left">';
        tableHTML += '<thead class="bg-gray-50 text-xs text-gray-700 uppercase font-semibold"><tr>';
        tableHeaders.forEach(th => {
          tableHTML += `<th class="px-4 py-3 border-b border-gray-200">${th}</th>`;
        });
        tableHTML += '</tr></thead><tbody class="divide-y divide-gray-100 bg-white">';
        tableRows.forEach(row => {
          tableHTML += '<tr class="hover:bg-gray-50">';
          row.forEach(cell => {
            tableHTML += `<td class="px-4 py-3 text-gray-600 whitespace-nowrap">${cell}</td>`;
          });
          tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table></div>';
        outputHTML.push(tableHTML);
        
        inTable = false;
        tableHeaders = [];
        tableRows = [];
      }

      // Parse bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        if (!inList) {
          inList = true;
          listHTML = '<ul class="list-disc pl-5 my-2 space-y-1.5 text-gray-600">';
        }
        const bulletText = line.trim().substring(2);
        listHTML += `<li>${bulletText}</li>`;
      } else {
        if (inList) {
          listHTML += '</ul>';
          outputHTML.push(listHTML);
          inList = false;
        }

        if (line.trim().startsWith('### ')) {
          outputHTML.push(`<h4 class="text-base font-semibold text-gray-800 mt-4 mb-2">${line.trim().substring(4)}</h4>`);
        } else if (line.trim().startsWith('## ')) {
          outputHTML.push(`<h3 class="text-lg font-bold text-gray-800 mt-5 mb-2.5">${line.trim().substring(3)}</h3>`);
        } else if (line.trim().startsWith('# ')) {
          outputHTML.push(`<h2 class="text-xl font-extrabold text-gray-900 mt-6 mb-3">${line.trim().substring(2)}</h2>`);
        } else if (line.trim()) {
          outputHTML.push(`<p class="text-gray-600 leading-relaxed my-2">${line}</p>`);
        }
      }
    }

    if (inList) {
      listHTML += '</ul>';
      outputHTML.push(listHTML);
    }

    if (inTable) {
      let tableHTML = '<div class="overflow-x-auto my-4 shadow-sm border border-gray-200 rounded-lg"><table class="min-w-full divide-y divide-gray-200 text-sm text-left">';
      tableHTML += '<thead class="bg-gray-50 text-xs text-gray-700 uppercase font-semibold"><tr>';
      tableHeaders.forEach(th => {
        tableHTML += `<th class="px-4 py-3 border-b border-gray-200">${th}</th>`;
      });
      tableHTML += '</tr></thead><tbody class="divide-y divide-gray-100 bg-white">';
      tableRows.forEach(row => {
        tableHTML += '<tr class="hover:bg-gray-50">';
        row.forEach(cell => {
          tableHTML += `<td class="px-4 py-3 text-gray-600 whitespace-nowrap">${cell}</td>`;
        });
        tableHTML += '</tr>';
      });
      tableHTML += '</tbody></table></div>';
      outputHTML.push(tableHTML);
    }

    return outputHTML.join('');
  };

  // Helper to calculate estimated fees
  const calculateEstimateFee = () => {
    let tuition = 0;
    let other = 0;
    let hostel = 0;
    
    if (calculatorTuition === 'btech') {
      tuition = 150000;
      other = 10000;
    } else if (calculatorTuition === 'bca') {
      tuition = 60000;
      other = 5000;
    } else if (calculatorTuition === 'mca') {
      tuition = 90000;
      other = 7500;
    }

    if (calculatorHostel === 'ac') {
      hostel = 120000;
    } else if (calculatorHostel === 'nonac') {
      hostel = 80000;
    }

    return {
      tuition: tuition.toLocaleString('en-US'),
      other: other.toLocaleString('en-US'),
      hostel: hostel.toLocaleString('en-US'),
      total: (tuition + other + hostel).toLocaleString('en-US')
    };
  };

  // Sort conversations by updatedAt / createdAt descending (most recently updated first)
  const sortedConversations = [...conversations].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt).getTime();
    return timeB - timeA;
  });

  const currentConversation = sortedConversations.find(c => c.id === currentConvId) || sortedConversations[0];
  const filteredConversations = sortedConversations.filter(c => 
    c.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(chatSearchQuery.toLowerCase()))
  );

  const feeEstimate = calculateEstimateFee();  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFB] text-[#0F172A] font-sans antialiased selection:bg-[#6C5CE7]/10">
      {/* HEADER BAR */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-md border-b border-[#E5E7EB] px-4 md:px-6 py-2.5 flex justify-between items-center h-14 select-none shrink-0">
        <div className="flex items-center space-x-3">
          {/* Toggle Sidebar Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-xl text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
            title="Toggle sidebar history"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveTab('chat')}>
            <span className="text-sm font-extrabold tracking-wider text-slate-900 uppercase">
              IRA CAMPUS
            </span>
            <span className="bg-[#6C5CE7]/10 text-[#6C5CE7] text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border border-[#6C5CE7]/20">
              AI
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center space-x-3 text-xs font-semibold relative">
          {!currentUser ? (
            <button
              onClick={() => {
                setAuthIsSignUp(false);
                setAuthEmail('');
                setAuthPassword('');
                setAuthConfirmPassword('');
                setAuthName('');
                setAuthError('');
                setShowAuthModal(true);
              }}
              className="bg-[#6C5CE7] hover:bg-[#5b4cd1] text-white px-4 py-2 rounded-xl transition-all font-bold text-xs shadow-md shadow-[#6C5CE7]/10 cursor-pointer"
            >
              Sign In
            </button>
          ) : (
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center space-x-2 focus:outline-none focus:ring-0 cursor-pointer"
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={userProfile?.name || currentUser.displayName || 'User'}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm uppercase">
                    {(userProfile?.name || currentUser.displayName || currentUser.email)?.[0] || 'U'}
                  </div>
                )}
                <span className="hidden md:inline text-xs font-bold text-slate-700">
                  {userProfile?.name || currentUser.displayName || currentUser.email?.split('@')[0]}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 space-y-3 z-50 text-left">
                  <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt={userProfile?.name || currentUser.displayName || 'User'}
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 rounded-full border border-slate-100"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-base uppercase">
                        {(userProfile?.name || currentUser.displayName || currentUser.email)?.[0] || 'U'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-slate-900 truncate">
                        {userProfile?.name || currentUser.displayName || 'Campus User'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate font-semibold">
                        {currentUser.email}
                      </p>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 space-y-1 py-1 font-semibold">
                    <p className="text-slate-400 font-bold uppercase tracking-wider text-[8px]">Profile Details</p>
                    <p>Role: <span className="text-indigo-600 font-extrabold">{isUserAdmin ? 'Authorized Staff Admin' : (userProfile?.role || 'Student')}</span></p>
                    <p className="truncate">Member Since: <span className="text-slate-700">{userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString() : 'Just now'}</span></p>
                  </div>

                  {isUserAdmin && (
                    <div className="border-t border-slate-100 pt-2">
                      {activeTab === 'chat' ? (
                        <button
                          onClick={() => {
                            setIsProfileOpen(false);
                            setActiveTab('admin');
                          }}
                          className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 rounded-xl border border-indigo-200 transition-colors flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer"
                        >
                          <span>Admin Dashboard</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setIsProfileOpen(false);
                            setActiveTab('chat');
                          }}
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-xl border border-slate-850 transition-colors flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer"
                        >
                          <span>Go to Chat</span>
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      handleSignOut();
                    }}
                    className="w-full bg-rose-50 text-rose-700 hover:bg-rose-100 py-2 rounded-xl border border-rose-200 transition-colors flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* BODY PANEL CONTAINER */}
      <main className="flex-1 flex flex-col">

        {/* CHAT / CO-PILOT VIEW */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex bg-[#FAFAFB] relative overflow-hidden">
            
            {/* Left Sidebar Drawer */}
            <div
              className={`fixed inset-y-0 left-0 z-50 flex flex-col w-72 bg-white border-r border-[#E5E7EB] transform transition-transform duration-300 ease-out shadow-2xl ${
                isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              {/* Sidebar Header */}
              <div className="p-4 border-b border-[#E5E7EB] flex justify-between items-center bg-[#FAFAFB]">
                <span className="text-xs font-extrabold uppercase tracking-widest text-[#64748B] flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#6C5CE7]" />
                  <span>AI Threads</span>
                </span>
                
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1.5 rounded-xl text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close sidebar"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Sidebar Input & Actions */}
              <div className="p-3.5 space-y-2.5">
                <button
                  onClick={() => {
                    handleNewChat();
                    setIsSidebarOpen(false);
                  }}
                  className="w-full bg-[#6C5CE7] hover:bg-[#5b4cd1] text-white font-bold text-xs py-3 px-4 rounded-xl shadow-md shadow-[#6C5CE7]/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Conversation</span>
                </button>
                
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    placeholder="Search chats..."
                    className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 pl-8.5 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#6C5CE7] focus:border-[#6C5CE7] focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Chat Thread history */}
              <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
                {/* Check if history is currently restoring / skeleton load */}
                {isHistoryRestoring ? (
                  <div className="space-y-3 p-2">
                    {[1, 2, 3, 4].map(idx => (
                      <div key={idx} className="space-y-2 animate-pulse">
                        <div className="h-4 bg-slate-200/60 rounded w-4/5"></div>
                        <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs font-semibold">
                    No matching threads
                  </div>
                ) : (
                  <>
                    {/* Batch Selection Options when in selection mode */}
                    {isSelectionMode && (
                      <div className="bg-[#6C5CE7]/5 rounded-xl border border-[#6C5CE7]/10 p-2 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[10px] font-extrabold text-[#6C5CE7] px-1 uppercase tracking-wider">
                          <span>{selectedConvIds.length} Selected</span>
                          <button
                            onClick={() => {
                              setSelectedConvIds(
                                selectedConvIds.length === filteredConversations.length 
                                  ? [] 
                                  : filteredConversations.map(c => c.id)
                              );
                            }}
                            className="text-[9px] uppercase tracking-wider hover:underline cursor-pointer"
                          >
                            {selectedConvIds.length === filteredConversations.length ? "Deselect All" : "Select All"}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleBatchDelete}
                            disabled={selectedConvIds.length === 0}
                            className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-[10px] uppercase tracking-wider py-1.5 px-2 rounded-lg transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => {
                              setIsSelectionMode(false);
                              setSelectedConvIds([]);
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] uppercase tracking-wider py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Bulk Actions Button (Visible when NOT in selection mode) */}
                    {!isSelectionMode && (
                      <div className="flex items-center justify-between px-2 mb-1.5">
                        <button
                          onClick={() => setIsSelectionMode(true)}
                          className="text-[10px] font-extrabold text-[#6C5CE7] hover:text-[#5b4cd1] uppercase tracking-wider cursor-pointer hover:underline"
                        >
                          Select Chats
                        </button>
                        {filteredConversations.length > 0 && (
                          <button
                            onClick={handleDeleteAllChats}
                            className="text-[10px] font-extrabold text-rose-600 hover:text-rose-700 uppercase tracking-wider cursor-pointer hover:underline"
                          >
                            Delete All
                          </button>
                        )}
                      </div>
                    )}

                    {/* Groups */}
                    {(() => {
                      const groups = groupConversationsByDate(filteredConversations);
                      const renderGroup = (title: string, items: Conversation[], showPinIcon = false) => {
                        if (items.length === 0) return null;
                        return (
                          <div className="space-y-1" key={title}>
                            <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                              {showPinIcon && <Pin className="h-3 w-3 text-amber-500 fill-amber-500" />}
                              <span>{title}</span>
                            </div>
                            {items.map((c, idx) => (
                              <div
                                key={c.id || idx}
                                className={`group relative flex items-center rounded-xl transition-all border ${
                                  c.id === currentConvId
                                    ? 'bg-[#6C5CE7]/5 border-[#6C5CE7]/20 text-[#6C5CE7]'
                                    : 'hover:bg-slate-50 border-transparent text-slate-700'
                                }`}
                              >
                                {/* Checkbox for Selection Mode */}
                                {isSelectionMode && (
                                  <button
                                    onClick={() => {
                                      setSelectedConvIds(prev => 
                                        prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                      );
                                    }}
                                    className="pl-3 text-slate-400 hover:text-[#6C5CE7] transition-all cursor-pointer shrink-0"
                                  >
                                    {selectedConvIds.includes(c.id) ? (
                                      <CheckSquare className="h-4 w-4 text-[#6C5CE7]" />
                                    ) : (
                                      <Square className="h-4 w-4" />
                                    )}
                                  </button>
                                )}

                                {editingConvId === c.id ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      handleSaveRename(c.id, editingTitle);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 flex items-center gap-1 p-2 w-full"
                                  >
                                    <input
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      className="flex-1 min-w-0 bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-lg px-2 py-1 focus:ring-1 focus:ring-[#6C5CE7] focus:border-[#6C5CE7] focus:outline-none"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          setEditingConvId(null);
                                        }
                                      }}
                                    />
                                    <button
                                      type="submit"
                                      className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer shrink-0"
                                      title="Save Title"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingConvId(null)}
                                      className="p-1 rounded-md text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                                      title="Cancel Rename"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </form>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        if (isSelectionMode) {
                                          setSelectedConvIds(prev => 
                                            prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                          );
                                        } else {
                                          setCurrentConvId(c.id);
                                          setIsSidebarOpen(false);
                                        }
                                      }}
                                      className={`flex-1 text-left p-3 min-w-0 flex flex-col space-y-1 cursor-pointer ${
                                        isSelectionMode ? 'pr-3' : 'pr-20'
                                      }`}
                                    >
                                      <span className={`text-xs font-bold truncate ${c.id === currentConvId ? 'text-[#6C5CE7]' : 'text-slate-800'}`}>
                                        {c.title}
                                      </span>
                                      <div className="flex justify-between items-center text-[9px] text-[#64748B] font-semibold">
                                        <span>{c.messages.length} messages</span>
                                        <span>{new Date(c.updatedAt || c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                      </div>
                                    </button>
                                    
                                    {/* Action Buttons (Hidden during Selection Mode) */}
                                    {!isSelectionMode && (
                                      <div className="absolute right-1 opacity-0 group-hover:opacity-100 flex items-center space-x-0.5 bg-white/95 backdrop-blur-xs py-1 px-1 rounded-lg shadow-xs border border-slate-100">
                                        <button
                                          onClick={(e) => handleTogglePin(c.id, e)}
                                          className={`p-1 rounded-lg transition-all cursor-pointer ${
                                            c.isPinned 
                                              ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50' 
                                              : 'text-slate-400 hover:text-[#6C5CE7] hover:bg-slate-50'
                                          }`}
                                          title={c.isPinned ? "Unpin Chat" : "Pin Chat"}
                                        >
                                          <Pin className={`h-3 w-3 ${c.isPinned ? 'fill-amber-500' : ''}`} />
                                        </button>
                                        
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            exportAsMarkdown(c);
                                          }}
                                          className="p-1 rounded-lg text-slate-400 hover:text-[#6C5CE7] hover:bg-slate-50 transition-all cursor-pointer"
                                          title="Export Markdown"
                                        >
                                          <Download className="h-3 w-3" />
                                        </button>

                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            exportAsPDF(c);
                                          }}
                                          className="p-1 rounded-lg text-slate-400 hover:text-[#6C5CE7] hover:bg-indigo-50 transition-all cursor-pointer font-extrabold text-[8px]"
                                          title="Export PDF"
                                        >
                                          PDF
                                        </button>

                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingConvId(c.id);
                                            setEditingTitle(c.title);
                                          }}
                                          className="p-1 rounded-lg text-slate-400 hover:text-[#6C5CE7] hover:bg-slate-50 transition-all cursor-pointer"
                                          title="Rename"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={(e) => handleDeleteChat(c.id, e)}
                                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                                          title="Delete"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      };

                      return (
                        <div className="space-y-3">
                          {renderGroup("Pinned", groups.pinned, true)}
                          {renderGroup("Today", groups.today)}
                          {renderGroup("Yesterday", groups.yesterday)}
                          {renderGroup("Previous 7 Days", groups.last7Days)}
                          {renderGroup("Previous 30 Days", groups.last30Days)}
                          {renderGroup("Older", groups.older)}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Sidebar Footer with Auth & Settings */}
              <div className="p-3 border-t border-[#E5E7EB] bg-[#FAFAFB] space-y-1.5">
                {currentUser ? (
                  <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs">
                    <div className="flex flex-col min-w-0">
                      <span className="font-extrabold text-slate-800 truncate">{currentUser.email}</span>
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        {isSyncing ? 'Syncing...' : 'Synced to Cloud'}
                      </span>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer shrink-0"
                      title="Sign Out"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="px-3 py-2 bg-amber-50/50 border border-amber-100/60 rounded-xl text-[10px] text-amber-800 font-semibold leading-normal">
                      Guest Mode – Chats are stored only on this device.
                    </div>
                    <button
                      onClick={() => {
                        setShowAuthModal(true);
                        setIsSidebarOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-100/40 transition-all cursor-pointer"
                    >
                      <Lock className="h-4 w-4" />
                      <span>Sync with Cloud</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowSettingsModal(true);
                    setIsSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-bold hover:bg-slate-100 transition-colors text-left cursor-pointer"
                >
                  <Settings className="h-4.5 w-4.5 text-slate-500" />
                  <span>Settings</span>
                </button>
                
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-500 hover:text-slate-900 text-xs font-bold hover:bg-slate-100 transition-colors text-left cursor-pointer"
                >
                  <ChevronLeft className="h-4.5 w-4.5 text-slate-400" />
                  <span>Collapse History</span>
                </button>
              </div>
            </div>

            {/* Sidebar Overlay Backdrop */}
            {isSidebarOpen && (
              <div
                className="fixed inset-0 z-45 bg-slate-900/10 backdrop-blur-xs transition-opacity duration-300"
                onClick={() => setIsSidebarOpen(false)}
              />
            )}

            {/* Conversation Core Panel */}
            <div className="flex-1 flex flex-col h-[calc(100vh-56px)] relative overflow-hidden">
              


              {/* Message streams container */}
              <div className="flex-1 overflow-y-auto px-4 py-8 space-y-8 bg-[#FAFAFB]">
                {currentConversation.messages.length === 0 || (currentConversation.messages.length === 1 && currentConversation.messages[0].role === 'assistant') ? (
                  
                  /* Clean, Centered Modern Zero-State welcome hero */
                  <div className="max-w-4xl mx-auto py-16 md:py-28 flex flex-col items-center justify-center space-y-12 animate-in fade-in duration-700">
                    
                    {/* Hero Header Section */}
                    <div className="text-center space-y-4 max-w-3xl flex flex-col items-center">
                      <h1 className="text-4xl md:text-[54px] font-extrabold tracking-tight text-slate-900 leading-tight md:leading-tight animate-in fade-in slide-in-from-bottom-3 duration-500">
                        Ask Anything About <span className="text-[#6C5CE7] bg-gradient-to-r from-[#6C5CE7] to-indigo-600 bg-clip-text text-transparent">Your College</span>
                      </h1>
                      <p className="text-base md:text-[19px] text-slate-500 max-w-2xl leading-relaxed font-normal animate-in fade-in slide-in-from-bottom-3 duration-500">
                        Search official college information in seconds. Get accurate answers from verified campus documents.
                      </p>
                    </div>

                    {/* Z.ai / ChatGPT style large input inside the zero state */}
                    <div className="w-full max-w-2xl">
                      <form 
                        onSubmit={handleSendMessage} 
                        className="bg-white border border-[#E5E7EB] hover:border-indigo-250 shadow-xl shadow-slate-100/80 rounded-[28px] p-2 flex items-center gap-1 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-[#6C5CE7]/10 transition-all duration-200"
                      >
                        <div className="flex items-center gap-1 pl-1 shrink-0">
                          {/* Attachment Button */}
                          <label className="p-2.5 rounded-full hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer block" title="Attach Document file">
                            <Paperclip className="h-4 w-4" />
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  alert(`File "${e.target.files[0].name}" uploaded successfully for grounding!`);
                                }
                              }} 
                            />
                          </label>

                          {/* Voice Button */}
                          <button
                            type="button"
                            onClick={handleVoiceInput}
                            className={`p-2.5 rounded-full transition-colors ${
                              isListening
                                ? 'bg-rose-50 text-rose-600 animate-pulse'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                            }`}
                            title="Speak query"
                          >
                            <Mic className="h-4 w-4" />
                          </button>

                          {/* Language selector icon */}
                          <button
                            type="button"
                            onClick={() => {
                              alert("AI model grounded in multi-lingual documents (English, Hindi, regional queries supported).");
                            }}
                            className="p-2.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                            title="College Grounded Languages"
                          >
                            <Globe className="h-4 w-4" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={inputMessage}
                          onChange={(e) => setInputMessage(e.target.value)}
                          placeholder="Ask anything about your college..."
                          className="flex-1 bg-transparent border-none text-sm text-slate-900 placeholder:text-slate-400 py-3.5 px-3 focus:outline-none focus:ring-0"
                        />

                        <button
                          type="submit"
                          disabled={!inputMessage.trim()}
                          className="bg-[#6C5CE7] hover:bg-[#5b4cd1] disabled:bg-slate-100 text-white disabled:text-slate-400 p-3.5 rounded-full transition-all shrink-0 flex items-center justify-center shadow-md shadow-[#6C5CE7]/10 active:scale-95 cursor-pointer"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </form>
                    </div>

                    {/* Small wrapped modern suggestion chips flow */}
                    <div className="w-full">
                      <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                        {[
                          { label: 'Admission Process', q: 'What is the admission process for B.Tech CSE?' },
                          { label: 'Fee Structure', q: 'What is the course fee structure?' },
                          { label: 'BCA Syllabus', q: 'Show me the BCA syllabus for third semester' },
                          { label: 'Hostel', q: 'Tell me about hostel fees and hostel rules' },
                          { label: 'Placements', q: 'What is the college placement record and average packages?' },
                          { label: 'Scholarships', q: 'Are there any scholarships available and what is the eligibility?' },
                          { label: 'Faculty', q: 'Show me the Head of Department details and contacts' },
                          { label: 'Campus Rules', q: 'What are the key campus rules and hostel curfew guidelines?' },
                          { label: "Today's Notices", q: 'What are the latest college notices or announcements?' }
                        ].map((chip, idx) => (
                          <button
                            key={idx}
                            onClick={() => triggerAiInquiry(chip.q)}
                            className="bg-white hover:bg-[#6C5CE7]/5 border border-[#E5E7EB] hover:border-[#6C5CE7]/30 text-slate-700 hover:text-[#6C5CE7] text-xs font-semibold px-4 py-2 rounded-full shadow-xs transition-all duration-150 cursor-pointer"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                ) : (
                  
                  /* Clean Claude/ChatGPT Conversation Stream */
                  <div className="max-w-3xl mx-auto space-y-8 w-full animate-in fade-in duration-300">
                    {currentConversation.messages.map((m, mIdx) => (
                      <div
                        key={m.id || mIdx}
                        className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex flex-col space-y-2 max-w-[85%] md:max-w-2xl ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                          
                          {/* Message bubble */}
                          <div className={`p-4 md:p-5 rounded-2xl ${
                            m.role === 'user'
                              ? 'bg-[#6C5CE7] text-white shadow-sm shadow-[#6C5CE7]/10 rounded-tr-sm'
                              : 'bg-white text-slate-900 border border-[#E5E7EB] shadow-xs'
                          }`}>
                            {m.role === 'user' ? (
                              <p className="text-sm font-semibold whitespace-pre-wrap leading-relaxed">{m.content}</p>
                            ) : (
                              <div
                                className="text-sm space-y-3 leading-relaxed markdown-body"
                                dangerouslySetInnerHTML={{ __html: parseMarkdown(m.content) }}
                              />
                            )}
                          </div>

                          {/* Under response premium bar with feedback & citations */}
                          {m.role === 'assistant' && (
                            <div className="w-full space-y-3 mt-1.5 pl-1">
                              
                              {/* Quick Actions (Copy, Regenerate, Likes, Citations) */}
                              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#64748B] font-semibold">
                                <span className="text-[10px] text-slate-400 font-medium">{m.timestamp}</span>
                                
                                {/* Copy button */}
                                <button
                                  onClick={() => copyMessageToClipboard(m.id, m.content)}
                                  className="hover:text-[#6C5CE7] flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Copy content"
                                >
                                  {copiedMessageId === m.id ? (
                                    <>
                                      <Check className="h-3 w-3 text-emerald-500" />
                                      <span className="text-emerald-600 font-bold">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>

                                {/* Regenerate Button */}
                                <button
                                  onClick={() => handleRegenerate(m.id)}
                                  className="hover:text-[#6C5CE7] flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Re-run query"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  <span>Regenerate</span>
                                </button>

                                {/* Upvote rating */}
                                <button
                                  onClick={() => handleFeedback(m.id, 'up')}
                                  className={`hover:text-emerald-600 transition-colors cursor-pointer ${feedbacks[m.id] === 'up' ? 'text-emerald-500' : ''}`}
                                  title="Accurate Answer"
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                </button>

                                {/* Downvote rating */}
                                <button
                                  onClick={() => handleFeedback(m.id, 'down')}
                                  className={`hover:text-rose-600 transition-colors cursor-pointer ${feedbacks[m.id] === 'down' ? 'text-rose-500' : ''}`}
                                  title="Inaccurate Answer"
                                >
                                  <ThumbsDown className="h-3 w-3" />
                                </button>

                                {m.debug && (
                                  <button
                                    onClick={() => setSelectedDebugMessage(m)}
                                    className="text-[#6C5CE7] hover:bg-[#6C5CE7]/5 bg-[#6C5CE7]/10 border border-[#6C5CE7]/20 rounded-md px-2 py-0.5 text-[10px] font-extrabold transition-all flex items-center gap-1 cursor-pointer"
                                    title="View AI Grounding Debug Panel"
                                  >
                                    <Database className="h-3 w-3 animate-pulse" />
                                    <span>Debug Panel</span>
                                  </button>
                                )}
                              </div>

                              {/* Grounded Sources / Citations list */}
                              {m.citations && m.citations.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                                    Knowledge Sources:
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {m.citations.map((cite, cidx) => (
                                      <button
                                        key={cidx}
                                        onClick={() => setActiveCitation(cite)}
                                        className="bg-slate-50 hover:bg-[#6C5CE7]/5 border border-slate-200 hover:border-[#6C5CE7]/20 rounded-lg px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:text-[#6C5CE7] transition-all flex items-center gap-1 cursor-pointer"
                                      >
                                        <FileText className="h-2.5 w-2.5" />
                                        <span>{cite.title}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Related / Follow up Questions */}
                              {m.suggestions && m.suggestions.length > 0 && (
                                <div className="space-y-1.5 pt-2">
                                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                                    Related follow-up questions:
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {m.suggestions.map((sug, sidx) => (
                                      <button
                                        key={sidx}
                                        onClick={() => triggerAiInquiry(sug)}
                                        className="bg-white hover:bg-[#6C5CE7]/5 border border-[#E5E7EB] hover:border-[#6C5CE7]/20 text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all text-[#6C5CE7] hover:text-[#5b4cd1] cursor-pointer"
                                      >
                                        {sug}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                            </div>
                          )}

                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Indexing and Typing Loader Indicator */}
                {isAiTyping && (
                  <div className="max-w-3xl mx-auto w-full flex justify-start pl-1">
                    <div className="flex items-start space-x-3.5">
                      <div className="h-8 w-8 rounded-xl bg-[#6C5CE7] text-white flex items-center justify-center shrink-0 border border-[#6C5CE7]/25 shadow-sm">
                        <Sparkles className="h-4 w-4 animate-spin" />
                      </div>
                      <div className="bg-white border border-[#E5E7EB] rounded-2xl px-4 py-3 shadow-xs flex items-center space-x-3">
                        <div className="flex space-x-1 shrink-0">
                          <span className="h-2.5 w-2.5 bg-[#6C5CE7] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-2.5 w-2.5 bg-[#6C5CE7] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-2.5 w-2.5 bg-[#6C5CE7] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs font-bold text-slate-500">IRA is finding answers in college documents...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Fixed Bottom Input panel (Only visible when conversation length > 1 to avoid duplicating input block) */}
              {!(currentConversation.messages.length === 0 || (currentConversation.messages.length === 1 && currentConversation.messages[0].role === 'assistant')) && (
                <div className="p-4 bg-transparent max-w-4xl w-full mx-auto pb-6 relative z-10 shrink-0">
                  <form 
                    onSubmit={handleSendMessage} 
                    className="bg-white border border-[#E5E7EB] focus-within:border-indigo-400 shadow-xl shadow-slate-100/80 rounded-[28px] p-2 flex items-center gap-1 focus-within:ring-4 focus-within:ring-[#6C5CE7]/10 transition-all duration-200"
                  >
                    <div className="flex items-center gap-1 pl-1 shrink-0">
                      {/* Attachment button */}
                      <label className="p-2.5 rounded-full hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer block" title="Attach Document file">
                        <Paperclip className="h-4 w-4" />
                        <input 
                          type="file" 
                          className="hidden" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              alert(`File "${e.target.files[0].name}" uploaded successfully for grounding!`);
                            }
                          }} 
                        />
                      </label>

                      {/* Voice input button */}
                      <button
                        type="button"
                        onClick={handleVoiceInput}
                        className={`p-2.5 rounded-full transition-colors ${
                          isListening
                            ? 'bg-rose-50 text-rose-600 animate-pulse'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        }`}
                        title="Speak query"
                      >
                        <Mic className="h-4 w-4" />
                      </button>

                      {/* Language Selection */}
                      <button
                        type="button"
                        onClick={() => {
                          alert("AI model is grounded in multi-lingual documents (English, Hindi, regional queries supported).");
                        }}
                        className="p-2.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors select-none"
                        title="Grounded Languages"
                      >
                        <Globe className="h-4 w-4" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      disabled={isAiTyping}
                      placeholder="Ask anything about your college..."
                      className="flex-1 bg-transparent border-none text-sm text-slate-900 placeholder:text-slate-400 py-3 px-3 focus:outline-none focus:ring-0 disabled:opacity-50"
                    />

                    <button
                      type="submit"
                      disabled={isAiTyping || !inputMessage.trim()}
                      className="bg-[#6C5CE7] hover:bg-[#5b4cd1] disabled:bg-slate-100 text-white disabled:text-slate-400 p-3.5 rounded-full transition-all shrink-0 flex items-center justify-center shadow-md shadow-[#6C5CE7]/10 active:scale-95 cursor-pointer"
                      title="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                  <p className="text-[10px] text-slate-400 text-center mt-3 font-semibold">
                    IRA is grounded strictly in the official IRA Campus knowledge base.
                  </p>
                </div>
              )}

            </div>
          </div>
        )}



        {/* ADMIN PORTAL & ANALYTICS VIEW */}
        {activeTab === 'admin' && (
          <div className="w-full max-w-6xl mx-auto px-4 lg:px-8 py-10 space-y-12">
            
            {/* LOGIN CARD / AUTH STATE CHECK */}
            {isCheckingAuth ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                <p className="text-xs text-slate-500 font-medium">Verifying administrator session status...</p>
              </div>
            ) : isAccessDenied ? (
              <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-xl shadow-slate-100 text-center space-y-6">
                <div className="inline-flex p-3 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-950">Access Denied</h2>
                <p className="text-xs text-slate-500 leading-normal font-semibold">
                  You are not authorized to access the IRA Campus Admin Portal.
                </p>
                {auth.currentUser && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-[10px] text-slate-600 leading-normal space-y-1">
                    <p>Logged in as: <strong>{auth.currentUser.email}</strong></p>
                  </div>
                )}
                <button
                  onClick={handleAdminLogout}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Sign Out / Choose Another Account
                </button>
              </div>
            ) : !isAdminLoggedIn ? (
              <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-xl shadow-slate-100 space-y-6">
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600 mb-2">
                    <Lock className="h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-950">Staff Administration Portal</h2>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">Sign in with an authorized Google account to manage campus knowledge documents.</p>
                </div>

                {loginError && (
                  loginError === 'unauthorized-domain' ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-4 rounded-2xl space-y-3 leading-normal text-left">
                      <div className="flex items-start gap-2.5">
                        <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-extrabold text-amber-950 text-xs">Firebase Unauthorized Domain Error</p>
                          <p className="text-[10px] text-amber-700 font-semibold mt-1">
                            Google Sign-In needs this app's domain to be authorized in your Firebase Console.
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-1 pt-1">
                        <p className="text-[9px] uppercase font-extrabold text-amber-800 tracking-wide">Steps to authorize:</p>
                        <ol className="list-decimal pl-4 space-y-1 text-[10px] text-amber-800 font-semibold">
                          <li>Go to your <strong>Firebase Console</strong>.</li>
                          <li>Navigate to <strong>Authentication</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Authorized domains</strong>.</li>
                          <li>Click <strong>Add domain</strong> and copy-paste these domains:</li>
                        </ol>
                      </div>

                      <div className="space-y-1.5 bg-white border border-amber-100 rounded-xl p-2.5 font-mono text-[9px] text-slate-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate select-all font-semibold">{window.location.hostname}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(window.location.hostname);
                              setCopiedDev(true);
                              setTimeout(() => setCopiedDev(false), 2000);
                            }}
                            className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-1 rounded font-sans font-bold text-[8px] transition-all cursor-pointer"
                          >
                            {copiedDev ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 mt-1.5">
                          <span className="truncate select-all font-semibold">ais-pre-kbzuh6brpamvy2idbtbl7l-746370824595.asia-southeast1.run.app</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText('ais-pre-kbzuh6brpamvy2idbtbl7l-746370824595.asia-southeast1.run.app');
                              setCopiedPre(true);
                              setTimeout(() => setCopiedPre(false), 2000);
                            }}
                            className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-1 rounded font-sans font-bold text-[8px] transition-all cursor-pointer"
                          >
                            {copiedPre ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold px-4 py-3 rounded-xl leading-normal text-center">
                      {loginError}
                    </div>
                  )
                )}

                <button
                  onClick={handleAdminLogin}
                  disabled={isLoggingIn}
                  className="w-full flex items-center justify-center gap-3 bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs py-3.5 px-4 rounded-xl shadow-md transition-all border border-slate-900 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoggingIn ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <svg className="h-4 w-4 fill-white" viewBox="0 0 24 24">
                      <path d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.107C18.23 1.964 15.44 1 12.24 1 6.01 1 12.24s5.01 11.24 11.24 11.24c6.5 0 10.822-4.57 10.822-11.015 0-.74-.08-1.3-.177-1.854H12.24z" />
                    </svg>
                  )}
                  {isLoggingIn ? 'Authenticating...' : 'Sign in with Google'}
                </button>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-[10px] text-slate-500 leading-normal text-center font-semibold">
                  🔐 Access is restricted to authorized Google accounts only.
                </div>
              </div>
            ) : (
              // AUTHED ADMIN WORKSPACE
              <div className="space-y-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6">
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-950">Administrative Control Hub</h2>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">Manage knowledge documents, publish announcements, and view analytics</p>
                  </div>
                  
                  {/* Sync & Retry Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      onClick={handleRetryAllFailed}
                      disabled={isRetryingDocs}
                      className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold text-xs py-2.5 px-4.5 rounded-xl shadow-md shadow-amber-100 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className={`h-4 w-4 ${isRetryingDocs ? 'animate-spin' : ''}`} />
                      <span>{isRetryingDocs ? 'Retrying Failed...' : 'Retry Failed AI Extractions'}</span>
                    </button>

                    <button
                      onClick={handleRebuildVectors}
                      disabled={isRebuildingVectors}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs py-2.5 px-4.5 rounded-xl shadow-md shadow-indigo-100 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Database className={`h-4 w-4 ${isRebuildingVectors ? 'animate-spin' : ''}`} />
                      <span>{isRebuildingVectors ? 'Regenerating Embeddings...' : 'Rebuild AI Knowledge Base'}</span>
                    </button>
                  </div>
                </div>

                {/* ANALYTICS SECTION */}
                {!analytics || analytics.totalQuestions === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-5 max-w-lg mx-auto shadow-sm">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                      <BarChart3 className="h-7 w-7 text-indigo-600 animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">No Real-Time Analytics Yet</h3>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        Submit queries in the AI Chat tab to begin tracking real-time metrics, system performance, token diagnostics, and user feedback ratings.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400">
                        Live RAG Engine Analytics
                      </h3>
                      
                      {/* Export & Reset Admin Tools */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => exportAnalyticsData('csv')}
                          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                          title="Export chat logs to CSV"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Export CSV</span>
                        </button>
                        <button
                          onClick={() => exportAnalyticsData('json')}
                          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                          title="Export all database stats to JSON"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Export JSON</span>
                        </button>
                        <button
                          onClick={handleClearAnalytics}
                          className="bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-600 font-bold text-[10px] uppercase tracking-wider py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                          title="Wipe analytics history"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Wipe Stats</span>
                        </button>
                      </div>
                    </div>
                    
                    {/* KPI CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      {/* Questions Handled */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
                        <div className="p-2 rounded-lg border text-blue-600 bg-blue-50 border-blue-100 self-start">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Questions Handled</p>
                          <p className="text-2xl font-extrabold text-slate-900 mt-1">{analytics.totalQuestions.toLocaleString()}</p>
                          <p className="text-[9px] text-slate-500 font-semibold mt-1">Directly logged queries</p>
                        </div>
                      </div>

                      {/* DAU */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
                        <div className="p-2 rounded-lg border text-amber-600 bg-amber-50 border-amber-100 self-start">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Users (DAU)</p>
                          <p className="text-2xl font-extrabold text-slate-900 mt-1">{analytics.dauToday}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[10px] font-extrabold ${analytics.dauGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {analytics.dauGrowth >= 0 ? '+' : ''}{analytics.dauGrowth}%
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium">vs yesterday ({analytics.dauYesterday})</span>
                          </div>
                        </div>
                      </div>

                      {/* Avg Response Time */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
                        <div className="p-2 rounded-lg border text-cyan-600 bg-cyan-50 border-cyan-100 self-start">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Avg Response Latency</p>
                          <p className="text-2xl font-extrabold text-slate-900 mt-1">{analytics.averageResponseTime} ms</p>
                          <div className="flex flex-wrap items-center gap-x-2 text-[9px] text-slate-400 font-medium mt-1 border-t border-slate-50 pt-1">
                            <span>Fast: {analytics.fastestResponseTime}ms</span>
                            <span>•</span>
                            <span>Slow: {analytics.slowestResponseTime}ms</span>
                          </div>
                        </div>
                      </div>

                      {/* User Satisfaction */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
                        <div className="p-2 rounded-lg border text-emerald-600 bg-emerald-50 border-emerald-100 self-start">
                          <ThumbsUp className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">User Satisfaction</p>
                          <p className="text-2xl font-extrabold text-slate-900 mt-1">{analytics.positiveFeedbackPercentage}%</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[9px] text-emerald-600 font-bold">👍 {analytics.positiveFeedbackPercentage}%</span>
                            <span className="text-[9px] text-slate-300">|</span>
                            <span className="text-[9px] text-rose-500 font-bold">👎 {analytics.negativeFeedbackPercentage}%</span>
                            <span className="text-[9px] text-slate-400 font-semibold">({analytics.totalFeedbackCount} total)</span>
                          </div>
                        </div>
                      </div>

                      {/* Vector DB Density */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
                        <div className="p-2 rounded-lg border text-indigo-600 bg-indigo-50 border-indigo-100 self-start">
                          <Database className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Embedding Density</p>
                          <p className="text-2xl font-extrabold text-slate-900 mt-1">{analytics.knowledgeStats?.totalEmbeddings || 0}</p>
                          <p className="text-[9px] text-slate-400 font-semibold mt-1">Avg {analytics.knowledgeStats?.averageChunksPerDocument || 0} chunks/doc</p>
                        </div>
                      </div>
                    </div>

                    {/* RECHARTS VISUALS BLOCK */}
                    <div className="grid lg:grid-cols-3 gap-6">
                      
                      {/* Daily Questions Trend Area Chart */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 lg:col-span-2 shadow-sm">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Daily Questions Trend</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Real-time volume graph of campus inquiries</p>
                        </div>
                        <div className="h-64">
                          {analytics.dailyQuestions && analytics.dailyQuestions.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={analytics.dailyQuestions}>
                                <defs>
                                  <linearGradient id="colorQuestions" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                                <Area type="monotone" dataKey="count" name="Questions" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorQuestions)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold">
                              No trend data compiled yet.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Top Searched Queries list */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Frequent Campus Queries</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Most common questions normalized by the system</p>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[250px] space-y-2 pr-1">
                          {analytics.popularQuestions && analytics.popularQuestions.length > 0 ? (
                            analytics.popularQuestions.slice(0, 10).map((pq, index) => (
                              <div key={index} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 w-5 h-5 rounded-md flex items-center justify-center shrink-0">
                                    {index + 1}
                                  </span>
                                  <p className="text-[11px] text-slate-700 font-semibold truncate" title={pq.question}>
                                    {pq.question}
                                  </p>
                                </div>
                                <span className="text-[10px] font-extrabold text-slate-500 shrink-0 bg-white border border-slate-200/60 rounded-full px-2 py-0.5">
                                  {pq.count} ask{pq.count > 1 ? 's' : ''}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold py-10">
                              No frequent queries logged.
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* AI SYSTEM DIAGNOSTICS & HARDWARE PERFORMANCE */}
                    <div className="grid lg:grid-cols-2 gap-6">
                      {/* AI Model Performance Metrics */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">LLM Inference Diagnostics</h4>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Model token footprints and API cost computation</p>
                          </div>
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-indigo-600 bg-indigo-50/60 border border-indigo-100 rounded-full px-2.5 py-1">
                            {analytics.aiModelStats?.modelName.split('/').pop() || 'Gemini'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Accumulated Tokens</p>
                            <p className="text-lg font-extrabold text-slate-800 mt-1">{(analytics.aiModelStats?.totalTokens || 0).toLocaleString()}</p>
                            <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                              {analytics.aiModelStats?.promptTokens || 0} In / {analytics.aiModelStats?.completionTokens || 0} Out
                            </p>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Estimated Cumulative API Cost</p>
                            <p className="text-lg font-extrabold text-slate-800 mt-1">${analytics.aiModelStats?.estimatedCost.toFixed(5)}</p>
                            <p className="text-[9px] text-slate-400 font-medium mt-0.5">Calculated using live model rates</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs">
                          <span className="text-slate-500 font-semibold">Average Tokens Per Question:</span>
                          <span className="font-extrabold text-slate-800">{analytics.aiModelStats?.averageTokensPerQuestion || 0} tokens</span>
                        </div>
                      </div>

                      {/* System Network & Latency Performance */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">System Performance & Health</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Core network latency split and component status checks</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1 bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                              <span>Local Vector DB</span>
                            </div>
                            <p className="font-extrabold text-slate-800 mt-0.5">{analytics.systemPerformance?.vectorDbStatus || 'Online'}</p>
                          </div>
                          <div className="space-y-1 bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                              <span>Embedding Queue</span>
                            </div>
                            <p className="font-extrabold text-slate-800 mt-0.5">{analytics.systemPerformance?.embeddingQueue || 'Idle'}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs border-t border-slate-50 pt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 font-semibold">Avg Document Retrieval:</span>
                            <span className="font-extrabold text-slate-800">{analytics.systemPerformance?.averageRetrievalTime || 25} ms</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 font-semibold">Avg Response Generation:</span>
                            <span className="font-extrabold text-slate-800">{analytics.systemPerformance?.averageGenerationTime || 0} ms</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* LIVE EVENT STREAM & RECENT LOGS */}
                    <div className="grid lg:grid-cols-3 gap-6">
                      {/* Live Activity Feed */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm lg:col-span-1">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Live Activity Event Stream</h4>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Real-time socket stream of incoming inquiries</p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                            <Activity className="h-3 w-3 animate-spin" />
                            <span>STREAM LIVE</span>
                          </div>
                        </div>

                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                          {analytics.liveActivityFeed && analytics.liveActivityFeed.length > 0 ? (
                            analytics.liveActivityFeed.map((event, idx) => (
                              <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs space-y-1.5">
                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                                  <span>{event.time}</span>
                                  <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">QUERY</span>
                                </div>
                                <p className="text-slate-700 font-semibold line-clamp-2 leading-relaxed">
                                  "{event.question}"
                                </p>
                                <div className="text-[9px] text-slate-500 flex items-center gap-1">
                                  <span className="font-extrabold">Retrieved:</span>
                                  <span className="truncate max-w-[150px]" title={event.retrievedSource}>
                                    {event.retrievedSource}
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="h-32 flex items-center justify-center text-xs text-slate-400 font-semibold">
                              Waiting for live student chat interactions...
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Conversation History Grid */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm lg:col-span-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Conversation Audit Logs</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Detailed conversational ledger and rating feedback</p>
                        </div>

                        <div className="overflow-x-auto max-h-[300px] overflow-y-auto border border-slate-100 rounded-xl">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] tracking-wider border-b border-slate-100">
                                <th className="p-3">Time</th>
                                <th className="p-3">Question Query</th>
                                <th className="p-3 text-right">Latency</th>
                                <th className="p-3">Sources</th>
                                <th className="p-3 text-center">Feedback</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analytics.recentChats && analytics.recentChats.length > 0 ? (
                                analytics.recentChats.map((chat, idx) => (
                                  <tr key={chat.id || idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="p-3 text-slate-400 font-semibold whitespace-nowrap">{chat.time}</td>
                                    <td className="p-3 text-slate-700 font-semibold max-w-[200px] truncate" title={chat.question}>
                                      {chat.question}
                                    </td>
                                    <td className="p-3 text-right text-slate-800 font-extrabold whitespace-nowrap">
                                      {chat.responseTimeMs} ms
                                    </td>
                                    <td className="p-3 text-slate-500 font-medium max-w-[120px] truncate" title={chat.sourcesUsed.join(', ')}>
                                      {chat.sourcesUsed.join(', ') || 'Direct / Fallback'}
                                    </td>
                                    <td className="p-3 text-center">
                                      {chat.feedback === 'positive' && (
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-0.5 font-extrabold text-[9px]">
                                          👍 Positive
                                        </span>
                                      )}
                                      {chat.feedback === 'negative' && (
                                        <span className="bg-rose-50 text-rose-700 border border-rose-100 rounded-full px-2 py-0.5 font-extrabold text-[9px]">
                                          👎 Negative
                                        </span>
                                      )}
                                      {!chat.feedback && (
                                        <span className="text-slate-300">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5} className="p-8 text-center text-slate-400 font-semibold">
                                    No historical logs loaded yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                  </div>
                )}

                {/* DOCUMENT INDEX MANAGER & AI KNOWLEDGE EXTRACTION */}
                <div className="space-y-8">
                  
                  {/* AI Knowledge Extraction Hub */}
                  <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <h4 className="text-lg font-extrabold text-slate-950 flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-indigo-600 animate-pulse" />
                          AI Knowledge Extraction Portal
                        </h4>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">
                          Paste raw website text or official campus circulars. Gemini will automatically structure, chunk, and index the data.
                        </p>
                      </div>
                      
                      {uploadSuccess && (
                        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          <span>Knowledge indexed successfully!</span>
                        </div>
                      )}
                    </div>

                    {/* Navigation tabs for manual vs website import */}
                    <div className="flex border-b border-slate-200 max-w-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setExtractionMethod('paste');
                          setImportSuccessMessage(false);
                          setExtractionSuccess(false);
                          setImportUrl('');
                          setPastedContent('');
                        }}
                        className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                          extractionMethod === 'paste'
                            ? 'border-indigo-600 text-indigo-600 font-extrabold'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <FileText className="h-4 w-4" />
                        <span>Manual Copy-Paste</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExtractionMethod('url');
                          setImportSuccessMessage(false);
                          setExtractionSuccess(false);
                          setImportUrl('');
                          setPastedContent('');
                        }}
                        className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                          extractionMethod === 'url'
                            ? 'border-indigo-600 text-indigo-600 font-extrabold'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <Globe className="h-4 w-4" />
                        <span>Import from Website URL</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExtractionMethod('json');
                          setImportSuccessMessage(false);
                          setExtractionSuccess(false);
                          setImportUrl('');
                          setPastedContent('');
                        }}
                        className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                          extractionMethod === 'json'
                            ? 'border-indigo-600 text-indigo-600 font-extrabold'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <Database className="h-4 w-4" />
                        <span>Import JSON Files</span>
                      </button>
                    </div>

                    {extractionMethod !== 'json' ? (
                      <div className="grid lg:grid-cols-2 gap-8 items-start">
                      
                      {/* Left: Raw Content Ingestion / URL Import */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                        {extractionMethod === 'paste' ? (
                          <>
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide flex justify-between">
                                <span>Webpage Text / Raw Copy-Paste Content</span>
                                <span className="text-slate-500 font-medium normal-case">{pastedContent.length} characters</span>
                              </label>
                              <textarea
                                rows={15}
                                required
                                value={pastedContent}
                                onChange={(e) => setPastedContent(e.target.value)}
                                placeholder="Paste the entire copied content, HTML markup, tables, or notes from the official college website here..."
                                className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl p-4 focus:outline-none focus:border-indigo-500 font-medium leading-relaxed resize-y min-h-[300px]"
                              />
                            </div>

                            {extractionError && (
                              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold p-4 rounded-xl space-y-2">
                                <p>{extractionError}</p>
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={isExtracting || !pastedContent.trim()}
                              onClick={handleAiExtract}
                              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                            >
                              {isExtracting ? (
                                <>
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  <span>Gemini analyzing & extracting structured data...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4" />
                                  <span>Extract with AI</span>
                                </>
                              )}
                            </button>

                            {isExtracting && (
                              <div className="bg-indigo-50/50 border border-indigo-100/60 rounded-xl p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                  <div className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                                  </div>
                                  <span className="text-xs font-bold text-indigo-700">Extraction Progress</span>
                                </div>
                                <ul className="text-[10px] text-slate-500 space-y-1.5 font-medium pl-6 list-disc">
                                  <li>Analyzing document semantics and domain category...</li>
                                  <li>Isolating searchable knowledge facts and rules...</li>
                                  <li>Formulating high-precision FAQs and summary notes...</li>
                                  <li>Drafting 100-500 word optimal context retrieval chunks...</li>
                                </ul>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="space-y-5">
                            <div className="space-y-2">
                              <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">
                                Single Webpage URL to Fetch
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                  <Globe className="h-4 w-4" />
                                </div>
                                <input
                                  type="url"
                                  required
                                  value={importUrl}
                                  onChange={(e) => setImportUrl(e.target.value)}
                                  placeholder="https://gacs.ac.in/about-us/"
                                  className="w-full bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-indigo-500 text-xs text-slate-900 rounded-xl pl-10 pr-4 py-3.5 focus:outline-none transition-all font-semibold"
                                />
                              </div>
                              <p className="text-[10px] text-slate-400 font-semibold">
                                The backend will download only this webpage and extract readable text while preserving headings, lists, and tables.
                              </p>
                            </div>

                            {importError && (
                              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold p-4 rounded-xl">
                                {importError}
                              </div>
                            )}

                            {isFetchingUrl && (
                              <div className="space-y-3 bg-indigo-50/50 border border-indigo-100/60 rounded-xl p-4">
                                <div className="flex items-center justify-between text-xs font-bold text-indigo-700">
                                  <span>{importStatusText}</span>
                                  <span>{importProgress}%</span>
                                </div>
                                <div className="w-full bg-slate-200/60 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${importProgress}%` }}
                                  ></div>
                                </div>
                              </div>
                            )}

                            {importSuccessMessage && (
                              <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-4 text-emerald-800 space-y-2">
                                <div className="flex items-center gap-2">
                                  <CheckSquare className="h-5 w-5 text-emerald-600" />
                                  <h4 className="font-extrabold text-xs">Page Fetched Successfully</h4>
                                </div>
                                <p className="text-[10px] text-emerald-600 font-semibold pl-7 leading-relaxed">
                                  Formatting preserved (headings, lists, and tables). You can view the preview below and click "Generate Structured Knowledge" to extract knowledge schema.
                                </p>
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={isFetchingUrl || !importUrl.trim()}
                              onClick={handleFetchAndExtract}
                              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                            >
                              {isFetchingUrl ? (
                                <>
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  <span>Downloading & Formatting Webpage...</span>
                                </>
                              ) : (
                                <>
                                  <Globe className="h-4 w-4" />
                                  <span>Fetch Webpage Content</span>
                                </>
                              )}
                            </button>

                            {/* Cleaned webpage preview panel with editable content preview */}
                            {pastedContent && !isFetchingUrl && (
                              <div className="space-y-2 border-t border-slate-100 pt-4">
                                <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-[10px] text-slate-500 font-semibold space-y-1">
                                  <p className="flex justify-between">
                                    <span>Source URL:</span>
                                    <span className="font-bold text-slate-700 truncate max-w-[180px]">{importUrl}</span>
                                  </p>
                                  <p className="flex justify-between">
                                    <span>Character Count:</span>
                                    <span className="font-bold text-slate-700">{pastedContent.length}</span>
                                  </p>
                                  <p className="flex justify-between">
                                    <span>Word Count:</span>
                                    <span className="font-bold text-slate-700">{pastedContent.split(/\s+/).filter(Boolean).length}</span>
                                  </p>
                                </div>

                                <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide flex justify-between">
                                  <span>Editable Content Preview</span>
                                </label>
                                <textarea
                                  rows={10}
                                  value={pastedContent}
                                  onChange={(e) => setPastedContent(e.target.value)}
                                  placeholder="Editable content preview..."
                                  className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl p-4 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed resize-y"
                                />
                                <p className="text-[10px] text-slate-400 font-medium">
                                  You can edit the raw webpage content above before sending it to Gemini for knowledge generation.
                                </p>

                                <button
                                  type="button"
                                  disabled={isExtracting || !pastedContent.trim()}
                                  onClick={handleAiExtract}
                                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold text-xs py-3 rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                                >
                                  {isExtracting ? (
                                    <>
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                      <span>AI Ingesting & Creating Knowledge Schema...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="h-4 w-4" />
                                      <span>Generate Structured Knowledge with AI</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: AI Structured Review Console */}
                      <div className="space-y-4">
                        {!extractionSuccess && !isExtracting && !isFetchingUrl && (
                          <div className="bg-white border border-slate-100 border-dashed rounded-2xl p-12 text-center space-y-3">
                            <div className="mx-auto w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                              <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-slate-900">Extracted Knowledge Console</h5>
                              <p className="text-[10px] text-slate-400 font-medium max-w-xs mx-auto mt-1">
                                {extractionMethod === 'url'
                                  ? 'Enter a website URL on the left and click "Fetch & Extract" to generate structured Title, FAQs, Categories, and Chunks.'
                                  : 'Paste webpage data in the left editor and click "Extract with AI" to generate structured Title, FAQs, Categories, and Chunks.'}
                              </p>
                            </div>
                          </div>
                        )}

                        {extractionSuccess && (
                          <form onSubmit={handleSaveExtracted} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                            <div className="border-b border-slate-100 pb-4">
                              <h5 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                                <CheckSquare className="h-4.5 w-4.5 text-indigo-600" />
                                Review & Edit Structured Knowledge
                              </h5>
                              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Customize AI outputs below before saving to the RAG database.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5 col-span-2">
                                <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Document Title</label>
                                <input
                                  type="text"
                                  required
                                  value={extractedTitle}
                                  onChange={(e) => setExtractedTitle(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Category Group</label>
                                <select
                                  value={extractedCategory}
                                  onChange={(e) => setExtractedCategory(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-semibold text-slate-700"
                                >
                                  <option value="Admissions">Admissions</option>
                                  <option value="Academics">Academics</option>
                                  <option value="Fees">Fees & Finance</option>
                                  <option value="Placements">Placements</option>
                                  <option value="Hostel">Hostel & Living</option>
                                  <option value="Campus Info">General Campus Info</option>
                                </select>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Keywords (Comma Separated)</label>
                                <input
                                  type="text"
                                  value={extractedKeywords.join(', ')}
                                  onChange={(e) => setExtractedKeywords(e.target.value.split(',').map(k => k.trim()).filter(Boolean))}
                                  className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Document Summary (Grounding Note)</label>
                              <textarea
                                rows={2}
                                value={extractedSummary}
                                onChange={(e) => setExtractedSummary(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl p-4 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
                              />
                            </div>

                            {/* FAQs LIST EDITOR */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Extracted FAQ Compilation</label>
                                <button
                                  type="button"
                                  onClick={handleFaqAdd}
                                  className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold flex items-center gap-1"
                                >
                                  <Plus className="h-3 w-3" /> Add FAQ
                                </button>
                              </div>

                              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                                {extractedFaqs.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic">No FAQs generated.</p>
                                ) : (
                                  extractedFaqs.map((faq, idx) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 relative group">
                                      <button
                                        type="button"
                                        onClick={() => handleFaqDelete(idx)}
                                        className="absolute top-2 right-2 text-slate-400 hover:text-rose-500 transition-colors"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                      <div className="space-y-1 pr-6">
                                        <input
                                          type="text"
                                          placeholder="Question"
                                          value={faq.question}
                                          onChange={(e) => handleFaqQuestionChange(idx, e.target.value)}
                                          className="w-full bg-white border border-slate-200 text-[11px] font-bold text-slate-900 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500"
                                        />
                                        <textarea
                                          rows={2}
                                          placeholder="Answer"
                                          value={faq.answer}
                                          onChange={(e) => handleFaqAnswerChange(idx, e.target.value)}
                                          className="w-full bg-white border border-slate-200 text-[10px] text-slate-600 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                                        />
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            {/* CHUNKS LIST EDITOR */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Searchable Knowledge Chunks</label>
                                <button
                                  type="button"
                                  onClick={handleChunkAdd}
                                  className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold flex items-center gap-1"
                                >
                                  <Plus className="h-3 w-3" /> Add Chunk
                                </button>
                              </div>

                              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                                {extractedChunks.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic">No searchable chunks defined.</p>
                                ) : (
                                  extractedChunks.map((chunk, idx) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 relative space-y-1">
                                      <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold mb-1">
                                        <span>Chunk #{idx + 1} ({chunk.length} chars)</span>
                                        <button
                                          type="button"
                                          onClick={() => handleChunkDelete(idx)}
                                          className="text-slate-400 hover:text-rose-500 transition-colors"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                      <textarea
                                        rows={4}
                                        value={chunk}
                                        onChange={(e) => handleChunkChange(idx, e.target.value)}
                                        className="w-full bg-white border border-slate-200 text-[10px] text-slate-700 font-medium rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
                                      />
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            {/* METADATA LIST EDITOR */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Document Metadata</label>
                                <button
                                  type="button"
                                  onClick={handleMetadataAdd}
                                  className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold flex items-center gap-1"
                                >
                                  <Plus className="h-3 w-3" /> Add Row
                                </button>
                              </div>

                              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                {extractedMetadata.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic">No custom metadata.</p>
                                ) : (
                                  extractedMetadata.map((meta, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                      <input
                                        type="text"
                                        placeholder="Key (e.g. Read Time)"
                                        value={meta.key}
                                        onChange={(e) => handleMetadataKeyChange(idx, e.target.value)}
                                        className="flex-1 bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                                      />
                                      <input
                                        type="text"
                                        placeholder="Value (e.g. 3 mins)"
                                        value={meta.value}
                                        onChange={(e) => handleMetadataValueChange(idx, e.target.value)}
                                        className="flex-1 bg-slate-50 border border-slate-200 text-[10px] text-slate-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleMetadataDelete(idx)}
                                        className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={isUploading}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-xs py-3 rounded-xl shadow-md shadow-emerald-50 transition-colors flex items-center justify-center gap-1.5"
                            >
                              {isUploading ? (
                                <>
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  <span>Saving Knowledge...</span>
                                </>
                              ) : (
                                <>
                                  <Database className="h-4 w-4" />
                                  <span>Save & Index Knowledge Base</span>
                                </>
                              )}
                            </button>
                          </form>
                        )}
                      </div>

                    </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm space-y-6">
                        <div className="space-y-2">
                          <h4 className="text-sm font-extrabold text-slate-950 flex items-center gap-2">
                            <Database className="h-5 w-5 text-indigo-600" />
                            Import Knowledge JSON Files
                          </h4>
                          <p className="text-xs text-slate-500 font-medium max-w-2xl">
                            Accept one or multiple JSON files generated by external AI systems or crawl engines.
                            The schema must define either a single object or an array of objects, with each object containing at least <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] text-slate-800">title</code> and <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] text-slate-800">content</code> fields.
                          </p>
                        </div>

                        <div className="grid lg:grid-cols-2 gap-8 items-start">
                          {/* Left Column: Upload area */}
                          <div className="space-y-5">
                            <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-8 text-center transition-colors relative bg-slate-50/50">
                              <input
                                type="file"
                                accept=".json"
                                multiple
                                onChange={handleJsonFilesSelected}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                              <div className="space-y-3">
                                <div className="mx-auto w-12 h-12 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm">
                                  <Upload className="h-5 w-5 text-indigo-500" />
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs font-bold text-slate-800">
                                    Click to select or drag & drop JSON files
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-medium">
                                    Support multiple files containing single objects or arrays of knowledge documents
                                  </p>
                                </div>
                              </div>
                            </div>

                            {jsonImportError && (
                              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold p-4 rounded-xl space-y-1">
                                <p>{jsonImportError}</p>
                              </div>
                            )}

                            {jsonImportSuccess && (
                              <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold p-4 rounded-xl flex items-start gap-2">
                                <CheckSquare className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                                <div>
                                  <p>Saved to Firestore successfully</p>
                                  <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                                    All valid documents were stored in the database and automatic vector index embeddings were generated.
                                  </p>
                                </div>
                              </div>
                            )}

                            {pendingJsonDocs.length > 0 && (
                              <div className="bg-indigo-50/50 border border-indigo-100/60 rounded-xl p-4 space-y-3">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-bold text-indigo-900">Valid Documents Loaded:</span>
                                  <span className="font-extrabold text-indigo-700 bg-white px-2 py-0.5 border border-indigo-100 rounded-md">
                                    {pendingJsonDocs.length} documents
                                  </span>
                                </div>
                                <p className="text-[10px] text-indigo-600 font-semibold leading-relaxed">
                                  Click the button below to parse, schema-validate, save, and generate vector embeddings for all loaded documents.
                                </p>
                                <button
                                  type="button"
                                  disabled={isImportingJson}
                                  onClick={handleImportJson}
                                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold text-xs py-3 rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                                >
                                  {isImportingJson ? (
                                    <>
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                      <span>Importing and Indexing JSON Documents...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Database className="h-4 w-4" />
                                      <span>Index {pendingJsonDocs.length} Loaded Documents</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Right Column: Execution Logs and Real-time Status */}
                          <div className="space-y-4">
                            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 font-mono text-[10px] leading-relaxed text-indigo-300 shadow-inner flex flex-col h-[300px]">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                                <span className="font-bold text-slate-400 flex items-center gap-1.5">
                                  <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                                  JSON Ingestion Console Logs
                                </span>
                                <span className="text-[9px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-semibold">
                                  LIVE DIAGNOSTICS
                                </span>
                              </div>
                              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 select-text scrollbar-thin">
                                {jsonImportLogs.length === 0 ? (
                                  <p className="text-slate-500 italic">No files processed yet. Upload a JSON file to see terminal logs...</p>
                                ) : (
                                  jsonImportLogs.map((logStr, i) => (
                                    <div key={i} className="whitespace-pre-wrap">
                                      {logStr.includes('[Client] Successfully') || logStr.includes('Successfully imported') ? (
                                        <span className="text-emerald-400 font-bold">{logStr}</span>
                                      ) : logStr.includes('Skipped') || logStr.includes('Failed') ? (
                                        <span className="text-rose-400 font-bold">{logStr}</span>
                                      ) : (
                                        <span>{logStr}</span>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Hiding old crawler to prevent compilation/syntax errors */}
                        <div className="hidden">
                        {/* URL configuration and action */}
                        <div className="max-w-2xl space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">
                              College Homepage / Root Website URL
                            </label>
                            <div className="flex flex-col sm:flex-row gap-3">
                              <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                  <Globe className="h-4 w-4" />
                                </div>
                                <input
                                  type="url"
                                  disabled={isScanningLinks || isImportingBatch}
                                  value={importUrl}
                                  onChange={(e) => setImportUrl(e.target.value)}
                                  placeholder="Enter main URL (e.g. https://iracampus.edu or https://gacs.ac.in)"
                                  className="w-full bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-indigo-500 text-xs text-slate-900 rounded-xl pl-10 pr-4 py-3 focus:outline-none transition-all font-semibold"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={isScanningLinks || isImportingBatch || !importUrl.trim()}
                                onClick={handleScanWebsiteLinks}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm whitespace-nowrap transition-all"
                              >
                                {isScanningLinks ? (
                                  <>
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    <span>Scanning Homepage...</span>
                                  </>
                                ) : (
                                  <>
                                    <Search className="h-4 w-4" />
                                    <span>Scan Website & Analyze Links</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-semibold">
                              The crawler will fetch the main page, automatically clean clutter, and isolate internal college links for selective structured RAG import.
                            </p>
                          </div>

                          {scanError && (
                            <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold p-4 rounded-xl flex items-center gap-2">
                              <span>⚠️</span>
                              <p>{scanError}</p>
                            </div>
                          )}
                        </div>

                        {/* Link Checklist Selection */}
                        {detectedLinks.length > 0 && !isImportingBatch && !batchImportCompleted && (
                          <div className="space-y-6 animate-fade-in border-t border-slate-100 pt-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <div>
                                <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Select Webpages to Index</h5>
                                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                  We detected {detectedLinks.length} total internal pages. Choose which pages to structure as separate knowledge documents.
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={handleToggleAllLinks}
                                  className="text-[10px] bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  {selectedLinks.length === detectedLinks.length ? 'Deselect All' : 'Select All'}
                                </button>
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold font-mono">
                                  {selectedLinks.length} of {detectedLinks.length} Selected
                                </span>
                              </div>
                            </div>

                            {/* Grouping detected links into important categories */}
                            <div className="grid md:grid-cols-2 gap-6">
                              {['About', 'Admission', 'Departments', 'Faculty', 'Courses', 'Hostel', 'Library', 'Scholarships', 'Fees', 'Placements', 'Notices', 'Contact', 'Administration', 'IQAC', 'NAAC', 'Academics', 'General'].map((cat) => {
                                const catLinks = detectedLinks.filter(l => l.category === cat);
                                if (catLinks.length === 0) return null;

                                const isAllCatSelected = catLinks.every(l => selectedLinks.includes(l.url));
                                const countSelected = catLinks.filter(l => selectedLinks.includes(l.url)).length;

                                return (
                                  <div key={cat} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm hover:border-slate-300/80 transition-all">
                                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                        {cat === 'General' ? 'Other Discovered' : cat} ({catLinks.length})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleCategoryLinks(cat)}
                                        className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold"
                                      >
                                        {isAllCatSelected ? 'Deselect Category' : `Select Category (${countSelected}/${catLinks.length})`}
                                      </button>
                                    </div>
                                    <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                                      {catLinks.map((link, linkIdx) => {
                                        const isSelected = selectedLinks.includes(link.url);
                                        // Extract clean filename or path
                                        let cleanPath = '';
                                        try {
                                          const p = new URL(link.url).pathname;
                                          cleanPath = p === '/' ? 'index' : p.substring(p.lastIndexOf('/') + 1) || p;
                                        } catch (_) {}

                                        return (
                                          <label
                                            key={`${link.url}-${linkIdx}`}
                                            className={`flex items-start gap-2.5 p-2 rounded-xl border text-[11px] font-semibold cursor-pointer transition-all ${
                                              isSelected
                                                ? 'bg-indigo-50/40 border-indigo-150/80 text-indigo-950'
                                                : 'bg-slate-50/20 border-slate-150 hover:bg-slate-50 text-slate-600'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => handleToggleLinkSelection(link.url)}
                                              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                                            />
                                            <div className="flex-1 min-w-0">
                                              <div className="truncate font-bold leading-tight" title={link.label}>{link.label}</div>
                                              <div className="text-[9px] text-slate-400 font-mono truncate mt-0.5" title={link.url}>
                                                {cleanPath} • {link.url}
                                              </div>
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Start Import Button */}
                            <div className="pt-4 flex justify-end">
                              <button
                                type="button"
                                disabled={selectedLinks.length === 0}
                                onClick={handleStartBatchImport}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold text-xs px-8 py-4 rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center gap-2"
                              >
                                <Sparkles className="h-4.5 w-4.5" />
                                <span>Import {selectedLinks.length} Selected Webpages</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Batch Queue & Pipeline Progress View */}
                        {(isImportingBatch || batchImportCompleted) && (
                          <div className="space-y-6 border-t border-slate-100 pt-6">
                            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 md:p-6 space-y-4">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                  <h5 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                                    {isImportingBatch ? (
                                      <>
                                        <RefreshCw className="h-4.5 w-4.5 text-indigo-600 animate-spin" />
                                        <span>Website Knowledge Extraction Pipeline Active</span>
                                      </>
                                    ) : (
                                      <>
                                        <CheckSquare className="h-5 w-5 text-emerald-600" />
                                        <span>Intelligent Crawl and Extraction Complete</span>
                                      </>
                                    )}
                                  </h5>
                                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                    Each webpage is cleaned, parsed, generated with Gemini, vectorized, and stored as an independent searchable document.
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-bold text-slate-700">
                                    {importQueue.filter(item => item.status === 'completed').length} of {importQueue.length} Done
                                  </span>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                                    batchImportCompleted ? 'bg-emerald-600' : 'bg-indigo-600'
                                  }`}
                                  style={{
                                    width: `${Math.round(
                                      (importQueue.filter(item => ['completed', 'failed'].includes(item.status)).length / importQueue.length) * 100
                                    )}%`
                                  }}
                                ></div>
                              </div>

                              {batchImportCompleted && (
                                <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-4 text-emerald-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                  <div className="space-y-1">
                                    <h6 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                                      <span>✓</span> Import Completed Successfully!
                                    </h6>
                                    <p className="text-[10px] text-emerald-600 font-semibold leading-relaxed">
                                      We have structured, summarized, indexed, and loaded {batchImportSummary.successful} documents into the searchable RAG database.
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDetectedLinks([]);
                                      setSelectedLinks([]);
                                      setImportQueue([]);
                                      setBatchImportCompleted(false);
                                    }}
                                    className="bg-white hover:bg-emerald-100/50 border border-emerald-200 text-emerald-700 font-bold text-xs px-4 py-2 rounded-xl transition-colors"
                                  >
                                    Reset Crawler
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Queue Item Status Pipeline Grid */}
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                              {importQueue.map((item, index) => {
                                const isActive = ['fetching', 'cleaning', 'extracting', 'generating', 'embedding', 'saving'].includes(item.status);
                                return (
                                  <div
                                    key={`${item.url}-${index}`}
                                    className={`border rounded-2xl p-4 transition-all ${
                                      isActive
                                        ? 'bg-indigo-50/30 border-indigo-200 shadow-sm'
                                        : item.status === 'completed'
                                        ? 'bg-white border-slate-100 opacity-85'
                                        : item.status === 'failed'
                                        ? 'bg-rose-50/30 border-rose-100'
                                        : 'bg-white border-slate-150'
                                    }`}
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                      <div className="flex items-start gap-2.5">
                                        <span className="text-xs font-bold text-slate-400 font-mono mt-0.5">#{index + 1}</span>
                                        <div>
                                          <h6 className="text-xs font-bold text-slate-900">{item.label}</h6>
                                          <p className="text-[10px] text-slate-400 font-semibold truncate max-w-lg mt-0.5">{item.url}</p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-[9px] uppercase">
                                          {item.category}
                                        </span>
                                        {item.status === 'completed' ? (
                                          <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 font-extrabold text-[10px] px-2.5 py-1 rounded-xl flex items-center gap-1">
                                            <span>✓</span> Indexed
                                          </span>
                                        ) : item.status === 'failed' ? (
                                          <span className="bg-rose-50 border border-rose-100 text-rose-700 font-extrabold text-[10px] px-2.5 py-1 rounded-xl flex items-center gap-1" title={item.error}>
                                            <span>✗</span> Failed
                                          </span>
                                        ) : item.status === 'pending' ? (
                                          <span className="bg-slate-100 text-slate-500 font-extrabold text-[10px] px-2.5 py-1 rounded-xl">
                                            Waiting...
                                          </span>
                                        ) : (
                                          <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold text-[10px] px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                                            <RefreshCw className="h-3 w-3 animate-spin text-indigo-600" />
                                            <span className="capitalize">{item.status}...</span>
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* GRANULAR PROGRESS PIPELINE (STEP 8 SPECIFICATION) */}
                                    {isActive && (
                                      <div className="mt-4 pl-6 space-y-1.5 border-l-2 border-indigo-500 py-1 bg-indigo-50/20 rounded-r-xl p-3 max-w-lg">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                                          <span className={['fetching', 'cleaning', 'extracting', 'generating', 'embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                                            {['fetching', 'cleaning', 'extracting', 'generating', 'embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? '✓' : '⌛'}
                                          </span>
                                          <span className={item.status === 'fetching' ? 'text-indigo-600 font-extrabold' : ''}>Fetching pages...</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                                          <span className={['cleaning', 'extracting', 'generating', 'embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                                            {['cleaning', 'extracting', 'generating', 'embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? '✓' : item.status === 'fetching' ? '⌛' : '○'}
                                          </span>
                                          <span className={item.status === 'cleaning' ? 'text-indigo-600 font-extrabold' : ''}>Cleaning HTML...</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                                          <span className={['extracting', 'generating', 'embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                                            {['extracting', 'generating', 'embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? '✓' : item.status === 'cleaning' ? '⌛' : '○'}
                                          </span>
                                          <span className={item.status === 'extracting' ? 'text-indigo-600 font-extrabold' : ''}>Extracting text...</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                                          <span className={['generating', 'embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                                            {['generating', 'embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? '✓' : item.status === 'extracting' ? '⌛' : '○'}
                                          </span>
                                          <span className={item.status === 'generating' ? 'text-indigo-600 font-extrabold' : ''}>Generating AI knowledge...</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                                          <span className={['embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                                            {['embedding', 'saving', 'completed'].indexOf(item.status) >= 0 ? '✓' : item.status === 'generating' ? '⌛' : '○'}
                                          </span>
                                          <span className={item.status === 'embedding' ? 'text-indigo-600 font-extrabold' : ''}>Creating embeddings...</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                                          <span className={['saving', 'completed'].indexOf(item.status) >= 0 ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                                            {['saving', 'completed'].indexOf(item.status) >= 0 ? '✓' : item.status === 'embedding' ? '⌛' : '○'}
                                          </span>
                                          <span className={item.status === 'saving' ? 'text-indigo-600 font-extrabold' : ''}>Saving documents...</span>
                                        </div>
                                      </div>
                                    )}

                                    {item.status === 'failed' && (
                                      <div className="mt-4 p-4 bg-rose-50/50 border border-rose-100 rounded-2xl space-y-3 max-w-xl text-xs font-sans">
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 block">Failed Stage</span>
                                            <span className="font-bold text-rose-950 mt-0.5 block">{item.failedStage || 'AI Extraction'}</span>
                                          </div>
                                          {item.httpStatus !== undefined && item.httpStatus !== null && (
                                            <div>
                                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 block">HTTP Status</span>
                                              <span className="font-bold text-rose-950 mt-0.5 block">{item.httpStatus}</span>
                                            </div>
                                          )}
                                        </div>

                                        <div>
                                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 block">Exact Error Message</span>
                                          <p className="font-semibold text-rose-900 mt-0.5 select-text break-words bg-rose-50 border border-rose-100/30 p-2.5 rounded-xl font-mono text-[10px] leading-relaxed">
                                            {item.error || 'Unknown crawler error.'}
                                          </p>
                                        </div>

                                        <div className="flex items-center gap-2 pt-1">
                                          <button
                                            type="button"
                                            onClick={() => handleRetryImport(index)}
                                            className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-[10px] px-3.5 py-1.5 rounded-xl transition-all shadow-xs cursor-pointer"
                                          >
                                            <RefreshCw className="h-3 w-3 animate-spin-hover" />
                                            Retry
                                          </button>

                                          {item.logs && item.logs.length > 0 && (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenLogsModal(item.label, item.logs)}
                                              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-[10px] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
                                            >
                                              <Terminal className="h-3 w-3 text-slate-500" />
                                              View Logs
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                  </div>

                  {/* Documents Directory List (Full-Width Bottom) */}
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6">
                    <div>
                      <h4 className="text-base font-extrabold text-slate-950">College Vector Knowledge Index</h4>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">List of structured and raw campus files mapped to natural language embeddings</p>
                    </div>

                    <div className="overflow-x-auto">
                      {isDocsLoading ? (
                        <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                          Loading document directory index...
                        </div>
                      ) : adminDocs.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                          No documents indexed yet. Paste webpage data above to begin semantic extraction.
                        </div>
                      ) : (
                        <table className="min-w-full divide-y divide-slate-100 text-xs text-left">
                          <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-wider font-extrabold">
                            <tr>
                              <th className="px-4 py-3">Source Title</th>
                              <th className="px-4 py-3">Category</th>
                              <th className="px-4 py-3">Type / Index Type</th>
                              <th className="px-4 py-3">AI Status</th>
                              <th className="px-4 py-3">Vectors Chunks</th>
                              <th className="px-4 py-3">Size</th>
                              <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {adminDocs.map((doc, docIdx) => (
                              <tr key={doc.id || docIdx} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3.5 text-slate-900 font-bold max-w-[240px]" title={doc.title}>
                                  <div className="flex items-center gap-2">
                                    <span className="truncate">{doc.title}</span>
                                    {doc.sourceUrl && (
                                      <a
                                        href={doc.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-600 hover:text-indigo-800"
                                        title={`Source URL: ${doc.sourceUrl}`}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-slate-500">
                                  <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                    {doc.category}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-slate-500">
                                  <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase font-bold border ${
                                    doc.type === 'url'
                                      ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                      : 'bg-indigo-50 border border-indigo-100 text-indigo-700'
                                  }`}>
                                    {doc.type === 'url' ? 'WEBPAGE IMPORT' : doc.type === 'ai_extracted' ? 'AI STRUCTURED' : doc.type}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-slate-500">
                                  {doc.aiStatus ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${
                                        doc.aiStatus === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                        doc.aiStatus === 'Processing' ? 'bg-indigo-50 text-indigo-700 border-indigo-100 animate-pulse' :
                                        doc.aiStatus === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                        'bg-rose-50 text-rose-700 border-rose-100'
                                      }`}>
                                        {doc.aiStatus === 'Completed' && '✓ Completed'}
                                        {doc.aiStatus === 'Processing' && '⚙ Processing'}
                                        {doc.aiStatus === 'Pending' && '⌛ Pending'}
                                        {doc.aiStatus === 'Retry Required' && '⚠️ Failed'}
                                      </span>
                                      {doc.aiError && (
                                        <span className="text-[9px] text-rose-600 font-mono font-medium max-w-[150px] truncate" title={doc.aiError}>
                                          {doc.aiError}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-[10px] font-bold italic">
                                      Instant Sync
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-slate-700 font-bold">{doc.chunksCount || (doc.chunks ? doc.chunks.length : 0)} vectors</td>
                                <td className="px-4 py-3.5 text-slate-500">{doc.size || 'N/A'}</td>
                                <td className="px-4 py-3.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {doc.aiStatus === 'Retry Required' && (
                                      <button
                                        onClick={() => handleRetryDocument(doc.id)}
                                        className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                        title="Retry AI Extraction"
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteDoc(doc.id)}
                                      className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                      title="Delete document"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs font-semibold text-slate-500">
                      <div className="flex items-center space-x-2">
                        <Database className="h-4 w-4 text-indigo-500" />
                        <span>Vectors automatically index when document uploads complete.</span>
                      </div>
                      <span>Total files: {adminDocs.length}</span>
                    </div>
                  </div>

                </div>


                {/* PUBLISH NOTICES & FAQ MANAGER PANEL */}
                <div className="grid lg:grid-cols-2 gap-8">
                  
                  {/* Create Notice */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                      <h4 className="text-base font-extrabold text-slate-950 flex items-center gap-1.5">
                        <Calendar className="h-4.5 w-4.5 text-indigo-600" />
                        Publish Campus Notice
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">Post general alerts visible instantly to all campus visitors</p>
                    </div>

                    <form onSubmit={handleCreateNotice} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Notice Title</label>
                        <input
                          type="text"
                          required
                          value={noticeTitle}
                          onChange={(e) => setNoticeTitle(e.target.value)}
                          placeholder="e.g. Summer Vacation Rescheduled"
                          className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Notice Category</label>
                        <select
                          value={noticeCategory}
                          onChange={(e) => setNoticeCategory(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="academic">Academic / Exams</option>
                          <option value="admission">Admission Update</option>
                          <option value="event">Fest / Cultural Events</option>
                          <option value="general">General Campus Notice</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Announcement Content</label>
                        <textarea
                          rows={4}
                          required
                          value={noticeContent}
                          onChange={(e) => setNoticeContent(e.target.value)}
                          placeholder="Provide the complete notice message clearly..."
                          className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 resize-none font-medium leading-relaxed"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl shadow-md transition-colors"
                      >
                        Publish Notice Broadcast
                      </button>
                    </form>
                  </div>

                  {/* Create FAQ */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                      <h4 className="text-base font-extrabold text-slate-950 flex items-center gap-1.5">
                        <MessageSquare className="h-4.5 w-4.5 text-indigo-600" />
                        Manage Helpful FAQs
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">Configure typical Q&A answers for rapid navigation</p>
                    </div>

                    <form onSubmit={handleCreateFAQ} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">FAQ Category</label>
                          <select
                            value={faqCategory}
                            onChange={(e) => setFaqCategory(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                          >
                            <option value="Admission">Admission</option>
                            <option value="Fees">Fees & Finance</option>
                            <option value="Hostel">Hostel Block</option>
                            <option value="Scholarships">Scholarships</option>
                            <option value="Campus Life">Campus Life</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Frequent Question</label>
                          <input
                            type="text"
                            required
                            value={faqQuestion}
                            onChange={(e) => setFaqQuestion(e.target.value)}
                            placeholder="e.g. Is transport available?"
                            className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">FAQ Answer</label>
                        <textarea
                          rows={4}
                          required
                          value={faqAnswer}
                          onChange={(e) => setFaqAnswer(e.target.value)}
                          placeholder="Provide the complete response to this question..."
                          className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 resize-none font-medium leading-relaxed"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl shadow-md transition-colors"
                      >
                        Publish FAQ Card
                      </button>
                    </form>
                  </div>

                </div>

              </div>
            )}
          </div>
        )}

      </main>

      {/* CITATION SIDE-DRAWER DRAWER PANEL */}
      {activeCitation && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm transition-all">
          <div className="w-full max-w-lg bg-white h-full flex flex-col justify-between shadow-2xl relative animate-slide-in p-6 lg:p-8 space-y-6">
            <div className="space-y-5">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-extrabold uppercase tracking-wide">
                    Document Grounding Extract
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-950 mt-2 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    {activeCitation.title}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveCitation(null)}
                  className="text-slate-400 hover:text-slate-950 text-base font-extrabold p-1"
                >
                  ✕
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 shadow-inner">
                <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider text-[10px] text-slate-400 mb-2">
                  Retrieved Chunk Snippet:
                </p>
                <blockquote className="text-sm text-slate-700 italic leading-relaxed whitespace-pre-wrap font-medium font-serif border-l-4 border-indigo-500 pl-4 py-1">
                  "{activeCitation.snippet}"
                </blockquote>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 space-y-4">
              <div className="flex items-center space-x-3 text-xs font-semibold text-slate-500 bg-slate-50/50 p-4 border border-slate-100 rounded-xl">
                <Shield className="h-4.5 w-4.5 text-emerald-500" />
                <span className="leading-snug">
                  This segment serves as structural context for IRA's conversational output.
                </span>
              </div>
              <button
                onClick={() => setActiveCitation(null)}
                className="w-full bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs py-3.5 rounded-xl transition-colors"
              >
                Close Grounding Drawer
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)} />
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-205 space-y-5">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Settings className="h-4.5 w-4.5 text-indigo-600" />
                <span>AI Session Settings</span>
              </h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  AI Grounding Model
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">Google Gemini API</p>
                    <p className="text-[10px] text-slate-400 font-medium">Model: gemini-1.5-flash</p>
                  </div>
                  <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-emerald-200">
                    Active
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Knowledge Base
                </label>
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                  IRA is loaded with official college documents on Admissions, Syllabus, Placements, Hostels, and Campus Rules.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Session Control
                </label>
                <button
                  type="button"
                  onClick={() => {
                    showConfirm(
                      "Clear Conversation History?",
                      "Are you sure you want to clear your conversation history? This is irreversible.",
                      () => {
                        localStorage.removeItem('ira_conversations');
                        window.location.reload();
                      }
                    );
                  }}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold px-4 py-2 rounded-xl border border-rose-200 transition-colors w-full text-center"
                >
                  Clear All Chats History
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-105 text-center">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="bg-slate-900 hover:bg-slate-850 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-colors w-full"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firebase Auth Sync Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => {
            setShowAuthModal(false);
            setAuthError('');
          }} />
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-205 space-y-5">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Lock className="h-4.5 w-4.5 text-[#6C5CE7]" />
                <span>{authIsSignUp ? 'Create Account' : 'Sign In'}</span>
              </h3>
              <button 
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthError('');
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {authError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold p-3 rounded-xl">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authIsSignUp && (
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#6C5CE7] focus:border-[#6C5CE7] focus:outline-none transition-all"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#6C5CE7] focus:border-[#6C5CE7] focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#6C5CE7] focus:border-[#6C5CE7] focus:outline-none transition-all"
                />
              </div>

              {authIsSignUp && (
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#6C5CE7] focus:border-[#6C5CE7] focus:outline-none transition-all"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#6C5CE7] hover:bg-[#5b4cd1] disabled:bg-slate-300 text-white font-extrabold text-xs py-3 rounded-xl transition-all shadow-md shadow-[#6C5CE7]/10 cursor-pointer"
              >
                {authLoading ? 'Please wait...' : authIsSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div className="relative flex py-1.5 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-[10px] text-slate-400 font-extrabold uppercase">or</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-3 px-4 rounded-xl border border-slate-200 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthIsSignUp(!authIsSignUp);
                  setAuthError('');
                  setAuthEmail('');
                  setAuthPassword('');
                  setAuthConfirmPassword('');
                  setAuthName('');
                }}
                className="text-xs font-bold text-[#6C5CE7] hover:underline cursor-pointer"
              >
                {authIsSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Guest History Sync Prompt Modal */}
      {showSyncPrompt && pendingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-205 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#6C5CE7]/10 text-[#6C5CE7]">
                <CloudLightning className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">
                Save Conversation
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Do you want to save this conversation to your account?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={async () => {
                  setShowSyncPrompt(false);
                  const user = pendingUser;
                  setPendingUser(null);
                  await syncCloudHistory(user, conversations);
                }}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-[#6C5CE7] hover:bg-[#5b4dbf] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg active:scale-95"
              >
                <span>Save Conversation</span>
              </button>
              <button
                onClick={async () => {
                  setShowSyncPrompt(false);
                  const user = pendingUser;
                  setPendingUser(null);
                  await startFreshCloudHistory(user);
                }}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <span>Start Fresh</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Dev Debug Panel Modal (Requirement 8) */}
      {selectedDebugMessage && selectedDebugMessage.debug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setSelectedDebugMessage(null)} />
          <div className="relative bg-white border border-slate-200 rounded-3xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Database className="h-5 w-5 text-[#6C5CE7]" />
                  <span>RAG Pipeline Dev Debug Panel</span>
                  <span className="text-[10px] bg-[#6C5CE7]/10 text-[#6C5CE7] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    Grounding Details
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Explore real-time semantic retrieval, entity mapping, token metrics, and prompts.</p>
              </div>
              <button 
                onClick={() => setSelectedDebugMessage(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Top Metrics Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#6C5CE7]/5 border border-[#6C5CE7]/10 rounded-2xl p-4 flex items-center gap-3.5">
                  <div className="p-2.5 bg-[#6C5CE7]/10 rounded-xl">
                    <Sparkles className="h-5 w-5 text-[#6C5CE7]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Sent Tokens</p>
                    <p className="text-xl font-black text-[#6C5CE7] mt-0.5">
                      {selectedDebugMessage.debug.totalTokens.toLocaleString()} <span className="text-[11px] font-bold text-[#6C5CE7]/70">Tokens</span>
                    </p>
                  </div>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3.5">
                  <div className="p-2.5 bg-emerald-100/60 rounded-xl">
                    <FileText className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Retrieved Chunks</p>
                    <p className="text-xl font-black text-emerald-700 mt-0.5">
                      {selectedDebugMessage.debug.retrievedChunks.length} <span className="text-[11px] font-bold text-emerald-600/70">Top Segments</span>
                    </p>
                  </div>
                </div>

                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3.5">
                  <div className="p-2.5 bg-amber-100/60 rounded-xl">
                    <Users className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Extracted Entity Collections</p>
                    <p className="text-xl font-black text-amber-700 mt-0.5">
                      {selectedDebugMessage.debug.retrievedEntities.length} <span className="text-[11px] font-bold text-amber-600/70">Sources Map</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Grid: Retrieved Chunks & Extracted Entities */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Left Side: Chunks with similarity score */}
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 pl-1">
                    <Search className="h-4 w-4 text-indigo-600" />
                    <span>Retrieved Semantic Chunks & Cosine Scores</span>
                  </h4>
                  
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {selectedDebugMessage.debug.retrievedChunks.map((chunk: any, cidx: number) => (
                      <div key={cidx} className="bg-white border border-slate-200 hover:border-[#6C5CE7]/30 rounded-2xl p-4 shadow-2xs transition-all space-y-2">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-1.5">
                          <span className="text-xs font-bold text-slate-900 truncate max-w-[70%]">
                            {chunk.docTitle}
                          </span>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold tracking-wider border ${
                             chunk.score >= 0.7 
                               ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                               : chunk.score >= 0.4 
                                 ? 'bg-indigo-50 text-[#6C5CE7] border-indigo-100' 
                                 : 'bg-slate-50 text-slate-600 border-slate-200'
                           }`}>
                            Score: {chunk.score.toFixed(4)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed font-sans font-medium whitespace-pre-wrap select-all">
                          {chunk.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Side: Retrieved Structured Entities */}
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 pl-1">
                    <Database className="h-4 w-4 text-emerald-600" />
                    <span>Retrieved Structured Knowledge Entities</span>
                  </h4>

                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    {selectedDebugMessage.debug.retrievedEntities.length === 0 ? (
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs font-medium">
                        No structured entities mapped for these segments.
                      </div>
                    ) : (
                      selectedDebugMessage.debug.retrievedEntities.map((re: any, ridx: number) => {
                        const ent = re.entities;
                        return (
                          <div key={ridx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                            <p className="text-xs font-extrabold text-indigo-900 border-b border-indigo-100/50 pb-1.5 truncate">
                              Document: {re.docTitle}
                            </p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                              {/* Departments */}
                              <div className="bg-white border border-slate-100 rounded-xl p-2.5">
                                <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px] mb-1">Departments</span>
                                <span className="font-semibold text-slate-700 leading-normal">
                                  {ent.departments && ent.departments.length > 0 ? ent.departments.join(', ') : 'None listed'}
                                </span>
                              </div>

                              {/* Faculty Members */}
                              <div className="bg-white border border-slate-100 rounded-xl p-2.5">
                                <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px] mb-1">Faculty / Staff</span>
                                <span className="font-semibold text-slate-700 leading-normal">
                                  {ent.facultyMembers && ent.facultyMembers.length > 0 ? ent.facultyMembers.join(', ') : 'None listed'}
                                </span>
                              </div>

                              {/* Courses */}
                              <div className="bg-white border border-slate-100 rounded-xl p-2.5">
                                <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px] mb-1">Courses</span>
                                <span className="font-semibold text-slate-700 leading-normal">
                                  {ent.courses && ent.courses.length > 0 ? ent.courses.join(', ') : 'None listed'}
                                </span>
                              </div>

                              {/* Fees */}
                              <div className="bg-white border border-slate-100 rounded-xl p-2.5">
                                <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px] mb-1">Fees & Charges</span>
                                <div className="space-y-0.5">
                                  {ent.fees && ent.fees.length > 0 ? (
                                    ent.fees.map((f: any, fidx: number) => {
                                      if (typeof f === 'object' && f !== null) {
                                        return (
                                          <p key={fidx} className="font-semibold text-slate-700">
                                            • <span className="text-slate-500">{f.courseOrService || f.service || 'Item'}:</span> {f.amount}
                                          </p>
                                        );
                                      }
                                      return <p key={fidx} className="font-semibold text-slate-700">• {String(f)}</p>;
                                    })
                                  ) : 'None listed'}
                                </div>
                              </div>

                              {/* Contacts */}
                              <div className="bg-white border border-slate-100 rounded-xl p-2.5">
                                <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px] mb-1">Contacts</span>
                                <span className="font-semibold text-slate-700 leading-normal select-all">
                                  {ent.contacts && ent.contacts.length > 0 ? ent.contacts.join(', ') : 'None listed'}
                                </span>
                              </div>

                              {/* Dates */}
                              <div className="bg-white border border-slate-100 rounded-xl p-2.5">
                                <span className="font-extrabold text-slate-400 uppercase tracking-wider block text-[8px] mb-1">Important Dates</span>
                                <span className="font-semibold text-slate-700 leading-normal">
                                  {ent.dates && ent.dates.length > 0 ? ent.dates.join(', ') : 'None listed'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

              {/* Full context sent as Prompt grounding */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-amber-600" />
                    <span>Final Prompt Grounding Context Sent to Gemini</span>
                  </h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedDebugMessage.debug.finalPromptContext);
                    }}
                    className="text-[10px] font-extrabold text-[#6C5CE7] hover:underline flex items-center gap-1 cursor-pointer bg-[#6C5CE7]/5 border border-[#6C5CE7]/15 rounded-md px-2.5 py-1"
                  >
                    <Copy className="h-3 w-3" />
                    <span>Copy Full Context</span>
                  </button>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 max-h-[220px] overflow-y-auto">
                  <pre className="font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap select-all">
                    {selectedDebugMessage.debug.finalPromptContext}
                  </pre>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50 rounded-b-3xl">
              <button
                onClick={() => setSelectedDebugMessage(null)}
                className="bg-slate-900 hover:bg-slate-950 text-white font-extrabold text-xs py-2.5 px-6 rounded-xl transition-colors cursor-pointer"
              >
                Close Debug Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate URL Confirmation Modal (Requirement 11) */}
      {showDuplicateUrlDialog && duplicateUrlInfo && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDuplicateUrlDialog(false)} />
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 bg-amber-50 border border-amber-100 rounded-2xl text-amber-600 mb-2">
                <Info className="h-6 w-6" />
              </div>
              <h3 className="text-base font-extrabold text-slate-950">Duplicate URL Detected</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                {duplicateUrlInfo.message}
              </p>
              <p className="text-xs text-slate-700 font-bold bg-slate-50 border border-slate-100 p-2.5 rounded-xl truncate">
                Existing document: "{duplicateUrlInfo.title}"
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => proceedFetchAndExtract(importUrl.trim(), true, duplicateUrlInfo.docId)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-colors shadow-md shadow-indigo-100 cursor-pointer"
              >
                Update Existing
              </button>
              <button
                type="button"
                onClick={() => proceedFetchAndExtract(importUrl.trim(), false, null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition-colors cursor-pointer"
              >
                Create New Version
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateUrlDialog(false);
                  setImportUrl('');
                  setImportProgress(0);
                }}
                className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold text-xs py-3 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRAWLER LOGS MODAL */}
      {logsModalOpen && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setLogsModalOpen(false)} />
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-950 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-indigo-600" />
                  Crawler Logs
                </h3>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5 truncate max-w-md">
                  Ingestion pipeline log for: {logsModalTitle}
                </p>
              </div>
              <button
                onClick={() => setLogsModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full transition-colors cursor-pointer text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-4 bg-slate-950 text-slate-200 p-4.5 rounded-2xl font-mono text-[10px] leading-relaxed space-y-1">
              {logsModalContent && logsModalContent.length > 0 ? (
                logsModalContent.map((logLine, logIdx) => (
                  <div key={logIdx} className="hover:bg-slate-900 py-0.5 px-1 rounded transition-colors whitespace-pre-wrap select-all">
                    {logLine}
                  </div>
                ))
              ) : (
                <div className="text-slate-500 italic py-4 text-center">No logs recorded for this operation.</div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLogsModalOpen(false)}
                className="bg-slate-900 hover:bg-slate-950 text-white font-extrabold text-xs py-2 px-5 rounded-xl transition-colors cursor-pointer"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation & Alert Dialog (Resolves Sandboxed iframe confirm/alert block) */}
      {customDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={customDialog.type === 'confirm' ? customDialog.onCancel : undefined} />
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 space-y-5">
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold text-slate-950 flex items-center gap-2">
                {customDialog.type === 'confirm' ? (
                  <div className="p-1.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
                    <Info className="h-4 w-4" />
                  </div>
                )}
                <span>{customDialog.title}</span>
              </h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                {customDialog.message}
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              {customDialog.type === 'confirm' ? (
                <>
                  <button
                    type="button"
                    onClick={customDialog.onCancel}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    {customDialog.cancelLabel || 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={customDialog.onConfirm}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    {customDialog.confirmLabel || 'Delete'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={customDialog.onConfirm}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  {customDialog.confirmLabel || 'OK'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
