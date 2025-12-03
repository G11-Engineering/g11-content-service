import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler';
import { config } from '../config/config';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw createError('Access token required', 401);
    }

    // Verify token locally using JWT
    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret) as any;
      console.log('Decoded JWT:', decoded);
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        username: decoded.username || '',
        role: decoded.role
      };
      console.log('User object:', req.user);
      next();
    } catch (error) {
      console.log('JWT verification error:', error);
      throw createError('Invalid token', 401);
    }
  } catch (error) {
    next(error);
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    console.log('Role check - User:', req.user);
    console.log('Role check - Required roles:', roles);
    console.log('Role check - User role:', req.user?.role);
    
    if (!req.user) {
      console.log('Role check failed: No user');
      next(createError('Authentication required', 401));
      return;
    }

    if (!roles.includes(req.user.role)) {
      console.log('Role check failed: Insufficient permissions');
      next(createError('Insufficient permissions', 403));
      return;
    }

    console.log('Role check passed');
    next();
  };
};

export const requireAdmin = requireRole(['admin']);
export const requireEditor = requireRole(['admin', 'editor']);
export const requireAuthor = requireRole(['admin', 'editor', 'author']);
