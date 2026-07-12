import { 
  db,
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  deleteDoc
} from './firebase_admin.js';
import fs from 'fs';
import path from 'path';
import { CollegeDocument, Notice, FAQ, AISettings, AILogEntry } from '../types';

const DB_DIR = path.resolve(process.cwd(), 'src/db/data');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DEFAULT_SETTINGS: AISettings = {
  provider: 'OpenRouter',
  model: 'google/gemini-2.5-flash',
  temperature: 0.2,
  maxTokens: 4096,
  retryAttempts: 3,
  delayBetweenRequests: 3000
};

// Initial seeded notices
const SEEDED_NOTICES: Notice[] = [
  {
    id: 'notice-1',
    title: 'Admissions Open for Academic Year 2026-2027',
    content: 'Admissions are now officially open for all Under Graduate (B.Tech, BCA, B.Sc) and Post Graduate (M.Tech, MCA, MBA) programs. Prospective students can apply online through the portal or visit the Admission Office in the Administrative Block. Last date to submit applications is July 31, 2026.',
    date: '2026-06-15',
    category: 'admission'
  },
  {
    id: 'notice-2',
    title: 'Semester End Examination Schedule - July 2026',
    content: 'The end-semester examinations for all regular and back papers will commence from July 10, 2026. The detailed timetable block-wise has been published on the examination board portal. Students must collect their admit cards from their respective departments after clearing any outstanding dues by July 5, 2026.',
    date: '2026-06-25',
    category: 'academic'
  },
  {
    id: 'notice-3',
    title: 'Annual Tech Fest "IRA-FEST 2026" Announced',
    content: 'We are thrilled to announce that the annual national-level technical symposium "IRA-FEST 2026" will be held on October 12-14, 2026. Events include Hackathons, Robo-Wars, Paper Presentations, and Coding Duels with prizes worth $500,000. Registration starts next month.',
    date: '2026-06-28',
    category: 'event'
  }
];

// Initial seeded FAQs
const SEEDED_FAQS: FAQ[] = [
  {
    id: 'faq-1',
    question: 'How do I apply for admission?',
    answer: 'You can apply online by visiting the admissions portal at admission.iracampus.edu, filling out the application form, uploading required documents (10th/12th marksheets, transfer certificate, migration certificate), and paying the application fee of $1,000 online.',
    category: 'Admission'
  },
  {
    id: 'faq-2',
    question: 'What are the college timings?',
    answer: 'The college operates from 9:00 AM to 4:30 PM, Monday to Friday. Saturdays are reserved for extra-curricular activities, workshops, and remedial classes (9:00 AM to 1:00 PM). Sunday is a holiday.',
    category: 'Campus Life'
  },
  {
    id: 'faq-3',
    question: 'What is the hostel fee structure?',
    answer: 'Hostel accommodation is available for both boys and girls. AC Double Sharing: $120,000 per year. Non-AC Triple Sharing: $80,000 per year. This includes laundry services, 24/7 Wi-Fi, electricity, security, and four meals a day (breakfast, lunch, evening snacks, and dinner) served at the mess.',
    category: 'Hostel'
  },
  {
    id: 'faq-4',
    question: 'Are there any scholarships available?',
    answer: 'Yes! We offer "Merit Scholar" waiver programs: 100% tuition waiver for students scoring above 95% in 12th Board examinations, and 50% waiver for students scoring above 90%. We also provide "Need-Based Aid" for students with family incomes under $200,000 per year, and dedicated sports scholarship programs.',
    category: 'Scholarships'
  }
];

