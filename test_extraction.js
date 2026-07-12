import { GoogleGenAI, Type } from '@google/genai';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const urls = [
  { name: 'Academic Calendar', url: 'https://gacs.ac.in/academic-calendar/' },
  { name: 'Courses', url: 'https://gacs.ac.in/course-details/' },
  { name: 'Education', url: 'https://gacs.ac.in/education/' },
  { name: 'Economics', url: 'https://gacs.ac.in/economics/' },
  { name: 'English', url: 'https://gacs.ac.in/english/' }
];

const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "A descriptive, clear, and concise title for the webpage."
    },
    category: {
      type: Type.STRING,
      description: "A single category for the content. Choose exactly one of: Admissions, Academics, Fees, Placements, Hostel, Campus Info."
    },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-8 keywords or search phrases."
    },
    summary: {
      type: Type.STRING,
      description: "A concise 2-3 sentence summary."
    },
    faqs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING }
        },
        required: ["question", "answer"]
      }
    },
    chunks: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    metadata: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          value: { type: Type.STRING }
        },
        required: ["key", "value"]
      }
    },
    entities: {
      type: Type.OBJECT,
      properties: {
        departments: { type: Type.ARRAY, items: { type: Type.STRING } },
        facultyMembers: { type: Type.ARRAY, items: { type: Type.STRING } },
        courses: { type: Type.ARRAY, items: { type: Type.STRING } },
        fees: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              courseOrService: { type: Type.STRING },
              amount: { type: Type.STRING }
            },
            required: ["courseOrService", "amount"]
          }
        },
        contacts: { type: Type.ARRAY, items: { type: Type.STRING } },
        dates: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["departments", "facultyMembers", "courses", "fees", "contacts", "dates"]
    }
  },
  required: ["title", "category", "keywords", "summary", "faqs", "chunks", "metadata", "entities"]
};

async function testExtraction(name, url) {
  console.log(`\n========================================`);
  console.log(`Testing Extraction for: ${name} (${url})`);
  
  try {
    // 1. Fetch
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Fetch failed with status ${res.status}`);
    }
    const html = await res.text();
    
    // 2. Clean HTML
    const $ = cheerio.load(html);
    $('script, style, noscript, iframe, header, footer, nav, aside, [role="banner"], [role="navigation"], [role="contentinfo"], .sidebar, .menu, .nav, .header, .footer, .ads, .advertisement').remove();
    let cleanedText = $('body').text() || $.text();
    cleanedText = cleanedText.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
    
    if (cleanedText.length < 10) {
      throw new Error('Cleaned text too short');
    }
    const trimmedText = cleanedText.substring(0, 15000);
    console.log(`Cleaned text length: ${trimmedText.length}`);
    
    // 3. Gemini Extraction
    console.log(`Calling Gemini...`);
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Please perform full structured College Knowledge Extraction on the following cleaned webpage content. Formulate and return high-fidelity results adhering exactly to the schema:\n\n${trimmedText}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: extractionSchema,
      }
    });
    
    const extractionText = response.text;
    console.log(`Gemini responded successfully. Length of response: ${extractionText ? extractionText.length : 0}`);
    if (!extractionText) {
      throw new Error('Empty response text');
    }
    
    const data = JSON.parse(extractionText);
    console.log(`Successfully parsed JSON. Title: "${data.title}", Category: "${data.category}"`);
    console.log(`Chunks count: ${data.chunks ? data.chunks.length : 0}`);
    console.log(`FAQs count: ${data.faqs ? data.faqs.length : 0}`);
    
    // 4. Test Embedding Generation
    if (data.chunks && data.chunks.length > 0) {
      console.log(`Testing embedding generation for first chunk: "${data.chunks[0].substring(0, 50)}..."`);
      const embedRes = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: data.chunks[0],
      });
      if (embedRes && embedRes.embedding && embedRes.embedding.values) {
        console.log(`Embedding generation successful. Vector length: ${embedRes.embedding.values.length}`);
      } else {
        throw new Error('Embed content response is missing values');
      }
    } else {
      console.log(`No chunks to embed!`);
    }
    
    console.log(`Status for ${name}: SUCCESS`);
  } catch (err) {
    console.error(`Status for ${name}: FAILED`);
    console.error(`Error details:`, err);
  }
}

async function run() {
  for (const item of urls) {
    await testExtraction(item.name, item.url);
  }
}

run();
