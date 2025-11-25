// Backend/services/wasabiStorage.js - Wasabi S3-Compatible Storage for Call Recordings
const AWS = require('aws-sdk');
const logger = require('../utils/logger');

class WasabiStorage {
  constructor() {
    if (process.env.WASABI_ENABLED === 'true') {
      this.s3 = new AWS.S3({
        accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
        secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
        endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
        region: process.env.WASABI_REGION || 'us-east-1',
        s3ForcePathStyle: true
      });
      this.bucketName = process.env.WASABI_BUCKET_NAME || 'caly-call-recordings';
      this.publicUrl = process.env.WASABI_PUBLIC_URL || 'https://caly-call-recordings.s3.wasabisys.com';
      this.enabled = true;
      logger.info('Wasabi storage initialized', { bucket: this.bucketName });
    } else {
      this.enabled = false;
      logger.warn('Wasabi storage disabled - call recordings will not be saved');
    }
  }

  /**
   * Upload call recording to Wasabi
   * @param {string} callId - Call ID
   * @param {Buffer|Stream} audioBuffer - Audio file buffer
   * @param {string} format - Audio format (mp3, wav, etc.)
   * @returns {Promise<string>} - Public URL of uploaded file
   */
  async uploadCallRecording(callId, audioBuffer, format = 'mp3') {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - recording not uploaded', { callId });
      return null;
    }

    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `recordings/${timestamp}/${callId}.${format}`;

      logger.info('Uploading call recording to Wasabi', { 
        callId, 
        fileName,
        size: audioBuffer.length 
      });

      const params = {
        Bucket: this.bucketName,
        Key: fileName,
        Body: audioBuffer,
        ContentType: `audio/${format}`,
        Metadata: {
          'call-id': callId,
          'uploaded-at': new Date().toISOString()
        }
      };

      const result = await this.s3.upload(params).promise();
      const publicUrl = `${this.publicUrl}/${fileName}`;
      
      logger.info('Call recording uploaded to Wasabi', { 
        callId, 
        url: publicUrl
      });

      return publicUrl;
    } catch (error) {
      logger.error('Failed to upload call recording to Wasabi', {
        callId,
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Download call recording from Wasabi
   * @param {string} recordingUrl - Full URL of recording
   * @returns {Promise<Buffer>} - Audio buffer
   */
  async downloadCallRecording(recordingUrl) {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - cannot download recording');
      return null;
    }

    try {
      const key = recordingUrl.replace(`${this.publicUrl}/`, '');
      logger.info('Downloading call recording from Wasabi', { key });

      const params = {
        Bucket: this.bucketName,
        Key: key
      };

      const data = await this.s3.getObject(params).promise();
      return data.Body;
    } catch (error) {
      logger.error('Failed to download call recording from Wasabi', {
        url: recordingUrl,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get pre-signed URL for sharing
   * @param {string} recordingUrl - Recording URL
   * @param {number} expirationSeconds - URL expiration time (default 3600 = 1 hour)
   * @returns {Promise<string>} - Pre-signed URL
   */
  async getPreSignedUrl(recordingUrl, expirationSeconds = 3600) {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - cannot generate pre-signed URL');
      return recordingUrl;
    }

    try {
      const key = recordingUrl.replace(`${this.publicUrl}/`, '');
      logger.info('Generating pre-signed URL for recording', { key });

      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expirationSeconds
      };

      const preSignedUrl = await this.s3.getSignedUrlPromise('getObject', params);
      return preSignedUrl;
    } catch (error) {
      logger.error('Failed to generate pre-signed URL', {
        url: recordingUrl,
        error: error.message
      });
      return recordingUrl;
    }
  }

  /**
   * Delete call recording from Wasabi
   * @param {string} recordingUrl - Recording URL
   * @returns {Promise<boolean>} - Success status
   */
  async deleteCallRecording(recordingUrl) {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - cannot delete recording');
      return false;
    }

    try {
      const key = recordingUrl.replace(`${this.publicUrl}/`, '');
      logger.info('Deleting call recording from Wasabi', { key });

      const params = {
        Bucket: this.bucketName,
        Key: key
      };

      await this.s3.deleteObject(params).promise();
      logger.info('Call recording deleted from Wasabi', { key });
      return true;
    } catch (error) {
      logger.error('Failed to delete call recording from Wasabi', {
        url: recordingUrl,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List all recordings for a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} - List of recordings
   */
  async listRecordings(startDate, endDate) {
    if (!this.enabled) {
      logger.warn('Wasabi disabled - cannot list recordings');
      return [];
    }

    try {
      logger.info('Listing call recordings from Wasabi', { startDate, endDate });

      const params = {
        Bucket: this.bucketName,
        Prefix: 'recordings/'
      };

      const data = await this.s3.listObjectsV2(params).promise();
      
      const recordings = data.Contents
        ?.filter(obj => {
          const dateMatch = obj.Key.match(/recordings\/(\d{4}-\d{2}-\d{2})/);
          if (!dateMatch) return false;
          const date = dateMatch[1];
          return date >= startDate && date <= endDate;
        })
        .map(obj => ({
          key: obj.Key,
          url: `${this.publicUrl}/${obj.Key}`,
          size: obj.Size,
          uploadedAt: obj.LastModified
        })) || [];

      logger.info('Found recordings in Wasabi', { count: recordings.length });
      return recordings;
    } catch (error) {
      logger.error('Failed to list recordings from Wasabi', {
        startDate,
        endDate,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get storage stats
   * @returns {Promise<Object>} - Storage usage information
   */
  async getStorageStats() {
    if (!this.enabled) {
      return { enabled: false, message: 'Wasabi storage disabled' };
    }

    try {
      logger.info('Getting Wasabi storage stats');

      const params = {
        Bucket: this.bucketName,
        Prefix: 'recordings/'
      };

      const data = await this.s3.listObjectsV2(params).promise();
      
      const totalSize = data.Contents?.reduce((sum, obj) => sum + obj.Size, 0) || 0;
      const fileCount = data.Contents?.length || 0;

      const stats = {
        bucket: this.bucketName,
        fileCount,
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        totalSizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2)
      };

      logger.info('Wasabi storage stats', stats);
      return stats;
    } catch (error) {
      logger.error('Failed to get Wasabi storage stats', {
        error: error.message
      });
      return { error: error.message };
    }
  }
}

module.exports = new WasabiStorage();