// Seeded documents for the RAG Knowledge Base
const SEEDED_DOCUMENTS_CONTENT = [
  {
    title: 'IRA Campus Admission Prospectus 2026',
    category: 'Admissions',
    type: 'pdf' as const,
    content: `IRA CAMPUS ADMISSION PROSPECTUS - ACADEMIC YEAR 2026-2027
Overview:
IRA Campus is a premier higher education institution dedicated to academic excellence, innovation, and holistic development. Founded in 2012, the campus offers state-of-the-art facilities, world-class faculty, and robust industry partnerships.

Admission Guidelines & Process:
1. Application Submission: Candidates must submit their applications through the online portal or directly at the Admission Office located in the Administrative Block (Ground Floor).
2. Eligibility Criteria: 
   - B.Tech (Computer Science & Engineering, Electronics): Candidates must have completed 10+2 (or equivalent) with Physics, Chemistry, and Mathematics, securing a minimum of 50% aggregate marks. Admission is based on National Joint Entrance Exam (JEE) scores or IRA Campus Entrance Test (IRA-CET).
   - BCA (Bachelor of Computer Applications): Candidates must have passed 10+2 with Mathematics or Computer Science as a subject, with a minimum of 50% aggregate marks.
   - MCA (Master of Computer Applications): BCA or B.Sc in Computer Science with at least 55% marks, with Mathematics at the 10+2 or Graduate level.
3. Required Documents:
   - 10th and 12th Grade original marksheets and certificates
   - Transfer Certificate (TC) and Conduct Certificate from the last attended institution
   - Migration Certificate (for boards other than State Board)
   - Category/Community Certificate (if claiming quota)
   - Passport-size photographs (6 copies)
   - JEE/IRA-CET scorecard (if applicable)
4. Critical Dates:
   - Application portal opens: May 1st, 2026
   - Last date of application submission: July 31st, 2026
   - First Counseling & Admission allotment: August 5th, 2026
   - Commencement of Classes: August 17th, 2026`
  },
  {
    title: 'BCA Course Curriculum and Syllabus Semester 3',
    category: 'Academics',
    type: 'docx' as const,
    content: `BACHELOR OF COMPUTER APPLICATIONS (BCA) - THIRD SEMESTER CURRICULUM
Course Details, Codes, and Syllabus:

1. Data Structures and Algorithms (Course Code: BCA-301)
   - Unit 1: Introduction to Data Structures, Arrays (1D & 2D), Address calculation, Sparse Matrices.
   - Unit 2: Linked Lists (Singly, Doubly, Circular) - Insertion, Deletion, and Traversal operations.
   - Unit 3: Stacks and Queues - Array and Linked list representation, Evaluation of Infix, Postfix expressions, Circular queues, Priority queues.
   - Unit 4: Trees & Graphs - Binary trees, Traversals (Pre-order, In-order, Post-order), Binary Search Trees (BST), Graph Representation (Adjacency Matrix, List), DFS and BFS traversals.
   - Textbooks: "Data Structures" by Lipschutz, "Algorithms" by Cormen.

2. Object-Oriented Programming using C++ (Course Code: BCA-302)
   - Unit 1: OOP Concepts (Encapsulation, Inheritance, Polymorphism, Abstraction), Classes and Objects, Constructors & Destructors.
   - Unit 2: Function overloading, Operator overloading, Friend functions, virtual functions, and Pure Virtual Functions.
   - Unit 3: Inheritance types (Single, Multiple, Hierarchical, Hybrid), Templates, and Exception Handling.

3. Database Management Systems (Course Code: BCA-303)
   - Unit 1: Introduction to DBMS, Three-Schema Architecture, ER Diagrams, Relational Model.
   - Unit 2: SQL - DDL and DML commands, joins, nested queries, views, and indexes.
   - Unit 3: Normalization (1NF, 2NF, 3NF, BCNF), Transaction management, and ACID properties.`
  },
  {
    title: 'Hostel and Accommodation Manual 2026',
    category: 'Hostel',
    type: 'pdf' as const,
    content: `IRA CAMPUS HOSTEL & RESIDENTIAL FACILITIES MANUAL 2026
Overview:
IRA Campus provides separate hostel residential blocks for boys (Vidyasagar Block) and girls (Gargi Block). Our hostels offer a home-away-from-home environment with robust safety and recreational systems.

Accommodation Packages and Fees:
- Category A (AC Double Sharing): $120,000 per academic year. Includes dual-compressor AC, premium study desks, wardrobes, and attached restrooms.
- Category B (Non-AC Triple Sharing): $80,000 per academic year. Includes ceiling fans, standard study units, and shared floor-level washrooms.
*Note: All fees are comprehensive and include laundry services, water supply, 24/7 security, high-speed Wi-Fi (100 Mbps), and four meals per day at the central mess (breakfast, lunch, evening snacks, and tea, dinner).*

Hostel Rules and Regulations:
1. Curfew: All residents must return to their respective blocks by 9:30 PM. Late entry is only permitted with prior written authorization from the Chief Warden.
2. Electrical Appliances: The use of heavy electrical items such as heaters, induction plates, and private irons is strictly prohibited to avoid fire hazards.
3. Visitors Policy: Parents and authorized guardians can visit residents in the lobby area between 4:30 PM and 7:00 PM on weekdays, and 10:00 AM to 6:00 PM on Sundays. No overnight guest stays are permitted in student rooms.`
  },
  {
    title: 'Placement & Career Development Cell Annual Report 2025',
    category: 'Placements',
    type: 'csv' as const,
    content: `IRA CAMPUS PLACEMENT STATISTICS AND HIGHLIGHTS 2025
Key Achievements:
- Overall Placement Rate: 94% across all departments.
- Highest International Package: 45 LPA (Lakhs Per Annum) offered by Adobe.
- Average Package (Computer Science & IT): 7.2 LPA.
- Average Package (Other Engineering branches): 5.4 LPA.
- Top Recruiters list: Microsoft, Amazon, Adobe, TCS, Infosys, Wipro, Cognizant, Tech Mahindra, and Capgemini.
- Internship Offers: Over 82% of pre-final year students received industrial internships with a stipend ranging from $15,000 to $45,000 per month.
- Training Initiatives: The Career Cell conducts mandatory weekly aptitude coaching, soft skills training, and mock mock-interviews starting from Semester 5.`
  },
  {
    title: 'Campus Facilities, Faculty and Central Library',
    category: 'Campus Info',
    type: 'txt' as const,
    content: `IRA CAMPUS FACILITIES & GENERAL INFORMATION
Campus Timing and Contact:
- Regular College Hours: Monday to Friday, 9:00 AM to 4:30 PM.
- Administrative Office Hours: 9:00 AM to 5:00 PM.
- Contact Number: +91-674-2567890 / +91-9876543210
- Email: info@iracampus.edu, admissions@iracampus.edu

Central Library:
- Location: Central Block, 2nd and 3rd Floor.
- Librarian: Mrs. Meera Sen, M.Lib.Sc.
- Timings: 8:00 AM to 8:00 PM on weekdays, 9:00 AM to 1:00 PM on Saturdays.
- Collections: Over 45,000 books, 120 printed journals, and access to online databases like IEEE, Springer, and Elsevier.
- Facilities: Wi-Fi study zone, digital library with 40 computer terminals, printing and photocopy section, and quiet study rooms.

Key Department Head (HOD) Contact Details:
- CSE (Computer Science & Engineering): Dr. Ramesh Chandra Panda, PhD (IIT Kharagpur) - hod.cse@iracampus.edu
- ECE (Electronics & Communication): Dr. Sunita Mohanty, PhD - hod.ece@iracampus.edu
- Basic Sciences: Dr. PK Rath, PhD - hod.bs@iracampus.edu
- Administrative Dean: Prof. S. Chakraborty - dean@iracampus.edu`
  }
];

