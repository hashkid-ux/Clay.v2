// Backend/routes/analyticsEnhanced.js - Enhanced analytics with cost analysis
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

/**
 * GET /api/analytics/comprehensive - Get comprehensive analytics
 */
router.get('/comprehensive', async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    
    // Parse time range
    let days = 7;
    if (range === '30d') days = 30;
    if (range === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch KPIs
    const kpisResult = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as resolved_calls,
        ROUND(
          SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END)::numeric / 
          COUNT(*)::numeric * 100, 1
        ) as automation_rate,
        ROUND(AVG(EXTRACT(EPOCH FROM (end_ts - start_ts))), 1) as avg_handling_time,
        ROUND(AVG(customer_satisfaction)::numeric, 2) as avg_satisfaction,
        ROUND(
          SUM(CASE WHEN resolved = false THEN 1 ELSE 0 END)::numeric / 
          COUNT(*)::numeric * 100, 1
        ) as failure_rate
      FROM calls
      WHERE start_ts > $1
    `, [startDate]);

    // Fetch hourly call volume
    const hourlyResult = await db.query(`
      SELECT 
        EXTRACT(HOUR FROM start_ts)::int as hour,
        COUNT(*) as total,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as automated
      FROM calls
      WHERE start_ts > $1
      GROUP BY EXTRACT(HOUR FROM start_ts)
      ORDER BY hour
    `, [startDate]);

    // Fetch intent breakdown
    const intentResult = await db.query(`
      SELECT 
        current_intent as intent,
        COUNT(*) as count,
        ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM calls WHERE start_ts > $1)::numeric * 100, 1) as percentage
      FROM calls
      WHERE start_ts > $1 AND current_intent IS NOT NULL
      GROUP BY current_intent
      ORDER BY count DESC
      LIMIT 8
    `, [startDate]);

    // Fetch agent performance
    const agentResult = await db.query(`
      SELECT 
        agent_type as name,
        COUNT(*) as calls_handled,
        ROUND(SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric * 100, 1) as success_rate,
        ROUND(AVG(EXTRACT(EPOCH FROM (end_ts - start_ts))), 1) as avg_response_time
      FROM calls
      WHERE start_ts > $1 AND agent_type IS NOT NULL
      GROUP BY agent_type
      ORDER BY calls_handled DESC
    `, [startDate]);

    const kpis = kpisResult.rows[0] || {
      total_calls: 0,
      resolved_calls: 0,
      automation_rate: 0,
      avg_handling_time: 0,
      avg_satisfaction: 0,
      failure_rate: 0
    };

    const hourlyData = hourlyResult.rows.map(row => ({
      hour: `${row.hour}:00`,
      total: parseInt(row.total),
      automated: parseInt(row.automated)
    }));

    const intentBreakdown = intentResult.rows.map(row => ({
      name: row.intent || 'Unknown',
      value: parseFloat(row.percentage)
    }));

    const agentPerformance = agentResult.rows.map(row => ({
      name: row.name,
      callsHandled: parseInt(row.calls_handled),
      successRate: Math.round(parseFloat(row.success_rate) || 0),
      avgResponseTime: Math.round(parseFloat(row.avg_response_time) || 0)
    }));

    res.json({
      kpis: {
        totalCalls: parseInt(kpis.total_calls),
        resolvedCalls: parseInt(kpis.resolved_calls),
        automationRate: Math.round(parseFloat(kpis.automation_rate) || 0),
        avgHandlingTime: Math.round(parseFloat(kpis.avg_handling_time) || 0),
        avgCustomerSatisfaction: parseFloat(kpis.avg_satisfaction) || 0,
        failureRate: Math.round(parseFloat(kpis.failure_rate) || 0)
      },
      hourlyData,
      intentBreakdown,
      agentPerformance,
      timeRange: range,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching comprehensive analytics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/analytics/cost-analysis - Cost savings analysis
 */
router.get('/cost-analysis', async (req, res) => {
  try {
    const { range = '30d' } = req.query;
    
    let days = 30;
    if (range === '7d') days = 7;
    if (range === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as automated_calls,
        ROUND(AVG(EXTRACT(EPOCH FROM (end_ts - start_ts))), 1) as avg_handling_time
      FROM calls
      WHERE start_ts > $1
    `, [startDate]);

    const data = result.rows[0];
    
    if (!data || data.total_calls === 0) {
      return res.json({
        totalCalls: 0,
        automatedCalls: 0,
        humanCalls: 0,
        aiCost: '0.00',
        humanCost: '0.00',
        monthlySavings: '0.00',
        savingsPercent: 0,
        roiMonths: 0
      });
    }

    const totalCalls = parseInt(data.total_calls);
    const automatedCalls = parseInt(data.automated_calls);
    const humanCalls = totalCalls - automatedCalls;

    const costPerAICall = 0.15; // $0.15 per call
    const costPerHumanCall = 5.00; // $5 per call (agent + infrastructure)

    const aiCost = (totalCalls * costPerAICall).toFixed(2);
    const humanCost = (totalCalls * costPerHumanCall).toFixed(2);
    const monthlySavings = (automatedCalls * (costPerHumanCall - costPerAICall)).toFixed(2);
    const savingsPercent = Math.round(((costPerHumanCall - costPerAICall) / costPerHumanCall) * 100);

    res.json({
      totalCalls,
      automatedCalls,
      humanCalls,
      aiCost: parseFloat(aiCost),
      humanCost: parseFloat(humanCost),
      monthlySavings: parseFloat(monthlySavings),
      savingsPercent,
      roiMonths: (1000 / (monthlySavings / 30)).toFixed(1), // ROI for $1k setup
      timeRange: range,
      metrics: {
        costPerAICall,
        costPerHumanCall,
        avgHandlingTime: parseFloat(data.avg_handling_time)
      }
    });

  } catch (error) {
    logger.error('Error fetching cost analysis', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch cost analysis' });
  }
});

module.exports = router;
