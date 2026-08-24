import { Module } from "@nestjs/common";
import { FirebaseModule } from "../firebase/firebase.module";
import { FirebaseTokenVerifier } from "./firebase-token-verifier";
import { TokenVerifier } from "./token-verifier";

@Module({
  imports: [FirebaseModule],
  providers: [{ provide: TokenVerifier, useClass: FirebaseTokenVerifier }],
  exports: [TokenVerifier],
})
export class AuthModule {}
