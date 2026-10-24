const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const {
    register,
    login
} = require("../controllers/authController");


router.post("/register", [
    body("email").isEmail(),
    body("password").isLength({ min: 8 })
        .matches(/[A-Z]/)
        .matches(/[0-9]/)
],

    register
);

router.post("/register", register);

router.post("/login", login);

module.exports = router;