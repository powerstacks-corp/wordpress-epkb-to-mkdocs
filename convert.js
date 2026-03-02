#!/usr/bin/env node
/**
 * WordPress EPKB → MkDocs Markdown Converter
 *
 * Parses a WordPress WXR export, strips Elementor markup,
 * converts EPKB knowledge base articles to clean Markdown,
 * and organizes them by product for separate MkDocs repos.
 *
 * Usage: node convert.js <export.xml> [output-dir]
 *
 * Arguments:
 *   export.xml   Path to your WordPress WXR export XML file
 *   output-dir   Output directory (default: ./converted)
 */

const fs = require('fs');
const path = require('path');

// ─── Parse CLI arguments ────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node convert.js <export.xml> [output-dir]

Arguments:
  export.xml   Path to your WordPress WXR export XML file
  output-dir   Output directory (default: ./converted)

Example:
  node convert.js my-site.xml ./output
`);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const INPUT_FILE = path.resolve(args[0]);
const OUTPUT_DIR = path.resolve(args[1] || './converted');

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`Error: Input file not found: ${INPUT_FILE}`);
  process.exit(1);
}

// ─── Configuration ──────────────────────────────────────────────────────────
//
// Customize these mappings for your WordPress site.
//
// PRODUCT_MAP:
//   Maps EPKB post type slugs to a product name and content type.
//   WordPress EPKB creates custom post types like 'epkb_post_type_2',
//   'epkb_post_type_3', etc. for each knowledge base.
//
//   To find your post types, search your XML export for:
//     <wp:post_type><![CDATA[epkb_post_type_
//
// KB_PREFIXES:
//   Maps URL path segments (from WordPress permalinks) to product slugs.
//   This is used to rewrite internal links between articles.
//   Look at your WordPress KB URLs to find the path prefix for each KB.

const PRODUCT_MAP = {
  'epkb_post_type_2': { product: 'bi-for-intune',   type: 'articles' },
  'epkb_post_type_3': { product: 'bi-for-sccm',     type: 'articles' },
  'epkb_post_type_4': { product: 'bi-for-intune',   type: 'release-notes' },
  'epkb_post_type_5': { product: 'bi-for-sccm',     type: 'release-notes' },
  'epkb_post_type_6': { product: 'bi-for-defender',  type: 'articles' },
  'epkb_post_type_7': { product: 'bi-for-defender',  type: 'release-notes' },
};

const PRODUCT_NAMES = {
  'bi-for-intune':  'BI for Intune',
  'bi-for-sccm':    'BI for SCCM',
  'bi-for-defender': 'BI for Defender',
};

const KB_PREFIXES = {
  'bi-for-intune-kb': 'bi-for-intune',
  'bi-for-sccm-kb': 'bi-for-sccm',
  'bi-for-defender-kb': 'bi-for-defender',
  'whats-new-bi-for-intune': 'bi-for-intune',
  'whats-new-bi-for-sccm': 'bi-for-sccm',
  'whats-new-in-bi-for-defender': 'bi-for-defender',
};

// ─── HTML → Markdown Converter ──────────────────────────────────────────────

function htmlToMarkdown(html) {
  if (!html || !html.trim()) return '';

  let md = html;

  // ── Phase 1: Remove junk ──────────────────────────────────────────────────

  // Remove <style> blocks entirely
  md = md.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove <script> blocks
  md = md.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Remove HTML comments
  md = md.replace(/<!--[\s\S]*?-->/g, '');

  // Remove Elementor-specific elements (spacers, icons, widgets wrappers)
  md = md.replace(/<div[^>]*class="[^"]*elementor-spacer[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  md = md.replace(/<div[^>]*class="[^"]*elementor-widget-spacer[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

  // Remove inline styles on remaining elements (but keep the elements)
  md = md.replace(/ style="[^"]*"/gi, '');

  // Remove class attributes
  md = md.replace(/ class="[^"]*"/gi, '');

  // Remove id attributes (but preserve heading IDs — we'll regenerate them)
  md = md.replace(/ id="[^"]*"/gi, '');

  // Remove data-* attributes
  md = md.replace(/ data-[a-z-]+="[^"]*"/gi, '');

  // Remove aria-* attributes
  md = md.replace(/ aria-[a-z-]+="[^"]*"/gi, '');

  // Remove role attributes
  md = md.replace(/ role="[^"]*"/gi, '');

  // ── Phase 2: Strip wrapper divs ───────────────────────────────────────────

  // Repeatedly strip wrapper divs (Elementor nests deeply)
  for (let i = 0; i < 15; i++) {
    const before = md;
    // Remove empty divs
    md = md.replace(/<div\s*>\s*<\/div>/gi, '');
    // Remove divs that just wrap content (no semantic meaning)
    md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1');
    if (md === before) break;
  }

  // Remove remaining spans that just wrap text
  for (let i = 0; i < 5; i++) {
    const before = md;
    md = md.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    if (md === before) break;
  }

  // Remove <section> wrappers
  md = md.replace(/<\/?section[^>]*>/gi, '');

  // Remove <article> wrappers
  md = md.replace(/<\/?article[^>]*>/gi, '');

  // Remove <figure> / <figcaption> but keep content
  md = md.replace(/<\/?figure[^>]*>/gi, '');
  md = md.replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi, '*$1*\n');

  // ── Phase 3: Convert semantic HTML to Markdown ────────────────────────────

  // Headings (h1-h6)
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `\n# ${cleanInline(content)}\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `\n## ${cleanInline(content)}\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) => `\n### ${cleanInline(content)}\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, content) => `\n#### ${cleanInline(content)}\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, content) => `\n##### ${cleanInline(content)}\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, content) => `\n###### ${cleanInline(content)}\n`);

  // Code blocks: <pre><code>...</code></pre>
  md = md.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => {
    const decoded = decodeEntities(code).trim();
    return `\n\`\`\`\n${decoded}\n\`\`\`\n`;
  });

  // Standalone <pre> blocks
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    const decoded = decodeEntities(code).trim();
    return `\n\`\`\`\n${decoded}\n\`\`\`\n`;
  });

  // Inline <code>
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => {
    const decoded = decodeEntities(code).replace(/\n/g, ' ').trim();
    return `\`${decoded}\``;
  });

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, (_, src, alt) => {
    return `![${alt}](${normalizeImageUrl(src)})`;
  });
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, (_, alt, src) => {
    return `![${alt}](${normalizeImageUrl(src)})`;
  });
  // img with no alt
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, (_, src) => {
    return `![](${normalizeImageUrl(src)})`;
  });

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = cleanInline(text).trim();
    if (!cleanText) return '';
    // If the link text is just an image, don't double-wrap
    if (cleanText.startsWith('![')) return cleanText;
    return `[${cleanText}](${href})`;
  });

  // Bold / Strong
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, content) => {
    const text = cleanInline(content).trim();
    return text ? `**${text}**` : '';
  });

  // Italic / Em
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, content) => {
    const text = cleanInline(content).trim();
    return text ? `*${text}*` : '';
  });

  // Strikethrough
  md = md.replace(/<(del|s|strike)[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, content) => {
    return `~~${cleanInline(content).trim()}~~`;
  });

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const lines = cleanInline(content).trim().split('\n');
    return '\n' + lines.map(l => `> ${l}`).join('\n') + '\n';
  });

  // Horizontal rules
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

  // Tables
  md = convertTables(md);

  // Lists — handle nested lists
  md = convertLists(md);

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, content) => {
    const text = content.trim();
    if (!text) return '';
    return `\n${text}\n`;
  });

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, '  \n');

  // ── Phase 4: Cleanup ──────────────────────────────────────────────────────

  // Remove any remaining HTML tags
  md = md.replace(/<\/?[a-z][a-z0-9]*[^>]*>/gi, '');

  // Decode HTML entities
  md = decodeEntities(md);

  // ── Phase 5: Remove Elementor/EPKB residue text ───────────────────────────

  // Remove "Copy the URL link to this section to share" (EPKB copy-link text)
  md = md.replace(/\s*Copy the URL link to this section to share\s*/g, '\n');

  // Remove standalone "Step" labels (Elementor step counter text)
  md = md.replace(/^\s*Step\s*$/gm, '');

  // Remove "(click to enlarge)" captions (lightbox was handled by plugin)
  md = md.replace(/\s*\*?\(click to enlarge\)\*?\s*/gi, '\n');

  // Remove duplicate title: if the first heading after frontmatter matches
  // a second heading immediately after, remove the duplicate
  md = md.replace(/^(# .+)\n+\1$/m, '$1');

  // Remove excessive indentation on image lines
  md = md.replace(/^\s{3,}(!\[)/gm, '$1');

  // Remove excessive indentation on link lines
  md = md.replace(/^\s{3,}(\[)/gm, '$1');

  // Remove excessive indentation on italic caption lines
  md = md.replace(/^\s{3,}(\*[^*])/gm, '$1');

  // Fix multiple blank lines (max 2)
  md = md.replace(/\n{4,}/g, '\n\n\n');

  // Fix spaces before/after bold/italic markers
  md = md.replace(/\*\* /g, '** ');
  md = md.replace(/ \*\*/g, ' **');

  // Remove leading/trailing whitespace on each line
  md = md.split('\n').map(l => l.trimEnd()).join('\n');

  // Remove leading blank lines
  md = md.replace(/^\n+/, '');

  // Ensure single trailing newline
  md = md.trimEnd() + '\n';

  return md;
}

// ─── Helper: Clean inline HTML (strip tags, keep text) ──────────────────────

function cleanInline(html) {
  if (!html) return '';
  let text = html;
  text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  text = text.replace(/<br\s*\/?>/gi, ' ');
  text = text.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  text = text.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
  text = text.replace(/<\/?[a-z][a-z0-9]*[^>]*>/gi, '');
  text = decodeEntities(text);
  return text.trim();
}

// ─── Helper: Convert HTML tables to Markdown tables ─────────────────────────

function convertTables(html) {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const cells = [];
      const cellRegex = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cleanInline(cellMatch[2]).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return '';

    const colCount = Math.max(...rows.map(r => r.length));
    rows.forEach(r => { while (r.length < colCount) r.push(''); });

    let md = '\n';
    md += '| ' + rows[0].join(' | ') + ' |\n';
    md += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    for (let i = 1; i < rows.length; i++) {
      md += '| ' + rows[i].join(' | ') + ' |\n';
    }
    return md + '\n';
  });
}

// ─── Helper: Convert HTML lists to Markdown lists ───────────────────────────

function convertLists(html) {
  let md = html;
  for (let i = 0; i < 10; i++) {
    const before = md;

    md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
      return convertListItems(content, '-');
    });

    md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
      return convertListItems(content, '1.');
    });

    if (md === before) break;
  }
  return md;
}

