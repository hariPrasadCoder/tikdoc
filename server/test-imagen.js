const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

async function testImagen() {
  console.log("Testing Imagen 4 Generation...");
  try {
    const url = `${BASE_URL}/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;
    const payload = {
      instances: [{ prompt: "A cinematic, futuristic 3D architectural diagram of a microservices cloud architecture, neon lines, dark mode, high detail, 4k" }],
      parameters: { sampleCount: 1, aspectRatio: "9:16" }
    };
    const response = await axios.post(url, payload);
    const data = response.data.predictions?.[0]?.bytesBase64Encoded;
    if (data) {
      console.log("✅ Imagen 4 Success! Image data received.");
    } else {
      console.log("❌ No image data. Response:", JSON.stringify(response.data));
    }
  } catch (err) {
    console.error("❌ Imagen 4 Failed:", err.response?.data || err.message);
  }
}

testImagen();
