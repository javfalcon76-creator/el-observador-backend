// ==========================================
// EL OBSERVADOR - BACKEND RSS
// Node.js + Express + RSS Parser
// ==========================================

const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const NodeCache = require('node-cache');

const app = express();
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; ElObservador/1.0)'
  }
});

// Cache: 30 minutos
const cache = new NodeCache({ stdTTL: 1800 });

// CORS para permitir peticiones del frontend
app.use(cors());
app.use(express.json());

// ==========================================
// CONFIGURACIÓN DE FEEDS RSS
// ==========================================
const RSS_FEEDS = [
  // INTERNACIONAL (3 fuentes)
  { 
    name: 'BBC News', 
    url: 'http://feeds.bbci.co.uk/news/rss.xml', 
    cat: 'internacional',
    priority: 1
  },
  { 
    name: 'Reuters', 
    url: 'http://feeds.reuters.com/reuters/topNews', 
    cat: 'internacional',
    priority: 1
  },
  { 
    name: 'Al Jazeera', 
    url: 'https://www.aljazeera.com/xml/rss/all.xml', 
    cat: 'internacional',
    priority: 2
  },
  
  // ESPAÑA (3 fuentes)
  { 
    name: 'El País', 
    url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', 
    cat: 'españa',
    priority: 1
  },
  { 
    name: 'El Mundo', 
    url: 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml', 
    cat: 'españa',
    priority: 1
  },
  { 
    name: '20 Minutos', 
    url: 'https://www.20minutos.es/rss/', 
    cat: 'españa',
    priority: 2
  },
  
  // GUIPÚZCOA (2 fuentes)
  { 
    name: 'Diariovasco', 
    url: 'https://www.diariovasco.com/rss/2.0/?section=gipuzkoa', 
    cat: 'guipuzcoa',
    priority: 1
  },
  { 
    name: 'Noticias de Gipuzkoa', 
    url: 'https://www.noticiasdegipuzkoa.eus/rss/portada.xml', 
    cat: 'guipuzcoa',
    priority: 2
  },
  
  // TECNOLOGÍA/IA (4 fuentes)
  { 
    name: 'TechCrunch', 
    url: 'https://techcrunch.com/feed/', 
    cat: 'tecnologia',
    priority: 1
  },
  { 
    name: 'The Verge', 
    url: 'https://www.theverge.com/rss/index.xml', 
    cat: 'tecnologia',
    priority: 1
  },
  { 
    name: 'Wired', 
    url: 'https://www.wired.com/feed/rss', 
    cat: 'tecnologia',
    priority: 2
  },
  { 
    name: 'Ars Technica', 
    url: 'https://feeds.arstechnica.com/arstechnica/index', 
    cat: 'tecnologia',
    priority: 2
  },
  
  // CULTURA (2 fuentes)
  { 
    name: 'The Guardian Culture', 
    url: 'https://www.theguardian.com/culture/rss', 
    cat: 'cultura',
    priority: 1
  },
  { 
    name: 'El Cultural', 
    url: 'https://www.elespanol.com/el-cultural/rss', 
    cat: 'cultura',
    priority: 2
  }
];

// ==========================================
// FUNCIÓN PARA LIMPIAR HTML
// ==========================================
function cleanHTML(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ==========================================
// FUNCIÓN PARA EXTRAER IMAGEN
// ==========================================
function extractImage(item) {
  // Intentar múltiples fuentes de imagen
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  
  if (item['media:thumbnail'] && item['media:thumbnail'].$) {
    return item['media:thumbnail'].$.url;
  }
  
  if (item['media:content'] && item['media:content'].$) {
    return item['media:content'].$.url;
  }
  
  if (item.image && item.image.url) {
    return item.image.url;
  }
  
  // Buscar en el contenido HTML
  const content = item.content || item['content:encoded'] || item.description || '';
  const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
  if (imgMatch) {
    return imgMatch[1];
  }
  
  return null;
}

// ==========================================
// FUNCIÓN PARA OBTENER UN FEED
// ==========================================
async function fetchFeed(feed) {
  try {
    console.log(`[${feed.name}] Obteniendo feed...`);
    
    const rssFeed = await parser.parseURL(feed.url);
    
    const items = rssFeed.items.slice(0, 10).map(item => {
      const title = cleanHTML(item.title || 'Sin título');
      const description = cleanHTML(
        item.contentSnippet || 
        item.content || 
        item.description || 
        item.summary || 
        ''
      ).substring(0, 400);
      
      return {
        id: `${feed.name}-${item.guid || item.link || Math.random()}`,
        title: title.substring(0, 200),
        summary: description || 'Sin descripción disponible',
        source: feed.name,
        category: feed.cat,
        url: item.link || '#',
        image: extractImage(item),
        published: item.pubDate ? new Date(item.pubDate) : new Date(),
        verified: true
      };
    });
    
    console.log(`[${feed.name}] ✅ ${items.length} noticias obtenidas`);
    
    return items;
    
  } catch (error) {
    console.error(`[${feed.name}] ❌ Error:`, error.message);
    return [];
  }
}

// ==========================================
// ENDPOINT PRINCIPAL: /api/news
// ==========================================
app.get('/api/news', async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📡 Nueva petición de noticias');
    console.log('========================================');
    
    // Verificar cache
    const cached = cache.get('all-news');
    if (cached) {
      console.log('✅ Devolviendo desde CACHE');
      return res.json({
        success: true,
        data: cached,
        count: cached.length,
        sources: RSS_FEEDS.length,
        cached: true,
        timestamp: new Date()
      });
    }
    
    console.log(`🔄 Obteniendo ${RSS_FEEDS.length} feeds RSS...`);
    
    // Obtener todos los feeds en paralelo
    const startTime = Date.now();
    const promises = RSS_FEEDS.map(feed => fetchFeed(feed));
    const results = await Promise.allSettled(promises);
    
    // Procesar resultados
    const allNews = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .flat()
      .filter(news => news && news.title && news.title !== 'Sin título')
      .sort((a, b) => b.published - a.published);
    
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n========================================');
    console.log('✅ RESUMEN:');
    console.log(`   Total noticias: ${allNews.length}`);
    console.log(`   Fuentes exitosas: ${results.filter(r => r.status === 'fulfilled' && r.value.length > 0).length}/${RSS_FEEDS.length}`);
    console.log(`   Tiempo: ${fetchTime}s`);
    console.log('========================================\n');
    
    // Desglose por categoría
    const breakdown = {};
    allNews.forEach(news => {
      breakdown[news.category] = (breakdown[news.category] || 0) + 1;
    });
    console.log('📊 Por categoría:', breakdown);
    
    // Guardar en cache
    cache.set('all-news', allNews);
    
    res.json({
      success: true,
      data: allNews,
      count: allNews.length,
      breakdown: breakdown,
      sources: RSS_FEEDS.length,
      fetchTime: parseFloat(fetchTime),
      cached: false,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Error general:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date()
    });
  }
});

