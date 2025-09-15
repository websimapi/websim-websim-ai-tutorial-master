import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { WebsimSocket, useQuery } from "@websim/use-query";
const room = new WebsimSocket();
function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [imageMode, setImageMode] = useState(true);
  const [serverUrl, setServerUrl] = useState("ws://localhost:8080");
  const [lastScreenshot, setLastScreenshot] = useState(null);
  const [aiThoughts, setAiThoughts] = useState("");
  const [learningProgress, setLearningProgress] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const wsRef = useRef(null);
  const conversationHistory = useRef([]);
  const { data: tutorials = [], loading } = useQuery(room.collection("tutorial_steps"));
  const { data: learnings = [] } = useQuery(room.collection("ai_learnings"));
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);
  const connectToServer = async () => {
    try {
      wsRef.current = new WebSocket(serverUrl);
      wsRef.current.onopen = () => {
        setIsConnected(true);
        console.log("Connected to Node.js server");
      };
      wsRef.current.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "screenshot") {
          setLastScreenshot(data.image);
          if (isLearning) {
            await analyzeScreenshot(data.image, data.url, data.pageText);
          }
        } else if (data.type === "pageText") {
          if (isLearning && !imageMode) {
            await analyzePageText(data.text, data.url);
          }
        }
      };
      wsRef.current.onclose = () => {
        setIsConnected(false);
        console.log("Disconnected from server");
      };
      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };
  const analyzeScreenshot = async (imageData, currentUrl, pageText) => {
    try {
      setCurrentStep("Analyzing current page...");
      const messages = [
        {
          role: "system",
          content: `You are an AI learning to use WebSim.com. Your goal is to understand the interface and create comprehensive tutorials.
                    
                    Current context:
                    - URL: ${currentUrl}
                    - Page text: ${pageText?.substring(0, 500)}...
                    
                    Analyze the screenshot and determine:
                    1. What page/section this is
                    2. What interactive elements you see
                    3. What the next logical step should be
                    4. Any new UI patterns you've discovered
                    
                    Respond with JSON containing:
                    {
                        "pageType": "string",
                        "elements": ["array of UI elements seen"],
                        "nextAction": "description of what to do next",
                        "thoughts": "what you're thinking about this page",
                        "shouldSpeak": true/false,
                        "speechText": "what to say if shouldSpeak is true",
                        "clickTarget": "CSS selector or description of what to click, or null"
                    }`
        },
        ...conversationHistory.current.slice(-5),
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this WebSim screenshot and tell me what you see and what we should do next." },
            { type: "image_url", image_url: { url: imageData } }
          ]
        }
      ];
      const completion = await websim.chat.completions.create({
        messages,
        json: true
      });
      const analysis = JSON.parse(completion.content);
      await room.collection("ai_learnings").create({
        page_type: analysis.pageType,
        url: currentUrl,
        elements: analysis.elements,
        thoughts: analysis.thoughts,
        screenshot_url: imageData,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      setAiThoughts(analysis.thoughts);
      setCurrentStep(analysis.nextAction);
      if (analysis.shouldSpeak && analysis.speechText) {
        await speakText(analysis.speechText);
      }
      if (analysis.clickTarget && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: "click",
          target: analysis.clickTarget
        }));
      }
      conversationHistory.current.push({
        role: "assistant",
        content: analysis.thoughts
      });
      setLearningProgress((prev) => Math.min(prev + 1, 100));
    } catch (error) {
      console.error("Analysis failed:", error);
      setCurrentStep("Analysis failed, retrying...");
    }
  };
  const analyzePageText = async (pageText, currentUrl) => {
    try {
      setCurrentStep("Analyzing page content...");
      const messages = [
        {
          role: "system",
          content: `You are learning WebSim.com. Analyze this page text and determine what to do next.
                    
                    URL: ${currentUrl}
                    
                    Respond with JSON:
                    {
                        "pageType": "string",
                        "mainContent": "summary of main content",
                        "interactiveElements": ["list of buttons, links, forms etc"],
                        "nextAction": "what to do next",
                        "thoughts": "your analysis",
                        "shouldSpeak": true/false,
                        "speechText": "what to say",
                        "actionType": "click|navigate|type",
                        "actionTarget": "what to interact with"
                    }`
        },
        {
          role: "user",
          content: `Page text: ${pageText}`
        }
      ];
      const completion = await websim.chat.completions.create({
        messages,
        json: true
      });
      const analysis = JSON.parse(completion.content);
      await room.collection("ai_learnings").create({
        page_type: analysis.pageType,
        url: currentUrl,
        content_summary: analysis.mainContent,
        interactive_elements: analysis.interactiveElements,
        thoughts: analysis.thoughts,
        mode: "text",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      setAiThoughts(analysis.thoughts);
      setCurrentStep(analysis.nextAction);
      if (analysis.shouldSpeak && analysis.speechText) {
        await speakText(analysis.speechText);
      }
      if (analysis.actionTarget && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: analysis.actionType,
          target: analysis.actionTarget
        }));
      }
    } catch (error) {
      console.error("Text analysis failed:", error);
    }
  };
  const speakText = async (text) => {
    try {
      setIsSpeaking(true);
      const result = await websim.textToSpeech({
        text,
        voice: "en-female"
      });
      const audio = new Audio(result.url);
      audio.onended = () => setIsSpeaking(false);
      await audio.play();
    } catch (error) {
      console.error("TTS failed:", error);
      setIsSpeaking(false);
    }
  };
  const startLearning = () => {
    setIsLearning(true);
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: "startCapture",
        imageMode
      }));
    }
  };
  const stopLearning = () => {
    setIsLearning(false);
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: "stopCapture"
      }));
    }
  };
  const downloadServerCode = () => {
    const serverCode = generateServerCode();
    const blob = new Blob([serverCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "websim-tutorial-server.js";
    a.click();
    URL.revokeObjectURL(url);
  };
  return /* @__PURE__ */ jsxDEV("div", { className: "min-h-screen bg-gray-900 text-white", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "gradient-bg p-6", children: [
      /* @__PURE__ */ jsxDEV("h1", { className: "text-4xl font-bold mb-2", children: "WebSim AI Tutorial Master" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 274,
        columnNumber: 17
      }, this),
      /* @__PURE__ */ jsxDEV("p", { className: "text-lg opacity-90", children: "AI-powered learning system for WebSim.com" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 275,
        columnNumber: 17
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 273,
      columnNumber: 13
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "container mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "lg:col-span-1 space-y-6", children: [
        /* @__PURE__ */ jsxDEV("div", { className: "bg-gray-800 p-6 rounded-lg", children: [
          /* @__PURE__ */ jsxDEV("h2", { className: "text-xl font-bold mb-4", children: "Control Panel" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 282,
            columnNumber: 25
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDEV("label", { className: "block text-sm font-medium mb-2", children: "Server URL" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 286,
                columnNumber: 33
              }, this),
              /* @__PURE__ */ jsxDEV(
                "input",
                {
                  type: "text",
                  value: serverUrl,
                  onChange: (e) => setServerUrl(e.target.value),
                  className: "w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500",
                  placeholder: "ws://localhost:8080"
                },
                void 0,
                false,
                {
                  fileName: "<stdin>",
                  lineNumber: 287,
                  columnNumber: 33
                },
                this
              )
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 285,
              columnNumber: 29
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "flex items-center space-x-2", children: [
              /* @__PURE__ */ jsxDEV(
                "input",
                {
                  type: "checkbox",
                  id: "imageMode",
                  checked: imageMode,
                  onChange: (e) => setImageMode(e.target.checked),
                  className: "rounded"
                },
                void 0,
                false,
                {
                  fileName: "<stdin>",
                  lineNumber: 297,
                  columnNumber: 33
                },
                this
              ),
              /* @__PURE__ */ jsxDEV("label", { htmlFor: "imageMode", children: "Image Mode (screenshots)" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 304,
                columnNumber: 33
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 296,
              columnNumber: 29
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "flex space-x-2", children: !isConnected ? /* @__PURE__ */ jsxDEV(
              "button",
              {
                onClick: connectToServer,
                className: "flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium",
                children: "Connect"
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 309,
                columnNumber: 37
              },
              this
            ) : /* @__PURE__ */ jsxDEV(Fragment, { children: !isLearning ? /* @__PURE__ */ jsxDEV(
              "button",
              {
                onClick: startLearning,
                className: "flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium",
                children: "Start Learning"
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 318,
                columnNumber: 45
              },
              this
            ) : /* @__PURE__ */ jsxDEV(
              "button",
              {
                onClick: stopLearning,
                className: "flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-medium",
                children: "Stop Learning"
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 325,
                columnNumber: 45
              },
              this
            ) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 316,
              columnNumber: 37
            }, this) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 307,
              columnNumber: 29
            }, this),
            /* @__PURE__ */ jsxDEV(
              "button",
              {
                onClick: downloadServerCode,
                className: "w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-medium",
                children: "Download Server Code"
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 336,
                columnNumber: 29
              },
              this
            )
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 284,
            columnNumber: 25
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "mt-4", children: [
            /* @__PURE__ */ jsxDEV("div", { className: `flex items-center space-x-2 ${isConnected ? "text-green-400" : "text-red-400"}`, children: [
              /* @__PURE__ */ jsxDEV("div", { className: `w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}` }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 346,
                columnNumber: 33
              }, this),
              /* @__PURE__ */ jsxDEV("span", { children: isConnected ? "Connected" : "Disconnected" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 347,
                columnNumber: 33
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 345,
              columnNumber: 29
            }, this),
            isSpeaking && /* @__PURE__ */ jsxDEV("div", { className: "flex items-center space-x-2 text-blue-400 mt-2", children: [
              /* @__PURE__ */ jsxDEV("div", { className: "w-2 h-2 rounded-full bg-blue-400 ai-thinking" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 352,
                columnNumber: 37
              }, this),
              /* @__PURE__ */ jsxDEV("span", { children: "AI Speaking..." }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 353,
                columnNumber: 37
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 351,
              columnNumber: 33
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 344,
            columnNumber: 25
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 281,
          columnNumber: 21
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "bg-gray-800 p-6 rounded-lg", children: [
          /* @__PURE__ */ jsxDEV("h3", { className: "text-lg font-bold mb-3", children: "AI Status" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 361,
            columnNumber: 25
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDEV("span", { className: "text-sm text-gray-400", children: "Current Step:" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 364,
                columnNumber: 33
              }, this),
              /* @__PURE__ */ jsxDEV("p", { className: "text-sm", children: currentStep || "Waiting..." }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 365,
                columnNumber: 33
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 363,
              columnNumber: 29
            }, this),
            /* @__PURE__ */ jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDEV("span", { className: "text-sm text-gray-400", children: "Learning Progress:" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 368,
                columnNumber: 33
              }, this),
              /* @__PURE__ */ jsxDEV("div", { className: "w-full bg-gray-700 rounded-full h-2 mt-1", children: /* @__PURE__ */ jsxDEV(
                "div",
                {
                  className: "bg-blue-600 h-2 rounded-full transition-all duration-300",
                  style: { width: `${learningProgress}%` }
                },
                void 0,
                false,
                {
                  fileName: "<stdin>",
                  lineNumber: 370,
                  columnNumber: 37
                },
                this
              ) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 369,
                columnNumber: 33
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 367,
              columnNumber: 29
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 362,
            columnNumber: 25
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 360,
          columnNumber: 21
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 280,
        columnNumber: 17
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "lg:col-span-2 space-y-6", children: [
        aiThoughts && /* @__PURE__ */ jsxDEV("div", { className: "bg-gray-800 p-6 rounded-lg", children: [
          /* @__PURE__ */ jsxDEV("h3", { className: "text-lg font-bold mb-3", children: "AI Thoughts" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 385,
            columnNumber: 29
          }, this),
          /* @__PURE__ */ jsxDEV("p", { className: "text-gray-300", children: aiThoughts }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 386,
            columnNumber: 29
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 384,
          columnNumber: 25
        }, this),
        lastScreenshot && /* @__PURE__ */ jsxDEV("div", { className: "bg-gray-800 p-6 rounded-lg", children: [
          /* @__PURE__ */ jsxDEV("h3", { className: "text-lg font-bold mb-3", children: "Current View" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 393,
            columnNumber: 29
          }, this),
          /* @__PURE__ */ jsxDEV(
            "img",
            {
              src: lastScreenshot,
              alt: "WebSim Screenshot",
              className: "w-full rounded border border-gray-600"
            },
            void 0,
            false,
            {
              fileName: "<stdin>",
              lineNumber: 394,
              columnNumber: 29
            },
            this
          )
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 392,
          columnNumber: 25
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "bg-gray-800 p-6 rounded-lg", children: [
          /* @__PURE__ */ jsxDEV("h3", { className: "text-lg font-bold mb-3", children: "Recent Learnings" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 404,
            columnNumber: 25
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "space-y-3 max-h-64 overflow-y-auto", children: learnings.slice(-10).reverse().map((learning) => /* @__PURE__ */ jsxDEV("div", { className: "bg-gray-700 p-3 rounded", children: [
            /* @__PURE__ */ jsxDEV("div", { className: "flex justify-between items-start mb-2", children: [
              /* @__PURE__ */ jsxDEV("span", { className: "text-sm font-medium text-blue-400", children: learning.page_type }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 409,
                columnNumber: 41
              }, this),
              /* @__PURE__ */ jsxDEV("span", { className: "text-xs text-gray-400", children: new Date(learning.created_at).toLocaleTimeString() }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 412,
                columnNumber: 41
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 408,
              columnNumber: 37
            }, this),
            /* @__PURE__ */ jsxDEV("p", { className: "text-sm text-gray-300", children: learning.thoughts }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 416,
              columnNumber: 37
            }, this),
            learning.elements && /* @__PURE__ */ jsxDEV("div", { className: "mt-2", children: [
              /* @__PURE__ */ jsxDEV("span", { className: "text-xs text-gray-400", children: "Elements found: " }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 419,
                columnNumber: 45
              }, this),
              /* @__PURE__ */ jsxDEV("span", { className: "text-xs", children: learning.elements.join(", ") }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 420,
                columnNumber: 45
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 418,
              columnNumber: 41
            }, this)
          ] }, learning.id, true, {
            fileName: "<stdin>",
            lineNumber: 407,
            columnNumber: 33
          }, this)) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 405,
            columnNumber: 25
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 403,
          columnNumber: 21
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 381,
        columnNumber: 17
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 278,
      columnNumber: 13
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 271,
    columnNumber: 9
  }, this);
}
function generateServerCode() {
  return `const puppeteer = require('puppeteer');
const WebSocket = require('ws');

class WebSimTutorialServer {
    constructor() {
        this.browser = null;
        this.page = null;
        this.wss = null;
        this.isCapturing = false;
        this.captureInterval = null;
    }

    async start() {
        console.log('Starting WebSim Tutorial Server...');
        
        // Launch browser
        this.browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1200, height: 800 });
        
        // Navigate to WebSim
        await this.page.goto('https://websim.com');
        
        // Start WebSocket server
        this.wss = new WebSocket.Server({ port: 8080 });
        console.log('WebSocket server started on port 8080');
        
        this.wss.on('connection', (ws) => {
            console.log('Client connected');
            
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this.handleMessage(data, ws);
                } catch (error) {
                    console.error('Error handling message:', error);
                }
            });
            
            ws.on('close', () => {
                console.log('Client disconnected');
                this.stopCapture();
            });
        });
    }

    async handleMessage(data, ws) {
        switch (data.type) {
            case 'startCapture':
                await this.startCapture(data.imageMode, ws);
                break;
            case 'stopCapture':
                this.stopCapture();
                break;
            case 'click':
                await this.clickElement(data.target);
                break;
            case 'navigate':
                await this.navigate(data.url);
                break;
            case 'type':
                await this.typeText(data.target, data.text);
                break;
        }
    }

    async startCapture(imageMode, ws) {
        this.isCapturing = true;
        console.log('Starting capture in', imageMode ? 'image' : 'text', 'mode');
        
        this.captureInterval = setInterval(async () => {
            try {
                const url = this.page.url();
                
                if (imageMode) {
                    const screenshot = await this.page.screenshot({ 
                        encoding: 'base64',
                        fullPage: false 
                    });
                    
                    const pageText = await this.page.evaluate(() => {
                        return document.body.innerText;
                    });
                    
                    ws.send(JSON.stringify({
                        type: 'screenshot',
                        image: \`data:image/png;base64,\${screenshot}\`,
                        url: url,
                        pageText: pageText
                    }));
                } else {
                    const pageText = await this.page.evaluate(() => {
                        return document.body.innerText;
                    });
                    
                    ws.send(JSON.stringify({
                        type: 'pageText',
                        text: pageText,
                        url: url
                    }));
                }
            } catch (error) {
                console.error('Capture error:', error);
            }
        }, 3000); // Capture every 3 seconds
    }

    stopCapture() {
        this.isCapturing = false;
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
        console.log('Capture stopped');
    }

    async clickElement(target) {
        try {
            console.log('Clicking element:', target);
            
            // Try CSS selector first
            try {
                await this.page.click(target);
                return;
            } catch (e) {
                // If CSS selector fails, try to find by text content
                await this.page.evaluate((text) => {
                    const elements = Array.from(document.querySelectorAll('*'));
                    const element = elements.find(el => 
                        el.textContent && el.textContent.toLowerCase().includes(text.toLowerCase())
                    );
                    if (element) {
                        element.click();
                    }
                }, target);
            }
        } catch (error) {
            console.error('Click failed:', error);
        }
    }

    async navigate(url) {
        try {
            console.log('Navigating to:', url);
            await this.page.goto(url);
        } catch (error) {
            console.error('Navigation failed:', error);
        }
    }

    async typeText(target, text) {
        try {
            console.log('Typing in:', target);
            await this.page.type(target, text);
        } catch (error) {
            console.error('Typing failed:', error);
        }
    }

    async stop() {
        this.stopCapture();
        if (this.browser) {
            await this.browser.close();
        }
        if (this.wss) {
            this.wss.close();
        }
    }
}

// Start the server
const server = new WebSimTutorialServer();
server.start().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await server.stop();
    process.exit(0);
});

// Export for use as module
module.exports = WebSimTutorialServer;
`;
}
const root = createRoot(document.getElementById("root"));
root.render(/* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
  fileName: "<stdin>",
  lineNumber: 625,
  columnNumber: 13
}));
