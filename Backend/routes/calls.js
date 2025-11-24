// routes/calls.js - Calls API endpoints
const express = require('express');
const router = express.Router();
const resolve = require('../utils/moduleResolver');
const db = require(resolve('db/postgres'));
const logger = require(resolve('utils/logger'));

// GET /api/calls - List all calls
router.get('/', async (req, res) => {
  try {
    const { 
      client_id, 
      limit = 50, 
      offset = 0,
      resolved,
      phone_from
    } = req.query;

    let query = 'SELECT * FROM calls WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (client_id) {
      query += ` AND client_id = $${paramIndex}`;
      params.push(client_id);
      paramIndex++;
    }

    if (resolved !== undefined) {
      query += ` AND resolved = $${paramIndex}`;
      params.push(resolved === 'true');
      paramIndex++;
    }

    if (phone_from) {
      query += ` AND phone_from = $${paramIndex}`;
      params.push(phone_from);
      paramIndex++;
    }

    query += ` ORDER BY start_ts DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM calls WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (client_id) {
      countQuery += ` AND client_id = $${countParamIndex}`;
      countParams.push(client_id);
      countParamIndex++;
    }

    if (resolved !== undefined) {
      countQuery += ` AND resolved = $${countParamIndex}`;
      countParams.push(resolved === 'true');
      countParamIndex++;
    }

    if (phone_from) {
      countQuery += ` AND phone_from = $${countParamIndex}`;
      countParams.push(phone_from);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      calls: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logger.error('Error fetching calls', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// GET /api/calls/:id - Get single call with actions
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const call = await db.calls.getById(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Get associated actions
    const actions = await db.actions.getByCall(id);

    // Get extracted entities
    const entities = await db.entities.getByCall(id);

    res.json({
      call,
      actions,
      entities
    });

  } catch (error) {
    logger.error('Error fetching call', { 
      callId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch call' });
  }
});

// PATCH /api/calls/:id - Update call
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate allowed fields
    const allowedFields = ['resolved', 'transcript_full', 'recording_url'];
    const filteredUpdates = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updatedCall = await db.calls.update(id, filteredUpdates);

    if (!updatedCall) {
      return res.status(404).json({ error: 'Call not found' });
    }

    logger.info('Call updated', { callId: id, updates: filteredUpdates });

    res.json({ call: updatedCall });

  } catch (error) {
    logger.error('Error updating call', { 
      callId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to update call' });
  }
});

// GET /api/calls/:id/transcript - Get call transcript
router.get('/:id/transcript', async (req, res) => {
  try {
    const { id } = req.params;

    const call = await db.calls.getById(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({
      call_id: call.id,
      transcript: call.transcript_full,
      start_ts: call.start_ts,
      end_ts: call.end_ts
    });

  } catch (error) {
    logger.error('Error fetching transcript', { 
      callId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// GET /api/calls/:id/recording - Get recording URL
router.get('/:id/recording', async (req, res) => {
  try {
    const { id } = req.params;

    const call = await db.calls.getById(id);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (!call.recording_url) {
      return res.status(404).json({ error: 'Recording not available' });
    }

    res.json({
      call_id: call.id,
      recording_url: call.recording_url
    });

  } catch (error) {
    logger.error('Error fetching recording', { 
      callId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

module.exports = router;