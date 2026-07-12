import * as cheerio from 'cheerio';

export class ScrapperService {
  /**
   * Scrapes raw HTML and transforms it into highly structured, markdown-like readable text content.
   */
  static htmlToFormattedText(html: string): string {
    const $ = cheerio.load(html);
    
    // Remove scripts, stylesheets, tracking headers, sidebars, navigation bars
    $('script, style, noscript, iframe, header, footer, nav, aside, [role="banner"], [role="navigation"], [role="contentinfo"], .sidebar, .menu, .nav, .header, .footer, .ads, .advertisement, .slider, .carousel, .popup, .banner, .login, .search, #search, .social, .social-links').remove();

    function traverse(node: any): string {
      if (!node) return '';
      
      if (node.type === 'text') {
        return node.data || '';
      }
      
      if (node.type === 'tag') {
        const tagName = (node.name || '').toLowerCase();
        
        // Formatted Headings
        if (/^h[1-6]$/.test(tagName)) {
          const text = $(node).text().trim();
          const level = parseInt(tagName.substring(1), 10);
          const prefix = '#'.repeat(level);
          return text ? `\n\n${prefix} ${text}\n\n` : '';
        }
        
        // Paragraph blocks and sections
        if (tagName === 'p' || tagName === 'div' || tagName === 'section' || tagName === 'article') {
          let text = '';
          if (node.children) {
            node.children.forEach((child: any) => {
              text += traverse(child);
            });
          }
          return `\n${text.trim()}\n`;
        }
        
        // Breaks
        if (tagName === 'br') {
          return '\n';
        }
        
        // Structured lists
        if (tagName === 'ul' || tagName === 'ol') {
          let text = '\n';
          $(node).children('li').each((idx, li) => {
            const bullet = tagName === 'ol' ? `${idx + 1}.` : '•';
            const liText = $(li).text().trim();
            if (liText) {
              text += `${bullet} ${liText}\n`;
            }
          });
          return `${text}\n`;
        }
        
        // Tables (extremely important for preserving schedules/fees)
        if (tagName === 'table') {
          let text = '\n';
          $(node).find('tr').each((_, tr) => {
            const cells: string[] = [];
            $(tr).find('th, td').each((__, cell) => {
              cells.push($(cell).text().trim());
            });
            if (cells.length > 0) {
              text += `| ${cells.join(' | ')} |\n`;
            }
          });
          return `${text}\n`;
        }
      }

      let result = '';
      if (node.children) {
        node.children.forEach((child: any) => {
          result += traverse(child);
        });
      }
      return result;
    }

    const body = $('body').get(0);
    const cleaned = traverse(body).replace(/\n{3,}/g, '\n\n').trim();
    return cleaned.substring(0, 15000); // Max 15,000 characters limit
  }

  /**
   * Fetches URL and parses HTML body
   */
  static async fetchAndParseUrl(url: string): Promise<{ title: string; rawText: string }> {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP fetch error! status: ${res.status}`);
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Extracted Webpage';
      const rawText = this.htmlToFormattedText(html);
      
      if (!rawText || rawText.length < 10) {
        throw new Error('No substantial readable content found on the webpage.');
      }
      return { title, rawText };
    } catch (err: any) {
      throw new Error(`Unable to fetch webpage: ${err.message}`);
    }
  }
}
