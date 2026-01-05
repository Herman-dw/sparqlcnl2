/**
 * Matching API Router - v1.1.0
 * ============================
 * Express router voor profiel-naar-beroep matching endpoints.
 * 
 * Integratie in bestaande Express app:
 * 
 *   import matchingRouter from './routes/matching.mjs';
 *   app.use('/api', matchingRouter);
 * 
 * Endpoints:
 *   POST /api/match-profile     - Match profiel tegen beroepen
 *   GET  /api/match-profile/health - Health check
 *   GET  /api/idf-weights       - Bekijk IDF gewichten
 * 
 * LET OP: Eerste request bouwt cache op (~30-60 sec)
 *         Gebruik preloadCache() bij server start voor betere UX
 */

import express from 'express';
import { matchProfile, preloadCache, clearCache } from './profile-matching-api.mjs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const router = express.Router();

// Database config (ondersteunt MARIADB_* en DB_* variabelen)
const DB_CONFIG = {
  host: process.env.MARIADB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.MARIADB_PORT || process.env.DB_PORT || '3306'),
  user: process.env.MARIADB_USER || process.env.DB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MARIADB_DATABASE || process.env.DB_NAME || 'competentnl_rag',
  charset: 'utf8mb4'
};

// ============================================================
// POST /api/match-profile
// ============================================================
/**
 * @api {post} /api/match-profile Match profiel tegen beroepen
 * @apiName MatchProfile
 * @apiGroup Matching
 * 
 * @apiBody {String[]} skills Lijst van vaardigheden (labels of URIs)
 * @apiBody {String[]} [knowledge] Lijst van kennisgebieden
 * @apiBody {String[]} [tasks] Lijst van taken
 * 
 * @apiQuery {Number} [limit=50] Maximum aantal resultaten
 * @apiQuery {Number} [minScore=0.1] Minimum score (0-1)
 * @apiQuery {Boolean} [includeGaps=true] Inclusief gap-analyse
 * @apiQuery {Boolean} [includeMatched=true] Inclusief gematchte items
 * 
 * @apiSuccess {Boolean} success Request succesvol
 * @apiSuccess {Object[]} matches Lijst met matches
 * @apiSuccess {Object} meta Metadata over de request
 * 
 * @apiExample {json} Request:
 *   POST /api/match-profile
 *   {
 *     "skills": ["Verzorgen", "Verplegen", "Communiceren"],
 *     "knowledge": ["Gezondheidszorg"],
 *     "tasks": []
 *   }
 * 
 * @apiSuccessExample {json} Response:
 *   {
 *     "success": true,
 *     "matches": [
 *       {
 *         "occupation": {
 *           "uri": "https://linkeddata.competentnl.nl/...",
 *           "label": "Verpleegkundige"
 *         },
 *         "score": 0.85,
 *         "breakdown": {
 *           "skills": { "score": 0.82, "weight": 0.5, "matchedCount": 3, "totalCount": 5 },
 *           "knowledge": { "score": 1.0, "weight": 0.3, "matchedCount": 1, "totalCount": 1 },
 *           "tasks": { "score": 0.6, "weight": 0.2, "matchedCount": 2, "totalCount": 4 }
 *         },
 *         "gaps": {
 *           "skills": [{ "label": "Revalidatietechnieken", "relevance": "essential" }],
 *           "knowledge": [],
 *           "tasks": []
 *         }
 *       }
 *     ],
 *     "meta": {
 *       "executionTime": 234,
 *       "totalCandidates": 150,
 *       "returnedMatches": 50
 *     }
 *   }
 */
