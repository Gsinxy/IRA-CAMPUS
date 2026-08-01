import { db, setDoc } from '../firebase.js';
import { collection, doc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { ProgrammeStructure } from '../../src/types.js';
import { handleFirestoreError, OperationType } from '../utils/helpers.js';

const COLLECTION_NAME = 'programme_structures';

function normalizeSem(sem: string): string {
  if (!sem) return '';
  const clean = sem.trim().toLowerCase();
  const romanMap: Record<string, string> = {
    '1': 'Semester I', '2': 'Semester II', '3': 'Semester III', '4': 'Semester IV',
    '5': 'Semester V', '6': 'Semester VI', '7': 'Semester VII', '8': 'Semester VIII',
    'i': 'Semester I', 'ii': 'Semester II', 'iii': 'Semester III', 'iv': 'Semester IV',
    'v': 'Semester V', 'vi': 'Semester VI', 'vii': 'Semester VII', 'viii': 'Semester VIII',
    'sem 1': 'Semester I', 'sem 2': 'Semester II', 'sem 3': 'Semester III', 'sem 4': 'Semester IV',
    'sem 5': 'Semester V', 'sem 6': 'Semester VI', 'sem 7': 'Semester VII', 'sem 8': 'Semester VIII',
    'semester 1': 'Semester I', 'semester 2': 'Semester II', 'semester 3': 'Semester III', 'semester 4': 'Semester IV',
    'semester 5': 'Semester V', 'semester 6': 'Semester VI', 'semester 7': 'Semester VII', 'semester 8': 'Semester VIII',
    'semester i': 'Semester I', 'semester ii': 'Semester II', 'semester iii': 'Semester III', 'semester iv': 'Semester IV',
    'semester v': 'Semester V', 'semester vi': 'Semester VI', 'semester vii': 'Semester VII', 'semester viii': 'Semester VIII'
  };
  return romanMap[clean] || sem;
}

export class ProgrammeStructureRepository {
  static async getAll(): Promise<ProgrammeStructure[]> {
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const list: ProgrammeStructure[] = [];
      snap.forEach(d => {
        const data = d.data() as ProgrammeStructure;
        if (data) {
          data.id = data.id || d.id;
          list.push(data);
        }
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, COLLECTION_NAME);
    }
  }

  static async getById(id: string): Promise<ProgrammeStructure | null> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) {
        const data = snap.data() as ProgrammeStructure;
        if (data) data.id = data.id || snap.id;
        return data;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  static async getByDeptAndSemester(department: string, semester: string, programme?: string): Promise<ProgrammeStructure | null> {
    try {
      console.log(`==================== PROGRAMME STRUCTURE RETRIEVAL START ====================`);
      console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Target Collection Name: "${COLLECTION_NAME}"`);
      const all = await this.getAll();
      const totalDocs = all ? all.length : 0;
      console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Total documents loaded from "${COLLECTION_NAME}": ${totalDocs}`);

      const targetDept = department ? department.trim().toLowerCase() : '';
      const targetSemNormalized = normalizeSem(semester).toLowerCase();

      console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Query Parameters:`);
      console.log(`  - Department: "${department}" (Normalized: "${targetDept}")`);
      console.log(`  - Semester: "${semester}" (Normalized: "${targetSemNormalized}")`);
      console.log(`  - Programme: "${programme || 'any'}"`);

      if (!all || all.length === 0) {
        console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Match Status: NO MATCH FOUND`);
        console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Failure Reason: Collection "${COLLECTION_NAME}" is completely empty in the database (Missing documents).`);
        console.log(`==================== PROGRAMME STRUCTURE RETRIEVAL END ====================`);
        return null;
      }

      const matched = all.filter(p => {
        const pDept = (p.department || '').trim().toLowerCase();
        const pSemNormalized = normalizeSem(p.semester || '').toLowerCase();
        const deptMatches = !targetDept || pDept === targetDept;
        const semMatches = !targetSemNormalized || pSemNormalized === targetSemNormalized || (p.semester || '').toLowerCase().includes(targetSemNormalized);
        
        let progMatches = true;
        if (programme && p.programme) {
          progMatches = p.programme.trim().toLowerCase() === programme.trim().toLowerCase() ||
                        p.programme.trim().toLowerCase().includes(programme.trim().toLowerCase()) ||
                        programme.trim().toLowerCase().includes(p.programme.trim().toLowerCase());
        }
        return deptMatches && semMatches && progMatches;
      });

      if (matched.length > 0) {
        const resDoc = matched[0];
        console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Match Status: MATCH FOUND!`);
        console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Matched Document ID: "${resDoc.id}"`);
        console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Matched Details -> Dept: "${resDoc.department}", Semester: "${resDoc.semester}", Programme: "${resDoc.programme || 'N/A'}"`);
        console.log(`==================== PROGRAMME STRUCTURE RETRIEVAL END ====================`);
        return resDoc;
      }

      // Retry without programme constraint if failed
      if (programme) {
        console.log(`[PROGRAMME STRUCTURE RETRIEVAL] No exact match with programme "${programme}". Retrying search without programme constraint...`);
        const matchedNoProg = all.find(p => {
          const pDept = (p.department || '').trim().toLowerCase();
          const pSemNormalized = normalizeSem(p.semester || '').toLowerCase();
          return (!targetDept || pDept === targetDept) && (!targetSemNormalized || pSemNormalized === targetSemNormalized || (p.semester || '').toLowerCase().includes(targetSemNormalized));
        });
        if (matchedNoProg) {
          console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Match Status: MATCH FOUND (without programme constraint)!`);
          console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Matched Document ID: "${matchedNoProg.id}"`);
          console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Matched Details -> Dept: "${matchedNoProg.department}", Semester: "${matchedNoProg.semester}", Programme: "${matchedNoProg.programme || 'N/A'}"`);
          console.log(`==================== PROGRAMME STRUCTURE RETRIEVAL END ====================`);
          return matchedNoProg;
        }
      }

      console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Match Status: NO MATCH FOUND`);
      console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Failure Reason: Field mismatch. No document in collection "${COLLECTION_NAME}" matched department "${targetDept}" and semester "${targetSemNormalized}".`);
      console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Available Documents in "${COLLECTION_NAME}" (${totalDocs}):`);
      all.forEach((docItem, index) => {
        console.log(`  [${index + 1}] ID: "${docItem.id}" | Department: "${docItem.department}" | Semester: "${docItem.semester}" | Programme: "${docItem.programme || 'N/A'}"`);
      });
      console.log(`==================== PROGRAMME STRUCTURE RETRIEVAL END ====================`);

      return null;
    } catch (err: any) {
      console.warn('[PROGRAMME STRUCTURE RETRIEVAL] Exception during lookup:', err);
      console.log(`[PROGRAMME STRUCTURE RETRIEVAL] Failure Reason: Exception or database connectivity issue (${err.message}).`);
      console.log(`==================== PROGRAMME STRUCTURE RETRIEVAL END ====================`);
      return null;
    }
  }

  static async save(structure: ProgrammeStructure): Promise<void> {
    const path = `${COLLECTION_NAME}/${structure.id}`;
    try {
      await setDoc(doc(db, COLLECTION_NAME, structure.id), structure, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  static async delete(id: string): Promise<void> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}
