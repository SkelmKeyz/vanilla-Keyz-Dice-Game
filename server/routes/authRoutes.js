const express = require("express");
const { body, validationResult } = require("express-validator");
const router = express.Router();
const { register, login } = require("../controllers/authController");

// ── Validation middleware that actually rejects bad input ─────────────────────
function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
}

// Single /register route with validators enforced
router.post(
    "/register",
    [
        body("email").isEmail().withMessage("Valid email is required"),
        body("password")
            .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
            .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
            .matches(/[0-9]/).withMessage("Password must contain at least one number")
    ],
    handleValidationErrors,
    register
);

router.post("/login", login);

module.exports = router;