router.post('/match-profile', async (req, res) => {
  try {
    const profile = req.body;
    
    // Validatie
    if (!profile) {
      return res.status(400).json({
        success: false,
        error: 'Request body is verplicht'
      });
    }
    
    if (!profile.skills?.length && !profile.knowledge?.length && !profile.tasks?.length) {
      return res.status(400).json({
        success: false,
        error: 'Profiel moet minstens één skill, kennisgebied of taak bevatten'
      });
    }
    
    // Parse opties
    const options = {
      limit: Math.min(parseInt(req.query.limit) || 50, 100),
      minScore: Math.max(0, Math.min(1, parseFloat(req.query.minScore) || 0.1)),
      includeGaps: req.query.includeGaps !== 'false',
      includeMatched: req.query.includeMatched !== 'false'
    };
    
    const result = await matchProfile(profile, options);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    return res.json(result);
    
  } catch (error) {
    console.error('Match profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================================
// GET /api/match-profile/health
// ============================================================
/**
 * Health check endpoint
 */
router.get('/match-profile/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  // Check database
  try {
    const connection = await mysql.createConnection(DB_CONFIG);
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM skill_idf_weights');
    health.checks.database = {
      status: 'ok',
      idfWeightsCount: rows[0].count
    };
    await connection.end();
  } catch (error) {
    health.status = 'degraded';
    health.checks.database = {
      status: 'error',
      error: error.message
    };
  }
  
  // Check SPARQL endpoint
  try {
    const response = await fetch(process.env.COMPETENTNL_ENDPOINT || 'https://linkeddata.competentnl.nl/sparql', {
      method: 'HEAD',
      headers: {
        'apikey': process.env.COMPETENTNL_API_KEY || ''
      }
    });
    health.checks.sparql = {
      status: response.ok ? 'ok' : 'error',
      statusCode: response.status
    };
  } catch (error) {
    health.status = 'degraded';
    health.checks.sparql = {
      status: 'error',
      error: error.message
    };
  }
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  return res.status(statusCode).json(health);
});

// ============================================================
// GET /api/idf-weights
// ============================================================
/**
 * Bekijk IDF gewichten (voor debugging/analyse)
 */
router.get('/idf-weights', async (req, res) => {
  try {
    const connection = await mysql.createConnection(DB_CONFIG);
    
    // Query parameters
    const category = req.query.category;
    const minIdf = parseFloat(req.query.minIdf) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const sortBy = req.query.sortBy === 'asc' ? 'ASC' : 'DESC';
    
    let query = `
      SELECT skill_uri, skill_label, occupation_count, idf_weight, skill_category
      FROM skill_idf_weights
      WHERE idf_weight >= ?
    `;
    const params = [minIdf];
    
    if (category) {
      query += ` AND skill_category = ?`;
      params.push(category.toUpperCase());
    }
    
    query += ` ORDER BY idf_weight ${sortBy} LIMIT ?`;
    params.push(limit);
    
    const [rows] = await connection.execute(query, params);
    
    // Get stats
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        ROUND(AVG(idf_weight), 3) as avgIdf,
        ROUND(MIN(idf_weight), 3) as minIdf,
        ROUND(MAX(idf_weight), 3) as maxIdf
      FROM skill_idf_weights
    `);
    
    await connection.end();
    
    return res.json({
      success: true,
      stats: stats[0],
      weights: rows.map(r => ({
        uri: r.skill_uri,
        label: r.skill_label,
        occupationCount: r.occupation_count,
        idf: parseFloat(r.idf_weight),
        category: r.skill_category
      }))
    });
    
  } catch (error) {
    console.error('IDF weights error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================================
// GET /api/idf-weights/categories
// ============================================================
/**
 * Bekijk IDF statistieken per categorie
 */
router.get('/idf-weights/categories', async (req, res) => {
  try {
    const connection = await mysql.createConnection(DB_CONFIG);
    
    const [rows] = await connection.execute(`
      SELECT 
        skill_category as category,
        COUNT(*) as count,
        ROUND(AVG(idf_weight), 3) as avgIdf,
        ROUND(MIN(idf_weight), 3) as minIdf,
        ROUND(MAX(idf_weight), 3) as maxIdf
      FROM skill_idf_weights
      GROUP BY skill_category
      ORDER BY avgIdf ASC
    `);
    
    await connection.end();
    
    return res.json({
      success: true,
      categories: rows
    });
    
  } catch (error) {
    console.error('IDF categories error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================================
// POST /api/match-profile/preload
// ============================================================
/**
 * Preload de cache (gebruik bij server start of warming)
 */
router.post('/match-profile/preload', async (req, res) => {
  try {
    const startTime = Date.now();
    await preloadCache();
    const duration = Date.now() - startTime;
    
    return res.json({
      success: true,
      message: 'Cache preloaded successfully',
      duration: duration
    });
  } catch (error) {
    console.error('Preload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to preload cache'
    });
  }
});

// ============================================================
// DELETE /api/match-profile/cache
// ============================================================
/**
 * Wis de cache (forceer refresh bij volgende request)
 */
router.delete('/match-profile/cache', (req, res) => {
  clearCache();
  return res.json({
    success: true,
    message: 'Cache cleared'
  });
});

export default router;
