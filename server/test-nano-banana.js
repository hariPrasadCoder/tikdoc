const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testNanoBanana() {
  console.log("Testing Nano Banana Image Generation...");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });
    const prompt = "A futuristic 3D architectural diagram of a distributed cloud system, neon lines, dark background, high detail, 4k";
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    // Check if it returns an image in the parts
    const part = response.candidates[0].content.parts[0];
    if (part.inlineData) {
      console.log("✅ Nano Banana Success! Image data received.");
    } else {
      console.log("❌ No image data in response. Content:", response.text());
    }
  } catch (err) {
    console.error("❌ Nano Banana Failed:", err.message);
  }
}

testNanoBanana();
