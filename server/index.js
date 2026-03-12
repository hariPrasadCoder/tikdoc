const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const pdf = require('pdf-parse');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 5005;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

app.use(cors());
app.use(express.json());

// Memory storage — no files written to disk
const upload = multer({ storage: multer.memoryStorage() });

async function generateDiagramImage(apiKey, diagramDescription) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
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
    console.error('Image gen failed:', err.message);
    return null;
  }
}

async function processDocument(apiKey, content) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `
    Analyze the following technical document and break it into 3 to 5 distinct "narrative beats" for a HYPER-ENGAGING TikTok-style video.
    Return ONLY a valid JSON array where each object has EXACTLY these keys:
    - "hook": A provocative rage-bait hook (10 words max)
    - "script": Fast-paced spoken explanation (30-40 words, conversational, no jargon)
    - "visualPrompts": An array of exactly 3 visual descriptions. Each should describe a compelling, colorful illustration or diagram that visually communicates the core idea — bold infographics, icon-driven flowcharts, colorful comparisons, timelines, or conceptual illustrations. Focus on the CONCEPT and visual metaphor. Very minimal text in the image — short 1-3 word labels only where essential. Use vivid, concrete visual language.

    Document: ${content}
  `;
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

// POST /process — main endpoint
// Accepts: multipart form with 'doc' file
// Header: x-api-key with Gemini API key
// Returns: { chunks: [...] }
app.post('/process', upload.single('doc'), async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'Missing x-api-key header' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    let content = '';
    if (req.file.originalname.toLowerCase().endsWith('.pdf')) {
      const data = await pdf(req.file.buffer);
      content = data.text;
    } else {
      content = req.file.buffer.toString('utf8');
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'File appears to be empty' });
    }

    console.log('Processing document...');
    const chunks = await processDocument(apiKey, content);

    const richChunks = await Promise.all(chunks.map(async (chunk) => {
      const prompts = (chunk.visualPrompts || []).slice(0, 3);
      const script = chunk.script || chunk.Script || '';
      console.log('Generating images + TTS for:', chunk.hook || 'beat');

      const [imageResults, ttsResult] = await Promise.all([
        Promise.all(prompts.map(p => generateDiagramImage(apiKey, p))),
        (async () => {
          try {
            const r = await axios.post(
              `${BASE_URL}/models/gemini-2.5-pro-preview-tts:generateContent?key=${apiKey}`,
              {
                contents: [{ parts: [{ text: script }] }],
                generationConfig: {
                  responseModalities: ['AUDIO'],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
                }
              }
            );
            const part = r.data.candidates[0].content.parts.find(p => p.inlineData);
            return part ? { audio: part.inlineData.data, audioMimeType: part.inlineData.mimeType } : null;
          } catch (e) {
            console.error('TTS failed:', e.message);
            return null;
          }
        })()
      ]);

      const images = imageResults.filter(Boolean).map(r => r.data);
      const imageMimeType = imageResults.find(Boolean)?.mimeType || 'image/jpeg';

      return {
        id: uuidv4(),
        images,
        imageMimeType,
        ...(ttsResult || {}),
        hook: chunk.hook,
        script,
        visualPrompts: chunk.visualPrompts,
      };
    }));

    res.json({ chunks: richChunks });
  } catch (error) {
    console.error('Process error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /tts — fallback TTS for a single script line
app.post('/tts', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'Missing x-api-key header' });

  try {
    const { text, voice = 'Puck' } = req.body;
    const response = await axios.post(
      `${BASE_URL}/models/gemini-2.5-pro-preview-tts:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        }
      }
    );
    const part = response.data.candidates[0].content.parts.find(p => p.inlineData);
    if (!part) return res.status(500).json({ error: 'No audio generated' });
    res.json({ audio: part.inlineData.data, mimeType: part.inlineData.mimeType });
  } catch (err) {
    console.error('TTS error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve React client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(port, () => {
  console.log(`TikDoc server running on http://localhost:${port}`);
});
