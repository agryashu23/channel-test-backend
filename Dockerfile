# Use a small, secure Node.js base image
FROM node:18-alpine

# Install ffmpeg and bash
RUN apk add --no-cache ffmpeg bash

# Set working directory inside the container
WORKDIR /app

# Copy dependency files first to leverage Docker cache
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of your app's code
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