function convertListItems(content, marker) {
  const items = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(content)) !== null) {
    let text = liMatch[1].trim();
    const lines = text.split('\n');
    const result = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('1. ') || trimmed.match(/^\d+\. /)) {
        result.push('    ' + trimmed);
      } else if (trimmed) {
        result.push(cleanInline(trimmed));
      }
    }
    items.push(result.join('\n'));
  }

  if (items.length === 0) return '';
  return '\n' + items.map(item => {
    const lines = item.split('\n');
    const first = `${marker} ${lines[0]}`;
    const rest = lines.slice(1).map(l => l.startsWith('    ') ? l : `  ${l}`).join('\n');
    return rest ? `${first}\n${rest}` : first;
  }).join('\n') + '\n';
}

// ─── Helper: Normalize image URLs ───────────────────────────────────────────

function normalizeImageUrl(url) {
  if (!url) return '';
  const match = url.match(/\/([^/]+\.(png|jpg|jpeg|gif|webp|svg))(\?.*)?$/i);
  if (match) {
    return `images/${match[1]}`;
  }
  return url;
}

// ─── Helper: Decode HTML entities ───────────────────────────────────────────

function decodeEntities(text) {
  if (!text) return '';
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'",
    '&apos;': "'", '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
    '&lsquo;': '\u2018', '&rsquo;': '\u2019', '&ldquo;': '\u201C', '&rdquo;': '\u201D',
    '&bull;': '\u2022', '&hellip;': '…', '&copy;': '©', '&reg;': '®',
    '&trade;': '™', '&rarr;': '→', '&larr;': '←', '&uarr;': '↑', '&darr;': '↓',
    '&times;': '×', '&divide;': '÷', '&frac12;': '½', '&frac14;': '¼', '&frac34;': '¾',
  };
  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return result;
}

