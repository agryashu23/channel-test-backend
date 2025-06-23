# chips-demo-server

# API Documentation

## User/Add Endpoint

### Description
This endpoint is used to add a new user.

#### Endpoint

#### Request
- **Method:** POST
- **Content Type:** application/json
- **Body:**
  ```json
  {
    "username": "example_user",
    "email": "user@example.com",
    "password": "securepassword"
  }

# Add/Curation Endpoint

## Description
This endpoint is used to add a new curation to the system. A "curation" typically refers to a curated collection of items, such as products, articles, or any other type of content.

### Endpoint

### Request
- **Method:** POST
- **Content Type:** application/json
- **Body:**
  ```json
  {
    "name": "New Curation",
    "description": "A curated collection of items."
  }

# Add Chip to Curation Endpoint

## Description
This endpoint is responsible for adding a chip to an existing curation. It links a specific chip, identified by its ID, to a curation, also identified by its ID. This is typically used in systems managing collections or inventories where items (chips) need to be assigned or categorized under specific curations.

### Endpoint

### Request
- **Method:** POST
- **Content Type:** application/json
- **Body:**
  ```json
  {
    "userId": "123456",
    "curationId": "789012",
    "chipId": "345678",
    "quantity": 2
  }

# Fetch Curations Endpoint

## Description
This endpoint retrieves a list of all curations available in the system. Curations represent curated collections of items, and this endpoint allows clients to obtain information about these collections.

### Endpoint

### Response
- **Status Code:** 200 OK
- **Body:**
  ```json
  {
    "curations": [
      {
        "curationId": "789012",
        "name": "Tech Gadgets",
        "description": "A curated collection of the latest tech gadgets."
      },
      {
        "curationId": "345678",
        "name": "Healthy Recipes",
        "description": "A curated collection of nutritious and delicious recipes."
      },
    ]
  }

# Fetch Chips by Curation ID Endpoint

## Description
This endpoint retrieves details about chips associated with a specific curation. It allows clients to view the items (chips) within a particular curated collection.

### Endpoint


### Request
- **Method:** GET

### Response
- **Status Code:** 200 OK
- **Body:**
  ```json
  {
    "chipId": "123456",
    "name": "Smartphone X",
    "description": "The latest smartphone with advanced features.",
    "quantity": 5
  },
  {
    "chipId": "789012",
    "name": "Healthy Snack Bars",
    "description": "Nutritious snack bars for a quick energy boost.",
    "quantity": 10
  },

# Distributed Chat System Setup

This guide explains how to set up the distributed chat system across multiple AWS regions.

## Architecture Overview

The system uses:
- Multiple EC2 instances across regions
- Redis for distributed caching
- RabbitMQ for message queuing
- Application Load Balancers (ALB)
- Route 53 for DNS routing

## Prerequisites

1. AWS Account with access to:
   - EC2
   - ElastiCache (Redis)
   - Amazon MQ (RabbitMQ)
   - Route 53
   - Application Load Balancer

2. Domain name registered in Route 53

## Environment Variables

Create a `.env` file in each region with these variables:

```env
# Application
NODE_ENV=production
PORT=3000

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://api-us-east-1.yourdomain.com,https://api-eu-west-1.yourdomain.com

# Redis Configuration
REDIS_PRIMARY_HOST=your-redis-primary.xxxxx.ng.0001.use1.cache.amazonaws.com
REDIS_PRIMARY_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_REPLICAS=[{"host":"replica1.xxxxx.0001.use1.cache.amazonaws.com","port":6379}]

# RabbitMQ Configuration
RABBITMQ_URLS=amqp://user:pass@rabbitmq1.internal:5672,amqp://user:pass@rabbitmq2.internal:5672

# AWS Configuration
AWS_REGION=us-east-1  # Change per region
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_ENDPOINTS=[{"region":"us-east-1","endpoint":"api-us-east-1.yourdomain.com"},{"region":"eu-west-1","endpoint":"api-eu-west-1.yourdomain.com"}]
ROUTE53_HOSTED_ZONE_ID=your-hosted-zone-id
DOMAIN_NAME=yourdomain.com
```

## Setup Steps

1. **Set up EC2 instances in each region**
   ```bash
   # Install Node.js, npm, and PM2
   curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   
   # Clone and setup application
   git clone your-repo-url
   cd your-repo
   npm install
   ```

2. **Set up Redis Cluster**
   - Create an ElastiCache Redis cluster in your primary region
   - Create read replicas in other regions
   - Update REDIS_* environment variables

3. **Set up RabbitMQ**
   - Create Amazon MQ brokers in each region
   - Configure them in a cluster
   - Update RABBITMQ_URLS in environment variables

4. **Configure Load Balancers**
   - Create an Application Load Balancer in each region
   - Configure health checks
   - Set up SSL certificates
   - Configure security groups

5. **Route 53 Setup**
   - Create a geolocation routing policy
   - Add A records for each regional endpoint
   - Configure health checks

6. **Start the Application**
   ```bash
   pm2 start app.js --name "chat-backend"
   pm2 save
   ```

## Testing

1. Test CORS:
   ```bash
   curl -X OPTIONS -H "Origin: https://yourdomain.com" \
        -H "Access-Control-Request-Method: POST" \
        https://api-us-east-1.yourdomain.com/api/chat
   ```

2. Test Redis:
   ```bash
   # Using redis-cli
   redis-cli -h your-redis-host -p 6379 ping
   ```

3. Test RabbitMQ:
   ```bash
   # Check RabbitMQ management console
   https://rabbitmq-console.yourdomain.com
   ```

## Monitoring

1. Use CloudWatch for monitoring:
   - EC2 metrics
   - Redis metrics
   - RabbitMQ metrics
   - Load Balancer metrics

2. Set up alarms for:
   - High CPU usage
   - Memory usage
   - Network latency
   - Error rates

## Troubleshooting

1. CORS Issues:
   - Check ALLOWED_ORIGINS in environment variables
   - Verify SSL certificates
   - Check browser console for specific CORS errors

2. Redis Connection Issues:
   - Verify security group rules
   - Check Redis cluster status
   - Verify credentials

3. RabbitMQ Issues:
   - Check cluster status
   - Verify network connectivity
   - Check queue lengths and memory usage

## Security Considerations

1. Always use HTTPS
2. Keep API keys and secrets secure
3. Implement rate limiting
4. Use security groups to restrict access
5. Regularly update dependencies
6. Monitor for suspicious activities

## Scaling

1. Horizontal Scaling:
   - Add more EC2 instances
   - Update load balancer target groups

2. Vertical Scaling:
   - Upgrade EC2 instance types
   - Increase Redis/RabbitMQ capacity

3. Geographic Scaling:
   - Add new regions
   - Update Route 53 policies
   - Add regional Redis replicas

  
