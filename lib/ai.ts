import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

if (!apiKey) {
  console.warn("NEXT_PUBLIC_GEMINI_API_KEY is not set. AI features will not work.");
}

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateProfileSummary = async (experience: string, skills: string[]) => {
  if (!ai) return "AI features are currently unavailable.";
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a professional, high-impact 2-sentence profile summary for a candidate with the following experience: "${experience}" and skills: ${skills.join(', ')}. Focus on achievements and value proposition.`,
  });
  
  return response.text || "Failed to generate summary.";
};

export const suggestSkills = async (experience: string) => {
  if (!ai) return [];
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on this work experience: "${experience}", suggest 5-8 relevant technical and soft skills. Return only the skills as a comma-separated list.`,
  });
  
  return (response.text || "").split(",").map(s => s.trim()).filter(Boolean);
};

export const structureExperience = async (rawInput: string) => {
  if (!ai) return null;
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Convert this raw work experience description into a structured JSON object: "${rawInput}". 
    The JSON should have: "title", "company", "duration", and "bulletPoints" (an array of 2-3 high-impact professional bullet points).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          company: { type: Type.STRING },
          duration: { type: Type.STRING },
          bulletPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["title", "company", "duration", "bulletPoints"]
      }
    }
  });
  
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    return null;
  }
};

export const structureProject = async (rawInput: string) => {
  if (!ai) return null;
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Convert this project description into a structured JSON object: "${rawInput}". 
    The JSON should have: "name", "description", "technologies" (array of strings), and "link" (optional string).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          technologies: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          link: { type: Type.STRING }
        },
        required: ["name", "description", "technologies"]
      }
    }
  });
  
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    return null;
  }
};
