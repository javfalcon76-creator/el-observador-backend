// ==========================================
// EL OBSERVADOR - BACKEND RSS SIMPLIFICADO
// Solo feeds RSS verificados y confiables
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
// FEEDS RSS VERIFICADOS QUE FUNCIONAN
// ==========================================
const RSS_FEEDS = [
  // INTERNACIONAL (3 fuentes - LAS MÁS CONFIABLES)
  { 
    name: 'BBC News', 
    url: 'http://feeds.bbci.co.uk/news/rss.xml', 
    cat: 'internacional'
  },
  { 
    name: 'Reuters', 
    url: 'http://feeds.reuters.com/reuters/topNews', 
    cat: 'internacional'
  },
  { 
    name: 'Al Jazeera', 
    url: 'https://www.aljazeera.com/xml/rss/all.xml', 
    cat: 'internacional'
  },
  
  // ESPAÑA (3 fuentes alternativas - MÁS CONFIABLES)
  { 
    name: 'RTVE Noticias', 
    url: 'https://www.rtve.es/api/noticias.rss', 
    cat: 'españa'
  },
  { 
    name: '20 Minutos', 
    url: 'https://www.20minutos.es/rss/', 
    cat: 'españa'
  },
  { 
    name: 'El Confidencial', 
    url: 'https://rss.elconfidencial.com/espana/', 
    cat: 'españa'
  },
  
  // GUIPÚZCOA (2 fuentes - Noticias Vascas)
  { 
    name: 'EITB Noticias', 
    url: 'https://www.eitb.eus/es/rss/radio/radio-vitoria/programas/boulevard/detalle/4838058/rss-boulevard/', 
    cat: 'guipuzcoa'
  },
  { 
    name: 'Noticias de Álava', 
    url: 'https://www.noticiasdealava.eus/rss/portada.xml', 
    cat: 'guipuzcoa'
  },
  
  // TECNOLOGÍA (3 fuentes - MUY CONFIABLES)
  { 
    name: 'TechCrunch', 
    url: 'https://techcrunch.com/feed/', 
    cat: 'tecnologia'
  },
  { 
    name: 'The Verge', 
    url: 'https://www.theverge.com/rss/index.xml', 
    cat: 'tecnologia'
  },
  { 
    name: 'Ars Technica', 
    url: 'https://feeds.arstechnica.com/arstechnica/index', 
    cat: 'tecnologia'
  },
  
  // CULTURA (2 fuentes - CONFIABLES)
  { 
    name: 'The Guardian Culture', 
    url: 'https://www.theguardian.com/culture/rss', 
    cat: 'cultura'
  },
  { 
    name: 'El País Cultura', 
    url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada', 
    cat: 'cultura'
  }
];

console.log('\n========================================');
console.log('📰 FEEDS RSS CONFIGURADOS:');
console.log('========================================');
RSS_FEEDS.forEach((feed, i) => {
  console.log(`${i + 1}. ${feed.name} (${feed.cat})`);
});
console.log(`\n✅ Total: ${RSS_FEEDS.length} fuentes verificadas`);
console.log('========================================\n');

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
  
  if (item['media:thumbnail']) {
    if (item['media:thumbnail'].$) return item['media:thumbnail'].$.url;
    if (item['media:thumbnail'].url) return item['media:thumbnail'].url;
  }
  
  if (item['media:content']) {
    if (item['media:content'].$) return item['media:content'].$.url;
    if (item['media:content'].url) return item['media:content'].url;
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
    console.log(`[${feed.name}] 📡 Obteniendo feed...`);
    
    const rssFeed = await parser.parseURL(feed.url);
    
    const items = rssFeed.items.slice(0, 15).map(item => {
      const title = cleanHTML(item.title || 'Sin título');
      const description = cleanHTML(
        item.contentSnippet || 
        item.content || 
        item.description || 
        item.summary || 
        ''
      ).substring(0, 500);
      
      return {
        id: `${feed.name}-${item.guid || item.link || Math.random().toString(36)}`,
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
    console.error(`[${feed.name}] ❌ Error: ${error.message}`);
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
    console.log(`Hora: ${new Date().toLocaleString('es-ES')}`);
    console.log('========================================');
    
    // Verificar cache
    const cached = cache.get('all-news');
    if (cached) {
      console.log('✅ Devolviendo desde CACHE (30 min)');
      console.log(`Noticias en cache: ${cached.length}`);
      return res.json({
        success: true,
        data: cached,
        count: cached.length,
        sources: RSS_FEEDS.length,
        cached: true,
        timestamp: new Date()
      });
    }
    
    console.log(`🔄 Obteniendo ${RSS_FEEDS.length} feeds RSS frescos...`);
    
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
    uptime: Math.floor(process.uptime()),
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
    const feedName = req.params.feedName.toLowerCase().replace(/-/g, ' ');
    const feed = RSS_FEEDS.find(f => 
      f.name.toLowerCase() === feedName
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
  console.log('🗑️  Cache limpiada manualmente');
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
    version: '1.0.0 - Simplificado',
    status: 'running',
    feeds: RSS_FEEDS.length,
    sources: RSS_FEEDS.map(f => ({ name: f.name, category: f.cat })),
    endpoints: {
      news: 'GET /api/news',
      health: 'GET /health',
      stats: 'GET /api/stats',
      test: 'GET /api/test/:feedName',
      clearCache: 'POST /api/cache/clear'
    }
  });
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('🚀 EL OBSERVADOR BACKEND - SIMPLIFICADO');
  console.log('========================================');
  console.log(`📡 Servidor: http://localhost:${PORT}`);
  console.log(`📰 Feeds RSS: ${RSS_FEEDS.length} fuentes verificadas`);
  console.log(`💾 Cache: 30 minutos`);
  console.log('========================================\n');
  console.log('📋 Feeds activos:');
  RSS_FEEDS.forEach((feed, i) => {
    console.log(`   ${i + 1}. ${feed.name} (${feed.cat})`);
  });
  console.log('\n========================================');
  console.log('🌐 Endpoints:');
  console.log(`   GET  ${PORT === 3000 ? 'http://localhost:3000' : ''}/api/news`);
  console.log(`   GET  ${PORT === 3000 ? 'http://localhost:3000' : ''}/health`);
  console.log(`   GET  ${PORT === 3000 ? 'http://localhost:3000' : ''}/api/stats`);
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