// ─── Helper: Slugify a title for filenames ──────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

// ─── Helper: Parse version from release note title ──────────────────────────

function parseVersionSort(title) {
  const match = title.match(/Version\s+(\d+(?:\.\d+)?)/i);
  if (match) return parseFloat(match[1]);
  return 0;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('Reading WordPress export...');
  const xml = fs.readFileSync(INPUT_FILE, 'utf8');

  console.log('Parsing items...');
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  const articles = [];

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const postType = item.match(/<wp:post_type><!\[CDATA\[(epkb_post_type_\d+)\]\]>/);
    const status = item.match(/<wp:status><!\[CDATA\[(\w+)\]\]>/);
    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]>/);
    const content = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
    const link = item.match(/<link>(.*?)<\/link>/);
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const wpName = item.match(/<wp:post_name><!\[CDATA\[(.*?)\]\]>/);

    if (!postType || !status || status[1] !== 'publish' || !title) continue;
    if (title[1].includes('PAGE TEMPLATE')) continue;
    if (title[1] === 'Hello' || title[1] === 'Testing') continue;

    const mapping = PRODUCT_MAP[postType[1]];
    if (!mapping) continue;

    articles.push({
      postType: postType[1],
      product: mapping.product,
      contentType: mapping.type,
      title: title[1],
      html: content ? content[1] : '',
      url: link ? link[1] : '',
      pubDate: pubDate ? pubDate[1] : '',
      wpSlug: wpName ? wpName[1] : '',
    });
  }

  console.log(`Found ${articles.length} EPKB articles across ${Object.keys(PRODUCT_MAP).length} post types\n`);

  // ── Build internal link rewrite map ─────────────────────────────────────

  const kbPrefixPattern = Object.keys(KB_PREFIXES).join('|');
  const linkMap = {};
  for (const article of articles) {
    const slug = article.wpSlug;
    const section = article.contentType === 'articles' ? 'guides' : 'release-notes';
    const filename = slugify(article.title) + '.md';
    const entry = { product: article.product, section, filename };

    const urlMatch = article.url.match(new RegExp(`\\/(${kbPrefixPattern})\\/`, 'i'));
    if (urlMatch) {
      linkMap[`${urlMatch[1].toLowerCase()}/${slug}`] = entry;
    }
    linkMap[slug] = entry;
  }

  function rewriteInternalLinks(html, currentProduct) {
    const regex = new RegExp(
      `href="(https?:\\/\\/[^"]*?\\/(${kbPrefixPattern})\\/([^/"]+)\\/?[^"]*)"`,
      'gi'
    );
    return html.replace(regex, (fullMatch, fullUrl, kbPrefix, articleSlug) => {
      const normalizedPrefix = kbPrefix.toLowerCase();
      const mapped = linkMap[`${normalizedPrefix}/${articleSlug}`] || linkMap[articleSlug];
      if (mapped) {
        if (mapped.product === currentProduct) {
          if (mapped.section === 'guides') {
            return `href="${mapped.filename}"`;
          } else {
            return `href="../${mapped.section}/${mapped.filename}"`;
          }
        } else {
          return `href="/${mapped.product}/${mapped.section}/${mapped.filename}"`;
        }
      }
      console.log(`      Warning: Unmapped link: ${kbPrefix}/${articleSlug}`);
      return fullMatch;
    });
  }

  // ── Group by product ──────────────────────────────────────────────────────

  const products = {};
  for (const article of articles) {
    const key = article.product;
    if (!products[key]) products[key] = { articles: [], 'release-notes': [] };
    products[key][article.contentType].push(article);
  }

  // ── Convert and write ─────────────────────────────────────────────────────

  const stats = { products: 0, articles: 0, releaseNotes: 0, totalChars: 0 };

  for (const [productSlug, content] of Object.entries(products)) {
    const productName = PRODUCT_NAMES[productSlug] || productSlug;
    const productDir = path.join(OUTPUT_DIR, productSlug, 'docs');
    stats.products++;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${productName}`);
    console.log(`${'='.repeat(60)}`);

    // ── KB Articles ─────────────────────────────────────────────────────

    if (content.articles.length > 0) {
      const articlesDir = path.join(productDir, 'guides');
      fs.mkdirSync(articlesDir, { recursive: true });
      fs.mkdirSync(path.join(productDir, 'images'), { recursive: true });

      console.log(`\n  Guides (${content.articles.length} articles):`);
      for (const article of content.articles) {
        const slug = slugify(article.title);
        const filename = `${slug}.md`;
        const rewrittenHtml = rewriteInternalLinks(article.html, productSlug);
        const markdown = htmlToMarkdown(rewrittenHtml);
        const frontMatter = [
          '---',
          `title: "${article.title.replace(/"/g, '\\"')}"`,
          '---',
          '',
        ].join('\n');

        const hasH1 = /^#\s/m.test(markdown.substring(0, 200));
        const fullContent = frontMatter + (hasH1 ? '' : `# ${article.title}\n\n`) + markdown;
        fs.writeFileSync(path.join(articlesDir, filename), fullContent, 'utf8');

        stats.articles++;
        stats.totalChars += fullContent.length;
        console.log(`    + ${article.title}`);
      }
    }

    // ── Release Notes ───────────────────────────────────────────────────

    if (content['release-notes'].length > 0) {
      const rnDir = path.join(productDir, 'release-notes');
      fs.mkdirSync(rnDir, { recursive: true });

      const sorted = content['release-notes'].sort((a, b) => parseVersionSort(b.title) - parseVersionSort(a.title));

      console.log(`\n  Release Notes (${sorted.length} versions):`);

      for (const article of sorted) {
        const slug = slugify(article.title);
        const filename = `${slug}.md`;
        const rewrittenHtml = rewriteInternalLinks(article.html, productSlug);
        const markdown = htmlToMarkdown(rewrittenHtml);
        const frontMatter = [
          '---',
          `title: "${article.title.replace(/"/g, '\\"')}"`,
          '---',
          '',
        ].join('\n');

        const hasH1 = /^#\s/m.test(markdown.substring(0, 200));
        const fullContent = frontMatter + (hasH1 ? '' : `# ${article.title}\n\n`) + markdown;
        fs.writeFileSync(path.join(rnDir, filename), fullContent, 'utf8');

        stats.releaseNotes++;
        stats.totalChars += fullContent.length;
        console.log(`    + ${article.title}`);
      }

      // Combined release notes page
      const combinedLines = [
        '---',
        `title: "Release Notes"`,
        '---',
        '',
        `# ${productName} Release Notes\n`,
      ];
      for (const article of sorted) {
        const rewrittenHtml = rewriteInternalLinks(article.html, productSlug);
        const markdown = htmlToMarkdown(rewrittenHtml);
        combinedLines.push(`## ${article.title}\n`);
        combinedLines.push(markdown);
        combinedLines.push('---\n');
      }
      fs.writeFileSync(path.join(rnDir, 'index.md'), combinedLines.join('\n'), 'utf8');
      console.log(`    + Combined -> release-notes/index.md`);
    }

    // ── Generate mkdocs nav snippet ─────────────────────────────────────

    const navLines = [
      `# Suggested nav structure for ${productName}`,
      `# Add to mkdocs.yml under 'nav:'`,
      '',
      'nav:',
      '  - Home: index.md',
      '  - Guides:',
    ];
    if (content.articles.length > 0) {
      for (const article of content.articles) {
        const slug = slugify(article.title);
        navLines.push(`    - "${article.title}": guides/${slug}.md`);
      }
    }
    navLines.push('  - Release Notes:');
    navLines.push('    - All Versions: release-notes/index.md');
    if (content['release-notes'].length > 0) {
      const sorted = content['release-notes'].sort((a, b) => parseVersionSort(b.title) - parseVersionSort(a.title));
      for (const article of sorted.slice(0, 10)) {
        const slug = slugify(article.title);
        navLines.push(`    - "${article.title}": release-notes/${slug}.md`);
      }
      if (sorted.length > 10) {
        navLines.push(`    # ... and ${sorted.length - 10} more versions`);
      }
    }

    fs.writeFileSync(path.join(productDir, 'nav-suggestion.yml'), navLines.join('\n') + '\n', 'utf8');
    console.log(`\n  -> nav-suggestion.yml generated`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(60)}`);
  console.log('  CONVERSION COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Products:      ${stats.products}`);
  console.log(`  KB Articles:   ${stats.articles}`);
  console.log(`  Release Notes: ${stats.releaseNotes}`);
  console.log(`  Total output:  ${(stats.totalChars / 1024).toFixed(0)} KB`);
  console.log(`  Output dir:    ${OUTPUT_DIR}`);
  console.log('');

  // ── Extract image URL manifest ────────────────────────────────────────

  const imageUrls = new Set();
  for (const article of articles) {
    const imgRegex = /src="(https?:\/\/[^"]*\.(png|jpg|jpeg|gif|webp|svg)[^"]*)"/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(article.html)) !== null) {
      imageUrls.add(imgMatch[1]);
    }
  }

  const imageManifest = Array.from(imageUrls).sort();
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'image-manifest.txt'),
    imageManifest.join('\n') + '\n',
    'utf8'
  );
  console.log(`  Image manifest: ${imageManifest.length} unique image URLs`);
  console.log(`  Saved to: ${path.join(OUTPUT_DIR, 'image-manifest.txt')}`);
  console.log('');
  console.log('  Next steps:');
  console.log('  1. Download images:  node download-images.js <output-dir> [--host https://yoursite.com]');
  console.log('  2. Review converted markdown for formatting issues');
  console.log('  3. Copy docs/ folders into your MkDocs repos');
  console.log('  4. Use nav-suggestion.yml to build your mkdocs.yml nav section');
  console.log('');
}

main();
