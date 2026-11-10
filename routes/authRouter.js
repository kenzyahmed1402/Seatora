import express from 'express';
import { register, login, logout, getMe, continueAsGuest, upgrade } from '../controllers/authController.js';
import { identify, protect } from '../middlewares/auth.js';
import { authLimiter, guestLimiter, signupLimiter } from '../middlewares/rateLimit.js';
import { validateRegister, validateLogin, validateGuest } from '../validators/authValidator.js';

const authRouter = express.Router();

authRouter.post('/register', authLimiter, signupLimiter, validateRegister, register);
authRouter.post('/login', authLimiter, validateLogin, login);
authRouter.post('/guest', guestLimiter, validateGuest, identify, continueAsGuest);
authRouter.post('/upgrade', authLimiter, signupLimiter, protect, validateRegister, upgrade);
authRouter.post('/logout', logout);
authRouter.get('/me', protect, getMe);

export default authRouter;
