import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { clearSession, clearVisitor, createSendToken, visitorId } from '../middlewares/auth.js';
import { claimVisitorData } from '../services/visitorService.js';
import { createGuest, upgradeGuest } from '../services/guestService.js';

// Logs the user in: the visitor's chat and cards move to the account, then
// the session cookie is set
const logIn = async (req, res, user, statusCode) => {
  await claimVisitorData(visitorId(req), user._id);
  clearVisitor(res);
  createSendToken(user, statusCode, res);
};

export const register = catchAsync(async (req, res) => {
  const { name, email, password } = req.body;

  const user = await User.create({
    name,
    email,
    password,
  });

  await logIn(req, res, user, 201);
});

// A hash of a random password, made on first use with the same cost as real
// ones. A login for an email without an account is checked against it, so
// the answer takes as long as a wrong password and doesn't reveal which
// emails have accounts.
let unusedHash;
const checkAgainstUnusedHash = async (password) => {
  unusedHash ??= bcrypt.hash(randomBytes(32).toString('hex'), 12);
  await bcrypt.compare(password, await unusedHash);
  return false;
};

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Please provide email and password', 400);
  }

  const user = await User.findOne({ email }).select('+password');
  const matches = user ? await user.comparePassword(password) : await checkAgainstUnusedHash(password);

  if (!matches) {
    throw new AppError('Incorrect email or password', 401);
  }

  await logIn(req, res, user, 200);
});

// POST /auth/guest { name, email, phone }: continue without an account, with
// the details the booking is for. Creates a guest account and logs it in;
// see services/guestService.js.
export const continueAsGuest = catchAsync(async (req, res) => {
  await logIn(req, res, await createGuest(req.body), 201);
});

// POST /auth/upgrade { name, email, password }: turns the logged-in guest
// account into a normal one, keeping its bookings
export const upgrade = catchAsync(async (req, res) => {
  createSendToken(await upgradeGuest(req.user, req.body), 200, res);
});

export const getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);

  res.json({
    status: 'success',
    data: { user },
  });
});

// POST /auth/logout: removes the login cookie
export const logout = (req, res) => {
  clearSession(res);
  clearVisitor(res);
  res.status(204).send();
};
