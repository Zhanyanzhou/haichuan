import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";

const jwtExpiresIn = process.env.JWT_EXPIRES_IN?.trim();
type JwtDuration = `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;
const jwtExpiresInOption: number | JwtDuration = jwtExpiresIn && /^\d+$/.test(jwtExpiresIn)
  ? Number(jwtExpiresIn)
  : jwtExpiresIn && /^\d+(ms|s|m|h|d|w|y)$/.test(jwtExpiresIn)
    ? jwtExpiresIn as JwtDuration
    : "7d";
import { LocalStrategy } from "./local.strategy";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        (() => {
          throw new Error("JWT_SECRET 环境变量未设置，请检查 .env 文件");
        })(),
      signOptions: { expiresIn: jwtExpiresInOption },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
