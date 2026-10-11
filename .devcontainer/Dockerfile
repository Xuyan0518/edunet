# Same Node/Alpine runtime family as the standalone Docker image.
FROM node:22-alpine
RUN apk add --no-cache bash git openssh-client
WORKDIR /app
# VS Code stays open when the foreground development servers are stopped.
CMD ["sleep", "infinity"]
