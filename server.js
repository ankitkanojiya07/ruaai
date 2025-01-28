import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Google AI
const API_KEY = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Rate limiting setup
const requestCounts = new Map();
const RATE_LIMIT = 10; // requests
const TIME_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Rate limiting middleware
function rateLimiter(req, res, next) {
  const ip = req.ip;
  const currentTime = Date.now();
  const userRequests = requestCounts.get(ip) || [];
  
  // Remove requests outside the time window
  const recentRequests = userRequests.filter(time => currentTime - time < TIME_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      details: "Please wait a minute before trying again"
    });
  }
  
  recentRequests.push(currentTime);
  requestCounts.set(ip, recentRequests);
  next();
}

// Generate content endpoint
app.post('/generate', rateLimiter, async (req, res) => {
  const prompt = req.body.prompt;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    // Safety check prompt length
    if (prompt.length > 1000) {
      return res.status(400).json({
        error: "Prompt too long",
        details: "Please limit your prompt to 1000 characters"
      });
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error("Empty response from AI");
    }

    const markdownResponse = `### Generated Response:\n\n${text}`;

    res.json({ response: markdownResponse });
  } catch (error) {
    console.error("Error generating content:", error);

    // Handle rate limits
    if (error.message.includes('429') || error.message.includes('quota')) {
      return res.status(429).json({
        error: "API rate limit exceeded",
        details: "Please try again in a minute"
      });
    }

    // Handle other errors
    res.status(500).json({
      error: "Failed to generate content",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});