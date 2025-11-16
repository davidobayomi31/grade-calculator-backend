import express from "express";
import cors from "cors";
import multer from "multer";
import pdf from "pdf-parse";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const upload = multer();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

app.post("/parse-syllabus", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const pdfData = await pdf(req.file.buffer);
    let text = pdfData.text || "";

    const MAX_CHARS = 12000;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
    }

    const prompt = `
Extract the grading breakdown from this syllabus.
Return ONLY JSON in this form:
[
  { "name": "Assignments", "weight": 20 },
  { "name": "Midterm", "weight": 30 }
]

Here is the text:
"""${text}"""
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Return only JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0
    });

    let content = completion.choices[0]?.message?.content?.trim() || "[]";

    try {
      content = JSON.parse(content);
    } catch {
      const cleaned = content.replace(/```json|```/g, "").trim();
      content = JSON.parse(cleaned);
    }

    const formatted = content.map((c, i) => ({
      id: `${Date.now()}-${i}`,
      name: c.name,
      weight: c.weight
    }));

    res.json({ components: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to parse syllabus" });
  }
});


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("Backend running on port", PORT));