# Use an official Node.js image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the app
COPY . .

# Expose port and start the app
EXPOSE 3000
CMD ["npm", "run", "dev"]
