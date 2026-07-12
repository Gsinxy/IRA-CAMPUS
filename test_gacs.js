import * as cheerio from 'cheerio';

async function run() {
  const baseUrl = 'https://gacs.ac.in/';
  console.log('Fetching homepage:', baseUrl);
  
  try {
    const res = await fetch(baseUrl);
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('HTML size:', html.length);
    
    const $ = cheerio.load(html);
    const links = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      links.push({ text, href });
    });
    
    console.log('Found links count:', links.length);
    
    // Find matching links for academic, calendar, courses, education, economics, english
    const targets = ['academic', 'calendar', 'courses', 'education', 'economics', 'english'];
    for (const t of targets) {
      console.log(`\n--- Matching targets for "${t}":`);
      const matched = links.filter(l => 
        (l.text && l.text.toLowerCase().includes(t)) || 
        (l.href && l.href.toLowerCase().includes(t))
      );
      matched.forEach(m => console.log(`  - Text: "${m.text}", Href: "${m.href}"`));
    }
  } catch (err) {
    console.error('Error fetching homepage:', err);
  }
}

run();
