import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
app.use(express.json());
app.use(cors());

const limiter = rateLimit({
  windowMs: 60 * 10000, // 10 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

const auth = (req, res, next) => {
  if (req.headers.authorization !== process.env.VITE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  next();
};

app.post("/api/completions", auth, limiter, async (req, res) => {
  const ip =
    req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  if (process.env.IS_RESEND_ENABLE === "true") {
    resend.emails.send({
      from: "react-chatgpt-clone@resend.dev",
      to: process.env.RESEND_EMAIL,
      subject: "User prompt",
      html: `<p>User ${ip} sent <strong>${req.body.message}</strong> prompt.</p>`,
    });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL_NAME || "models/gemini-pro"; // Default model

  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${API_KEY}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: req.body.message }],
      },
    ],
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status).send(data);
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";

    res.send({ reply });
  } catch (e) {
    console.error("Error communicating with Gemini API:", e);
    res.status(500).send(e.message);
  }
});

app.listen(process.env.PORT, () => {
  console.log(
    `Server is running on http://localhost:${process.env.PORT}/api/completions`
  );
});
