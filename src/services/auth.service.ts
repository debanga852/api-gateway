import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import redisService from './redis.service';
import { config } from '../config';
import { RedisKeys } from '../utils/redisKeys';
import { JwtPayload, AdminJwtPayload } from '../types';

class AuthService {
  /** Issue a gateway JWT for a user (used by mock/test routes). */
  issueToken(
    userId: string,
    role: 'user' | 'admin' | 'service' = 'user',
    apiKey?: string,
  ): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub:    userId,
      role,
      jti:    uuidv4(),
      ...(apiKey ? { apiKey } : {}),
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as string,
      algorithm: config.jwt.algorithm,
    } as jwt.SignOptions);
  }

  /** Verify a gateway JWT. Throws if invalid or blacklisted. */
  async verifyToken(token: string): Promise<JwtPayload> {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;

    const redis     = redisService.getClient();
    const blacklisted = await redis.get(RedisKeys.auth.blacklist(payload.jti));
    if (blacklisted) throw new Error('Token has been revoked');

    return payload;
  }

  /** Blacklist a token by JTI until its natural expiry. */
  async revokeToken(token: string): Promise<void> {
    try {
      const payload = jwt.decode(token) as JwtPayload;
      if (!payload?.jti) return;

      const ttl  = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
      const redis = redisService.getClient();
      await redis.setex(RedisKeys.auth.blacklist(payload.jti), ttl, '1');
    } catch {
      // ignore decode errors
    }
  }

  /** Issue an admin dashboard JWT. */
  issueAdminToken(username: string): string {
    const payload: Omit<AdminJwtPayload, 'iat' | 'exp'> = {
      sub:  username,
      role: 'admin',
      jti:  uuidv4(),
    };

    return jwt.sign(payload, config.adminJwt.secret, {
      expiresIn: config.adminJwt.expiresIn as string,
    } as jwt.SignOptions);
  }

  /** Verify an admin JWT. */
  verifyAdminToken(token: string): AdminJwtPayload {
    return jwt.verify(token, config.adminJwt.secret) as AdminJwtPayload;
  }
}

export const authService = new AuthService();
export default authService;
