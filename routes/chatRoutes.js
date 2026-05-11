// routes/chatRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

// ── Readable English labels for Arabic posture codes ──────────────
const POSTURE_EN = {
  "صحيحة":  "correct – sitting perfectly straight",
  "منحنية": "leaning / bent forward or sideways (bad posture)",
  "تعب":    "drowsy / very tired",
  "طويلة":  "long session – user has been sitting too long and needs a break",
};

// ── Local fallback when Gemini is unavailable ─────────────────────
function localFallback({ posture, sessionMinutes, attention, drowsy }) {
  const isAr = typeof posture === "string" && /[؀-ۿ]/.test(posture);

  if (drowsy) {
    return isAr
      ? "يبدو أنك تشعر بالنعاس 😴 جرّب تقوم تتحرك دقيقة أو تشرب كوب ماء."
      : "You seem drowsy 😴 Try standing up for a minute or drinking some water.";
  }
  if (posture === "تعب") {
    return isAr
      ? "خذ استراحة قصيرة الآن وجرّب تمدد كتفيك ورقبتك."
      : "Take a short break and stretch your shoulders and neck.";
  }
  if (sessionMinutes >= 40) {
    return isAr
      ? "مضت أكثر من 40 دقيقة! ⏸️ قوم وتحرك لمدة دقيقتين على الأقل."
      : "Over 40 minutes of sitting! ⏸️ Stand up and move for at least 2 minutes.";
  }
  if (attention != null && attention < 40) {
    return isAr
      ? "تركيزك منخفض – جرّب تأخذ نفساً عميقاً وتبعد نظرك عن الشاشة لثوانٍ."
      : "Your focus is low – try a deep breath and look away from the screen briefly.";
  }
  return isAr
    ? "حافظ على استقامة ظهرك وكتفيك للخلف 💪"
    : "Keep your back straight and shoulders back 💪";
}

// ── POST /chat ────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  const { message, posture, sessionMinutes, attention, drowsy } = req.body;

  if (!process.env.GROQ_API_KEY) {
    return res.json({
      reply: localFallback({ posture, sessionMinutes, attention, drowsy }),
      source: "local",
    });
  }

  // Build readable context strings
  const postureDesc  = POSTURE_EN[posture] || posture || "unknown";
  const attentionStr = attention != null ? `${Math.round(attention)}%` : "not available";
  const drowsyStr    = drowsy ? "Yes – the user appears drowsy" : "No";
  const sessionStr   = sessionMinutes != null ? `${sessionMinutes} minutes` : "unknown";

  // ── System instruction: PostureAI persona ──
  const systemInstruction = `You are PostureAI, a smart wellness coach for a smart chair system.
Current user data: posture=${postureDesc}, session=${sessionStr}, focus=${attentionStr}, drowsy=${drowsy ? "yes" : "no"}

Rules:
- Answer EXACTLY what the user asks
- SHORT replies (2-4 sentences max)
- Respond in SAME language as user (Arabic→Arabic, English→English)
- Reference actual data in response
- Be warm and friendly, 1-2 emojis max
- NEVER give generic advice unless data supports it
- If user asks anything off-topic (weather, food, news, etc.) → answer it briefly and naturally (1-2 sentences), then add one gentle wellness tip tied to their current data
- NEVER refuse or say "I only answer about posture" — be like a friendly colleague who happens to know about health
- NEVER use Chinese, Japanese, or any non-Arabic/English characters — output only Arabic or English
- When responding in Arabic, write perfect natural Arabic (Modern Standard or friendly dialect as appropriate)
- You are talking to Arab users primarily — default to Arabic unless the user writes in English
- Arabic must be natural, modern, and without any English or Chinese word mixing
- Maximum 2-3 sentences per response, NO exceptions
- Sound like a friendly human, NOT a robot or assistant
- No bullet points, no lists, just natural conversational text
- If in Arabic, write like a friendly Arab colleague`;

  // ── User turn: context + actual message ──
  const userContent = `Current real-time sensor data for this user:
• Posture: ${postureDesc}
• Session duration: ${sessionStr}
• Focus / attention level: ${attentionStr}
• Drowsy: ${drowsyStr}

User's message: "${message}"`;

  try {
    const aiRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user",   content: userContent },
          ],
          max_tokens: 150,
          temperature: 0.6,
          stop: ["<think>", "</think>"],
        }),
      }
    );

    const data       = await aiRes.json();
    const raw        = data?.choices?.[0]?.message?.content?.trim();
    const cleanReply = raw?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    if (!cleanReply || cleanReply.length < 8) {
      return res.json({
        reply: localFallback({ posture, sessionMinutes, attention, drowsy }),
        source: "local",
      });
    }

    return res.json({ reply: cleanReply, source: "groq" });
  } catch (err) {
    return res.json({
      reply: localFallback({ posture, sessionMinutes, attention, drowsy }),
      source: "local",
    });
  }
});

module.exports = router;
