import validateRequest from '../middlewares/validateRequest.js';
import {
  NAME_MAX_LENGTH,
  emailProblem,
  nameProblem,
  normalizeName,
  normalizePhone,
  passwordProblem,
  phoneProblem,
} from '../utils/accountRules.js';

// For new accounts (register, and a guest's upgrade). The name, email and
// password rules are in utils/accountRules.js. Emails can't be longer than
// 254 characters (RFC 5321). bcrypt only uses the first 72 bytes of a
// password, so longer ones would be silently cut.
const registerSchema = {
  name: { required: true, type: 'string', normalize: normalizeName, maxLength: NAME_MAX_LENGTH, check: nameProblem },
  email: { required: true, type: 'email', maxLength: 254, check: emailProblem },
  password: {
    required: true,
    type: 'string',
    minLength: 8,
    maxBytes: 72,
    check: (password, { name, email }) => passwordProblem(password, { name, email }),
  },
};

// Login checks only the shape: accounts made before a rule existed can still
// log in. 1024 is far above any real password and keeps bcrypt's input small.
const loginSchema = {
  email: { required: true, type: 'email', maxLength: 254 },
  password: { required: true, type: 'string', maxLength: 1024 },
};

// Continuing as a guest: who the booking is for. The email is for contact
// only, never a login, so it can't clash with an existing account.
const guestSchema = {
  name: registerSchema.name,
  email: registerSchema.email,
  phone: { required: true, type: 'string', normalize: normalizePhone, maxLength: 16, check: phoneProblem },
};

export const validateRegister = validateRequest(registerSchema);
export const validateGuest = validateRequest(guestSchema);
export const validateLogin = validateRequest(loginSchema);
