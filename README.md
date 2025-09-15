# WebSim AI Tutorial Master

An advanced AI-powered system that learns how to use WebSim.com by analyzing screenshots and controlling a browser instance to create comprehensive tutorials.

## Features

- **AI-Powered Learning**: Uses vision AI to analyze WebSim screenshots and understand the interface
- **Browser Automation**: Controls a real browser instance to interact with WebSim
- **Text-to-Speech**: AI speaks its thoughts and explanations during the learning process
- **Database Storage**: Stores learnings, UI patterns, and tutorial steps for future reference
- **Dual Mode Operation**: Works with both image analysis and text-based content analysis
- **Real-time Communication**: WebSocket connection between frontend and Node.js server

## Setup Instructions

### 1. Download and Setup Server

1. Click "Download Server Code" in the interface to get the Node.js server file
2. Create a new directory for the server: `mkdir websim-tutorial-server && cd websim-tutorial-server`
3. Save the downloaded file as `websim-tutorial-server.js`
4. Copy the `package.json` file contents and save as `package.json`
5. Install dependencies: `npm install`

### 2. Start the Server

```bash
npm start

