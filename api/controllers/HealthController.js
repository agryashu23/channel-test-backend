const AWS = require('aws-sdk');
const axios = require('axios');
const redisService = require('../services/redisService');
const rabbitmqService = require('../services/rabbitmqService');

async function getInstanceRegion() {
    try {
        const response = await axios.get('http://169.254.169.254/latest/meta-data/placement/region', {
            timeout: 2000 // 2 second timeout
        });
        return response.data;
    } catch (error) {
        return process.env.AWS_REGION || 'unknown';
    }
}

exports.check = async function (req, res) {
    try {
        const region = await getInstanceRegion();
        const hostname = require('os').hostname();

        return res.status(200).json({
            status: 'healthy',
            region: region,
            hostname: hostname,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'dev'
        });
    } catch (error) {
        return res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
};

exports.health_check = async function (req, res) {
  try {
    const redisStatus = await redisService.ping();
    const rabbitmqStatus = await rabbitmqService.checkConnection();
    
    res.json({
      success: true,
      services: {
        redis: redisStatus ? 'connected' : 'disconnected',
        rabbitmq: rabbitmqStatus ? 'connected' : 'disconnected'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
}; 