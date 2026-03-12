const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5005;
const API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// DB Setup
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ documents: [], chunks: [] }).write();

// Gemini Setup
const genAI = new GoogleGenerativeAI(API_KEY);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.fieldname === 'brain_rot' ? 'uploads/brain-rot' : 'uploads/docs';
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Helper: Generate diagram image via Gemini 3 Pro Image
async function generateDiagramImage(diagramDescription) {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-image-preview',
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    });
    const result = await model.generateContent(
      `Create a stunning, colorful visual to represent: ${diagramDescription}.
      Style: vibrant bold colors, modern flat design, professional infographic aesthetic.
      Use rich color blocks, gradients, and icons to tell the story visually.
      Minimal text — use short 1-3 word labels only where essential.
      Prefer icons, shapes, arrows, and illustrations over text.
      White or very light background. Clean, sharp, high-contrast. No photos. No clip art. No handwriting.`
    );
    const parts = result.response.candidates[0].content.parts;
    const imagePart = parts.find(p => p.inlineData);
    if (!imagePart) return null;
    return { data: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType };
  } catch (err) {
    console.error('Diagram Gen Failed:', err.message);
    return null;
  }
}

// Helper: Process document with Gemini 2.5
async function processDocument(content) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `
    Analyze the following technical document and break it into 3 to 5 distinct "narrative beats" for a HYPER-ENGAGING TikTok-style video.
    Return ONLY a valid JSON array where each object has EXACTLY these keys:
    - "hook": A provocative rage-bait hook (10 words max)
    - "script": Fast-paced spoken explanation (30-40 words, conversational, no jargon)
    - "visualPrompts": An array of exactly 3 visual descriptions. Each should describe a compelling, colorful illustration or diagram that visually communicates the core idea — bold infographics, icon-driven flowcharts, colorful comparisons, timelines, or conceptual illustrations. Focus on the CONCEPT and visual metaphor. Very minimal text in the image — short 1-3 word labels only where essential. Use vivid, concrete visual language. Example: "A bold colorful flowchart with three stages: red Identify box, yellow Analyze box, green Solve box, connected by thick arrows, with small icons representing each stage"

    Document: ${content}
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanedText);
}

// Routes
app.post('/upload-doc', upload.single('doc'), async (req, res) => {
  try {
    const filePath = req.file.path;
    let content = '';
    if (req.file.originalname.toLowerCase().endsWith('.pdf')) {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      content = data.text;
    } else {
      content = fs.readFileSync(filePath, 'utf8');
    }

    if (!content || content.trim().length === 0) throw new Error('Empty content');

    console.log('Using Gemini 2.5 for Cinematic Chunks...');
    
    // Clear old data for the POC
    db.set('documents', []).write();
    db.set('chunks', []).write();

    const chunks = await processDocument(content);
    
    const richChunks = await Promise.all(chunks.map(async (chunk) => {
      const prompts = (chunk.visualPrompts || []).slice(0, 3);
      console.log('Generating diagrams for:', chunk.hook || 'beat');
      const imageResults = await Promise.all(prompts.map(p => generateDiagramImage(p)));
      const images = imageResults.filter(Boolean).map(r => r.data);
      const imageMimeType = imageResults.find(Boolean)?.mimeType || 'image/jpeg';
      return {
        id: uuidv4(),
        images,
        imageMimeType,
        ...chunk,
      };
    }));

    db.get('chunks').push(...richChunks).write();
    res.json({ message: 'Success', chunkCount: chunks.length });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/feed', (req, res) => {
  const chunks = db.get('chunks').value();
  const brainRotDir = path.join(__dirname, 'uploads/brain-rot');
  let brainRotFiles = fs.readdirSync(brainRotDir).filter(f => f.endsWith('.mp4'));

  const segmentDuration = 30;
  const feed = chunks.map((chunk, index) => {
    const videoFile = brainRotFiles[index % brainRotFiles.length];
    const segmentIndex = Math.floor(index / brainRotFiles.length);
    const startTime = segmentIndex * segmentDuration;

    return {
      ...chunk,
      brainRotVideo: `http://localhost:${port}/uploads/brain-rot/${videoFile}`,
      startTime
    };
  });
  res.json(feed);
});

app.listen(port, () => {
  console.log(`TikDoc Cinematic Server running on http://localhost:${port}`);
});
