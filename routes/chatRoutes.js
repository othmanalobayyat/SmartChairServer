// routes/chatRoutes.js
const express = require("express");
const router = express.Router();

// 🧠 fallback محلي (إذا AI فشل أو رجع شي فاضي)
function localFallback({ posture, sessionMinutes }) {
  if (posture === "تعب") {
    return "واضح إنك متعب، خذ استراحة قصيرة وحاول تمدد كتفيك.";
  }
  if (sessionMinutes >= 40) {
    return "صار وقت استراحة ⏸️ قوم وتحرك دقيقتين.";
  }
  return "حافظ على استقامة ظهرك وخلي كتافك للخلف.";
}

router.post("/", async (req, res) => {
  const { message, posture, sessionMinutes } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      reply: localFallback({ posture, sessionMinutes }),
      source: "local",
    });
  }

  try {
    const aiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `
You are a friendly posture coach chatting with a user.

Context (do NOT repeat this):
- Current posture: ${posture}
- Session duration: ${sessionMinutes} minutes

User message:
"${message}"

Instructions:
- Reply naturally to the user's message.
- Be short (1–2 sentences).
- Sound like a real chat, not instructions.
- Avoid repeating the same wording.
- If the user sounds tired, suggest stretching.
- If the session is long, suggest a break.
`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 60,
          },
        }),
      }
    );

    const data = await aiRes.json();

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    // لو الرد فاضي أو قصير زيادة → fallback
    if (!reply || reply.length < 10) {
      return res.json({
        reply: localFallback({ posture, sessionMinutes }),
        source: "local",
      });
    }

    return res.json({
      reply,
      source: "gemini",
    });
  } catch (err) {
    return res.json({
      reply: localFallback({ posture, sessionMinutes }),
      source: "local",
    });
  }
});

module.exports = router;