// Helper to chunk document contents
function generateChunks(docId: string, title: string, content: string) {
  const chunks = [];
  const chunkSize = 500;
  const overlap = 100;
  let i = 0;
  
  while (i < content.length) {
    const textChunk = content.substring(i, Math.min(i + chunkSize, content.length));
    chunks.push({
      id: `${docId}-chunk-${chunks.length}`,
      text: textChunk,
      embedding: [] as number[]
    });
    i += (chunkSize - overlap);
  }
  return chunks;
}

const SEEDED_ENTITIES_MAP: Record<string, any> = {
  'doc-1': {
    departments: ['Admissions Department', 'Computer Science & Engineering', 'Electronics'],
    facultyMembers: [],
    courses: ['B.Tech (Computer Science & Engineering)', 'B.Tech (Electronics)', 'BCA (Bachelor of Computer Applications)', 'MCA (Master of Computer Applications)'],
    fees: [],
    contacts: ['Admission Office'],
    dates: ['May 1st, 2026', 'July 31st, 2026', 'August 5th, 2026', 'August 17th, 2026']
  },
  'doc-2': {
    departments: ['Computer Science'],
    facultyMembers: [],
    courses: ['BCA (Bachelor of Computer Applications)'],
    fees: [],
    contacts: [],
    dates: []
  },
  'doc-3': {
    departments: ['Boys Hostel (Vidyasagar Block)', 'Girls Hostel (Gargi Block)'],
    facultyMembers: ['Chief Warden'],
    courses: [],
    fees: [
      { courseOrService: 'Category A (AC Double Sharing)', amount: '$120,000 per academic year' },
      { courseOrService: 'Category B (Non-AC Triple Sharing)', amount: '$80,000 per academic year' }
    ],
    contacts: [],
    dates: ['weekdays 4:30 PM - 7:00 PM', 'Sundays 10:00 AM - 6:00 PM']
  },
  'doc-4': {
    departments: ['Placement & Career Development Cell'],
    facultyMembers: [],
    courses: [],
    fees: [
      { courseOrService: 'Internship Stipend', amount: '$15,000 to $45,000 per month' }
    ],
    contacts: ['Career Cell'],
    dates: []
  },
  'doc-5': {
    departments: ['CSE (Computer Science & Engineering)', 'ECE (Electronics & Communication)', 'Basic Sciences', 'Central Library'],
    facultyMembers: ['Dr. Ramesh Chandra Panda', 'Dr. Sunita Mohanty', 'Dr. PK Rath', 'Prof. S. Chakraborty', 'Mrs. Meera Sen'],
    courses: [],
    fees: [],
    contacts: ['+91-674-2567890', '+91-9876543210', 'info@iracampus.edu', 'admissions@iracampus.edu', 'hod.cse@iracampus.edu', 'hod.ece@iracampus.edu', 'hod.bs@iracampus.edu', 'dean@iracampus.edu'],
    dates: []
  }
};

