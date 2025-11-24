// Backend/routes/clients.js - Client management for multi-tenancy
const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// GET /api/clients - List all clients (admin only)
router.get('/', async (req, res) => {
  try {
    const { active, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM clients WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (active !== undefined) {
      query += ` AND active = $${paramIndex}`;
      params.push(active === 'true');
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    res.json({
      clients: result.rows.map(c => ({
        ...c,
        // Don't expose sensitive keys in list
        shopify_api_secret: undefined,
        shiprocket_password: undefined
      })),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logger.error('Error fetching clients', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// POST /api/clients - Create new client
router.post('/', async (req, res) => {
  try {
    const {
      companyName,
      contactPerson,
      email,
      phone,
      shopifyStore,
      shopifyApiKey,
      shopifyApiSecret,
      exotelNumber,
      exotelSid,
      exotelToken,
      returnWindowDays = 14,
      refundAutoThreshold = 2000,
      cancelWindowHours = 24,
      enableWhatsApp = false,
      enableSMS = true,
      enableEmail = true
    } = req.body;

    // Validation
    if (!companyName || !email || !shopifyStore) {
      return res.status(400).json({ 
        error: 'Missing required fields: companyName, email, shopifyStore' 
      });
    }

    // Check if client already exists
    const existingClient = await db.query(
      'SELECT id FROM clients WHERE shopify_store_url = $1 OR email = $2',
      [shopifyStore, email]
    );

    if (existingClient.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Client with this Shopify store or email already exists' 
      });
    }

    // Create client
    const result = await db.query(
      `INSERT INTO clients (
        name, contact_person, email, phone,
        shopify_store_url, shopify_api_key, shopify_api_secret,
        exotel_number, exotel_sid, exotel_token,
        return_window_days, refund_auto_threshold, cancel_window_hours,
        enable_whatsapp, enable_sms, enable_email,
        active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true)
      RETURNING *`,
      [
        companyName, contactPerson, email, phone,
        shopifyStore, shopifyApiKey, shopifyApiSecret,
        exotelNumber, exotelSid, exotelToken,
        returnWindowDays, refundAutoThreshold, cancelWindowHours,
        enableWhatsApp, enableSMS, enableEmail
      ]
    );

    const client = result.rows[0];

    // Log audit event
    await db.auditLog({
      client_id: client.id,
      event_type: 'client_created',
      payload: { company_name: companyName, email },
      ip_address: req.ip
    });

    logger.info('Client created', { 
      clientId: client.id,
      companyName 
    });

    // Don't return sensitive data
    delete client.shopify_api_secret;
    delete client.exotel_token;

    res.status(201).json({ 
      client,
      message: 'Client created successfully' 
    });

  } catch (error) {
    logger.error('Error creating client', { error: error.message });
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// GET /api/clients/:id - Get single client
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const client = await db.clients.getById(id);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Don't expose API secrets
    delete client.shopify_api_secret;
    delete client.shiprocket_password;
    delete client.exotel_token;

    res.json({ client });

  } catch (error) {
    logger.error('Error fetching client', { 
      clientId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// PATCH /api/clients/:id - Update client
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Allowed fields to update
    const allowedFields = [
      'name', 'contact_person', 'email', 'phone',
      'shopify_store_url', 'shopify_api_key', 'shopify_api_secret',
      'exotel_number', 'exotel_sid', 'exotel_token',
      'return_window_days', 'refund_auto_threshold', 'cancel_window_hours',
      'enable_whatsapp', 'enable_sms', 'enable_email',
      'active'
    ];

    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);
    const result = await db.query(
      `UPDATE clients SET ${fields.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = result.rows[0];

    // Log audit event
    await db.auditLog({
      client_id: id,
      event_type: 'client_updated',
      payload: updates,
      ip_address: req.ip
    });

    logger.info('Client updated', { clientId: id, updates });

    // Don't return sensitive data
    delete client.shopify_api_secret;
    delete client.exotel_token;

    res.json({ client });

  } catch (error) {
    logger.error('Error updating client', { 
      clientId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id - Deactivate client (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'UPDATE clients SET active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Log audit event
    await db.auditLog({
      client_id: id,
      event_type: 'client_deactivated',
      payload: {},
      ip_address: req.ip
    });

    logger.info('Client deactivated', { clientId: id });

    res.json({ message: 'Client deactivated successfully' });

  } catch (error) {
    logger.error('Error deactivating client', { 
      clientId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to deactivate client' });
  }
});

// GET /api/clients/:id/stats - Get client statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;

    // Verify client exists
    const client = await db.clients.getById(id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    let whereClause = 'WHERE client_id = $1';
    const params = [id];
    let paramIndex = 2;

    if (start_date) {
      whereClause += ` AND start_ts >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereClause += ` AND start_ts <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    // Get call statistics
    const callStats = await db.query(
      `SELECT 
        COUNT(*) as total_calls,
        COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_calls,
        AVG(EXTRACT(EPOCH FROM (end_ts - start_ts))) as avg_duration
       FROM calls ${whereClause}`,
      params
    );

    // Get action breakdown
    const actionStats = await db.query(
      `SELECT 
        a.action_type,
        COUNT(*) as count,
        COUNT(CASE WHEN a.status = 'success' THEN 1 END) as success_count
       FROM actions a
       JOIN calls c ON a.call_id = c.id
       ${whereClause}
       GROUP BY a.action_type
       ORDER BY count DESC`,
      params
    );

    const stats = {
      total_calls: parseInt(callStats.rows[0].total_calls),
      resolved_calls: parseInt(callStats.rows[0].resolved_calls),
      automation_rate: callStats.rows[0].total_calls > 0 
        ? ((callStats.rows[0].resolved_calls / callStats.rows[0].total_calls) * 100).toFixed(2) + '%'
        : '0%',
      avg_handling_time: Math.round(callStats.rows[0].avg_duration || 0),
      actions_breakdown: actionStats.rows
    };

    res.json({ stats });

  } catch (error) {
    logger.error('Error fetching client stats', { 
      clientId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// POST /api/clients/:id/test-call - Initiate test call
router.post('/:id/test-call', async (req, res) => {
  try {
    const { id } = req.params;
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    const client = await db.clients.getById(id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // In production, integrate with Exotel API to initiate call
    // For now, create a test call record
    const testCall = await db.calls.create({
      client_id: id,
      call_sid: 'TEST_' + Date.now(),
      phone_from: phone_number,
      phone_to: client.exotel_number
    });

    logger.info('Test call initiated', { clientId: id, phone: phone_number });

    res.json({
      message: 'Test call initiated',
      call_id: testCall.id
    });

  } catch (error) {
    logger.error('Error initiating test call', { 
      clientId: req.params.id,
      error: error.message 
    });
    res.status(500).json({ error: 'Failed to initiate test call' });
  }
});

module.exports = router;