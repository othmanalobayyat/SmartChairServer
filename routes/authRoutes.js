// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");

// نفس السر المستخدم في middleware/auth.js
const JWT_SECRET = process.env.JWT_SECRET;

// ==============================
// REGISTER
// ==============================
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check existing
    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    const user = new User({ name, email, password: hashed });
    await user.save();

    res.status(201).json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// LOGIN
// ==============================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    // إصدار التوكن
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// UPDATE PROFILE
// ==============================
router.put("/update-profile", auth, async (req, res) => {
  try {
    const { name, email, avatar } = req.body;

    // تحقق من الإيميل
    const existing = await User.findOne({
      email,
      _id: { $ne: req.user.id },
    });
    if (existing)
      return res.status(400).json({ message: "Email already used" });

    const update = { name, email };
    if (avatar !== undefined) update.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.user.id, update, {
      new: true,
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// CHANGE PASSWORD
// ==============================
router.put("/change-password", auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match)
      return res.status(400).json({ message: "Old password incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ success: true, message: "Password updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
