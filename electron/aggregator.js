import axios from 'axios';
import xml2js from 'xml2js';
import * as cheerio from 'cheerio';

async function fetchRSS(url) {
  try {
    const response = await axios.get(url, { 
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    const items = result.rss.channel.item || [];
    return (Array.isArray(items) ? items : [items])
      .map(item => {
        const categories = Array.isArray(item.category) ? item.category : [item.category].filter(Boolean);
        const source = new URL(url).hostname.replace('www.', '');
        
        // Deep extraction of images and content
        let image = null;
        const fullContent = item['content:encoded'] || item.description || '';
        if (fullContent) {
          const $content = cheerio.load(fullContent);
          const $img = $content('img').first();
          if ($img.length) {
            image = $img.attr('src');
          }
        }

        // Helper to decode basic HTML entities
        const decodeEntities = (text) => {
          if (!text) return '';
          return text
            .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'");
        };

        return {
          title: decodeEntities(item.title),
          link: item.link,
          pubDate: item.pubDate,
          description: decodeEntities(item.description?.replace(/<[^>]*>?/gm, '').substring(0, 160)) + '...',
          image,
          author: item['dc:creator'] || item.author || 'Staff',
          source,
          type: 'article',
          categories
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error(`Failed to fetch RSS from ${url}:`, error.message);
    return [];
  }
}

async function scrapeStore() {
  const categories = [
    { name: 'New Releases', url: 'https://store.x-plane.org/New_c_160.html' },
    { name: 'Aircraft', url: 'https://store.x-plane.org/Airliners_c_75.html' },
    { name: 'Scenery', url: 'https://store.x-plane.org/Scenery_c_6.html' }
  ];
  
  const allItems = [];
  
  for (const cat of categories) {
    try {
      const response = await axios.get(cat.url, { 
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      const $ = cheerio.load(response.data);

      $('.product-item').each((i, el) => {
        if (i >= 30) return; 
        const nameAnchor = $(el).find('.name a');
        const title = nameAnchor.text().trim();
        const href = nameAnchor.attr('href') || '';
        const link = href.startsWith('http') ? href : 'https://store.x-plane.org/' + href;
        
        let rawImg = $(el).find('.img img').attr('src') || '';
        const image = rawImg.startsWith('http') ? rawImg : 'https://store.x-plane.org/' + rawImg.replace(/^\//, '');
        const price = $(el).find('.price').text().trim();
        
        // 1. FAST PATTERN DETECTION (Reliable for major brands)
        const brands = {
          'TOLISS': 'ToLiss',
          'FLIGHTFACTOR': 'FlightFactor',
          'FF-': 'FlightFactor',
          'JAR': 'JARDesign',
          'SIMCODERS': 'SimCoders',
          'ROTOSIM': 'Rotorsim',
          'IXEG': 'IXEG',
          'INIBUILD': 'iniBuilds',
          'AEROSOFT': 'Aerosoft',
          'JUSTFLIGHT': 'JustFlight',
          'THRANDA': 'Thranda',
          'VFLYTE': 'vFlyte70x'
        };

        let author = 'Unknown';
        const searchStr = (title + ' ' + href).toUpperCase();

        for (const [key, val] of Object.entries(brands)) {
          if (searchStr.includes(key)) {
            author = val;
            break;
          }
        }

        // Fallback 1: If "by Developer" is in title
        if (author === 'Unknown' && title.toLowerCase().includes(' by ')) {
          const parts = title.split(/ by /i);
          if (parts.length > 1) author = parts[1].trim();
        }
        
        // Fallback 2: Extract from URL Slug (Very reliable for X-Plane Store)
        if (author === 'Unknown' && href) {
          const urlParts = href.split('/');
          const fileName = urlParts[urlParts.length - 1];
          if (fileName && fileName.includes('-')) {
            const potential = fileName.split('-')[0].replace(/_/g, ' ');
            // Filter out obvious model names
            if (!/^[AB]\d{3}/i.test(potential) && potential.length > 2) {
              author = potential.charAt(0).toUpperCase() + potential.slice(1);
            }
          }
        }

        if (title && link) {
          allItems.push({
            title,
            link,
            image,
            price,
            source: 'store.x-plane.org',
            type: 'product',
            category: cat.name,
            author,
            dateAdded: new Date().toISOString()
          });
        }
      });
    } catch (err) {
      console.warn(`Failed to scrape store category ${cat.name}: ${err.message}`);
    }
  }

  // 2. VERIFIED DEEP SCRAPE (For remaining 'Unknown' authors)
  const unknownItems = allItems.filter(item => item.author === 'Unknown').slice(0, 15);
  const scrapePromises = unknownItems.map(async (item) => {
    try {
      // Use unique request to bypass server-side session issues
      const res = await axios.get(item.link + `?v=${Math.random().toString(36).substring(7)}`, { 
        timeout: 7000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const $prod = cheerio.load(res.data);
      
      // Verification: Relaxed check
      const pageTitle = $prod('title').text().toUpperCase();
      const itemTitlePart = item.title.split(' ')[0].toUpperCase();
      
      // If we got a completely different page (e.g. redirected to home or another product)
      if (pageTitle.length < 5 || (!pageTitle.includes(itemTitlePart) && !pageTitle.includes('X-PLANE'))) {
        // Fallback: Extract from URL slug
        const urlParts = item.link.split('/');
        const fileName = urlParts[urlParts.length - 1];
        if (fileName && fileName.includes('-')) {
          item.author = fileName.split('-')[0].replace(/_/g, ' ');
        }
        return;
      }

      let pnValue = null;
      $prod('div, span, p, td, b, strong').each((_, el) => {
        const text = $prod(el).text().trim();
        if (text.includes('Part Number:')) {
          const match = text.match(/Part Number:\s*([^\s<|]+)/i);
          if (match) pnValue = match[1].toUpperCase();
        }
      });

      if (pnValue) {
        const segments = pnValue.split('-');
        if (segments.length > 1 && /^[AB]\d{3}/i.test(segments[0])) {
          item.author = segments[1].replace(/_/g, ' ');
        } else {
          item.author = segments[0].replace(/_/g, ' ');
        }
      } else {
        // Last Resort: Extract from URL slug if PN not found on page
        const urlParts = item.link.split('/');
        const fileName = urlParts[urlParts.length - 1];
        if (fileName && fileName.includes('-')) {
          item.author = fileName.split('-')[0].replace(/_/g, ' ');
        }
      }
      
      const metaDesc = $prod('meta[name="description"]').attr('content');
      if (metaDesc) item.description = metaDesc;
    } catch (e) {}
  });

  await Promise.all(scrapePromises);
  
  // Remove duplicates by link
  return Array.from(new Map(allItems.map(item => [item.link, item])).values());
}

export async function fetchSingleProductPrice(url) {
  try {
    const res = await axios.get(url, { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const priceText = $('.price').text().trim();
    const prices = priceText.match(/[\$€]\d+\.\d+/g);
    
    // Part Number for developer verification
    const pageText = $('body').text();
    const partNumberMatch = pageText.match(/Part Number:\s*([^\s<]+)/i);
    let author = null;
    if (partNumberMatch && partNumberMatch[1]) {
      author = partNumberMatch[1].split('-')[0];
    }

    return {
      price: prices ? (prices.length > 1 ? prices[1] : prices[0]) : null,
      oldPrice: (prices && prices.length > 1) ? prices[0] : null,
      author
    };
  } catch (e) {
    console.error(`Failed to fetch single product price for ${url}:`, e.message);
    return null;
  }
}

async function scrapeSimPictures() {
  try {
    const url = 'https://www.simpictures.com/find?q=X-Plane';
    const response = await axios.get(url, { 
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(response.data);
    const items = [];

    $('.picture-item').each((i, el) => {
      if (i >= 10) return;
      const title = $(el).find('.title').text().trim();
      const link = 'https://www.simpictures.com' + $(el).find('a').attr('href');
      const image = $(el).find('img').attr('src');
      const author = $(el).find('.author').text().trim();
      
      items.push({
        title,
        link,
        image,
        author,
        source: 'simpictures.com',
        type: 'media',
        dateAdded: new Date().toISOString()
      });
    });
    return items;
  } catch (error) {
    console.error('Failed to scrape SimPictures:', error.message);
    return [];
  }
}

async function fetchVATSIMEvents() {
  try {
    const url = 'https://my.vatsim.net/api/v2/events/latest';
    const response = await axios.get(url, { timeout: 10000 });
    const events = response.data.data || [];
    
    return events.map(event => ({
      title: event.name,
      link: event.link || `https://my.vatsim.net/events/${event.slug || ''}`,
      pubDate: event.start_time,
      description: event.short_description || `Upcoming VATSIM Event at ${event.airports?.map(a => a.icao).join(', ') || 'multiple airports'}`,
      image: event.banner,
      author: event.organisers?.[0]?.name || 'VATSIM',
      source: 'vatsim.net',
      type: 'media',
      dateAdded: event.start_time
    }));
  } catch (error) {
    console.error('Failed to fetch VATSIM events:', error.message);
    return [];
  }
}

async function fetchIVAOEvents() {
  try {
    const url = 'https://ivao.aero/events';
    const { data } = await axios.get(url, { 
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    const $ = cheerio.load(data);
    const events = [];

    // Note: IVAO site structure can vary, targeting general event container
    $('.event-item, .ivao-event-card').each((i, el) => {
      if (i >= 15) return;
      const title = $(el).find('h3, .event-title').text().trim();
      const link = 'https://ivao.aero' + ($(el).find('a').attr('href') || '/events');
      const image = $(el).find('img').attr('src');
      const date = $(el).find('.event-date').text().trim();
      
      if (title) {
        events.push({
          title,
          link,
          pubDate: new Date().toISOString(), // Fallback
          description: `Upcoming IVAO Event: ${date}`,
          image: image?.startsWith('http') ? image : 'https://ivao.aero' + image,
          author: 'IVAO HQ',
          source: 'ivao.aero',
          type: 'media',
          dateAdded: new Date().toISOString()
        });
      }
    });

    return events;
  } catch (error) {
    console.error('Failed to fetch IVAO events:', error.message);
    return [];
  }
}

export async function getUnifiedFeed() {
  const [threshold, officialBlog, fselite, xpReviews, simDaily, vatsim, ivao, store, simPictures] = await Promise.all([
    fetchRSS('https://thresholdx.net/?s=X-Plane&feed=rss2'),
    fetchRSS('https://www.x-plane.com/feed/'),
    fetchRSS('https://fselite.net/simulator/xpl12/feed/'),
    fetchRSS('https://xplanereviews.com/forums/forum/25-news-the-latest-developments-in-x-plane/?rss=1'),
    fetchRSS('https://simulationdaily.com/category/x-plane/feed/'),
    fetchVATSIMEvents(),
    fetchIVAOEvents(),
    scrapeStore(),
    scrapeSimPictures()
  ]);

  return [
    ...threshold,
    ...officialBlog,
    ...fselite,
    ...xpReviews,
    ...simDaily,
    ...vatsim,
    ...ivao,
    ...store,
    ...simPictures
  ].sort((a, b) => new Date(b.pubDate || b.dateAdded) - new Date(a.pubDate || a.dateAdded));
}
