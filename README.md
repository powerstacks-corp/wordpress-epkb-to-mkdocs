# WordPress EPKB to MkDocs Converter

Convert [WordPress Echo Knowledge Base (EPKB)](https://www.echoknowledgebase.com/) articles to [MkDocs](https://www.mkdocs.org/)-compatible Markdown, organized by product for separate documentation sites.

## What It Does

- Parses a standard WordPress WXR export XML file
- Strips Elementor page builder markup (inline styles, wrapper divs, spacer widgets, data attributes)
- Converts HTML to clean Markdown (headings, lists, tables, code blocks, images, links)
- Rewrites internal links between articles to relative MkDocs paths
- Organizes output by product with separate `guides/` and `release-notes/` directories
- Generates a nav suggestion YAML for each product's `mkdocs.yml`
- Extracts an image manifest for bulk downloading
- Downloads all referenced images with retry and fallback support

## Requirements

- Node.js 18+ (no additional dependencies required)

## Usage

### Step 1: Export WordPress Content

In WordPress Admin, go to **Tools > Export** and export **All content**. Save the `.xml` file.

### Step 2: Configure Product Mapping

Edit the `PRODUCT_MAP`, `PRODUCT_NAMES`, and `KB_PREFIXES` objects at the top of `convert.js` to match your EPKB knowledge bases.

To find your EPKB post types, search your XML export for:
```
<wp:post_type><![CDATA[epkb_post_type_
```

Each knowledge base in EPKB gets a sequential post type number (starting at 2).

### Step 3: Convert Articles

```bash
node convert.js path/to/export.xml ./output
```

This creates:
```
output/
  {product-slug}/
    docs/
      guides/           # KB articles as individual .md files
      release-notes/    # Version pages + combined index.md
      images/           # Empty, populated by download step
      nav-suggestion.yml
  image-manifest.txt    # All image URLs found in articles
```

### Step 4: Download Images

```bash
node download-images.js ./output --host https://yoursite.com
```

The `--host` flag rewrites development/staging URLs (e.g., EC2 instances) to your production hostname for downloading. Images are saved to each product's `docs/images/` folder.

If your images are already accessible at their original URLs, you can omit `--host`:

```bash
node download-images.js ./output
```

### Step 5: Set Up MkDocs

Each product's `docs/` folder is ready to drop into a MkDocs project. Use the generated `nav-suggestion.yml` as a starting point for your `mkdocs.yml` navigation.

**Important:** The converted Markdown references images as `images/filename.png` (relative to the `.md` file). If your MkDocs structure places guides in a subdirectory like `docs/guides/`, you'll need to adjust image paths to `../images/filename.png`.

## Handling Elementor Content

The converter handles common Elementor patterns:

- Strips `<style>` blocks and inline styles
- Unwraps deeply nested wrapper `<div>` elements (up to 15 levels deep)
- Removes `<span>` wrappers, `<section>`, `<article>` elements
- Strips `class`, `id`, `data-*`, `aria-*`, and `role` attributes
- Removes Elementor spacer widgets
- Cleans up EPKB-specific text like "Copy the URL link to this section to share"
- Removes "Step" counter labels from Elementor step widgets
- Removes "(click to enlarge)" lightbox captions

## Internal Link Rewriting

The converter builds a map of WordPress URL slugs to MkDocs file paths and rewrites links during conversion:

- Same-product links become relative paths (e.g., `configure-the-dataset.md`)
- Cross-product links use absolute path references
- Unmapped links are preserved and logged as warnings

## License

MIT
