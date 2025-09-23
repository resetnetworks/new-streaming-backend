import { User } from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import bcrypt from "bcrypt";
import { sendMail } from "../utils/sendResetPassMail.js";
import crypto from "crypto";
import { StatusCodes } from 'http-status-codes';
import { BadRequestError, UnauthorizedError, } from "../errors/index.js";
import { shapeUserResponse } from "../dto/user.dto.js";
import Session from "../models/Session.js";
import { log } from "console";

// ===================================================================
// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
// ===================================================================
export const registerUser = async (req, res) => {
  const { name, email, password, dob } = req.body;

  // 1. Check if user already exists
  const existingUser = await User.findOne({ email }).lean();
  if (existingUser) {
    throw new BadRequestError("User already exists");
  }

  // 2. Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // 3. Create new user
  const createdUser = await User.create({
    name,
    email,
    dob,
    password: hashedPassword,
  });

  // 4. Generate token and set cookie
  generateToken(createdUser._id, res);

  // 5. Prepare safe user response
  const shapedUser = shapeUserResponse(createdUser.toObject());

  // 6. Send response
  res.status(StatusCodes.CREATED).json({
    user: shapedUser,
    message: "User registered",
  });
};



// ===================================================================
// @desc    Authenticate user & get token
// @route   POST /api/users/login
// @access  Public
// ===================================================================
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  // 🔍 Find user with only required fields
  const user = await User.findOne({ email }).select("+password +role");
  
  // Dummy hash (mitigates timing attacks when user not found)
  const dummyHash =
    "$2b$10$C.wq7D6vZT0eJZK3x7zCfuM8CyqOajwX4gO8hUO9gZ.2B0uB1dYx6";
  const passwordToCompare = user ? user.password : dummyHash;

  const isMatch = await bcrypt.compare(password, passwordToCompare);

  if (!user || !isMatch) {
    throw new BadRequestError("Invalid email or password"); // unified error
  }

  // 🧹 Remove expired sessions first
  await Session.deleteMany({
    userId: user._id,
    expiresAt: { $lt: new Date() },
  });

  // 🔒 Enforce max 2 active sessions
  const activeSessions = await Session.countDocuments({ userId: user._id });
  if (activeSessions >= 4) {
    throw new BadRequestError("Maximum 2 active logins allowed");
  }

  // ✅ Generate JWT
  const rawToken = generateToken(user._id, res);

  // ✅ Hash token before saving
  const hashedToken = await bcrypt.hash(rawToken, 10);

  // ✅ Save session
  await Session.create({
    userId: user._id,
    token: hashedToken,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7d expiry
    userAgent: req.headers["user-agent"],
    ip: req.headers["x-forwarded-for"] || req.ip,
  });

  // 🧩 Shape user response (remove sensitive fields)
  const shapedUser = shapeUserResponse(user.toObject());

  // 📤 Send back token + shaped user
  res.status(StatusCodes.OK).json({
    user: shapedUser,
    token: rawToken,
    message: "User logged in successfully",
  });
};



// ===================================================================
// @desc    Get current user's profile
// @route   GET /api/users/me
// @access  Private
// ===================================================================
export const myProfile = async (req, res) => {
  if (!req.user || !req.user._id) {
    throw new UnauthorizedError("User authentication failed");
  }

  const user = await User.findById(req.user._id)
    .select("-password")
    .lean();

  if (!user) {
    throw new NotFoundError("User not found");
  }

  // 🔥 NEW: Enhanced response for social login with all necessary fields
  const userResponse = {
    _id: user._id,
    name: user.name,
    email: user.email,
    profileImage: user.profileImage || "",
    authType: user.authType || "email",
    role: user.role || "user",
    purchasedSongs: user.purchasedSongs || [],
    purchasedAlbums: user.purchasedAlbums || [],
    likedsong: user.likedsong || [],
    preferredGenres: user.preferredGenres || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };


  res.status(StatusCodes.OK).json(userResponse);
};


