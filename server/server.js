require('dotenv').config({ path: '../.env' }); 

const express = require('express');
const nodemailer = require('nodemailer');
const app = express();
const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const transporter = require('./utils/mailer.js');
const { generateOtp } = require('./utils/otp.js');
const { verifyUser } = require('./middleware/auth.js');  // Destructure the correct middleware function
const reviewModel = require('./models/Review');

const FRONTEND_URL = "http://192.168.1.59:5000";
const JWT_SECRET = "aisaanka";
const mongoUrl = "mongodb+srv://fabromikylla:admin123@cluster0.zavvr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Database Connection
mongoose.connect(mongoUrl).then(() => {
    console.log("Database connected");
}).catch((e) => {
    console.log("Database connection error:", e);
});

// Start the server
const port = 5000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

require('./models/User');
const User = mongoose.model("User");

// Middleware
app.use(express.json());
app.use(cors({ origin: FRONTEND_URL }));

// Home Route
app.get("/", (req, res) => {
    res.send({ status: "Started" });
});

const sendOtpEmail = async (email, otp) => {
    const mailOptions = {
        from: '"Aisaanka Team" <no-reply@aisaanka.co>',
        to: email,
        subject: "Verify Your Email - Aisaanka OTP Code",
        html: `
        <div style="max-width: 600px; margin: auto; padding: 20px; border-radius: 8px; background-color: #f9fafc; font-family: Arial, sans-serif; text-align: center; border: 1px solid #ddd;">
            <div style="background-color: #0b617e; padding: 20px; border-radius: 8px 8px 0 0;">
                <h1 style="color: #fff; margin: 0;">Aisaanka</h1>
            </div>
            <div style="padding: 20px;">
                <h2 style="color: #0b617e; font-size: 22px; margin-bottom: 10px;">Your OTP Code</h2>
                <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
                    Use the code below to verify your email and activate your account.
                </p>
                <div style="font-size: 32px; font-weight: bold; padding: 15px; background-color: #e6f4f1; color: #0b617e; display: inline-block; border-radius: 6px;">
                    ${otp}
                </div>
                <p style="color: #555; font-size: 14px; margin-top: 20px;">
                    This OTP is valid for <strong>1 hour</strong>. If you did not request this, please ignore this email.
                </p>
                <hr style="border: none; height: 1px; background-color: #ddd; margin: 20px 0;">
                <p style="color: #777; font-size: 13px;">
                    If you need any help, contact us at 
                    <a href="mailto:support@aisaanka.co" style="color: #0b617e; text-decoration: none;">support@aisaanka.co</a>.
                </p>
            </div>
            <div style="background-color: #0b617e; padding: 10px; border-radius: 0 0 8px 8px; text-align: center;">
                <p style="color: #fff; font-size: 12px; margin: 0;">Aisaanka © 2024 - All rights reserved.</p>
            </div>
        </div>
        `,
    };
  
    try {
      await transporter.sendMail(mailOptions);
      console.log('OTP sent to:', email);
    } catch (error) {
      console.error('Error sending OTP:', error);
    }
  };
// Login Route
// Register Route - Ensures password is hashed and saved correctly
app.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).send({ data: "Email already in use" });
        }

        const otp = generateOtp();  
        console.log("Generated OTP:", otp); 
        console.log("OTP saved to user:", otp);

        // Hash the password
        const hashedPassword = await bcrypt.hash(password.trim(), 10); // Ensure password is trimmed
        console.log("Hashed Password (for storage):", hashedPassword); // Log hashed password to ensure proper hashing

        // Save the user
        const newUser = await User.create({
            username,
            email: email.toLowerCase(),
            password: hashedPassword, // Store the hashed password
            role: 1,
            otp,
        });

        await sendOtpEmail(email, otp);
        await User.updateOne({ email: email.toLowerCase() }, { otp });
        res.status(201).send({ status: "ok", data: "User created. OTP sent." });
    } catch (error) {
        console.error("Error during registration:", error);
        res.status(500).send({ status: "error", data: "Registration failed" });
    }
});

// Login Route - Ensure password is compared correctly
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send({ data: "Email and password are required" });
    }

    try {
        // Find the user by email
        const oldUser = await User.findOne({ email: email.toLowerCase() });

        if (!oldUser) {
            return res.status(400).send({ data: "User doesn't exist" });
        }

        console.log("Entered Password (After Trim):", password.trim());
        console.log("Stored Hashed Password:", oldUser.password);

        // Use bcrypt.compare to check if the entered password matches the stored hashed password
        const isPasswordCorrect = await bcrypt.compare(password.trim(), oldUser.password); // Trim password during comparison
        console.log("Password comparison result (bcrypt.compare):", isPasswordCorrect);

        if (!isPasswordCorrect) {
            return res.status(400).send({ status: "error", data: "Invalid credentials" });
        }

        // Generate JWT Token if password matches
        const token = jwt.sign({ id: User._id, email: oldUser.email, role: oldUser.role }, JWT_SECRET, { expiresIn: "24h" });
        console.log("Generated JWT token:", token);
        console.log("Backend JWT Secret Key:", process.env.JWT_SECRET);


        return res.status(200).send({ status: "ok", data: { token, role: oldUser.role } });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).send({ status: "error", data: "Login failed" });
    }
});



