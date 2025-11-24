// agents/orchestrator.js - Agent orchestration system
const logger = require('../utils/logger');
const EventEmitter = require('events');

// Import all agents
const OrderLookupAgent = require('./types/OrderLookupAgent');
const ReturnAgent = require('./types/ReturnAgent');
const { RefundAgent, CancelOrderAgent, TrackingAgent, ComplaintAgent } = require('./types/RefundAgent');

class AgentOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.activeAgents = new Map(); // callId -> { agent, state, startTime }
    this.agentRegistry = this.registerAgents();
  }

  /**
   * Register all available agents
   */
  registerAgents() {
    return {
      OrderLookupAgent,
      ReturnAgent,
      RefundAgent,
      CancelOrderAgent,
      TrackingAgent,
      ComplaintAgent
      // Add more as we build them
    };
  }

  /**
   * Launch an agent for a call
   * @param {string} callId - Call identifier
   * @param {string} agentType - Type of agent to launch
   * @param {object} initialData - Initial data for agent
   */
  async launchAgent(callId, agentType, initialData = {}) {
    try {
      // Check if agent already active for this call
      if (this.activeAgents.has(callId)) {
        const existing = this.activeAgents.get(callId);
        
        // If same agent type, update it
        if (existing.agent.constructor.name === agentType) {
          logger.info('Updating existing agent', { callId, agentType });
          existing.agent.updateData(initialData);
          return existing.agent;
        }
        
        // If different agent, cancel old one
        logger.info('Cancelling previous agent, launching new', { 
          callId, 
          oldAgent: existing.agent.constructor.name,
          newAgent: agentType 
        });
        await this.cancelAgent(callId);
      }

      // Get agent class
      const AgentClass = this.agentRegistry[agentType];
      
      if (!AgentClass) {
        logger.error('Unknown agent type', { agentType });
        throw new Error(`Unknown agent type: ${agentType}`);
      }

      // Create agent instance
      const agent = new AgentClass(callId, initialData);

      // Store agent
      this.activeAgents.set(callId, {
        agent,
        agentType,
        state: 'RUNNING',
        startTime: Date.now()
      });

      logger.info('Agent launched', { 
        callId, 
        agentType,
        initialData 
      });

      // Setup agent event handlers
      this.setupAgentHandlers(callId, agent);

      // Execute agent asynchronously
      this.executeAgent(callId, agent);

      return agent;

    } catch (error) {
      logger.error('Error launching agent', { 
        callId,
        agentType,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Setup event handlers for agent
   */
  setupAgentHandlers(callId, agent) {
    // Agent needs more info
    agent.on('need_info', (data) => {
      logger.info('Agent needs more info', { 
        callId,
        needed: data.field,
        prompt: data.prompt 
      });
      
      // Emit to session manager to update AI context
      this.emit('agent_needs_info', {
        callId,
        field: data.field,
        prompt: data.prompt
      });
    });

    // Agent completed
    agent.on('completed', (result) => {
      logger.info('Agent completed', { 
        callId,
        agentType: agent.constructor.name,
        duration: Date.now() - this.activeAgents.get(callId).startTime
      });

      // Update state
      const agentData = this.activeAgents.get(callId);
      if (agentData) {
        agentData.state = 'COMPLETED';
      }

      // Emit result
      this.emit('agent_completed', {
        callId,
        agentType: agent.constructor.name,
        result
      });
    });

    // Agent error
    agent.on('error', (error) => {
      logger.error('Agent error', { 
        callId,
        agentType: agent.constructor.name,
        error: error.message 
      });

      // Update state
      const agentData = this.activeAgents.get(callId);
      if (agentData) {
        agentData.state = 'ERROR';
      }

      // Emit error
      this.emit('agent_error', {
        callId,
        agentType: agent.constructor.name,
        error
      });
    });
  }

  /**
   * Execute agent asynchronously
   */
  async executeAgent(callId, agent) {
    try {
      // Agent runs in background
      await agent.execute();
      
    } catch (error) {
      logger.error('Agent execution failed', { 
        callId,
        error: error.message 
      });
      
      // Emit error event
      agent.emit('error', error);
    }
  }

  /**
   * Update agent with new data (e.g., user provided order_id)
   * @param {string} callId - Call identifier
   * @param {object} data - New data to provide to agent
   */
  updateAgent(callId, data) {
    const agentData = this.activeAgents.get(callId);
    
    if (!agentData) {
      logger.warn('No active agent to update', { callId });
      return false;
    }

    const agent = agentData.agent;

    logger.info('Updating agent with new data', { 
      callId,
      agentType: agent.constructor.name,
      data 
    });

    // Pass data to agent
    agent.updateData(data);

    return true;
  }

  /**
   * Cancel active agent for a call
   * @param {string} callId - Call identifier
   */
  async cancelAgent(callId) {
    const agentData = this.activeAgents.get(callId);
    
    if (!agentData) {
      logger.debug('No active agent to cancel', { callId });
      return;
    }

    const agent = agentData.agent;

    logger.info('Cancelling agent', { 
      callId,
      agentType: agent.constructor.name 
    });

    try {
      // Call agent's cancel method
      await agent.cancel();
      
      // Update state
      agentData.state = 'CANCELLED';

      // Emit event
      this.emit('agent_cancelled', {
        callId,
        agentType: agent.constructor.name
      });

      // Remove from active agents
      this.activeAgents.delete(callId);

    } catch (error) {
      logger.error('Error cancelling agent', { 
        callId,
        error: error.message 
      });
    }
  }

  /**
   * Get active agent for a call
   */
  getAgent(callId) {
    const agentData = this.activeAgents.get(callId);
    return agentData ? agentData.agent : null;
  }

  /**
   * Get agent state
   */
  getAgentState(callId) {
    const agentData = this.activeAgents.get(callId);
    return agentData ? {
      agentType: agentData.agentType,
      state: agentData.state,
      startTime: agentData.startTime,
      duration: Date.now() - agentData.startTime
    } : null;
  }

  /**
   * Check if agent is active for call
   */
  hasActiveAgent(callId) {
    return this.activeAgents.has(callId);
  }

  /**
   * Get all active agents
   */
  getAllActiveAgents() {
    const active = [];
    for (const [callId, agentData] of this.activeAgents) {
      active.push({
        callId,
        agentType: agentData.agentType,
        state: agentData.state,
        duration: Date.now() - agentData.startTime
      });
    }
    return active;
  }

  /**
   * Cleanup completed agents (call this periodically)
   */
  cleanup() {
    const now = Date.now();
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes

    for (const [callId, agentData] of this.activeAgents) {
      if (agentData.state === 'COMPLETED' || agentData.state === 'ERROR') {
        const age = now - agentData.startTime;
        if (age > MAX_AGE) {
          logger.debug('Cleaning up old agent', { 
            callId,
            agentType: agentData.agentType,
            age 
          });
          this.activeAgents.delete(callId);
        }
      }
    }
  }
}

// Singleton instance
const orchestrator = new AgentOrchestrator();

// Cleanup every 2 minutes
setInterval(() => {
  orchestrator.cleanup();
}, 2 * 60 * 1000);

module.exports = orchestrator;
