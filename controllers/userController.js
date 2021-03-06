const mongoose = require("mongoose");
const User = mongoose.model("User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../mailer");

// Load input validation
const validateRegisterInput = require("../validation/register");
const validateLoginInput = require("../validation/login");
const validateForgotInput = require("../validation/forgot");
const validateResetInput = require("../validation/reset");

exports.registerUser = (req, res) => {
  // Form validation
  const { errors, isValid } = validateRegisterInput(req.body);

  // Check validation
  if (!isValid) {
    return res.status(400).json(errors);
  }

  User.findOne({
    $or: [{ email: req.body.email }, { name: req.body.name }],
  }).then((user) => {
    if (user) {
      return res.status(400).json({ name: "Name or Email already exists" });
    } else {
      const newUser = new User({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
      });

      // Hash password before saving in database
      bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(newUser.password, salt, (err, hash) => {
          if (err) throw err;

          newUser.password = hash;
          newUser
            .save()
            .then((user) => res.json(user))
            .catch((err) => console.log(err));

          sendEmail({
            to: newUser.email,
            name: newUser.name,
            text: "Welcome to my website!",
            html: `
              <div>
                <h1>Welcome ${newUser.name}</h1>
                <p>I hope you have a good time here!</p>
              </div>
            `,
          });
        });
      });
    }
  });
};

exports.loginUser = (req, res) => {
  // Form validation
  const { errors, isValid } = validateLoginInput(req.body);

  // Check validation
  if (!isValid) {
    return res.status(400).json(errors);
  }

  const { email, password } = req.body;

  // Find user by email
  User.findOne({ email })
    .then((user) => {
      // Check if user exists
      if (!user) {
        return res.status(404).json({ emailnotfound: "Email not found" });
      }

      // Check password
      bcrypt.compare(password, user.password).then((isMatch) => {
        if (isMatch) {
          // User matched

          // Create JWT Payload
          const payload = {
            id: user.id,
            name: user.name,
          };

          // Sign token
          jwt.sign(
            payload,
            process.env.SECRET,
            {
              expiresIn: 31556926, // 1 year in seconds
            },
            (err, token) => {
              res.json({
                success: true,
                token: "Bearer " + token,
              });
            }
          );
        } else {
          return res
            .status(400)
            .json({ passwordincorrect: "Password incorrect" });
        }
      });
    })
    .catch((err) => console.log(err));
};

exports.forgotPassword = (req, res) => {
  const { errors, isValid } = validateForgotInput(req.body);

  if (!isValid) {
    return res.status(400).json(errors);
  }

  User.findOne({ email: req.body.email }).then((user) => {
    if (!user) {
      return res
        .status(404)
        .json({ emailnotfound: "No user exists for that email" });
    }

    user.passwordResetToken = {
      token: crypto.randomBytes(20).toString("hex"),
      expires: Date.now() + 1000 * 60 * 60 * 2,
    };
    user
      .save()
      .then(() => {
        const resetUrl = `https://${
          req.hostname + (req.hostname === "localhost" ? ":3000" : "")
        }/resetpassword/${user.passwordResetToken.token}`;
        sendEmail({
          to: user.email,
          name: user.name,
          text: `You have been sent this password reset link: ${resetUrl}`,
          html: `
            <div>
              <h1>Reset Password</h1>
              <p>Greetings from far off! You have been sent this password reset link. ᕕ( ᐛ )ᕗ</p>
              <a href="${resetUrl}">Reset Password</a>
            </div>
          `,
        });

        return res.json(user);
      })
      .catch((err) => console.log(err));
  });
};

exports.resetPassword = (req, res) => {
  const { errors, isValid } = validateResetInput(req.body);

  if (!isValid) {
    return res.status(400).json(errors);
  }

  User.findOne({ "passwordResetToken.token": req.body.token }).then((user) => {
    if (!user || user.passwordResetToken.expires < Date.now()) {
      return res.status(404).json({ token: "invalid" });
    }

    user.passwordResetToken.expires = 0;

    // Hash password before saving in database
    bcrypt.genSalt(10, (err, salt) => {
      bcrypt.hash(req.body.password, salt, (err, hash) => {
        if (err) throw err;

        user.password = hash;
        user
          .save()
          .then((user) => res.json(user))
          .catch((err) => console.log(err));
      });
    });
  });
};
