import type { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { randomToken, sha256Hex } from '../../common/ids';
import { sendMail, passwordResetEmail } from '../../lib/mailer';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
} from '../../common/errors';
import { env, isProduction } from '../../config/env';
import type { RegisterInput, LoginInput, ResetPasswordInput, UpdateProfileInput } from './auth.schemas';
import type { RoleValue } from '../../common/constants';

interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export class AuthService {
  constructor(private readonly db: PrismaClient) {}

  private async issueTokens(
    user: { id: string; email: string; fullName: string; role: string; facilityId: string },
    remember: boolean,
    ctx: SessionContext,
  ): Promise<IssuedTokens> {
    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role as RoleValue,
      facilityId: user.facilityId,
    });

    const ttl = remember ? env.JWT_REFRESH_TTL_REMEMBER_SECONDS : env.JWT_REFRESH_TTL_SECONDS;
    const refreshToken = randomToken(48);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(refreshToken),
        expiresAt,
        userAgent: ctx.userAgent?.slice(0, 255),
        ipAddress: ctx.ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: env.JWT_ACCESS_TTL_SECONDS,
      refreshTokenExpiresIn: ttl,
    };
  }

  async register(input: RegisterInput, ctx: SessionContext) {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError('An account with this email already exists');

    const facility = input.facilityId
      ? await this.db.facility.findUnique({ where: { id: input.facilityId } })
      : await this.db.facility.findFirst({ where: { active: true }, orderBy: { code: 'asc' } });
    if (!facility) throw new BadRequestError('No active facility available for registration');

    const passwordHash = await hashPassword(input.password);
    const user = await this.db.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role: input.role ?? 'STORE_MANAGER',
        facilityId: facility.id,
      },
      include: { facility: true },
    });

    const tokens = await this.issueTokens(user, false, ctx);
    return { user, tokens };
  }

  async login(input: LoginInput, ctx: SessionContext) {
    const user = await this.db.user.findUnique({
      where: { email: input.email },
      include: { facility: true },
    });
    if (!user || !user.active) throw new UnauthorizedError('Invalid email or password');

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid email or password');

    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.issueTokens(user, input.remember, ctx);
    return { user, tokens };
  }

  async refresh(rawToken: string, ctx: SessionContext) {
    const tokenHash = sha256Hex(rawToken);
    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) throw new UnauthorizedError('Invalid refresh token');

    if (stored.revokedAt) {
      await this.db.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    if (!stored.user.active) throw new UnauthorizedError('Account is disabled');

    await this.db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const remember =
      stored.expiresAt.getTime() - stored.createdAt.getTime() >
      env.JWT_REFRESH_TTL_SECONDS * 1000 * 1.5;

    const user = await this.db.user.findUnique({
      where: { id: stored.userId },
      include: { facility: true },
    });
    if (!user) throw new UnauthorizedError('User no longer exists');

    const tokens = await this.issueTokens(user, remember, ctx);
    return { user, tokens };
  }

  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = sha256Hex(rawToken);
    await this.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string): Promise<{ token?: string }> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) return {};

    const token = randomToken(32);
    await this.db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const mail = passwordResetEmail(user.fullName, token);
    mail.to = user.email;
    await sendMail(mail);

    if (!isProduction) return { token };
    return {};
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = sha256Hex(input.token);
    const record = await this.db.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(input.password);
    await this.db.$transaction([
      this.db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.db.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async getProfile(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { facility: true },
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async updateProfile(userId: string, input: UpdateProfileInput, ctx: SessionContext) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const data: Record<string, unknown> = {};
    if (input.fullName) data.fullName = input.fullName;

    if (input.newPassword) {
      if (!input.currentPassword) throw new BadRequestError('Current password is required');
      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) throw new UnauthorizedError('Current password is incorrect');
      data.passwordHash = await hashPassword(input.newPassword);
    }

    const updated = await this.db.user.update({
      where: { id: userId },
      data,
      include: { facility: true },
    });

    let tokens: IssuedTokens | undefined;
    if (input.newPassword) {
      await this.db.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      tokens = await this.issueTokens(updated, false, ctx);
    }

    return { user: updated, tokens };
  }
}
