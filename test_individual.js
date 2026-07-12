import * as cheerio from 'cheerio';

const urls = [
  { name: 'Academic Calendar', url: 'https://gacs.ac.in/academic-calendar/' },
  { name: 'Courses (course-details)', url: 'https://gacs.ac.in/course-details/' },
  { name: 'Courses (courses - possible 404)', url: 'https://gacs.ac.in/courses/' },
  { name: 'Education', url: 'https://gacs.ac.in/education/' },
  { name: 'Economics', url: 'https://gacs.ac.in/economics/' },
  { name: 'English', url: 'https://gacs.ac.in/english/' }
];

async function testUrl(name, url) {
  console.log(`\n========================================`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  
  try {
    // 1. Fetch
    const res = await fetch(url);
    console.log(`1. Fetch successful: true`);
    console.log(`2. HTTP Status Code: ${res.status}`);
    
    if (!res.ok) {
      console.log(`3. HTML Content downloaded: false (due to bad status)`);
      return;
    }
    
    const html = await res.text();
    console.log(`3. HTML Content downloaded: true (size: ${html.length} bytes)`);
    
    // 4. HTML Cleaning
    try {
      const $ = cheerio.load(html);
      $('script, style, noscript, iframe, header, footer, nav, aside, [role="banner"], [role="navigation"], [role="contentinfo"], .sidebar, .menu, .nav, .header, .footer, .ads, .advertisement, .slider, .carousel, .popup, .banner, .login, .search, #search, .social, .social-links, #footer, #header, #sidebar, #nav, #navigation, .skip-link, .skip, a[href^="#content"]').remove();
      
      let mainContent = '';
      const mainSelectors = ['article', 'main', '[role="main"]', '.content', '.main-content', '#content', '#main', '.post', '.article'];
      for (const selector of mainSelectors) {
        const el = $(selector);
        if (el.length > 0) {
          const txt = el.first().text().trim();
          if (txt.length > 300) {
            mainContent = el.first().html() || '';
            break;
          }
        }
      }

      let cleanedText = '';
      if (mainContent) {
        const $sub = cheerio.load(mainContent);
        cleanedText = $sub.text();
      } else {
        cleanedText = $('body').text() || $.text();
      }

      cleanedText = cleanedText
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
        
      console.log(`4. HTML Cleaning: Completed. Cleaned Text Length: ${cleanedText.length}`);
      if (cleanedText.length < 10) {
        console.log(`  - ERROR: No substantial readable content found on the webpage after cleaning.`);
      } else {
        console.log(`  - Sample Text (first 200 chars): "${cleanedText.substring(0, 200)}..."`);
      }
    } catch (cleanErr) {
      console.log(`4. HTML Cleaning failed:`, cleanErr.message);
    }
  } catch (err) {
    console.log(`1. Fetch successful: false`);
    console.log(`9. Exception:`, err.message);
  }
}

async function run() {
  for (const item of urls) {
    await testUrl(item.name, item.url);
  }
}

run();
