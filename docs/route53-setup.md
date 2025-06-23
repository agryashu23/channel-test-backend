# Route 53 Configuration Guide for Channels

## Current Setup
- Primary Domain: api.channels.social
- Regions: 
  - Mumbai (ap-south-1)
  - Tokyo (ap-northeast-1)

## Step 1: Create Health Checks

1. Go to Route 53 Console > Health checks
2. Create health check for Mumbai region:
   ```
   Name: mumbai-health
   Protocol: HTTPS
   Domain: api.channels.social
   Path: /health (or your health endpoint)
   Region: Mumbai
   ```

3. Create health check for Tokyo region:
   ```
   Name: tokyo-health
   Protocol: HTTPS
   Domain: api.channels.social
   Path: /health (or your health endpoint)
   Region: Tokyo
   ```

## Step 2: Create Record Sets

1. Go to Route 53 Console > Hosted zones > api.channels.social
2. Create records with geolocation routing:

### Mumbai Record
```
Record name: api.channels.social
Record type: A
Routing policy: Geolocation
Location: Asia/India, Sri Lanka, Bangladesh
Value: [Your Mumbai ALB DNS]
Set ID: mumbai-endpoint
Health check: mumbai-health
```

### Tokyo Record
```
Record name: api.channels.social
Record type: A
Routing policy: Geolocation
Location: Asia/Japan, Korea, China
Value: [Your Tokyo ALB DNS]
Set ID: tokyo-endpoint
Health check: tokyo-health
```

### Default Record (Important!)
```
Record name: api.channels.social
Record type: A
Routing policy: Geolocation
Location: Default (*)
Value: [Your Mumbai ALB DNS] (or Tokyo, whichever has better latency)
Set ID: default-endpoint
Health check: both-regions-health
```

## Step 3: Create Failover Setup

1. Create a health check that monitors both regions:
   ```
   Name: both-regions-health
   Type: CALCULATED
   Health check combines: mumbai-health AND tokyo-health
   ```

2. Set up failover between regions:
   - If Mumbai is down, route Asia traffic to Tokyo
   - If Tokyo is down, route Asia traffic to Mumbai

## Step 4: Testing

Test access from different locations:
1. From India: `curl -v https://api.channels.social/health`
2. From Japan: `curl -v https://api.channels.social/health`
3. From US: `curl -v https://api.channels.social/health`

## Important Notes

1. Always keep health checks enabled and monitored
2. Set up CloudWatch alarms for health check failures
3. Consider adding more regions (US region recommended) for better global coverage
4. Monitor latency from different regions

## Next Steps

1. Add a US region (recommended):
   - US East (N. Virginia) or US West (California)
   - This will significantly improve access from Florida and San Jose

2. Set up CloudFront:
   - Create a CloudFront distribution
   - Use your ALBs as origins
   - This will help reduce latency globally 