export const DataStore = {
  async getDocuments(): Promise<CollegeDocument[]> {
    if (!db) return [];
    try {
      const querySnapshot = await getDocs(collection(db, 'knowledge'));
      const docs: CollegeDocument[] = [];
      querySnapshot.forEach((d) => {
        docs.push(d.data() as CollegeDocument);
      });
      
      if (docs.length === 0) {
        console.log('[DataStore] No documents found in Firestore "knowledge" collection, seeding...');
        const seeded = SEEDED_DOCUMENTS_CONTENT.map((seed, idx) => {
          const id = `doc-${idx + 1}`;
          return {
            id,
            title: seed.title,
            type: seed.type,
            category: seed.category,
            content: seed.content,
            size: `${Math.round(seed.content.length / 102) / 10} KB`,
            uploadedAt: '2026-06-20T10:00:00Z',
            uploadedBy: 'Admissions Office',
            chunks: generateChunks(id, seed.title, seed.content),
            entities: SEEDED_ENTITIES_MAP[id] || {
              departments: [],
              facultyMembers: [],
              courses: [],
              fees: [],
              contacts: [],
              dates: []
            }
          } as any;
        });
        
        for (const docObj of seeded) {
          await setDoc(doc(db, 'knowledge', docObj.id), docObj);
          docs.push(docObj);
        }
      }
      
      let updated = false;
      for (const d of docs) {
        if (!d.entities) {
          d.entities = SEEDED_ENTITIES_MAP[d.id] || {
            departments: [],
            facultyMembers: [],
            courses: [],
            fees: [],
            contacts: [],
            dates: []
          };
          await setDoc(doc(db, 'knowledge', d.id), d);
          updated = true;
        }
      }
      
      return docs;
    } catch (err: any) {
      console.error('[DataStore] Failed to retrieve documents from Firestore:', err.message);
      return [];
    }
  },

  async saveDocuments(docs: CollegeDocument[]): Promise<void> {
    if (!db) return;
    try {
      for (const d of docs) {
        await setDoc(doc(db, 'knowledge', d.id), d);
      }
    } catch (err: any) {
      console.error('[DataStore] Failed to save documents to Firestore:', err.message);
    }
  },

  async addDocument(docObj: Omit<CollegeDocument, 'id' | 'uploadedAt' | 'size'>): Promise<CollegeDocument> {
    if (!db) throw new Error('[DataStore] Firestore not initialized');
    const id = `doc-${Date.now()}`;
    const newDoc: CollegeDocument = {
      ...docObj,
      id,
      size: `${Math.round(docObj.content.length / 102) / 10} KB`,
      uploadedAt: new Date().toISOString(),
      chunks: generateChunks(id, docObj.title, docObj.content) as any
    } as any;
    
    await setDoc(doc(db, 'knowledge', id), newDoc);
    return newDoc;
  },

  async deleteDocument(id: string): Promise<boolean> {
    if (!db) return false;
    try {
      await deleteDoc(doc(db, 'knowledge', id));
      return true;
    } catch (err: any) {
      console.error('[DataStore] Failed to delete document from Firestore:', err.message);
      return false;
    }
  },

  async getNotices(): Promise<Notice[]> {
    if (!db) return [];
    try {
      const querySnapshot = await getDocs(collection(db, 'notices'));
      const notices: Notice[] = [];
      querySnapshot.forEach((d) => {
        notices.push(d.data() as Notice);
      });
      
      if (notices.length === 0) {
        console.log('[DataStore] No notices found in Firestore "notices" collection, seeding...');
        for (const notice of SEEDED_NOTICES) {
          await setDoc(doc(db, 'notices', notice.id), notice);
          notices.push(notice);
        }
      }
      
      return notices.sort((a, b) => b.id.localeCompare(a.id));
    } catch (err: any) {
      console.error('[DataStore] Failed to get notices from Firestore:', err.message);
      return [];
    }
  },

  async addNotice(notice: Omit<Notice, 'id' | 'date'>): Promise<Notice> {
    if (!db) throw new Error('[DataStore] Firestore not initialized');
    const id = `notice-${Date.now()}`;
    const newNotice: Notice = {
      ...notice,
      id,
      date: new Date().toISOString().split('T')[0]
    };
    await setDoc(doc(db, 'notices', id), newNotice);
    return newNotice;
  },

  async deleteNotice(id: string): Promise<boolean> {
    if (!db) return false;
    try {
      await deleteDoc(doc(db, 'notices', id));
      return true;
    } catch (err: any) {
      console.error('[DataStore] Failed to delete notice from Firestore:', err.message);
      return false;
    }
  },

  async getFAQs(): Promise<FAQ[]> {
    if (!db) return [];
    try {
      const querySnapshot = await getDocs(collection(db, 'faqs'));
      const faqs: FAQ[] = [];
      querySnapshot.forEach((d) => {
        faqs.push(d.data() as FAQ);
      });
      
      if (faqs.length === 0) {
        console.log('[DataStore] No FAQs found in Firestore "faqs" collection, seeding...');
        for (const faq of SEEDED_FAQS) {
          await setDoc(doc(db, 'faqs', faq.id), faq);
          faqs.push(faq);
        }
      }
      return faqs;
    } catch (err: any) {
      console.error('[DataStore] Failed to get FAQs from Firestore:', err.message);
      return [];
    }
  },

  async addFAQ(faq: Omit<FAQ, 'id'>): Promise<FAQ> {
    if (!db) throw new Error('[DataStore] Firestore not initialized');
    const id = `faq-${Date.now()}`;
    const newFAQ: FAQ = {
      ...faq,
      id
    };
    await setDoc(doc(db, 'faqs', id), newFAQ);
    return newFAQ;
  },

  async deleteFAQ(id: string): Promise<boolean> {
    if (!db) return false;
    try {
      await deleteDoc(doc(db, 'faqs', id));
      return true;
    } catch (err: any) {
      console.error('[DataStore] Failed to delete FAQ from Firestore:', err.message);
      return false;
    }
  },

  async getSettings(): Promise<AISettings> {
    if (!db) return DEFAULT_SETTINGS;
    try {
      const snap = await getDoc(doc(db, 'ai_settings', 'config'));
      if (snap.exists()) {
        return snap.data() as AISettings;
      }
      await setDoc(doc(db, 'ai_settings', 'config'), DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    } catch (err: any) {
      console.error('[DataStore] Failed to get AI settings from Firestore:', err.message);
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: AISettings): Promise<void> {
    if (!db) return;
    try {
      await setDoc(doc(db, 'ai_settings', 'config'), settings);
    } catch (err: any) {
      console.error('[DataStore] Failed to save AI settings to Firestore:', err.message);
    }
  },

  async getAILogs(): Promise<AILogEntry[]> {
    if (!db) return [];
    try {
      const querySnapshot = await getDocs(collection(db, 'ai_logs'));
      const logs: AILogEntry[] = [];
      querySnapshot.forEach((d) => {
        logs.push(d.data() as AILogEntry);
      });
      return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch (err: any) {
      console.error('[DataStore] Failed to get AI logs from Firestore:', err.message);
      return [];
    }
  },

  async addAILogEntry(log: Omit<AILogEntry, 'id' | 'timestamp'>): Promise<AILogEntry> {
    if (!db) throw new Error('[DataStore] Firestore not initialized');
    const id = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newLog: AILogEntry = {
      ...log,
      id,
      timestamp: new Date().toISOString()
    };
    await setDoc(doc(db, 'ai_logs', id), newLog);
    return newLog;
  },

  async clearAILogs(): Promise<void> {
    if (!db) return;
    try {
      const querySnapshot = await getDocs(collection(db, 'ai_logs'));
      for (const d of querySnapshot.docs) {
        await deleteDoc(doc(db, 'ai_logs', d.id));
      }
    } catch (err: any) {
      console.error('[DataStore] Failed to clear AI logs from Firestore:', err.message);
    }
  },

  async incrementQuestionsCount(question: string): Promise<void> {
    // Redundant updates to disk bypassed; we leverage direct real-time Firestore logging
  },

  async incrementDocAccessCount(docTitle: string): Promise<void> {
    // Redundant updates to disk bypassed; we leverage direct real-time Firestore logging
  }
};