// ===================================================================
// @desc    Logout user by clearing auth token cookie
// @route   GET /api/users/logout
// @access  Private
// ===================================================================
export const logoutUser = async (req, res) => {
  try {
    // 🔑 Extract token from cookie or Authorization header
    const rawToken =
      req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!rawToken) {
      throw new BadRequestError("No token provided");
    }

    // 🧹 Clean up expired sessions
    await Session.deleteMany({ expiresAt: { $lt: new Date() } });

    // 🔍 Find all sessions for this user
    const sessions = await Session.find({ userId: req.user._id });

    let sessionToDelete = null;
    for (const session of sessions) {
      const isMatch = await bcrypt.compare(rawToken, session.token); // compare against hashed token
      if (isMatch) {
        sessionToDelete = session._id;
        break;
      }
    }

    if (!sessionToDelete) {
      throw new BadRequestError("Session not found or already logged out");
    }

    // ❌ Delete only this session
    await Session.findByIdAndDelete(sessionToDelete);

    // 🧹 Clear cookie if used
    res.cookie("token", "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(StatusCodes.OK).json({
      message: "Logged out successfully",
    });
  } catch (err) {
    throw new BadRequestError(err.message || "Logout failed");
  }
};






// ===================================================================
// @desc    Toggle like/unlike for a song
// @route   POST /api/songs/:id/like
// @access  Private
// ===================================================================
export const likeSong = async (req, res) => {
  console.log("hello");
  
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const songId = req.params.id;

  const isAlreadyLiked = user.likedsong.some(id => id.equals(songId));

  if (isAlreadyLiked) {
    user.likedsong = user.likedsong.filter(id => !id.equals(songId));
    await user.save();
    return res.status(StatusCodes.OK).json({
      message: "Song removed from liked songs",
      liked: false,
    });
  }

  user.likedsong.push(songId);
  await user.save();

  return res.status(StatusCodes.OK).json({
    message: "Song added to liked songs",
    liked: true,
  });
};



// ===================================================================
// @desc    Update user's preferred genres
// @route   PUT /api/users/preferences/genres
// @access  Private
// ===================================================================
export const updatePreferredGenres = async (req, res) => {
  const { genres } = req.body;

  // Validate input type
  if (!Array.isArray(genres)) {
    throw new BadRequestError("Genres must be an array");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Normalize genres (trim and lowercase)
  user.preferredGenres = genres.map((genre) => genre.trim().toLowerCase());

  await user.save();

  res.status(StatusCodes.OK).json({
    message: "Preferred genres updated",
    preferredGenres: user.preferredGenres,
  });
};



// ===================================================================
// @desc    Send password reset link to user email
// @route   POST /api/auth/forgot-password
// @access  Public
// ===================================================================
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Generate secure reset token
  const resetToken = crypto.randomBytes(20).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

  await user.save({ validateBeforeSave: false });

  const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  const message = `You requested a password reset. Click the link to reset your password:\n\n${resetURL}\n\nIf you did not request this, you can safely ignore this email.`;

  await sendMail(user.email, "Reset Your Password", message);

  res.status(StatusCodes.OK).json({
    message: "Reset link sent to your email",
  });
};



// ===================================================================
// @desc    Reset user password using a valid token
// @route   PUT /api/auth/reset-password/:token
// @access  Public
// ===================================================================
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  // Hash the token to compare with DB
  const resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    throw new BadRequestError("Token is invalid or has expired");
  }

  // Update password and clear reset fields
  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  res.status(StatusCodes.OK).json({ message: "Password reset successful" });
};

// ===================================================================
// @desc    Handle Google OAuth callback and redirect to client
// @route   GET /api/auth/google/callback
// @access  Public (OAuth)
// ===================================================================
export const googleAuthCallback = (req, res) => {
  try {
    // 🔥 NEW: Extract user and isNewUser from req.user (updated passport strategy)
    const { user, isNewUser } = req.user || {};
    
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=google_auth_failed`);
    }

   
    
    // 🔥 NEW: Use same generateToken pattern as login/register
    const token = generateToken(user._id, res);
    
    
    // 🔥 NEW: Redirect to frontend callback with newUser parameter
    const redirectUrl = `${process.env.CLIENT_URL}/auth/callback?newUser=${isNewUser}`;
    
    res.redirect(redirectUrl);
    
  } catch (error) {
    res.redirect(`${process.env.CLIENT_URL}/login?error=callback_failed`);
  }
};