app.post("/verify-otp", async (req, res) => {
    const { email, otp } = req.body;

    console.log("Received OTP:", otp);

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.log("User not found");
            return res.status(400).send({ message: "Invalid OTP" });
        }

        console.log("Stored OTP:", user.otp);

        // Ensure that we compare the received OTP with the stored one
        if (user.otp !== otp) {
            console.log("Mismatch: Stored OTP:", user.otp, "Received OTP:", otp);
            return res.status(400).send({ message: "Invalid OTP" });
        }

        // Clear OTP only after successful verification
        await User.updateOne({ email: email.toLowerCase() }, { otp: null });
        console.log("OTP verified successfully");

        res.status(200).send({ message: "OTP verified successfully" });
    } catch (error) {
        console.error("Error verifying OTP:", error);
        res.status(500).send({ message: "OTP verification failed" });
    }
});


// Add resendOtp functionality
app.post("/resend-otp", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Generate and save new OTP
        const newOtp = generateOtp();
        user.otp = newOtp;
        user.otpExpires = Date.now() + 3600000; // OTP expires in 1 hour

        try {
            await user.save();
        } catch (saveError) {
            console.error("❌ Error saving OTP:", saveError);
            return res.status(500).json({ message: "Failed to generate OTP. Please try again." });
        }

        // Send OTP via email
        try {
            await sendOtpEmail(email, newOtp);
        } catch (emailError) {
            console.error("❌ Error sending OTP email:", emailError);
            return res.status(500).json({ message: "Failed to send OTP email. Please try again." });
        }

        res.status(200).json({ message: "A new OTP has been sent to your email." });
    } catch (error) {
        console.error("❌ Unexpected Error:", error);
        res.status(500).json({ message: "Internal server error. Please try again later." });
    }
});


// Update User Role (Admin Feature)
app.put("/update-role", async (req, res) => {
    const { email, role } = req.body;

    if (![0, 1].includes(role)) {
        return res.status(400).send({ data: "Invalid role" });
    }

    try {
        const updatedUser = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { role },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).send({ data: "User not found" });
        }

        res.send({ status: "ok", data: "Role updated successfully", updatedUser });
    } catch (error) {
        res.status(500).send({ status: "error", data: "Role update failed" });
    }
});

// Fetch User Data
app.post("/userdata", async (req, res) => {
    const { token } = req.body; // Get the token from the request body

    try {
        const user = jwt.verify(token, JWT_SECRET); // Verify the token
        const userEmail = user.email; // Get the user email from the decoded token

        const userData = await User.findOne({ email: userEmail }); // Get the user data by email
        if (!userData) {
            return res.status(404).send({ data: "User not found" });
        }

        return res.send({ status: "ok", data: userData });
    } catch (error) {
        console.error("Token verification failed:", error);
        return res.status(401).send({ error: "Invalid token" });
    }
});

// Update User Profile
// Inside /profile/update route in server.js
app.put("/profile/update", async (req, res) => {
    const { username, email, password, currentPassword } = req.body;
    const user = await User.findOne({ email });

    try {
        // Check if user exists
        if (!user) {
            return res.status(404).json({ data: "User not found" });  // Ensure JSON response
        }

        // Check if the entered password matches the stored hashed password
        const isPasswordCorrect = await bcrypt.compare(currentPassword.toString(), user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ data: "Incorrect current password" });  // Ensure JSON response
        }

        // Update user fields
        user.username = username || user.username;
        user.email = email || user.email;

        // If password is provided, hash and update it
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10); // Hash the new password before saving
            user.password = hashedPassword;
        }

        // Save updated user
        await user.save();

        // Respond with JSON
        res.status(200).json({ status: "ok", data: "Profile updated successfully" });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ data: "Profile update failed" });  // Ensure JSON response
    }
});

app.post("/review", verifyUser, async (req, res) => {
    try {
        const { issue, suggestion, rating } = req.body;

        // Validate input
        if (!issue || !suggestion || !rating) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Create a new review
        const newReview = new reviewModel({
            user: req.user._id,  // Use the authenticated user's _id from the token
            issue,
            suggestion,
            rating,
        });

        // Save the review to the database
        await newReview.save();

        // Send the response back with the created review
        res.status(201).json(newReview);
    } catch (error) {
        // Handle any errors that may occur
        res.status(500).json({ message: error.message });
    }
});



// Fetch All Users
app.get("/users", async (req, res) => {
  try {
      const users = await User.find({}, "username email role"); // Fetch only needed fields
      res.status(200).send({ status: "ok", data: users });
  } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).send({ status: "error", data: "Failed to fetch users" });
  }
});