// ==========================================
// ENDPOINT: Health Check
// ==========================================
app.get('/health', (req, res) => {
  const cacheStats = cache.getStats();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    cache: {
      keys: cache.keys().length,
      hits: cacheStats.hits,
      misses: cacheStats.misses
    },
    feeds: RSS_FEEDS.length,
    timestamp: new Date()
  });
});

// ==========================================
// ENDPOINT: Test individual feed
// ==========================================
app.get('/api/test/:feedName', async (req, res) => {
  try {
    const feedName = req.params.feedName;
    const feed = RSS_FEEDS.find(f => 
      f.name.toLowerCase().replace(/\s+/g, '-') === feedName.toLowerCase()
    );
    
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Feed no encontrado',
        available: RSS_FEEDS.map(f => ({
          name: f.name,
          slug: f.name.toLowerCase().replace(/\s+/g, '-')
        }))
      });
    }
    
    const items = await fetchFeed(feed);
    
    res.json({
      success: true,
      feed: feed.name,
      category: feed.cat,
      count: items.length,
      data: items
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// ENDPOINT: Limpiar cache
// ==========================================
app.post('/api/cache/clear', (req, res) => {
  cache.flushAll();
  res.json({
    success: true,
    message: 'Cache limpiada',
    timestamp: new Date()
  });
});

// ==========================================
// ENDPOINT: Estadísticas
// ==========================================
app.get('/api/stats', (req, res) => {
  const cacheStats = cache.getStats();
  const cached = cache.get('all-news');
  
  res.json({
    success: true,
    feeds: {
      total: RSS_FEEDS.length,
      byCategory: RSS_FEEDS.reduce((acc, feed) => {
        acc[feed.cat] = (acc[feed.cat] || 0) + 1;
        return acc;
      }, {})
    },
    cache: {
      enabled: true,
      ttl: '30 minutos',
      keys: cache.keys().length,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0
    },
    currentNews: cached ? cached.length : 0,
    timestamp: new Date()
  });
});

// ==========================================
// ROOT
// ==========================================
app.get('/', (req, res) => {
  res.json({
    name: 'El Observador Backend',
    version: '1.0.0',
    endpoints: {
      news: '/api/news',
      health: '/health',
      stats: '/api/stats',
      test: '/api/test/:feedName',
      clearCache: '/api/cache/clear (POST)'
    },
    feeds: RSS_FEEDS.length,
    status: 'running'
  });
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('🚀 EL OBSERVADOR BACKEND');
  console.log('========================================');
  console.log(`📡 Servidor: http://localhost:${PORT}`);
  console.log(`📰 Feeds RSS: ${RSS_FEEDS.length} configurados`);
  console.log(`💾 Cache: 30 minutos`);
  console.log('========================================\n');
  console.log('📋 Endpoints disponibles:');
  console.log(`   GET  /api/news         - Obtener todas las noticias`);
  console.log(`   GET  /health           - Estado del servidor`);
  console.log(`   GET  /api/stats        - Estadísticas`);
  console.log(`   GET  /api/test/:name   - Probar feed individual`);
  console.log(`   POST /api/cache/clear  - Limpiar cache`);
  console.log('========================================\n');
});

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});
